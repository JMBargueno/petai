//! Canal en tiempo real: Socket.IO en el namespace `/realtime`.
//!
//! El servidor solo envía (no hay mensajes del cliente). Cierra la conexión cuando caduca el
//! access token con el que se abrió: aquí se renueva y se vuelve a conectar con el nuevo.
//!
//! El cliente es propio y mínimo: un WebSocket que habla lo justo de Engine.IO v4 y Socket.IO
//! (saludo, latido, eventos del namespace). Así el TLS es el mismo de Rust puro que usa el resto
//! del núcleo y no hace falta OpenSSL, que en Android e iOS es lo difícil de compilar.

use std::sync::Arc;
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::Connector;

use crate::contract::RealtimeEvent;
use crate::core::Core;
use crate::events::CoreEvent;
use crate::jwt;

const NAMESPACE: &str = "/realtime";
/// Mínimo entre dos renovaciones provocadas por el socket: evita bucles si el servidor rechaza un
/// token recién emitido.
const MIN_RECOVERY_INTERVAL: Duration = Duration::from_secs(5);
const BACKOFF_START: Duration = Duration::from_secs(1);
const BACKOFF_MAX: Duration = Duration::from_secs(60);
/// Una conexión que ha durado esto se considera sana: el siguiente corte reintenta enseguida.
const HEALTHY_AFTER: Duration = Duration::from_secs(30);
/// Sin latido del servidor en este tiempo, la conexión se da por muerta (el servidor avisa de su
/// propio intervalo en el saludo; esto es el tope si no lo hace).
const DEFAULT_SILENCE: Duration = Duration::from_secs(60);

