//! Lo que la mascota enseña en la muñeca, y lo que el jugador puede hacer desde ahí (spec 44).
//!
//! El reloj **no es un cliente**: no habla con el backend, no ve tokens y no tiene estado propio.
//! Aquí vive toda su cabeza, y es pura: del estado del núcleo sale el resumen que el reloj pinta
//! ([`snapshot`]) y de una intención suya sale la acción que el núcleo ejecuta ([`resolve`]).
//! SwiftUI solo dibuja y manda botones.
//!
//! **Sin push.** El backend no registra tokens de APNs, así que al reloj no se le puede despertar
//! desde el servidor (ver `surfaces.rs`, que tiene el mismo problema). Las cuentas atrás viajan con
//! su hora de fin absoluta y el reloj las pinta con `Text(timerInterval:)`, que sigue contando con
//! todo suspendido; las constantes vitales, en cambio, se marcan como viejas pasado [`STALE_AFTER_MS`]
//! en lugar de proyectarse, porque proyectarlas sería inventarse estado en el reloj.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::care::{pet_glance, PetGlance};
use crate::state::AppState;
use crate::surfaces::{surfaces, Surface};

/// Cuánto se confía en las constantes vitales de un resumen. Pasado esto, el reloj las enseña
/// apagadas: el deterioro lo calcula el servidor al leer el estado, y el reloj no lo adivina.
const STALE_AFTER_MS: i64 = 30 * 60 * 1000;

/// Cuánto vale una intención del reloj. Una acción que llevaba media hora en la cola del sistema
/// puede ser justo lo contrario de lo que el jugador quería.
pub const REQUEST_TTL_MS: i64 = 30 * 60 * 1000;

/// Como poco, cuánto se espera entre dos envíos al reloj. WatchConnectivity entrega cuando el
/// sistema quiere y siempre el último contexto, así que mandar más solo gasta batería.
const MIN_SEND_GAP_MS: i64 = 15 * 1000;

/// Por encima de esta higiene el backend rechaza el baño («ya está limpia»). El mismo número que
/// `cleanMaxHygiene` de `balance.json`, igual que los umbrales de `notices.rs` viven aquí: el núcleo
/// no carga los datos de juego, y preguntar al servidor para saber si pintar un botón gris no vale
/// la pena.
const CLEAN_MAX_HYGIENE: i64 = 80;

/// Nivel mínimo para la forma final y el objeto que la libera. Los mismos que
/// `evolution.finalStageMinLevel` y `evolution.finalStageItemId` de `balance.json`, replicados aquí
/// por lo mismo que [`CLEAN_MAX_HYGIENE`]: el núcleo no carga los datos de juego y preguntar al
/// servidor para saber si pintar un botón gris no vale la pena.
const EVOLVE_MIN_LEVEL: i64 = 50;
const EVOLVE_ITEM_ID: &str = "evolution_stone";

/// La experiencia que hace falta para pasar de `level` al siguiente.
///
/// **Es una regla del servidor replicada**: vive en `xpForLevel` de
/// `backend/src/modules/pets/pets.service.ts` y no en `balance.json`, así que si allí cambia la
/// curva hay que cambiarla aquí. Se replica porque el anillo de nivel del reloj no merece una
/// consulta al servidor, y es el mismo trato que [`CLEAN_MAX_HYGIENE`].
fn xp_for_level(level: i64) -> i64 {
    (100.0 * (level.max(1) as f64).powf(1.5)).round() as i64
}

/// Lo que el jugador puede hacer desde el reloj: lo que se resuelve de un toque y no necesita leer
/// nada más que el estado que el núcleo ya tiene.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WristAction {
    Feed,
    Clean,
    Sleep,
    Wake,
    Heal,
    Evolve,
}

impl WristAction {
    fn label(self) -> &'static str {
        match self {
            WristAction::Feed => "Dar de comer",
            WristAction::Clean => "Bañar",
            WristAction::Sleep => "A dormir",
            WristAction::Wake => "Despertar",
            WristAction::Heal => "Curar",
            WristAction::Evolve => "Evolucionar",
        }
    }

    /// El nombre del icono en el set propio (`shared/ui/src/icons`). Viaja como **dato**, no como un
    /// `switch` en Swift: el reloj dibuja lo que le dicen y no decide nada.
    fn icon(self) -> &'static str {
        match self {
            WristAction::Feed => "feed",
            WristAction::Clean => "clean",
            WristAction::Sleep => "sleep",
            WristAction::Wake => "wake",
            WristAction::Heal => "heal",
            WristAction::Evolve => "evolve",
        }
    }
}

/// Un botón del reloj, ya decidido: si se puede pulsar y, si no, por qué.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WristButton {
    pub action: WristAction,
    pub label: String,
    pub enabled: bool,
    /// El icono que lo pinta, del set propio de interfaz.
    pub icon: String,
    /// Qué enseñar cuando está gris. Corto: cabe en una pantalla de reloj.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled_reason: Option<String>,
    /// Con qué se hace, cuando la acción gasta un objeto (comer y curar). **Lo elige el núcleo**;
    /// decírselo al reloj no le da ningún conocimiento nuevo de la mochila, solo deja de pintarle un
    /// cubierto genérico donde va una manzana.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_name: Option<String>,
}

