//! Estado global de la app: usuario, mascotas, huevos, inventario y tienda.
//!
//! El núcleo es el dueño: lo carga del backend, lo mantiene al día (sondeo y tiempo real), lo guarda
//! en disco para arrancar al instante y avisa de cada cambio con [`CoreEvent::State`]. La UI solo se
//! suscribe; lo que necesitan los widgets y las Live Activities sale de aquí, sin webview.
//!
//! Los datos se guardan tal cual los manda el backend (JSON): el contrato de la API no tipa la mayoría
//! de las respuestas y la UI lee muchos campos que al núcleo no le importan. El núcleo solo
//! interpreta lo que necesita para decidir (`id`, `emailVerified`, `handle`, `timezone`…).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tokio::task::JoinHandle;
use ts_rs::TS;

use crate::contract::{ApiRequest, SessionKind};
use crate::core::Core;
use crate::events::CoreEvent;

/// Las constantes vitales solo se recalculan al consultar al servidor (tick perezoso): se consulta
/// cada minuto para poder avisar cuando la mascota necesita atención.
const POLL_INTERVAL: Duration = Duration::from_secs(60);
const SNAPSHOT_FILE: &str = "state.json";

/// Cada parte del estado que cambia y se anuncia por separado.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Slice {
    User,
    Pets,
    ActivePetId,
    Eggs,
    Inventory,
    Shop,
    Inbox,
    Environment,
}

/// Cada cuántos ciclos de sondeo (de un minuto) se vuelve a pedir el estado ambiental completo.
const ENVIRONMENT_REFRESH_EVERY: u32 = 15;

/// Avisos que se guardan como mucho en la bandeja.
const INBOX_MAX: usize = 100;

/// De dónde viene un cambio: del servidor (carga, sondeo, tiempo real) o de este dispositivo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ChangeSource {
    Server,
    Local,
}

/// Carga del evento `core://state`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StateChange {
    pub slice: Slice,
    /// Número de revisión del estado tras este cambio (crece con cada cambio).
    #[ts(type = "number")]
    pub rev: u64,
    #[ts(type = "unknown")]
    pub value: Value,
    pub source: ChangeSource,
}

/// El estado completo, tal cual lo devuelve `state_snapshot`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct AppState {
    #[ts(type = "number")]
    pub rev: u64,
    /// El usuario (`GET /v1/me`), o `null` sin sesión.
    #[ts(type = "Record<string, unknown> | null")]
    pub user: Value,
    #[ts(type = "Array<{ id: string } & Record<string, unknown>>")]
    pub pets: Vec<Value>,
    /// La mascota que el jugador eligió en este dispositivo. Sin elección, la activa es la primera.
    pub active_pet_id: Option<String>,
    #[ts(type = "Array<Record<string, unknown>>")]
    pub eggs: Vec<Value>,
    #[ts(type = "Array<Record<string, unknown>>")]
    pub inventory: Vec<Value>,
    /// Lo que se vende en la tienda (sin lo que solo sale de cofres ni lo oculto).
    #[ts(type = "Array<Record<string, unknown>>")]
    pub shop: Vec<Value>,
    /// Bandeja de avisos de la mascota que no se pudieron mostrar (los más recientes primero).
    #[ts(type = "Array<Record<string, unknown>>")]
    pub inbox: Vec<Value>,
    /// Estado ambiental que da el servidor (hora del día, actividad, festividad), o `null`. El clima
    /// no va aquí: sale del propio dispositivo.
    #[ts(type = "Record<string, unknown> | null")]
    pub environment: Value,
}

impl AppState {
    fn slice(&self, slice: Slice) -> Value {
        match slice {
            Slice::User => self.user.clone(),
            Slice::Pets => Value::Array(self.pets.clone()),
            Slice::ActivePetId => json!(self.active_pet_id),
            Slice::Eggs => Value::Array(self.eggs.clone()),
            Slice::Inventory => Value::Array(self.inventory.clone()),
            Slice::Shop => Value::Array(self.shop.clone()),
            Slice::Inbox => Value::Array(self.inbox.clone()),
            Slice::Environment => self.environment.clone(),
        }
    }

