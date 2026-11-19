//! Canal en tiempo real: Socket.IO en el namespace `/realtime`.
//!
//! El servidor solo envía (no hay mensajes del cliente). Cierra la conexión cuando caduca el
//! access token con el que se abrió: aquí se renueva y se vuelve a conectar con el nuevo.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures_util::FutureExt;
use rust_socketio::asynchronous::{Client, ClientBuilder};
use rust_socketio::{Event, Payload, TransportType};
use serde_json::{json, Value};
use tokio::sync::Notify;

use crate::contract::RealtimeEvent;
use crate::core::Core;
use crate::events::CoreEvent;
use crate::jwt;

/// Mínimo entre dos renovaciones provocadas por el socket: evita bucles si el servidor rechaza un
/// token recién emitido.
const MIN_RECOVERY_INTERVAL: Duration = Duration::from_secs(5);
const BACKOFF_START: Duration = Duration::from_secs(1);
const BACKOFF_MAX: Duration = Duration::from_secs(60);
/// Una conexión que ha durado esto se considera sana: el siguiente corte reintenta enseguida.
const HEALTHY_AFTER: Duration = Duration::from_secs(30);

pub(crate) async fn run(core: Core) {
    let mut backoff = BACKOFF_START;
    let mut last_recovery: Option<Instant> = None;

    loop {
        // Se crea antes de leer el token: un cambio entre la lectura y la espera no se pierde.
        let mut token_changes = core.token_changes();
        let Some(token) = core.access_token() else {
            // Sin sesión no hay canal: se espera a que alguien entre.
            if token_changes.changed().await.is_err() {
                return;
            }
            continue;
        };

        let closed = Arc::new(Notify::new());
        let expired = Arc::new(AtomicBool::new(false));
        let started = Instant::now();

        match connect(&core, &token, closed.clone(), expired.clone()).await {
            Ok(client) => {
                // Conectado: hasta que el servidor corte o se cierre la sesión.
                loop {
                    tokio::select! {
                        _ = closed.notified() => break,
                        changed = token_changes.changed() => {
                            if changed.is_err() || core.access_token().is_none() {
                                break;
                            }
                        }
                    }
                }
                let _ = client.disconnect().await;
                core.emit(CoreEvent::RealtimeStatus { connected: false });
            }
            Err(e) => log::warn!("[tiempo real] no se pudo conectar: {e}"),
        }

        if core.access_token().is_none() {
            continue;
        }

        // Corte por caducidad del token: renovar y reconectar con el nuevo.
        if expired.load(Ordering::SeqCst) || jwt::is_expired(&token) {
            let can_recover = last_recovery.is_none_or(|at| at.elapsed() >= MIN_RECOVERY_INTERVAL);
            if can_recover {
                last_recovery = Some(Instant::now());
                if core.renew(Some(&token)).await.is_some() {
                    backoff = BACKOFF_START;
                    continue;
                }
            }
            // No se pudo renovar: se espera a que una petición HTTP lo consiga (o a un nuevo inicio
            // de sesión), con un tope para volver a intentarlo.
            if core.access_token().as_deref() == Some(token.as_str()) {
                tokio::select! {
                    _ = token_changes.changed() => {}
                    _ = tokio::time::sleep(BACKOFF_MAX) => {}
                }
            }
            continue;
        }

        // Cualquier otro corte (red, reinicio del servidor): reintento con espera creciente.
        if started.elapsed() >= HEALTHY_AFTER {
            backoff = BACKOFF_START;
        }
        tokio::select! {
            _ = tokio::time::sleep(backoff) => {}
            _ = token_changes.changed() => {}
        }
        backoff = (backoff * 2).min(BACKOFF_MAX);
    }
}

async fn connect(
    core: &Core,
    token: &str,
    closed: Arc<Notify>,
    expired: Arc<AtomicBool>,
) -> Result<Client, rust_socketio::Error> {
    let cfg = core.config();
    // El backend usa `deviceId` + `platform` como señal de presencia, y `client` para distinguir
    // la web de las apps en el modo mantenimiento.
    let auth = json!({
        "token": token,
        "deviceId": core.device_id(),
        "platform": cfg.platform,
        "client": cfg.client,
    });

    let on_connect = core.clone();
    let on_event = core.clone();
    let closed_on_close = closed.clone();
    let closed_on_error = closed;

    ClientBuilder::new(cfg.base_url.clone())
        .namespace("/realtime")
        .auth(auth)
        .transport_type(TransportType::Websocket)
        // La reconexión la lleva `run`: cada intento necesita el token vigente en el saludo.
        .reconnect(false)
        .on(Event::Connect, move |_, _| {
            let core = on_connect.clone();
            async move { core.emit(CoreEvent::RealtimeStatus { connected: true }) }.boxed()
        })
        .on(Event::Close, move |_, _| {
            let closed = closed_on_close.clone();
            async move { closed.notify_one() }.boxed()
        })
        .on(Event::Error, move |payload, _| {
            let closed = closed_on_error.clone();
            async move {
                log::warn!("[tiempo real] error del canal: {payload:?}");
                closed.notify_one();
            }
            .boxed()
        })
        .on_any(move |event, payload, _| {
            let core = on_event.clone();
            let expired = expired.clone();
            async move {
                let (name, payload) = named(String::from(event), first_value(payload));
                match name.as_str() {
                    "auth:expired" => expired.store(true, Ordering::SeqCst),
                    "maintenance" => core.emit(CoreEvent::Maintenance(payload.clone())),
                    _ => {}
                }
                core.state_on_realtime(&name, &payload);
                core.emit(CoreEvent::Realtime(RealtimeEvent { name, payload }));
            }
            .boxed()
        })
        .connect()
        .await
}

/// Un evento sin datos (`auth:expired`) llega del cliente Socket.IO como `message` con el nombre
/// del evento por carga: se devuelve con su nombre real y sin carga.
fn named(name: String, payload: Value) -> (String, Value) {
    match (name.as_str(), payload) {
        ("message", Value::String(real)) => (real, Value::Null),
        (_, payload) => (name, payload),
    }
}

/// El backend manda un único argumento por evento.
fn first_value(payload: Payload) -> Value {
    match payload {
        Payload::Text(values) => values.into_iter().next().unwrap_or(Value::Null),
        #[allow(deprecated)]
        Payload::String(text) => serde_json::from_str(&text).unwrap_or(Value::String(text)),
        Payload::Binary(_) => Value::Null,
    }
}