/// La mascota activa, vista desde la muñeca: el [`PetGlance`] que ya comparten el widget de iOS y
/// los avisos, más lo que solo el reloj necesita.
///
/// Es un tipo aparte y **no campos nuevos en `PetGlance`** a propósito: ese resumen vive guardado en
/// el App Group del iPhone y lo decodifica `PockaiPetGlance.load` con campos no opcionales, así que
/// una clave obligatoria nueva dejaría sin decodificar lo ya guardado y el widget se caería a «Abre
/// Pockai» hasta la siguiente pasada en segundo plano.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WristPet {
    /// Plano en el JSON: Swift declara un solo tipo con todos los campos al mismo nivel.
    #[serde(flatten)]
    pub glance: PetGlance,
    /// Con qué sprite se dibuja: el `spriteKey` de la especie y la etapa.
    pub species_id: String,
    /// `baby`, `juvenile`, `adult` o `final`.
    pub stage: String,
    /// El Flujo de la especie (`fire`, `water`, `plant`, `electric`, `shadow`, `light`), para teñir.
    pub element: String,
    pub xp: i64,
    /// Cuánta experiencia pide el nivel siguiente. El reloj pinta la barra; aquí no se resta nada.
    pub xp_needed: i64,
    /// El vínculo, de 0 a 100.
    pub bonding: i64,
    /// La constante que peor está y su valor: es lo que se enseña en la esfera. **Lo decide aquí el
    /// núcleo** y no SwiftUI, que antes lo recalculaba por su cuenta.
    pub lowest: String,
    pub lowest_value: i64,
}

impl std::ops::Deref for WristPet {
    type Target = PetGlance;
    /// `pet.hunger` en lugar de `pet.glance.hunger`: el resumen de siempre sigue leyéndose igual
    /// desde fuera, aunque dentro vaya envuelto.
    fn deref(&self) -> &PetGlance {
        &self.glance
    }
}

/// Lo que el jugador lleva encima. Va empaquetado y no suelto en el resumen para que
/// [`should_send`] lo cubra con una sola comparación.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WristWallet {
    pub coins: i64,
    pub gems: i64,
}

/// El resumen que el iPhone le manda al reloj. Sin tokens y sin nada que identifique al usuario:
/// viaja por WatchConnectivity y se queda guardado en el reloj.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WristSnapshot {
    /// La revisión del estado del núcleo. El reloj **descarta** cualquier resumen con una `rev`
    /// menor que la que ya tiene: WatchConnectivity no garantiza el orden de entrega.
    pub rev: u64,
    pub generated_at: i64,
    /// A partir de cuándo las constantes dejan de ser de fiar.
    pub stale_at: i64,
    /// Si hay sesión. Sin ella el reloj solo sabe pedir que se abra el iPhone.
    pub signed_in: bool,
    /// La mascota activa, o `None` sin sesión o sin mascota.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pet: Option<WristPet>,
    /// Monedas y gemas, o `None` sin sesión.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wallet: Option<WristWallet>,
    /// Las cuentas atrás con hora de fin conocida, las mismas que la Live Activity del iPhone.
    pub surfaces: Vec<Surface>,
    pub buttons: Vec<WristButton>,
}

/// Lo que el reloj manda al iPhone cuando el jugador pulsa un botón.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WristRequest {
    /// Lo pone el reloj (un UUID). Sirve para no actuar dos veces: `transferUserInfo` puede
    /// entregar el mismo mensaje otra vez tras un reinicio.
    pub request_id: String,
    pub action: WristAction,
    /// Cuándo lo pulsó el jugador, en milisegundos desde la época.
    pub issued_at: i64,
}

/// Por qué no se hace lo que pide el reloj. El reloj lo enseña tal cual.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "reason", content = "detail")]
pub enum WristReject {
    /// No hay sesión o no hay mascota.
    NoPet,
    /// Llegó demasiado tarde para que signifique lo que significaba.
    Expired,
    /// Ya se hizo: el mismo `request_id` otra vez.
    Duplicate,
    /// El botón no se podía pulsar (sin comida, ya está limpia, ya duerme…).
    Unavailable(String),
}

impl WristReject {
    /// El texto que enseña el reloj.
    pub fn message(&self) -> String {
        match self {
            WristReject::NoPet => "Abre Pockai en el iPhone".into(),
            WristReject::Expired => "La acción caducó; vuelve a intentarlo".into(),
            WristReject::Duplicate => "Ya estaba hecho".into(),
            WristReject::Unavailable(why) => why.clone(),
        }
    }
}

/// Lo mínimo para una complicación de la esfera: lo que cabe en un círculo.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WristComplication {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// `sick`, `sleeping`, `hungry`, `sad` o `happy`, los mismos que decide `care.rs`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mood: Option<String>,
    /// La constante más baja y su valor: es lo que el jugador necesita saber de un vistazo.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lowest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lowest_value: Option<i64>,
    /// La hora de fin más próxima, si hay alguna cuenta atrás.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ends_at: Option<i64>,
    pub stale_at: i64,
}

/// El resumen para la muñeca con este estado. `now` es el reloj en milisegundos desde la época.
pub fn snapshot(state: &AppState, now: i64) -> WristSnapshot {
    let signed_in = !state.user.is_null();
    let pet = state.active_pet();
    WristSnapshot {
        rev: state.rev,
        generated_at: now,
        stale_at: now + STALE_AFTER_MS,
        signed_in,
        pet: pet.filter(|_| signed_in).map(wrist_pet),
        wallet: signed_in.then(|| WristWallet {
            coins: state.user.get("coins").and_then(Value::as_i64).unwrap_or(0),
            gems: state.user.get("gems").and_then(Value::as_i64).unwrap_or(0),
        }),
        surfaces: if signed_in { surfaces(state, now) } else { Vec::new() },
        buttons: buttons(state),
    }
}