    /// La mascota activa: la elegida si sigue existiendo; si no, la primera.
    pub fn active_pet(&self) -> Option<&Value> {
        let chosen = self.active_pet_id.as_deref();
        self.pets.iter().find(|p| pet_id(p) == chosen && chosen.is_some()).or_else(|| self.pets.first())
    }
}

/// Qué pide la UI al cargar el estado.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct LoadOptions {
    /// Zona horaria del dispositivo (IANA). Si el usuario sigue en `UTC`, se le ajusta a esta.
    pub timezone: Option<String>,
    /// Mascota activa que guardaba el webview en versiones anteriores (se adopta una sola vez).
    pub legacy_active_pet_id: Option<String>,
}

/// Paso de alta que le falta a la cuenta: la UI muestra esa pantalla y nada más.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum AccountLock {
    Unverified,
    NoHandle,
}

/// Cómo terminó la carga del estado.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LoadOutcome {
    /// Hay sesión.
    pub session: bool,
    /// A la cuenta le falta verificar el correo o elegir nickname.
    pub lock: Option<AccountLock>,
    /// No se pudo hablar con el servidor: el estado es el último guardado (o está vacío).
    pub offline: bool,
}

/// Dónde vive el estado dentro del núcleo.
pub(crate) struct StateStore {
    /// Cuándo se avisó por última vez de cada necesidad de cada mascota.
    pub(crate) needs_sent: Mutex<HashMap<String, Instant>>,
    /// ¿Está el jugador delante? Lo dice la UI (ventana visible); va en el latido al servidor.
    present: AtomicBool,
    state: Mutex<AppState>,
    poll: Mutex<Option<JoinHandle<()>>>,
    /// Mascota activa ya comunicada al servidor en esta sesión.
    activated: Mutex<Option<String>>,
    path: Option<PathBuf>,
}

impl StateStore {
    /// Con sesión, recupera el último estado guardado para arrancar sin esperar a la red.
    pub(crate) fn new(data_dir: Option<&PathBuf>, has_session: bool) -> Self {
        let path = data_dir.map(|dir| dir.join(SNAPSHOT_FILE));
        let state = match (&path, has_session) {
            (Some(path), true) => std::fs::read_to_string(path)
                .ok()
                .and_then(|raw| serde_json::from_str::<AppState>(&raw).ok())
                .unwrap_or_default(),
            _ => AppState::default(),
        };
        Self { needs_sent: Mutex::new(HashMap::new()), present: AtomicBool::new(true), state: Mutex::new(state), poll: Mutex::new(None), activated: Mutex::new(None), path }
    }

    fn persist(&self, state: &AppState) {
        let Some(path) = &self.path else { return };
        let Ok(raw) = serde_json::to_vec(state) else { return };
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        // Escritura atómica: un corte a mitad no deja el fichero a medias.
        let tmp = path.with_extension("json.tmp");
        if std::fs::write(&tmp, raw).is_ok() {
            let _ = std::fs::rename(&tmp, path);
        }
    }

    fn forget(&self) {
        if let Some(path) = &self.path {
            let _ = std::fs::remove_file(path);
        }
    }
}

impl Core {
    /// El estado completo en este momento.
    pub fn state_snapshot(&self) -> AppState {
        self.store().state.lock().unwrap().clone()
    }

