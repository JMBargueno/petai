use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use eventsource_stream::Eventsource;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, CONTENT_TYPE};
use reqwest::{Method, StatusCode};
use serde_json::Value;
use tokio::sync::{broadcast, watch};
use tokio::task::JoinHandle;

use crate::config::CoreConfig;
use crate::contract::{ApiRequest, ApiResponse, SessionKind, SessionState, SseEvent};
use crate::error::CoreError;
use crate::events::CoreEvent;
use crate::secrets::{SecretStore, Tokens};
use crate::state::StateStore;

/// Código del 503 que devuelve la API durante el mantenimiento manual.
const MAINTENANCE_CODE: &str = "MAINTENANCE";
/// Códigos del 403 de «falta un paso de alta». No son un problema de token: no se renueva.
const EMAIL_NOT_VERIFIED: &str = "EMAIL_NOT_VERIFIED";
const HANDLE_REQUIRED: &str = "HANDLE_REQUIRED";
/// Lo que la UI recibe en lugar de un token: los de verdad no salen del núcleo.
const REDACTED: &str = "core";
/// Cabeceras de la respuesta que se devuelven a la UI.
const FORWARDED_HEADERS: [&str; 2] = ["content-type", "retry-after"];

/// El núcleo cliente. Barato de clonar: todas las copias comparten sesión y conexiones.
#[derive(Clone)]
pub struct Core {
    inner: Arc<Inner>,
}

struct Inner {
    cfg: CoreConfig,
    http: reqwest::Client,
    secrets: Box<dyn SecretStore>,
    tokens: Mutex<Option<Tokens>>,
    /// Solo una renovación en curso: el refresh token rota en cada uso y el backend trata como robo
    /// (cierra todas las sesiones) la reutilización de uno ya canjeado.
    refresh_gate: tokio::sync::Mutex<()>,
    /// Cuenta los cambios de sesión; el canal en tiempo real espera aquí un token nuevo.
    token_version: watch::Sender<u64>,
    events: broadcast::Sender<CoreEvent>,
    device_id: Mutex<String>,
    /// El id del dispositivo se acaba de generar: una sesión heredada puede traer el suyo.
    device_id_fresh: AtomicBool,
    realtime: Mutex<Option<JoinHandle<()>>>,
    store: StateStore,
}

/// Resultado de una petición: ya leída, o un flujo de eventos todavía abierto.
enum Outcome {
    Buffered(ApiResponse),
    Stream(reqwest::Response),
}