/// La mascota activa vista desde la muñeca. El ánimo y las constantes salen de [`pet_glance`], que
/// es el mismo criterio que usan los avisos y el widget de iOS: no hay dos reglas en la app.
fn wrist_pet(pet: &Value) -> WristPet {
    let glance = pet_glance(pet);
    let level = glance.level;
    let (lowest, lowest_value) = worst(&glance);
    WristPet {
        species_id: pet
            .get("species")
            .and_then(|s| s.get("spriteKey").or_else(|| s.get("id")))
            .and_then(Value::as_str)
            .or_else(|| pet.get("speciesId").and_then(Value::as_str))
            .unwrap_or("ignisaur")
            .to_string(),
        stage: pet.get("stage").and_then(Value::as_str).unwrap_or("baby").to_string(),
        element: pet
            .get("species")
            .and_then(|s| s.get("element"))
            .and_then(Value::as_str)
            .unwrap_or("neutral")
            .to_string(),
        xp: stat(pet, "xp"),
        xp_needed: xp_for_level(level),
        bonding: stat(pet, "bonding"),
        lowest,
        lowest_value,
        glance,
    }
}

/// La constante que peor está. A igual valor gana la primera de la lista, que es el orden en que se
/// cuidan.
fn worst(g: &PetGlance) -> (String, i64) {
    [
        ("hunger", g.hunger),
        ("happiness", g.happiness),
        ("energy", g.energy),
        ("hygiene", g.hygiene),
        ("health", g.health),
    ]
    .into_iter()
    .min_by_key(|(_, v)| *v)
    .map(|(k, v)| (k.to_string(), v))
    .expect("la lista no está vacía")
}

/// Los botones, ya decididos. Sin sesión o sin mascota no hay ninguno: el reloj enseña «abre el
/// iPhone» en lugar de botones que no harían nada.
pub fn buttons(state: &AppState) -> Vec<WristButton> {
    if state.user.is_null() {
        return Vec::new();
    }
    let Some(pet) = state.active_pet() else { return Vec::new() };
    let sleeping = pet.get("sleeping").and_then(Value::as_bool).unwrap_or(false);
    let hygiene = stat(pet, "hygiene");

    let food = food_item(state);
    let medicine = medicine_item(state);

    let mut out = Vec::with_capacity(5);
    out.push(
        button(
            WristAction::Feed,
            if sleeping {
                Some("Está durmiendo".into())
            } else if food.is_none() {
                Some("Sin comida en la mochila".into())
            } else {
                None
            },
        )
        .with_item(food),
    );
    out.push(button(
        WristAction::Clean,
        if sleeping {
            Some("Está durmiendo".into())
        } else if hygiene >= CLEAN_MAX_HYGIENE {
            Some("Ya está limpia".into())
        } else {
            None
        },
    ));
    // Dormir y despertar son el mismo botón: lo que toque según cómo esté.
    out.push(button(if sleeping { WristAction::Wake } else { WristAction::Sleep }, None));
    // Curar **no** se cierra por «no está enferma»: el backend no lo exige (solo una medicina
    // válida), y esconderlo dejaría fuera el caso útil de la salud baja sin enfermedad.
    out.push(
        button(
            WristAction::Heal,
            if sleeping {
                Some("Está durmiendo".into())
            } else if medicine.is_none() {
                Some("Sin medicinas en la mochila".into())
            } else {
                None
            },
        )
        .with_item(medicine),
    );
    out.push(button(
        WristAction::Evolve,
        evolve_blocked(state, pet, stat(pet, "level"), sleeping),
    ));
    out
}

/// Por qué no se puede evolucionar, si no se puede. Las mismas tres puertas que el backend
/// (`pets.service.ts`, `evolve()`): etapa, nivel y la Piedra de Evolución.
fn evolve_blocked(state: &AppState, pet: &Value, level: i64, sleeping: bool) -> Option<String> {
    let stage = pet.get("stage").and_then(Value::as_str).unwrap_or("baby");
    if sleeping {
        return Some("Está durmiendo".into());
    }
    if stage == "final" {
        return Some("Ya está en su forma final".into());
    }
    if stage != "adult" {
        return Some("Todavía no es adulta".into());
    }
    if level < EVOLVE_MIN_LEVEL {
        return Some(format!("Hace falta nivel {EVOLVE_MIN_LEVEL}"));
    }
    if !has_item(state, EVOLVE_ITEM_ID) {
        return Some("Sin Piedra de Evolución".into());
    }
    None
}

fn button(action: WristAction, disabled_reason: Option<String>) -> WristButton {
    WristButton {
        action,
        label: action.label().into(),
        enabled: disabled_reason.is_none(),
        icon: action.icon().into(),
        disabled_reason,
        item_id: None,
        item_name: None,
    }
}

impl WristButton {
    /// Anota con qué objeto se hará la acción, para que el reloj lo pinte.
    fn with_item(mut self, item: Option<(String, String)>) -> Self {
        if let Some((id, name)) = item {
            self.item_name = Some(name);
            self.item_id = Some(id);
        }
        self
    }
}