    /// Carga el estado del backend: tienda, y con sesión, usuario, mascotas, huevos e inventario.
    /// Después lo mantiene al día sondeando las mascotas cada minuto.
    pub async fn state_load(&self, options: LoadOptions) -> LoadOutcome {
        let mut outcome = LoadOutcome { session: self.session_state().active, ..Default::default() };

        // La tienda es pública. Spec 41: lo que es solo drop u oculto no se vende.
        match self.get_json("/v1/catalog", false).await {
            Ok(catalog) => {
                let foods = catalog.get("foods").and_then(Value::as_array).cloned().unwrap_or_default();
                let shop = foods.into_iter().filter(is_sold).collect();
                self.change(Slice::Shop, ChangeSource::Server, |s| s.shop = shop);
            }
            Err(_) => outcome.offline = true,
        }
        if !outcome.session {
            return outcome;
        }

        let mut user = match self.get_json("/v1/me", true).await {
            Ok(user) => user,
            Err(_) => {
                // Sesión rechazada (ya se ha cerrado) o sin conexión (se conserva lo guardado).
                outcome.session = self.session_state().active;
                outcome.offline = outcome.session;
                return outcome;
            }
        };

        // Cuenta sin verificar o sin nickname: solo se muestra esa pantalla (la API rechaza con 403
        // los datos de juego hasta completar el paso).
        outcome.lock = account_lock(&user);
        if outcome.lock.is_some() {
            self.clear_game();
            self.change(Slice::User, ChangeSource::Server, |s| s.user = user);
            return outcome;
        }

        // El servidor usa la zona horaria del usuario (ciclo de sueño, recordatorios): si sigue en el
        // valor por defecto se ajusta a la del dispositivo. No es crítico: se reintenta al arrancar.
        if let Some(timezone) = options.timezone.as_deref().filter(|tz| !tz.is_empty() && *tz != "UTC") {
            if user.get("timezone").and_then(Value::as_str) == Some("UTC") {
                if let Ok(updated) = self.send_json("PATCH", "/v1/me", json!({ "timezone": timezone })).await {
                    user = updated;
                }
            }
        }
        self.change(Slice::User, ChangeSource::Server, |s| s.user = user);

        if let Some(legacy) = options.legacy_active_pet_id.filter(|id| !id.is_empty()) {
            let unset = self.store().state.lock().unwrap().active_pet_id.is_none();
            if unset {
                self.change(Slice::ActivePetId, ChangeSource::Local, |s| s.active_pet_id = Some(legacy));
            }
        }

        for slice in [Slice::Pets, Slice::Eggs, Slice::Inventory] {
            if self.state_refresh(slice).await.is_err() {
                outcome.offline = true;
            }
        }

        self.sync_active_pet();
        self.start_poll();
        // El tiempo real lo arranca el núcleo, no cada UI: sin él no llegan los cambios que el
        // servidor hace por su cuenta (recompensas de logros, visitas, avisos).
        self.realtime_start();
        self.deliver_reminders().await;
        // Entorno: estado inicial y primer latido (los siguientes van con el sondeo).
        let _ = self.environment_refresh().await;
        self.heartbeat().await;
        outcome
    }

    /// Vuelve a pedir al servidor el estado ambiental (hora del día, actividad, festividad).
    pub async fn environment_refresh(&self) -> Result<(), String> {
        let status = self.get_json("/v1/environmental/status", true).await?;
        self.change(Slice::Environment, ChangeSource::Server, |s| s.environment = status);
        Ok(())
    }

    /// La UI dice si el jugador está delante (ventana visible). Va en el siguiente latido.
    pub fn set_present(&self, present: bool) {
        self.store().present.store(present, Ordering::SeqCst);
    }

    /// Latido de actividad: el servidor lo usa para saber si la mascota está acompañada.
    async fn heartbeat(&self) {
        let active = self.store().present.load(Ordering::SeqCst);
        let _ = self.send_json("POST", "/v1/environmental/activity", json!({ "active": active })).await;
    }

    /// `environmental:changed` del tiempo real. Los de clima se ignoran: el servidor ya no conoce la
    /// ubicación y el clima sale del propio dispositivo.
    fn environment_changed(&self, event: &Value) {
        let known = !self.store().state.lock().unwrap().environment.is_null();
        if !known {
            let core = self.clone();
            tokio::spawn(async move {
                let _ = core.environment_refresh().await;
            });
            return;
        }
        let kind = event.get("type").and_then(Value::as_str).unwrap_or("");
        let data = event.get("data").cloned().unwrap_or(Value::Null);
        self.change(Slice::Environment, ChangeSource::Server, |s| {
            let Some(env) = s.environment.as_object_mut() else { return };
            match kind {
                "timeOfDay" => {
                    env.insert("timeOfDay".into(), data.get("timeOfDay").cloned().unwrap_or(Value::Null));
                }
                "activity" => {
                    let mode = data.get("mode").cloned().unwrap_or(Value::Null);
                    let active = mode.as_str() == Some("active");
                    let activity = env.entry("activity").or_insert_with(|| json!({}));
                    if let Some(activity) = activity.as_object_mut() {
                        activity.insert("mode".into(), mode);
                        activity.insert("active".into(), Value::Bool(active));
                    }
                }
                "festival" => {
                    env.insert("festival".into(), data);
                }
                _ => {}
            }
        });
    }