/// Cómo terminó una conexión.
#[derive(Debug, PartialEq)]
enum End {
    /// El servidor avisó de que el token había caducado antes de cortar.
    Expired,
    /// Cualquier otro corte: red, reinicio del servidor, sesión cerrada.
    Closed,
}

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

        let started = Instant::now();
        let end = match connection(&core, &token, &mut token_changes).await {
            Ok(end) => end,
            Err(e) => {
                log::warn!("[tiempo real] conexión fallida: {e}");
                End::Closed
            }
        };

        if core.access_token().is_none() {
            continue;
        }

        // Corte por caducidad del token: renovar y reconectar con el nuevo.
        if end == End::Expired || jwt::is_expired(&token) {
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

/// Abre una conexión y la atiende hasta que se corta.
async fn connection(core: &Core, token: &str, token_changes: &mut tokio::sync::watch::Receiver<u64>) -> Result<End, String> {
    let cfg = core.config();
    let (stream, _) = tokio_tungstenite::connect_async_tls_with_config(socket_url(&cfg.base_url), None, false, Some(tls()))
        .await
        .map_err(|e| e.to_string())?;
    let (mut write, mut read) = stream.split();

    // El backend usa `deviceId` + `platform` como señal de presencia, y `client` para distinguir
    // la web de las apps en el modo mantenimiento.
    let auth = json!({ "token": token, "deviceId": core.device_id(), "platform": cfg.platform, "client": cfg.client });

    let mut silence = DEFAULT_SILENCE;
    let mut connected = false;
    let mut end = End::Closed;

    loop {
        let message = tokio::select! {
            message = tokio::time::timeout(silence, read.next()) => match message {
                Ok(Some(Ok(message))) => message,
                // Corte, error de red o silencio demasiado largo.
                _ => break,
            },
            changed = token_changes.changed() => {
                // Sesión cerrada: se corta. Un token renovado no molesta a la conexión abierta.
                if changed.is_err() || core.access_token().is_none() {
                    break;
                }
                continue;
            }
        };
        let text = match message {
            Message::Text(text) => text.to_string(),
            Message::Close(_) => break,
            _ => continue,
        };

        match Packet::parse(&text) {
            // Saludo de Engine.IO: dice cada cuánto late; se pide entrar en el namespace.
            Packet::Open(info) => {
                let interval = info.get("pingInterval").and_then(Value::as_u64).unwrap_or(25_000);
                let timeout = info.get("pingTimeout").and_then(Value::as_u64).unwrap_or(20_000);
                silence = Duration::from_millis(interval + timeout);
                let hello = format!("40{NAMESPACE},{auth}");
                if write.send(Message::text(hello)).await.is_err() {
                    break;
                }
            }
            Packet::Ping => {
                if write.send(Message::text("3")).await.is_err() {
                    break;
                }
            }
            Packet::Connected => {
                connected = true;
                core.emit(CoreEvent::RealtimeStatus { connected: true });
            }
            Packet::Event { name, payload } => {
                match name.as_str() {
                    "auth:expired" => end = End::Expired,
                    "maintenance" => core.emit(CoreEvent::Maintenance(payload.clone())),
                    _ => {}
                }
                core.state_on_realtime(&name, &payload);
                core.emit(CoreEvent::Realtime(RealtimeEvent { name, payload }));
            }
            // El servidor nos saca del namespace (token caducado, demasiadas conexiones…).
            Packet::Disconnected | Packet::Refused => break,
            Packet::Other => {}
        }
    }

    let _ = write.close().await;
    if connected {
        core.emit(CoreEvent::RealtimeStatus { connected: false });
    }
    Ok(end)
}

/// Lo que puede llegar por el WebSocket, ya interpretado.
#[derive(Debug, PartialEq)]
enum Packet {
    /// Engine.IO `0`: saludo con los intervalos de latido.
    Open(Value),
    /// Engine.IO `2`: latido del servidor; se responde con `3`.
    Ping,
    /// Socket.IO `40/realtime`: dentro del namespace.
    Connected,
    /// Socket.IO `41/realtime`: el servidor nos saca.
    Disconnected,
    /// Socket.IO `44/realtime`: no nos deja entrar.
    Refused,
    /// Socket.IO `42/realtime,["nombre", datos]`.
    Event { name: String, payload: Value },
    Other,
}

impl Packet {
    fn parse(text: &str) -> Packet {
        let Some(kind) = text.chars().next() else { return Packet::Other };
        let rest = &text[kind.len_utf8()..];
        match kind {
            '0' => Packet::Open(serde_json::from_str(rest).unwrap_or(Value::Null)),
            '2' => Packet::Ping,
            // `4` es un mensaje de Engine.IO que lleva un paquete de Socket.IO.
            '4' => Self::socket(rest),
            _ => Packet::Other,
        }
    }

    fn socket(text: &str) -> Packet {
        let Some(kind) = text.chars().next() else { return Packet::Other };
        let rest = &text[kind.len_utf8()..];
        // Solo interesa nuestro namespace: `/realtime,` y después los datos.
        let Some(data) = rest.strip_prefix(NAMESPACE) else { return Packet::Other };
        let data = data.strip_prefix(',').unwrap_or(data);
        match kind {
            '0' => Packet::Connected,
            '1' => Packet::Disconnected,
            '4' => Packet::Refused,
            '2' => {
                // Puede llevar delante un número de acuse: los datos empiezan en el corchete.
                let Some(start) = data.find('[') else { return Packet::Other };
                let Ok(Value::Array(mut items)) = serde_json::from_str::<Value>(&data[start..]) else { return Packet::Other };
                if items.is_empty() {
                    return Packet::Other;
                }
                let Value::String(name) = items.remove(0) else { return Packet::Other };
                // El backend manda un único argumento por evento (o ninguno).
                let payload = if items.is_empty() { Value::Null } else { items.remove(0) };
                Packet::Event { name, payload }
            }
            _ => Packet::Other,
        }
    }
}

/// `https://servidor` → `wss://servidor/socket.io/?EIO=4&transport=websocket`.
fn socket_url(base_url: &str) -> String {
    let ws = match base_url.strip_prefix("https://") {
        Some(rest) => format!("wss://{rest}"),
        None => format!("ws://{}", base_url.strip_prefix("http://").unwrap_or(base_url)),
    };
    format!("{ws}/socket.io/?EIO=4&transport=websocket")
}

/// TLS en Rust puro (rustls con ring y las raíces de Mozilla), igual que las peticiones HTTP.
fn tls() -> Connector {
    let roots = rustls::RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = rustls::ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
        .with_safe_default_protocol_versions()
        .expect("versiones de TLS")
        .with_root_certificates(roots)
        .with_no_client_auth();
    Connector::Rustls(Arc::new(config))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_url_del_socket_sale_de_la_del_backend() {
        assert_eq!(socket_url("https://game-api.pockai.world"), "wss://game-api.pockai.world/socket.io/?EIO=4&transport=websocket");
        assert_eq!(socket_url("http://127.0.0.1:3000"), "ws://127.0.0.1:3000/socket.io/?EIO=4&transport=websocket");
    }

    #[test]
    fn interpreta_el_saludo_y_el_latido() {
        let open = Packet::parse(r#"0{"sid":"x","pingInterval":25000,"pingTimeout":20000}"#);
        assert_eq!(open, Packet::Open(json!({ "sid": "x", "pingInterval": 25000, "pingTimeout": 20000 })));
        assert_eq!(Packet::parse("2"), Packet::Ping);
        assert_eq!(Packet::parse(r#"40/realtime,{"sid":"y"}"#), Packet::Connected);
    }

    #[test]
    fn interpreta_los_eventos_con_y_sin_datos() {
        let update = Packet::parse(r#"42/realtime,["pet:update",{"id":"p1","hunger":20}]"#);
        assert_eq!(update, Packet::Event { name: "pet:update".into(), payload: json!({ "id": "p1", "hunger": 20 }) });

        // `auth:expired` llega sin datos.
        let expired = Packet::parse(r#"42/realtime,["auth:expired"]"#);
        assert_eq!(expired, Packet::Event { name: "auth:expired".into(), payload: Value::Null });

        // Con número de acuse delante.
        let acked = Packet::parse(r#"42/realtime,17["clan:message",{"id":"m1"}]"#);
        assert_eq!(acked, Packet::Event { name: "clan:message".into(), payload: json!({ "id": "m1" }) });
    }

    #[test]
    fn distingue_cuando_el_servidor_nos_saca_o_no_nos_deja_entrar() {
        assert_eq!(Packet::parse("41/realtime,"), Packet::Disconnected);
        assert_eq!(Packet::parse(r#"44/realtime,{"message":"no"}"#), Packet::Refused);
    }

    #[test]
    fn ignora_lo_que_no_es_de_su_namespace_o_no_entiende() {
        assert_eq!(Packet::parse(r#"42["suelto",1]"#), Packet::Other);
        assert_eq!(Packet::parse(r#"42/otro,["x"]"#), Packet::Other);
        assert_eq!(Packet::parse("42/realtime,no-es-json"), Packet::Other);
        assert_eq!(Packet::parse("6"), Packet::Other);
        assert_eq!(Packet::parse(""), Packet::Other);
    }
}