/// La acción del núcleo que corresponde a una intención del reloj, o por qué no se hace.
///
/// `seen` son los `request_id` que ya se atendieron: la cola del sistema puede entregar el mismo
/// mensaje dos veces, y pagar dos manzanas por un doble envío se nota.
pub fn resolve(
    req: &WristRequest,
    state: &AppState,
    now: i64,
    seen: &[String],
) -> Result<crate::Action, WristReject> {
    if seen.iter().any(|id| id == &req.request_id) {
        return Err(WristReject::Duplicate);
    }
    // Un reloj con la hora adelantada no debería invalidar sus propias acciones: solo cuenta el
    // retraso, no el adelanto.
    if now - req.issued_at > REQUEST_TTL_MS {
        return Err(WristReject::Expired);
    }
    let pet_id = state
        .active_pet()
        .filter(|_| !state.user.is_null())
        .and_then(|p| p.get("id").and_then(Value::as_str))
        .map(str::to_string)
        .ok_or(WristReject::NoPet)?;

    // El mismo juez que pinta los botones decide si la acción vale: así el reloj no puede colar una
    // acción que su pantalla enseñaba en gris.
    let available = buttons(state);
    match available.iter().find(|b| b.action == req.action) {
        None => return Err(WristReject::Unavailable("Eso ahora no se puede".into())),
        Some(b) if !b.enabled => {
            return Err(WristReject::Unavailable(b.disabled_reason.clone().unwrap_or_else(|| "Ahora no".into())))
        }
        Some(_) => {}
    }

    Ok(match req.action {
        WristAction::Feed => {
            let (item_id, _) =
                food_item(state).ok_or_else(|| WristReject::Unavailable("Sin comida en la mochila".into()))?;
            crate::Action::Feed { pet_id, item_id }
        }
        WristAction::Clean => crate::Action::Clean { pet_id },
        WristAction::Sleep => crate::Action::Sleep { pet_id },
        WristAction::Wake => crate::Action::Wake { pet_id },
        WristAction::Heal => {
            let (item_id, _) = medicine_item(state)
                .ok_or_else(|| WristReject::Unavailable("Sin medicinas en la mochila".into()))?;
            crate::Action::Heal { pet_id, item_id }
        }
        WristAction::Evolve => crate::Action::Evolve { pet_id },
    })
}

/// Lo que hay en la mochila de una clase, con su identificador y su nombre. Se recorre entero: el
/// inventario del núcleo es una lista corta.
fn bag<'a>(state: &'a AppState, kind: &str) -> impl Iterator<Item = (&'a str, &'a Value)> {
    let kind = kind.to_string();
    state.inventory.iter().filter_map(move |entry| {
        if entry.get("qty").and_then(Value::as_i64).unwrap_or(0) <= 0 {
            return None;
        }
        let item = entry.get("item")?;
        if item.get("kind").and_then(Value::as_str) != Some(kind.as_str()) {
            return None;
        }
        Some((item.get("id").and_then(Value::as_str)?, item))
    })
}

/// Si hay al menos una unidad de este objeto, sea de la clase que sea.
fn has_item(state: &AppState, id: &str) -> bool {
    state.inventory.iter().any(|entry| {
        entry.get("qty").and_then(Value::as_i64).unwrap_or(0) > 0
            && entry.get("item").and_then(|i| i.get("id")).and_then(Value::as_str) == Some(id)
    })
}

fn item_name(item: &Value, id: &str) -> String {
    item.get("name").and_then(Value::as_str).unwrap_or(id).to_string()
}

/// Lo que cuesta un objeto, para ordenar de más corriente a más raro. Un objeto que no se vende
/// (precio cero en las dos monedas: los que solo salen de cofres o hallazgos) va el último, no el
/// primero: gastar el más raro del juego desde la muñeca y sin preguntar sería una faena.
fn price_rank(item: &Value) -> (bool, i64, i64) {
    let coins = item.get("priceCoins").and_then(Value::as_i64).unwrap_or(0);
    let gems = item.get("priceGems").and_then(Value::as_i64).unwrap_or(0);
    let sold = coins > 0 || gems > 0;
    (!sold, gems, coins)
}

/// Con qué se le da de comer: la comida favorita de su especie si está en la mochila y, si no, la
/// más corriente. El reloj no elige: no conoce la mochila ni debería.
fn food_item(state: &AppState) -> Option<(String, String)> {
    let favorite = state
        .active_pet()
        .and_then(|p| p.get("species"))
        .and_then(|s| s.get("favoriteFood"))
        .and_then(Value::as_str);

    let mut best: Option<((bool, i64, i64), &str, &Value)> = None;
    for (id, item) in bag(state, "food") {
        if Some(id) == favorite {
            return Some((id.to_string(), item_name(item, id)));
        }
        let rank = price_rank(item);
        // A igual precio, el id decide: así la elección no depende del orden de la mochila.
        if best.as_ref().is_none_or(|(r, bid, _)| rank < *r || (rank == *r && id < *bid)) {
            best = Some((rank, id, item));
        }
    }
    best.map(|(_, id, item)| (id.to_string(), item_name(item, id)))
}

/// Con qué se cura: la medicina más corriente de la mochila que de verdad sirva.
///
/// El backend (`pets.service.ts`, `heal()`) rechaza con un 400 un objeto medicinal que no cure la
/// enfermedad ni dé salud, y el rechazo llega **después** de haberlo gastado, así que aquí se filtra
/// igual. Y no vale «la más barata» a secas: el Néctar del Origen vale cero en las dos monedas
/// porque no se vende, y sería justo el que se gastaría.
fn medicine_item(state: &AppState) -> Option<(String, String)> {
    let mut best: Option<((bool, i64, i64), &str, &Value)> = None;
    for (id, item) in bag(state, "medicine") {
        let effects = item.get("effects");
        let cures = effects.and_then(|e| e.get("curesSick")).and_then(Value::as_bool).unwrap_or(false);
        let heals = effects.and_then(|e| e.get("health")).and_then(Value::as_i64).unwrap_or(0) > 0;
        if !cures && !heals {
            continue;
        }
        let rank = price_rank(item);
        if best.as_ref().is_none_or(|(r, bid, _)| rank < *r || (rank == *r && id < *bid)) {
            best = Some((rank, id, item));
        }
    }
    best.map(|(_, id, item)| (id.to_string(), item_name(item, id)))
}

fn stat(pet: &Value, key: &str) -> i64 {
    pet.get(key).and_then(Value::as_f64).map(|v| v.round() as i64).unwrap_or(0)
}