    /// Vuelve a pedir al servidor una parte del estado.
    pub async fn state_refresh(&self, slice: Slice) -> Result<(), String> {
        match slice {
            Slice::User => {
                let user = self.get_json("/v1/me", true).await?;
                self.change(slice, ChangeSource::Server, |s| s.user = user);
            }
            Slice::Pets => {
                let pets = as_list(self.get_json("/v1/pets", true).await?);
                self.change(slice, ChangeSource::Server, |s| s.pets = pets);
            }
            Slice::Eggs => {
                // El servidor manda `remainingMs` (su reloj). Se traduce a un `hatchesAt` en el reloj
                // local para que la cuenta atrás sea correcta aunque el del dispositivo esté desfasado.
                let received_at = now_ms();
                let eggs = as_list(self.get_json("/v1/eggs", true).await?)
                    .into_iter()
                    .map(|egg| with_hatches_at(egg, received_at))
                    .collect();
                self.change(slice, ChangeSource::Server, |s| s.eggs = eggs);
            }
            Slice::Inventory => {
                let inventory = as_list(self.get_json("/v1/inventory", true).await?);
                self.change(slice, ChangeSource::Server, |s| s.inventory = inventory);
            }
            Slice::Environment => return self.environment_refresh().await,
            Slice::Shop | Slice::ActivePetId | Slice::Inbox => return Err("esta parte del estado no se recarga sola".into()),
        }
        Ok(())
    }

    /// Guarda una mascota que la UI acaba de recibir del servidor (dar de comer, bañar…). Con `add`
    /// la añade si no estaba (una recién nacida); sin él solo actualiza las que ya se tienen.
    pub fn state_apply_pet(&self, pet: Value, add: bool) {
        self.apply_pet(pet, add, ChangeSource::Local);
    }

    /// Cambia campos sueltos de una mascota sin esperar al servidor (la etapa al evolucionar…).
    pub fn state_patch_pet(&self, id: &str, patch: Map<String, Value>) {
        self.change(Slice::Pets, ChangeSource::Local, |s| {
            let Some(pet) = s.pets.iter_mut().find(|p| pet_id(p) == Some(id)) else { return };
            if let Some(fields) = pet.as_object_mut() {
                fields.extend(patch);
            }
        });
    }

    /// El jugador elige la mascota activa: se recuerda en este dispositivo y se le dice al servidor
    /// (es la que le representa en el hábitat del clan y en las visitas).
    pub fn state_select_pet(&self, id: &str) {
        let known = self.store().state.lock().unwrap().pets.iter().any(|p| pet_id(p) == Some(id));
        if !known {
            return;
        }
        let id = id.to_string();
        self.change(Slice::ActivePetId, ChangeSource::Local, |s| s.active_pet_id = Some(id));
        self.sync_active_pet();
    }

    /// Vacía el estado de la sesión (la tienda, que es pública, se conserva).
    pub fn state_clear(&self) {
        self.clear_game();
        self.change(Slice::User, ChangeSource::Local, |s| s.user = Value::Null);
        self.change(Slice::ActivePetId, ChangeSource::Local, |s| s.active_pet_id = None);
        self.change(Slice::Inbox, ChangeSource::Local, |s| s.inbox.clear());
        self.store().needs_sent.lock().unwrap().clear();
        self.store().forget();
    }

    /// Guarda en la bandeja un aviso de la mascota que no se pudo mostrar.
    pub fn inbox_push(&self, notice: Value) {
        self.change(Slice::Inbox, ChangeSource::Local, |s| {
            s.inbox.insert(0, notice);
            s.inbox.truncate(INBOX_MAX);
        });
    }

    /// Vacía la bandeja y devuelve lo que había, para volver a intentar mostrarlo.
    pub fn inbox_take(&self) -> Vec<Value> {
        let pending = self.store().state.lock().unwrap().inbox.clone();
        self.change(Slice::Inbox, ChangeSource::Local, |s| s.inbox.clear());
        pending
    }