impl Core {
    pub fn new(cfg: CoreConfig, secrets: Box<dyn SecretStore>) -> Self {
        let tokens = secrets.load();
        let store = StateStore::new(cfg.data_dir.as_ref(), tokens.is_some());
        let (device_id, fresh) = load_device_id(&cfg);
        let (events, _) = broadcast::channel(256);
        let (token_version, _) = watch::channel(0);
        let http = reqwest::Client::builder()
            .user_agent(concat!("pockai-core/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("cliente HTTP");
        Self {
            inner: Arc::new(Inner {
                cfg,
                http,
                secrets,
                tokens: Mutex::new(tokens),
                refresh_gate: tokio::sync::Mutex::new(()),
                token_version,
                events,
                device_id: Mutex::new(device_id),
                device_id_fresh: AtomicBool::new(fresh),
                realtime: Mutex::new(None),
                store,
            }),
        }
    }

    pub fn config(&self) -> &CoreConfig {
        &self.inner.cfg
    }

    /// Se suscribe a los eventos del núcleo.
    pub fn subscribe(&self) -> broadcast::Receiver<CoreEvent> {
        self.inner.events.subscribe()
    }

    pub fn session_state(&self) -> SessionState {
        SessionState { active: self.inner.tokens.lock().unwrap().is_some() }
    }

    /// Id estable de este dispositivo (presencia en el canal en tiempo real).
    pub fn device_id(&self) -> String {
        self.inner.device_id.lock().unwrap().clone()
    }

    /// Petición a la API. Con `auth`, añade la sesión y, ante un 401, la renueva y repite una vez.
    pub async fn request(&self, req: ApiRequest) -> Result<ApiResponse, CoreError> {
        match self.execute(&req, false).await? {
            Outcome::Buffered(res) => Ok(res),
            Outcome::Stream(res) => self.buffer(res).await,
        }
    }

    /// Petición cuya respuesta es un flujo `text/event-stream` (el chat). Cada evento se entrega a
    /// `on_event` según llega. Si el servidor responde con un error en vez de abrir el flujo,
    /// devuelve esa respuesta sin llamar a `on_event`.
    pub async fn stream(
        &self,
        req: ApiRequest,
        mut on_event: impl FnMut(SseEvent) + Send,
    ) -> Result<ApiResponse, CoreError> {
        let res = match self.execute(&req, true).await? {
            Outcome::Buffered(res) => return Ok(res),
            Outcome::Stream(res) => res,
        };
        let status = res.status().as_u16();
        let headers = forwarded_headers(res.headers());
        let mut events = res.bytes_stream().eventsource();
        while let Some(item) = events.next().await {
            match item {
                Ok(ev) => on_event(SseEvent { event: ev.event, data: ev.data }),
                Err(e) => return Err(CoreError::Network(e.to_string())),
            }
        }
        Ok(ApiResponse { status, body: String::new(), headers })
    }

    /// Cierra la sesión en este dispositivo y revoca su refresh token en el servidor, sin esperar
    /// la respuesta (sin conexión, el token caduca por sí solo).
    pub fn logout(&self) {
        let previous = self.set_tokens(None);
        self.emit(CoreEvent::Session(SessionKind::LoggedOut));
        let Some(tokens) = previous else { return };
        let core = self.clone();
        if let Ok(runtime) = tokio::runtime::Handle::try_current() {
            runtime.spawn(async move {
                let req = ApiRequest {
                    method: "POST".into(),
                    path: "/v1/auth/logout".into(),
                    body: Some(serde_json::json!({ "refreshToken": tokens.refresh }).to_string()),
                    auth: false,
                    content_type: None,
                };
                let _ = core.send(&req, None).await;
            });
        }
    }

    /// Adopta la sesión que guardaba la versión anterior de la app (tokens en el almacenamiento del
    /// webview). No pisa una sesión ya existente. Devuelve si la adoptó.
    pub fn import_legacy(&self, access: String, refresh: String, device_id: Option<String>) -> bool {
        if let Some(id) = device_id.filter(|id| !id.trim().is_empty()) {
            if self.inner.device_id_fresh.swap(false, Ordering::SeqCst) {
                save_device_id(&self.inner.cfg, &id);
                *self.inner.device_id.lock().unwrap() = id;
            }
        }
        if access.is_empty() || refresh.is_empty() || self.session_state().active {
            return false;
        }
        self.set_tokens(Some(Tokens { access, refresh }));
        self.emit(CoreEvent::Session(SessionKind::Active));
        true
    }

    /// Arranca el canal en tiempo real. Se mantiene conectado mientras haya sesión y se reconecta
    /// solo. Hay que llamarlo desde dentro de un runtime de Tokio.
    pub fn realtime_start(&self) {
        let mut slot = self.inner.realtime.lock().unwrap();
        if slot.as_ref().is_some_and(|task| !task.is_finished()) {
            return;
        }
        *slot = Some(tokio::spawn(crate::realtime::run(self.clone())));
    }

    pub fn realtime_stop(&self) {
        if let Some(task) = self.inner.realtime.lock().unwrap().take() {
            task.abort();
            self.emit(CoreEvent::RealtimeStatus { connected: false });
        }
    }

    // ── Interno ──────────────────────────────────────────────────────────────────────────────

    pub(crate) fn store(&self) -> &StateStore {
        &self.inner.store
    }

    pub(crate) fn emit(&self, event: CoreEvent) {
        // El estado reacciona antes de que la UI se entere: cuando le llega «sesión cerrada», el
        // estado ya está vacío.
        if let CoreEvent::Session(kind) = &event {
            self.state_on_session(*kind);
        }
        // Sin suscriptores no es un error: el evento simplemente no le interesa a nadie todavía.
        let _ = self.inner.events.send(event);
    }

    pub(crate) fn access_token(&self) -> Option<String> {
        self.inner.tokens.lock().unwrap().as_ref().map(|t| t.access.clone())
    }

    /// Receptor que despierta cada vez que cambia la sesión (entrada, salida o renovación).
    pub(crate) fn token_changes(&self) -> watch::Receiver<u64> {
        self.inner.token_version.subscribe()
    }

    /// Guarda (o borra, con `None`) la sesión. Devuelve la anterior.
    fn set_tokens(&self, tokens: Option<Tokens>) -> Option<Tokens> {
        let previous = {
            let mut slot = self.inner.tokens.lock().unwrap();
            std::mem::replace(&mut *slot, tokens.clone())
        };
        match &tokens {
            Some(t) => self.inner.secrets.save(t),
            None => self.inner.secrets.clear(),
        }
        self.inner.token_version.send_modify(|v| *v += 1);
        previous
    }

    fn expire_session(&self) {
        if self.set_tokens(None).is_some() {
            self.emit(CoreEvent::Session(SessionKind::Expired));
        }
    }

    /// Renueva el access token con el refresh token.
    ///
    /// `stale` es el token con el que falló quien llama: si ya hay otro vigente (otra petición lo
    /// renovó mientras esta esperaba) se devuelve ese sin volver a llamar al servidor.
    ///
    /// Devuelve `None` si no se pudo renovar. Solo se cierra la sesión cuando el servidor rechaza
    /// el refresh token (400/401); un fallo de red o un 429/5xx la conserva para reintentar.
    pub(crate) async fn renew(&self, stale: Option<&str>) -> Option<String> {
        let _gate = self.inner.refresh_gate.lock().await;

        let current = self.inner.tokens.lock().unwrap().clone();
        let Some(current) = current else {
            return None;
        };
        if let Some(stale) = stale {
            if current.access != stale {
                return Some(current.access);
            }
        }

        let req = ApiRequest {
            method: "POST".into(),
            path: "/v1/auth/refresh".into(),
            body: Some(serde_json::json!({ "refreshToken": current.refresh }).to_string()),
            auth: false,
            content_type: None,
        };
        let res = self.send(&req, None).await.ok()?;
        let res = self.buffer(res).await.ok()?;
        self.inspect_maintenance(&res);

        // Si mientras tanto se cerró la sesión o se inició otra, el resultado ya no aplica.
        let still_current =
            self.inner.tokens.lock().unwrap().as_ref().is_some_and(|t| t.refresh == current.refresh);
        if !still_current {
            return None;
        }
        if res.status == 400 || res.status == 401 {
            self.expire_session();
            return None;
        }
        if !(200..300).contains(&res.status) {
            return None;
        }
        let tokens = tokens_in(&serde_json::from_str::<Value>(&res.body).ok()?)?;
        let access = tokens.access.clone();
        self.set_tokens(Some(tokens));
        Some(access)
    }

    async fn execute(&self, req: &ApiRequest, allow_stream: bool) -> Result<Outcome, CoreError> {
        let path = req.path.split('?').next().unwrap_or("");
        // Las rutas /auth/* (login incorrecto, refresh caducado) no se renuevan ni reintentan, salvo
        // /auth/verify-email/*: va con sesión y el usuario puede completarla horas después.
        let auth_route = path.contains("/auth/") && !path.contains("/auth/verify-email/");
        let sent = if req.auth { self.access_token() } else { None };

        let mut res = self.send(req, sent.as_deref()).await?;
        if let (Some(sent), false) = (&sent, auth_route) {
            if res.status() == StatusCode::UNAUTHORIZED {
                if let Some(token) = self.renew(Some(sent)).await {
                    res = self.send(req, Some(&token)).await?;
                }
            }
        }

        if allow_stream && res.status().is_success() && is_event_stream(res.headers()) {
            return Ok(Outcome::Stream(res));
        }

        let mut out = self.buffer(res).await?;
        self.inspect_maintenance(&out);
        if sent.is_some() && !auth_route {
            self.inspect_gate(&out);
        }
        if path.contains("/auth/") {
            self.adopt_session(&mut out);
        }
        Ok(Outcome::Buffered(out))
    }

    async fn send(&self, req: &ApiRequest, token: Option<&str>) -> Result<reqwest::Response, CoreError> {
        if !req.path.starts_with('/') || req.path.starts_with("//") {
            return Err(CoreError::InvalidRequest(format!("la ruta debe empezar por «/»: {}", req.path)));
        }
        let method = Method::from_bytes(req.method.to_ascii_uppercase().as_bytes())
            .map_err(|_| CoreError::InvalidRequest(format!("método desconocido: {}", req.method)))?;
        let url = format!("{}{}", self.inner.cfg.base_url, req.path);

        let mut builder = self.inner.http.request(method, url).header("X-Client", &self.inner.cfg.client);
        if let Some(token) = token {
            builder = builder.bearer_auth(token);
        }
        if let Some(body) = &req.body {
            builder = builder
                .header(CONTENT_TYPE, req.content_type.as_deref().unwrap_or("application/json"))
                .body(body.clone());
        }
        builder.send().await.map_err(|e| CoreError::Network(e.to_string()))
    }

    async fn buffer(&self, res: reqwest::Response) -> Result<ApiResponse, CoreError> {
        let status = res.status().as_u16();
        let headers = forwarded_headers(res.headers());
        let body = res.text().await.map_err(|e| CoreError::Network(e.to_string()))?;
        Ok(ApiResponse { status, body, headers })
    }

    /// 503 `MAINTENANCE`: la app se bloquea con el aviso hasta que termine.
    fn inspect_maintenance(&self, res: &ApiResponse) {
        if res.status != 503 {
            return;
        }
        let Ok(body) = serde_json::from_str::<Value>(&res.body) else { return };
        if body.get("code").and_then(Value::as_str) == Some(MAINTENANCE_CODE) {
            self.emit(CoreEvent::Maintenance(body));
        }
    }

    /// 403 de cuenta sin verificar o sin nickname: la UI muestra la pantalla que falta.
    fn inspect_gate(&self, res: &ApiResponse) {
        if res.status != 403 {
            return;
        }
        let Ok(body) = serde_json::from_str::<Value>(&res.body) else { return };
        match body.get("code").and_then(Value::as_str) {
            Some(EMAIL_NOT_VERIFIED) => self.emit(CoreEvent::Session(SessionKind::Unverified)),
            Some(HANDLE_REQUIRED) => self.emit(CoreEvent::Session(SessionKind::HandleRequired)),
            _ => {}
        }
    }

    /// Una respuesta correcta de `/auth/*` que trae un par de tokens (inicio de sesión, registro,
    /// cambio de contraseña, vinculación de dispositivo) abre sesión. Los tokens se quedan en el
    /// núcleo: a la UI le llega la respuesta con ellos sustituidos.
    fn adopt_session(&self, res: &mut ApiResponse) {
        if !(200..300).contains(&res.status) {
            return;
        }
        let Ok(mut body) = serde_json::from_str::<Value>(&res.body) else { return };
        let Some(tokens) = tokens_in(&body) else { return };
        self.set_tokens(Some(tokens));
        self.emit(CoreEvent::Session(SessionKind::Active));
        body["accessToken"] = Value::String(REDACTED.into());
        body["refreshToken"] = Value::String(REDACTED.into());
        res.body = body.to_string();
    }
}

fn tokens_in(body: &Value) -> Option<Tokens> {
    let access = body.get("accessToken")?.as_str()?;
    let refresh = body.get("refreshToken")?.as_str()?;
    if access.is_empty() || refresh.is_empty() {
        return None;
    }
    Some(Tokens { access: access.to_string(), refresh: refresh.to_string() })
}

fn is_event_stream(headers: &HeaderMap) -> bool {
    headers
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.to_ascii_lowercase().starts_with("text/event-stream"))
}

fn forwarded_headers(headers: &HeaderMap) -> HashMap<String, String> {
    FORWARDED_HEADERS
        .iter()
        .filter_map(|name| {
            let value = headers.get(*name)?.to_str().ok()?;
            Some((name.to_string(), value.to_string()))
        })
        .collect()
}

/// Lee el id del dispositivo de la carpeta de datos; si no existe lo genera y lo guarda.
/// Devuelve también si se acaba de generar.
fn load_device_id(cfg: &CoreConfig) -> (String, bool) {
    if let Some(dir) = &cfg.data_dir {
        if let Ok(existing) = std::fs::read_to_string(dir.join(DEVICE_ID_FILE)) {
            let existing = existing.trim();
            if !existing.is_empty() {
                return (existing.to_string(), false);
            }
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    save_device_id(cfg, &id);
    (id, true)
}

fn save_device_id(cfg: &CoreConfig, id: &str) {
    let Some(dir) = &cfg.data_dir else { return };
    if std::fs::create_dir_all(dir).is_ok() {
        let _ = std::fs::write(dir.join(DEVICE_ID_FILE), id);
    }
}

const DEVICE_ID_FILE: &str = "device-id";