/// Si vale la pena mandarle al reloj este resumen. Se compara lo que **se ve**, no la hora: el
/// `generated_at` cambia en cada pasada y reenviar por eso gastaría el presupuesto del sistema.
pub fn should_send(previous: Option<&WristSnapshot>, next: &WristSnapshot, last_sent_at: i64, now: i64) -> bool {
    let Some(before) = previous else { return true };
    if now - last_sent_at < MIN_SEND_GAP_MS {
        return false;
    }
    before.signed_in != next.signed_in
        || before.pet != next.pet
        || before.wallet != next.wallet
        || before.surfaces != next.surfaces
        || before.buttons != next.buttons
}

/// Lo que cabe en una complicación de la esfera.
pub fn complication(snap: &WristSnapshot) -> WristComplication {
    WristComplication {
        name: snap.pet.as_ref().map(|p| p.glance.name.clone()),
        mood: snap.pet.as_ref().map(|p| p.glance.mood.to_string()),
        lowest: snap.pet.as_ref().map(|p| p.lowest.clone()),
        lowest_value: snap.pet.as_ref().map(|p| p.lowest_value),
        ends_at: snap.surfaces.first().map(|s| s.ends_at),
        stale_at: snap.stale_at,
    }
}

impl crate::Core {
    /// El resumen para la muñeca con el estado que el núcleo ya tiene.
    pub fn wrist_snapshot(&self, now: i64) -> WristSnapshot {
        snapshot(&self.state_snapshot(), now)
    }

    /// El resumen que toca mandarle al reloj ahora, o `None` si no hay nada nuevo que se vea.
    ///
    /// Es la misma idea que `surfaces_diff`: el núcleo recuerda lo último que mandó para que una
    /// pasada que no cambia nada no gaste el presupuesto de WatchConnectivity.
    pub fn wrist_push(&self, now: i64) -> Option<WristSnapshot> {
        let next = self.wrist_snapshot(now);
        let mut sent = self.wrist_sent();
        let (previous, last_sent_at) = match sent.as_ref() {
            Some((snap, at)) => (Some(snap), *at),
            None => (None, 0),
        };
        if !should_send(previous, &next, last_sent_at, now) {
            return None;
        }
        *sent = Some((next.clone(), now));
        Some(next)
    }

    /// Olvida lo último que se mandó, para que el siguiente resumen salga sí o sí. Se usa cuando el
    /// reloj dice que no tiene nada: puede haberse reinstalado.
    pub fn wrist_forget(&self) {
        *self.wrist_sent() = None;
    }