    /// Marca como leídos todos los avisos de la bandeja (los conserva).
    pub fn inbox_mark_all_read(&self) {
        self.change(Slice::Inbox, ChangeSource::Local, |s| {
            for notice in s.inbox.iter_mut().filter_map(Value::as_object_mut) {
                notice.insert("read".into(), Value::Bool(true));
            }
        });
    }

    // ── Interno ──────────────────────────────────────────────────────────────────────────────

    /// Cambios de sesión que afectan al estado.
    pub(crate) fn state_on_session(&self, kind: SessionKind) {
        match kind {
            SessionKind::LoggedOut | SessionKind::Expired => self.state_clear(),
            // La API dice que falta un paso de alta: se para el juego y queda solo el usuario,
            // marcado para que la UI muestre la pantalla que toca.
            SessionKind::Unverified => self.lock_account("emailVerified", Value::Bool(false)),
            SessionKind::HandleRequired => self.lock_account("handle", Value::Null),
            SessionKind::Active => {}
        }
    }

    /// Respuestas correctas de la API que cambian el estado. Mientras las acciones pasen por la
    /// pasarela (`api_request`), así es como el núcleo se entera de lo que la UI acaba de hacer: dar
    /// de comer devuelve la mascota y gasta inventario, comprar cambia el saldo, eclosionar trae una
    /// mascota nueva.
    pub(crate) fn state_on_response(&self, method: &str, path: &str, body: &str) {
        if method.eq_ignore_ascii_case("GET") {
            return;
        }
        let path = path.split('?').next().unwrap_or("");
        let Some(route) = path.strip_prefix("/v1/") else { return };
        let segments: Vec<&str> = route.split('/').collect();
        let value = serde_json::from_str::<Value>(body).unwrap_or(Value::Null);

        match segments.as_slice() {
            // Cambios en la cuenta (zona horaria, nickname…): la respuesta es el usuario.
            ["me"] | ["me", "handle"] => {
                if value.get("id").is_some() {
                    self.change(Slice::User, ChangeSource::Server, |s| s.user = value);
                }
            }
            // Cuidar a una mascota: la respuesta es esa mascota, ya actualizada.
            ["pets", id] | ["pets", id, _] => {
                if pet_id(&value) == Some(*id) {
                    self.apply_pet(value, false, ChangeSource::Server);
                }
                if matches!(segments.get(2), Some(&"feed") | Some(&"heal") | Some(&"use-item")) {
                    self.refresh_later(&[Slice::Inventory]);
                }
                // Equipar prendas responde solo con las prendas: la mascota se vuelve a pedir.
                if segments.get(2) == Some(&"accessories") {
                    self.refresh_later(&[Slice::Pets]);
                }
            }
            ["eggs", _, "hatch"] => {
                if pet_id(&value).is_some() {
                    self.apply_pet(value, true, ChangeSource::Server);
                }
                self.refresh_later(&[Slice::Eggs, Slice::User]);
            }
            ["eggs", "buy"] => self.refresh_later(&[Slice::Eggs, Slice::User]),
            ["shop", "buy"] => self.refresh_later(&[Slice::Inventory, Slice::User]),
            // Combates y cofres: la respuesta es el resultado, no la mascota ni el saldo. Gastan
            // energía y dan premios (monedas, gemas, objetos), así que se vuelven a pedir.
            ["raid", "attack"] => self.refresh_later(&[Slice::Pets, Slice::User]),
            // Cada piso de la mazmorra es un turno: solo cambia algo cuando la mazmorra termina.
            ["training", "submit"] => {
                if value.get("status").and_then(Value::as_str) != Some("active") {
                    self.refresh_later(&[Slice::Pets, Slice::User]);
                }
            }
            ["training", "start"] => self.refresh_later(&[Slice::Pets]),
            ["tournament", "enter"] => self.refresh_later(&[Slice::User]),
            ["chests", "open"] | ["chests", "purchase"] => self.refresh_later(&[Slice::User, Slice::Inventory]),
            ["accessories", _, "buy"] => self.refresh_later(&[Slice::User]),
            _ => {}
        }
    }

