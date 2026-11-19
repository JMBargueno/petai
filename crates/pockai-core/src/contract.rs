//! Contrato entre el núcleo y la UI. De aquí se generan los tipos TypeScript de
//! `shared/client/src/bindings` (`cargo test -p pockai-core export_bindings`).

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

/// Petición a la API a través del núcleo. Es la pasarela de transición: la UI describe la llamada
/// y el núcleo pone la sesión, la renueva si hace falta y vigila el mantenimiento.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ApiRequest {
    pub method: String,
    /// Ruta con su query, empezando por `/` (p. ej. `/v1/pets?limit=5`).
    pub path: String,
    /// Cuerpo ya serializado (JSON), si lo hay.
    #[serde(default)]
    pub body: Option<String>,
    /// La llamada va con sesión: el núcleo añade el token y lo renueva ante un 401.
    #[serde(default)]
    pub auth: bool,
    /// `Content-Type` del cuerpo. Por defecto `application/json`.
    #[serde(default)]
    pub content_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ApiResponse {
    pub status: u16,
    pub body: String,
    /// Solo las cabeceras que la UI necesita (`content-type`, `retry-after`), en minúsculas.
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum SessionKind {
    /// Hay sesión (inicio de sesión, registro o sesión importada).
    Active,
    /// El usuario cerró la sesión.
    LoggedOut,
    /// El servidor rechazó el refresh token: hay que volver a entrar.
    Expired,
    /// La API exige verificar el correo antes de seguir.
    Unverified,
    /// La API exige elegir nickname antes de seguir.
    HandleRequired,
}

/// Carga del evento `core://session`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SessionEvent {
    pub kind: SessionKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SessionState {
    pub active: bool,
}

/// Un evento del chat en streaming, tal cual lo manda el servidor (`data` es JSON sin interpretar).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SseEvent {
    pub event: String,
    pub data: String,
}

/// Carga del evento `core://realtime`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RealtimeEvent {
    pub name: String,
    #[ts(type = "unknown")]
    pub payload: Value,
}

/// Carga del evento `core://realtime-status`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RealtimeStatus {
    pub connected: bool,
}

/// Carga del evento `core://maintenance`: el cuerpo del 503 `MAINTENANCE`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MaintenanceEvent {
    #[ts(type = "unknown")]
    pub body: Value,
}