    /// Hace lo que pide el reloj y devuelve el resumen nuevo. Si no se puede, dice por qué y el
    /// reloj lo enseña: no se encola nada aquí, porque el reloj no tiene estado propio.
    pub async fn wrist_perform(&self, req: &WristRequest, now: i64) -> Result<WristSnapshot, WristReject> {
        let action = {
            let seen = self.wrist_seen();
            resolve(req, &self.state_snapshot(), now, &seen)?
        };
        match self.perform(action).await {
            Ok(_) => {
                self.wrist_remember(&req.request_id);
                Ok(self.wrist_snapshot(now))
            }
            // Un fallo del servidor no se recuerda: el jugador puede volver a pulsar.
            Err(e) => Err(WristReject::Unavailable(e.message)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// 2026-11-20T15:00:00Z en milisegundos.
    const NOW: i64 = 1_795_186_800_000;

    fn state(pet: Value, inventory: Vec<Value>) -> AppState {
        AppState {
            rev: 7,
            user: json!({ "id": "u1" }),
            pets: vec![pet],
            inventory,
            ..AppState::default()
        }
    }

    fn pet() -> Value {
        json!({
            "id": "p1", "nickname": "Brasa", "level": 7, "xp": 900, "stage": "juvenile", "bonding": 42,
            "hunger": 40, "happiness": 70, "energy": 60, "hygiene": 30, "health": 90,
            "species": { "id": "ignisaur", "spriteKey": "ignisaur", "name": "Ignisaurio",
                         "element": "fire", "favoriteFood": "spicy_berry" },
        })
    }

    /// Una medicina de la mochila. `sold` distingue la que se vende de la que solo sale de cofres.
    fn medicine(id: &str, coins: i64, cures: bool, health: i64) -> Value {
        json!({ "qty": 1, "item": { "id": id, "kind": "medicine", "name": id, "priceCoins": coins,
                                    "priceGems": 0, "effects": { "curesSick": cures, "health": health } } })
    }

    fn stone() -> Value {
        json!({ "qty": 1, "item": { "id": "evolution_stone", "kind": "evolution",
                                    "name": "Piedra de Evolución", "priceCoins": 0, "priceGems": 20 } })
    }

    /// Los botones que hay ahora mismo, por acción.
    fn acciones(s: &AppState) -> Vec<WristAction> {
        buttons(s).iter().map(|b| b.action).collect()
    }

    /// Un botón concreto.
    fn boton(s: &AppState, action: WristAction) -> WristButton {
        buttons(s).into_iter().find(|b| b.action == action).expect("el botón existe")
    }

    fn food(id: &str, price: i64, qty: i64) -> Value {
        json!({ "qty": qty, "item": { "id": id, "kind": "food", "priceCoins": price } })
    }

    fn req(action: WristAction) -> WristRequest {
        WristRequest { request_id: "r1".into(), action, issued_at: NOW }
    }

    #[test]
    fn el_resumen_lleva_constantes_cuentas_atras_y_botones() {
        let mut s = state(pet(), vec![food("apple", 10, 2)]);
        s.eggs = vec![json!({ "id": "e1", "eggType": "starter", "hatchesAt": "2026-11-20T16:00:00Z" })];
        let snap = snapshot(&s, NOW);
        assert_eq!(snap.rev, 7);
        assert!(snap.signed_in);
        let p = snap.pet.as_ref().expect("mascota");
        assert_eq!((p.name.as_str(), p.level, p.hunger), ("Brasa", 7, 40));
        assert_eq!(snap.surfaces.len(), 1);
        assert_eq!(snap.surfaces[0].ends_at, NOW + 3_600_000);
        assert_eq!(snap.stale_at, NOW + 30 * 60 * 1000);
        assert_eq!(
            snap.buttons.iter().map(|b| b.action).collect::<Vec<_>>(),
            vec![WristAction::Feed, WristAction::Clean, WristAction::Sleep, WristAction::Heal, WristAction::Evolve]
        );
        // Comer, bañar y dormir sí; curar y evolucionar no, que no hay ni medicina ni piedra.
        assert_eq!(snap.buttons.iter().filter(|b| b.enabled).count(), 3);
    }

    #[test]
    fn el_resumen_lleva_con_que_dibujar_a_la_mascota_y_lo_que_lleva_encima() {
        let mut s = state(pet(), vec![food("apple", 10, 2)]);
        s.user = json!({ "id": "u1", "coins": 1250, "gems": 7 });
        let snap = snapshot(&s, NOW);
        let p = snap.pet.as_ref().expect("mascota");
        assert_eq!((p.species_id.as_str(), p.stage.as_str(), p.element.as_str()), ("ignisaur", "juvenile", "fire"));
        assert_eq!((p.xp, p.bonding), (900, 42));
        // La curva del servidor: round(100 · 7^1.5) = 1852.
        assert_eq!(p.xp_needed, 1852);
        // La higiene es la que peor está (30), y la decide el núcleo, no SwiftUI.
        assert_eq!((p.lowest.as_str(), p.lowest_value), ("hygiene", 30));
        assert_eq!(snap.wallet, Some(WristWallet { coins: 1250, gems: 7 }));
        // Y el botón de comer dice con qué, para que el reloj pinte la manzana.
        let feed = boton(&s, WristAction::Feed);
        assert_eq!((feed.item_id.as_deref(), feed.item_name.as_deref()), (Some("apple"), Some("apple")));
        assert_eq!(feed.icon, "feed");
    }

    #[test]
    fn curar_no_depende_de_estar_enferma_sino_de_tener_medicina_que_sirva() {
        // Sin medicinas, gris con su motivo.
        let vacia = state(pet(), vec![food("apple", 10, 1)]);
        let gris = boton(&vacia, WristAction::Heal);
        assert!(!gris.enabled);
        assert_eq!(gris.disabled_reason.as_deref(), Some("Sin medicinas en la mochila"));

        // Un objeto medicinal que ni cura ni da salud no cuenta: el backend lo rechazaría con un
        // 400 **después** de gastarlo.
        let inservible = state(pet(), vec![medicine("agua", 5, false, 0)]);
        assert!(!boton(&inservible, WristAction::Heal).enabled);

        // Con una que sirve, el botón va, aunque la mascota no esté enferma.
        let con = state(pet(), vec![medicine("medicine", 80, true, 40)]);
        let activo = boton(&con, WristAction::Heal);
        assert!(activo.enabled, "la salud baja sin enfermedad también se cura");
        assert_eq!(activo.item_id.as_deref(), Some("medicine"));
    }

    #[test]
    fn curar_no_gasta_la_medicina_que_no_se_vende() {
        // El Néctar del Origen vale cero en las dos monedas porque no se vende: «la más barata»
        // gastaría el objeto más raro del juego desde la muñeca.
        let s = state(
            pet(),
            vec![medicine("origin_nectar", 0, true, 100), medicine("medicine", 80, true, 40)],
        );
        assert_eq!(medicine_item(&s).map(|(id, _)| id).as_deref(), Some("medicine"));

        // Si es lo único que hay, entonces sí.
        let solo = state(pet(), vec![medicine("origin_nectar", 0, true, 100)]);
        assert_eq!(medicine_item(&solo).map(|(id, _)| id).as_deref(), Some("origin_nectar"));
    }

    #[test]
    fn evolucionar_pide_etapa_nivel_y_piedra() {
        let adulta = |level: i64| {
            let mut p = pet();
            p["stage"] = json!("adult");
            p["level"] = json!(level);
            p
        };
        let motivo = |s: &AppState| boton(s, WristAction::Evolve).disabled_reason.unwrap_or_default();

        // La etapa.
        assert_eq!(motivo(&state(pet(), vec![stone()])), "Todavía no es adulta");
        // El nivel.
        assert_eq!(motivo(&state(adulta(49), vec![stone()])), "Hace falta nivel 50");
        // La piedra.
        assert_eq!(motivo(&state(adulta(50), vec![])), "Sin Piedra de Evolución");
        // Ya está.
        let lista = state(adulta(50), vec![stone()]);
        assert!(boton(&lista, WristAction::Evolve).enabled);
        assert_eq!(
            resolve(&req(WristAction::Evolve), &lista, NOW, &[]),
            Ok(crate::Action::Evolve { pet_id: "p1".into() })
        );

        // Y en su forma final ya no hay a dónde ir.
        let mut final_ = adulta(60);
        final_["stage"] = json!("final");
        assert_eq!(motivo(&state(final_, vec![stone()])), "Ya está en su forma final");
    }

    #[test]
    fn durmiendo_no_se_cura_ni_se_evoluciona() {
        let mut p = pet();
        p["sleeping"] = json!(true);
        p["stage"] = json!("adult");
        p["level"] = json!(50);
        let s = state(p, vec![medicine("medicine", 80, true, 40), stone()]);
        for accion in [WristAction::Heal, WristAction::Evolve] {
            let b = boton(&s, accion);
            assert!(!b.enabled, "{accion:?} debería estar gris durmiendo");
            assert_eq!(b.disabled_reason.as_deref(), Some("Está durmiendo"));
        }
        // Y el mismo juez rechaza la intención, no solo la pinta gris.
        assert!(matches!(
            resolve(&req(WristAction::Heal), &s, NOW, &[]),
            Err(WristReject::Unavailable(_))
        ));
        assert_eq!(acciones(&s).len(), 5);
    }

    #[test]
    fn el_monedero_tambien_hace_que_se_reenvie_el_resumen() {
        let mut s = state(pet(), vec![food("apple", 10, 1)]);
        s.user = json!({ "id": "u1", "coins": 100, "gems": 0 });
        let antes = snapshot(&s, NOW);
        s.user = json!({ "id": "u1", "coins": 90, "gems": 0 });
        let despues = snapshot(&s, NOW + MIN_SEND_GAP_MS);
        assert!(should_send(Some(&antes), &despues, NOW, NOW + MIN_SEND_GAP_MS));
    }

    #[test]
    fn sin_sesion_el_resumen_va_vacio_y_sin_botones() {
        let s = AppState::default();
        let snap = snapshot(&s, NOW);
        assert!(!snap.signed_in);
        assert_eq!(snap.pet, None);
        assert!(snap.surfaces.is_empty());
        assert!(snap.buttons.is_empty());
    }

    #[test]
    fn el_resumen_no_lleva_tokens() {
        let mut s = state(pet(), vec![food("apple", 10, 1)]);
        s.user = json!({ "id": "u1", "email": "a@b.c", "accessToken": "secreto", "refreshToken": "secreto" });
        let json = serde_json::to_string(&snapshot(&s, NOW)).unwrap();
        for prohibido in ["token", "Token", "Bearer", "secreto", "a@b.c", "u1"] {
            assert!(!json.contains(prohibido), "el resumen filtró {prohibido}: {json}");
        }
    }

    #[test]
    fn dormir_se_vuelve_despertar_si_la_mascota_duerme() {
        let mut p = pet();
        p["sleeping"] = json!(true);
        let b = buttons(&state(p, vec![food("apple", 10, 1)]));
        assert_eq!(b[2].action, WristAction::Wake);
        assert!(b[2].enabled);
        // Durmiendo no se come ni se baña: lo rechazaría el backend.
        assert_eq!(b[0].disabled_reason.as_deref(), Some("Está durmiendo"));
        assert_eq!(b[1].disabled_reason.as_deref(), Some("Está durmiendo"));
    }

    #[test]
    fn dar_de_comer_prefiere_la_favorita_y_si_no_la_mas_barata() {
        let con_favorita = state(pet(), vec![food("apple", 10, 3), food("spicy_berry", 25, 1)]);
        assert_eq!(food_item(&con_favorita).map(|(id, _)| id).as_deref(), Some("spicy_berry"));

        let sin_favorita = state(pet(), vec![food("sweet_coral", 25, 1), food("apple", 10, 1)]);
        assert_eq!(food_item(&sin_favorita).map(|(id, _)| id).as_deref(), Some("apple"));

        // Lo que no es comida, o lo que se acabó, no cuenta.
        let nada = state(
            pet(),
            vec![
                json!({ "qty": 5, "item": { "id": "elixir", "kind": "medicine", "priceCoins": 1 } }),
                food("apple", 10, 0),
            ],
        );
        assert_eq!(food_item(&nada), None);
    }

    #[test]
    fn sin_comida_el_boton_va_gris_con_su_motivo() {
        let s = state(pet(), vec![]);
        let b = buttons(&s);
        assert!(!b[0].enabled);
        assert_eq!(b[0].disabled_reason.as_deref(), Some("Sin comida en la mochila"));
        // Y no se puede colar por la puerta de atrás.
        assert_eq!(
            resolve(&req(WristAction::Feed), &s, NOW, &[]),
            Err(WristReject::Unavailable("Sin comida en la mochila".into()))
        );
    }

    #[test]
    fn con_la_mascota_limpia_no_se_puede_banar() {
        let mut p = pet();
        p["hygiene"] = json!(80);
        let s = state(p, vec![]);
        assert_eq!(buttons(&s)[1].disabled_reason.as_deref(), Some("Ya está limpia"));
        assert_eq!(
            resolve(&req(WristAction::Clean), &s, NOW, &[]),
            Err(WristReject::Unavailable("Ya está limpia".into()))
        );
    }

    #[test]
    fn una_intencion_se_convierte_en_la_accion_del_nucleo() {
        let s = state(pet(), vec![food("apple", 10, 1)]);
        assert_eq!(
            resolve(&req(WristAction::Feed), &s, NOW, &[]),
            Ok(crate::Action::Feed { pet_id: "p1".into(), item_id: "apple".into() })
        );
        assert_eq!(resolve(&req(WristAction::Clean), &s, NOW, &[]), Ok(crate::Action::Clean { pet_id: "p1".into() }));
        assert_eq!(resolve(&req(WristAction::Sleep), &s, NOW, &[]), Ok(crate::Action::Sleep { pet_id: "p1".into() }));
    }

    #[test]
    fn una_intencion_caducada_se_rechaza_pero_un_reloj_adelantado_no() {
        let s = state(pet(), vec![food("apple", 10, 1)]);
        let vieja = WristRequest { issued_at: NOW - REQUEST_TTL_MS - 1, ..req(WristAction::Clean) };
        assert_eq!(resolve(&vieja, &s, NOW, &[]), Err(WristReject::Expired));

        let justo = WristRequest { issued_at: NOW - REQUEST_TTL_MS, ..req(WristAction::Clean) };
        assert!(resolve(&justo, &s, NOW, &[]).is_ok());

        let adelantada = WristRequest { issued_at: NOW + 5_000, ..req(WristAction::Clean) };
        assert!(resolve(&adelantada, &s, NOW, &[]).is_ok());
    }

    #[test]
    fn la_misma_intencion_dos_veces_solo_actua_una() {
        let s = state(pet(), vec![food("apple", 10, 1)]);
        assert_eq!(resolve(&req(WristAction::Feed), &s, NOW, &["r1".into()]), Err(WristReject::Duplicate));
        assert!(resolve(&req(WristAction::Feed), &s, NOW, &["otro".into()]).is_ok());
    }

    #[test]
    fn sin_sesion_o_sin_mascota_no_se_actua() {
        assert_eq!(resolve(&req(WristAction::Clean), &AppState::default(), NOW, &[]), Err(WristReject::NoPet));
        let mut s = state(pet(), vec![]);
        s.pets.clear();
        assert_eq!(resolve(&req(WristAction::Clean), &s, NOW, &[]), Err(WristReject::NoPet));
    }

    #[test]
    fn el_resumen_no_se_reenvia_si_no_cambia_nada_que_se_vea() {
        let s = state(pet(), vec![food("apple", 10, 1)]);
        let antes = snapshot(&s, NOW);
        assert!(should_send(None, &antes, 0, NOW), "el primero siempre se manda");

        // Solo ha pasado el tiempo: no se reenvía.
        let igual = snapshot(&s, NOW + MIN_SEND_GAP_MS + 1);
        assert!(!should_send(Some(&antes), &igual, NOW, NOW + MIN_SEND_GAP_MS + 1));

        // Ha comido: sí.
        let mut p = pet();
        p["hunger"] = json!(90);
        let distinto = snapshot(&state(p, vec![food("apple", 10, 1)]), NOW + MIN_SEND_GAP_MS + 1);
        assert!(should_send(Some(&antes), &distinto, NOW, NOW + MIN_SEND_GAP_MS + 1));

        // Pero no antes de que pase el hueco mínimo.
        assert!(!should_send(Some(&antes), &distinto, NOW, NOW + 1_000));
    }

    #[test]
    fn la_complicacion_lleva_la_constante_mas_baja_y_la_cuenta_atras_mas_proxima() {
        let mut s = state(pet(), vec![]);
        s.eggs = vec![
            json!({ "id": "e2", "hatchesAt": "2026-11-20T18:00:00Z" }),
            json!({ "id": "e1", "hatchesAt": "2026-11-20T16:00:00Z" }),
        ];
        let c = complication(&snapshot(&s, NOW));
        assert_eq!(c.name.as_deref(), Some("Brasa"));
        assert_eq!((c.lowest.as_deref(), c.lowest_value), (Some("hygiene"), Some(30)));
        assert_eq!(c.ends_at, Some(NOW + 3_600_000), "la que antes termina");

        // Sin mascota, la complicación no inventa nada.
        let vacia = complication(&snapshot(&AppState::default(), NOW));
        assert_eq!((vacia.name, vacia.mood, vacia.lowest, vacia.ends_at), (None, None, None, None));
    }

    #[test]
    fn la_complicacion_cabe_en_un_kilobyte() {
        let mut s = state(pet(), vec![food("apple", 10, 1)]);
        s.eggs = vec![json!({ "id": "e1", "hatchesAt": "2026-11-20T16:00:00Z" })];
        let snap = snapshot(&s, NOW);
        assert!(serde_json::to_string(&complication(&snap)).unwrap().len() < 1024);
        // Y el resumen entero, en los cuatro que WatchConnectivity mueve con holgura.
        assert!(serde_json::to_string(&snap).unwrap().len() < 4096);
    }

    /// La forma del JSON es el contrato con Swift: `PockaiWrist.swift` decodifica estos nombres.
    /// Si alguien renombra un campo aquí, este test y el de Swift sobre el fixture se caen juntos.
    #[test]
    fn el_json_lleva_los_nombres_que_espera_swift() {
        let mut s = state(pet(), vec![food("apple", 10, 1)]);
        s.eggs = vec![json!({ "id": "e1", "hatchesAt": "2026-11-20T16:00:00Z" })];
        let v = serde_json::to_value(snapshot(&s, NOW)).unwrap();
        for campo in ["rev", "generatedAt", "staleAt", "signedIn", "pet", "surfaces", "buttons"] {
            assert!(v.get(campo).is_some(), "falta {campo} en {v}");
        }
        for campo in ["name", "level", "mood", "moodLabel", "hunger", "happiness", "energy", "hygiene", "health"] {
            assert!(v["pet"].get(campo).is_some(), "falta pet.{campo}");
        }
        assert_eq!(v["buttons"][0]["action"], "feed");
        assert_eq!(v["buttons"][2]["action"], "sleep");
        assert_eq!(v["surfaces"][0]["kind"], "eggHatching");

        let c = serde_json::to_value(complication(&snapshot(&s, NOW))).unwrap();
        for campo in ["name", "mood", "lowest", "lowestValue", "endsAt", "staleAt"] {
            assert!(c.get(campo).is_some(), "falta {campo} en la complicación: {c}");
        }
    }

    /// El fichero que decodifica el test de Swift (`PockaiWristTests`). Se regenera con
    /// `cargo test -p pockai-core fixture_del_reloj -- --ignored`.
    #[test]
    #[ignore = "escribe un fichero; se corre a mano al cambiar el contrato"]
    fn fixture_del_reloj() {
        let mut s = state(pet(), vec![food("apple", 10, 1), medicine("medicine", 80, true, 40)]);
        s.user = json!({ "id": "u1", "coins": 1250, "gems": 7 });
        s.eggs = vec![json!({ "id": "e1", "eggType": "starter", "hatchesAt": "2026-11-20T16:00:00Z" })];
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
        std::fs::create_dir_all(&dir).unwrap();
        let json = serde_json::to_string_pretty(&snapshot(&s, NOW)).unwrap();
        std::fs::write(dir.join("wrist-snapshot.json"), format!("{json}\n")).unwrap();
    }
}