    /// Vuelve a pedir partes del estado en segundo plano, sin hacer esperar a quien llamó.
    fn refresh_later(&self, slices: &[Slice]) {
        let Ok(runtime) = tokio::runtime::Handle::try_current() else { return };
        let core = self.clone();
        let slices = slices.to_vec();
        runtime.spawn(async move {
            for slice in slices {
                let _ = core.state_refresh(slice).await;
            }
        });
    }

    /// Eventos del servidor que cambian el estado.
    pub(crate) fn state_on_realtime(&self, name: &str, payload: &Value) {
        match name {
            "pet:update" => self.apply_pet(payload.clone(), false, ChangeSource::Server),
            "environmental:changed" => self.environment_changed(payload),
            // La recompensa ya está acreditada: se refresca el saldo.
            "achievement:unlocked" | "reward:received" => {
                let core = self.clone();
                tokio::spawn(async move {
                    let _ = core.state_refresh(Slice::User).await;
                });
            }
            _ => {}
        }
    }

    fn apply_pet(&self, pet: Value, add: bool, source: ChangeSource) {
        let Some(id) = pet_id(&pet).map(str::to_string) else { return };
        self.change(Slice::Pets, source, |s| {
            match s.pets.iter_mut().find(|p| pet_id(p) == Some(id.as_str())) {
                Some(existing) => *existing = pet,
                None if add => s.pets.push(pet),
                None => {}
            }
        });
    }

    fn lock_account(&self, field: &str, value: Value) {
        let already = self.store().state.lock().unwrap().user.get(field) == Some(&value);
        if already {
            return;
        }
        self.clear_game();
        self.change(Slice::User, ChangeSource::Server, |s| {
            if let Some(user) = s.user.as_object_mut() {
                user.insert(field.to_string(), value);
            }
        });
    }

    fn clear_game(&self) {
        if let Some(task) = self.store().poll.lock().unwrap().take() {
            task.abort();
        }
        *self.store().activated.lock().unwrap() = None;
        self.change(Slice::Pets, ChangeSource::Local, |s| s.pets.clear());
        self.change(Slice::Eggs, ChangeSource::Local, |s| s.eggs.clear());
        self.change(Slice::Inventory, ChangeSource::Local, |s| s.inventory.clear());
        self.change(Slice::Environment, ChangeSource::Local, |s| s.environment = Value::Null);
    }

    /// Aplica un cambio, lo guarda en disco y lo anuncia.
    fn change(&self, slice: Slice, source: ChangeSource, apply: impl FnOnce(&mut AppState)) {
        let change = {
            let mut state = self.store().state.lock().unwrap();
            let before = state.slice(slice);
            apply(&mut state);
            let value = state.slice(slice);
            // Lo que llega del servidor se anuncia siempre: aunque no cambie, es una lectura fresca
            // (la UI revisa con ella si la mascota necesita atención).
            if value == before && source == ChangeSource::Local {
                return;
            }
            state.rev += 1;
            if value != before {
                self.store().persist(&state);
            }
            StateChange { slice, rev: state.rev, value, source }
        };
        self.emit(CoreEvent::State(change));
        // Lectura fresca de las mascotas: ¿necesita atención la activa?
        if slice == Slice::Pets && source == ChangeSource::Server {
            self.announce_needs();
        }
    }

    /// Le dice al servidor cuál es la mascota activa, una vez por sesión y elección. Solo si es una
    /// elección hecha en este dispositivo: uno recién instalado mostraría la primera mascota y
    /// pisaría la que el jugador eligió en otro.
    fn sync_active_pet(&self) {
        let chosen = {
            let state = self.store().state.lock().unwrap();
            state.active_pet_id.clone().filter(|id| state.pets.iter().any(|p| pet_id(p) == Some(id.as_str())))
        };
        let Some(id) = chosen.filter(|id| is_plain_id(id)) else { return };
        {
            let mut activated = self.store().activated.lock().unwrap();
            if activated.as_deref() == Some(id.as_str()) {
                return;
            }
            *activated = Some(id.clone());
        }
        let core = self.clone();
        let Ok(runtime) = tokio::runtime::Handle::try_current() else { return };
        runtime.spawn(async move {
            if core.send_json("POST", &format!("/v1/pets/{id}/activate"), json!({})).await.is_err() {
                // Se reintenta en el próximo cambio o arranque.
                let mut activated = core.store().activated.lock().unwrap();
                if activated.as_deref() == Some(id.as_str()) {
                    *activated = None;
                }
            }
        });
    }

