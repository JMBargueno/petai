use serde_json::Value;

use crate::contract::{RealtimeEvent, SessionKind};
use crate::state::StateChange;

/// Lo que el núcleo anuncia a quien se suscriba: el puente de Tauri (que lo reenvía a la UI) y los
/// plugins nativos (widgets, Live Activities).
#[derive(Debug, Clone)]
pub enum CoreEvent {
    /// Cambio en la sesión: iniciada, cerrada, caducada o bloqueada por un paso de alta pendiente.
    Session(SessionKind),
    /// La API (o el canal en tiempo real) avisa de mantenimiento; lleva el cuerpo del 503.
    Maintenance(Value),
    /// Evento del servidor por el canal en tiempo real.
    Realtime(RealtimeEvent),
    /// El canal en tiempo real se ha conectado o se ha caído.
    RealtimeStatus { connected: bool },
    /// Ha cambiado una parte del estado global.
    State(StateChange),
}