    fn start_poll(&self) {
        let mut slot = self.store().poll.lock().unwrap();
        if slot.as_ref().is_some_and(|task| !task.is_finished()) {
            return;
        }
        let core = self.clone();
        *slot = Some(tokio::spawn(async move {
            let mut cycle: u32 = 0;
            loop {
                tokio::time::sleep(POLL_INTERVAL).await;
                if !core.session_state().active {
                    break;
                }
                cycle = cycle.wrapping_add(1);
                core.heartbeat().await;
                if cycle % ENVIRONMENT_REFRESH_EVERY == 0 {
                    let _ = core.environment_refresh().await;
                }
                let has_pets = !core.store().state.lock().unwrap().pets.is_empty();
                if has_pets {
                    // Sin conexión o sesión caducada: se reintenta en el siguiente ciclo.
                    let _ = core.state_refresh(Slice::Pets).await;
                }
                core.deliver_reminders().await;
            }
        }));
    }

    pub(crate) async fn get_json(&self, path: &str, auth: bool) -> Result<Value, String> {
        self.json(ApiRequest { method: "GET".into(), path: path.into(), body: None, auth, content_type: None }).await
    }

    pub(crate) async fn send_json(&self, method: &str, path: &str, body: Value) -> Result<Value, String> {
        self.json(ApiRequest {
            method: method.into(),
            path: path.into(),
            body: Some(body.to_string()),
            auth: true,
            content_type: None,
        })
        .await
    }

    async fn json(&self, request: ApiRequest) -> Result<Value, String> {
        let res = self.request(request).await.map_err(|e| e.to_string())?;
        if !(200..300).contains(&res.status) {
            return Err(format!("el servidor respondió {}", res.status));
        }
        // Una respuesta correcta sin cuerpo (204, o un 201 vacío) también vale.
        if res.body.trim().is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_str(&res.body).map_err(|e| e.to_string())
    }
}

fn pet_id(pet: &Value) -> Option<&str> {
    pet.get("id").and_then(Value::as_str)
}

fn as_list(value: Value) -> Vec<Value> {
    match value {
        Value::Array(items) => items,
        _ => Vec::new(),
    }
}

/// ¿Se vende en la tienda? Lo que no dice nada, sí.
fn is_sold(food: &Value) -> bool {
    food.get("availability").and_then(Value::as_str).unwrap_or("shop") == "shop"
}

/// Igual que la UI: bloquea `emailVerified: false` y `handle: null` (presente y nulo, no ausente).
fn account_lock(user: &Value) -> Option<AccountLock> {
    if user.get("emailVerified") == Some(&Value::Bool(false)) {
        return Some(AccountLock::Unverified);
    }
    if user.get("handle") == Some(&Value::Null) {
        return Some(AccountLock::NoHandle);
    }
    None
}

/// Los ids del backend son UUID: no se construye una ruta con nada que no lo parezca.
fn is_plain_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn with_hatches_at(mut egg: Value, received_at_ms: i64) -> Value {
    let remaining = egg.get("remainingMs").and_then(Value::as_f64);
    if let (Some(remaining), Some(fields)) = (remaining, egg.as_object_mut()) {
        fields.insert("hatchesAt".into(), Value::String(iso_from_ms(received_at_ms + remaining as i64)));
    }
    egg
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Fecha ISO 8601 en UTC con milisegundos, como `Date.prototype.toISOString`.
fn iso_from_ms(ms: i64) -> String {
    let days = ms.div_euclid(86_400_000);
    let rem = ms.rem_euclid(86_400_000);
    // Días desde 1970-01-01 a fecha civil (algoritmo de Howard Hinnant).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        rem / 3_600_000,
        rem / 60_000 % 60,
        rem / 1_000 % 60,
        rem % 1_000
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_fecha_iso_coincide_con_la_de_javascript() {
        assert_eq!(iso_from_ms(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_from_ms(1_795_122_000_123), "2026-11-19T21:00:00.123Z");
        assert_eq!(iso_from_ms(951_782_400_000), "2000-02-29T00:00:00.000Z");
    }

    #[test]
    fn el_huevo_recibe_su_hora_de_eclosion_en_el_reloj_local() {
        let egg = with_hatches_at(json!({ "id": "e1", "remainingMs": 60_000 }), 0);
        assert_eq!(egg["hatchesAt"], "1970-01-01T00:01:00.000Z");
        // Un huevo sin cuenta atrás se deja como está.
        assert_eq!(with_hatches_at(json!({ "id": "e2" }), 0), json!({ "id": "e2" }));
    }

    #[test]
    fn solo_bloquea_el_correo_sin_verificar_y_el_nickname_nulo() {
        assert_eq!(account_lock(&json!({ "emailVerified": false })), Some(AccountLock::Unverified));
        assert_eq!(account_lock(&json!({ "emailVerified": true, "handle": null })), Some(AccountLock::NoHandle));
        assert_eq!(account_lock(&json!({ "emailVerified": true, "handle": "filo" })), None);
        // Un backend antiguo que no manda el campo no bloquea.
        assert_eq!(account_lock(&json!({ "id": "u1" })), None);
    }

    #[test]
    fn la_mascota_activa_es_la_elegida_o_la_primera() {
        let mut state = AppState { pets: vec![json!({ "id": "a" }), json!({ "id": "b" })], ..Default::default() };
        assert_eq!(state.active_pet().unwrap()["id"], "a");
        state.active_pet_id = Some("b".into());
        assert_eq!(state.active_pet().unwrap()["id"], "b");
        state.active_pet_id = Some("ya-no-existe".into());
        assert_eq!(state.active_pet().unwrap()["id"], "a");
    }

    #[test]
    fn lo_que_solo_sale_de_cofres_no_se_vende() {
        assert!(is_sold(&json!({ "id": "manzana" })));
        assert!(is_sold(&json!({ "availability": "shop" })));
        assert!(!is_sold(&json!({ "availability": "drop" })));
        assert!(!is_sold(&json!({ "availability": "hidden" })));
    }
}

#[cfg(test)]
mod realtime_tests {
    use super::*;
    use crate::config::CoreConfig;
    use crate::secrets::MemoryStore;

    fn core_with(state: AppState) -> Core {
        let core = Core::new(CoreConfig::desktop("http://127.0.0.1:9", None), Box::new(MemoryStore::default()));
        *core.store().state.lock().unwrap() = state;
        core
    }

    #[tokio::test]
    async fn pet_update_sustituye_solo_a_las_mascotas_que_ya_se_tienen() {
        let core = core_with(AppState { pets: vec![json!({ "id": "p1", "hunger": 80 })], ..Default::default() });

        core.state_on_realtime("pet:update", &json!({ "id": "p1", "hunger": 20 }));
        core.state_on_realtime("pet:update", &json!({ "id": "ajena", "hunger": 1 }));

        assert_eq!(core.state_snapshot().pets, vec![json!({ "id": "p1", "hunger": 20 })]);
    }

    #[tokio::test]
    async fn los_cambios_ambientales_se_funden_con_el_estado_y_el_clima_se_ignora() {
        let environment = json!({ "timeOfDay": "morning", "activity": { "mode": "active", "active": true, "lastActiveAt": "x" }, "festival": null });
        let core = core_with(AppState { environment, ..Default::default() });

        core.state_on_realtime("environmental:changed", &json!({ "type": "timeOfDay", "data": { "timeOfDay": "night" } }));
        core.state_on_realtime("environmental:changed", &json!({ "type": "activity", "data": { "mode": "solo" } }));
        core.state_on_realtime("environmental:changed", &json!({ "type": "festival", "data": { "id": "f1", "name": "Fiesta" } }));
        core.state_on_realtime("environmental:changed", &json!({ "type": "weather", "data": { "condition": "rain" } }));

        let env = core.state_snapshot().environment;
        assert_eq!(env["timeOfDay"], "night");
        assert_eq!(env["activity"], json!({ "mode": "solo", "active": false, "lastActiveAt": "x" }));
        assert_eq!(env["festival"]["id"], "f1");
        assert!(env.get("weather").is_none());
    }
}
