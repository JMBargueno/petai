//! Núcleo cliente de Pockai.
//!
//! Toda la comunicación con el backend (HTTP, sesión, tiempo real y chat en streaming) vive aquí,
//! igual para escritorio, iOS y Android. No depende de Tauri: el puente (`tauri-plugin-pockai`) y
//! los plugins nativos consumen [`Core`] y se suscriben a [`CoreEvent`].

pub mod actions;
mod care;
pub mod config;
pub mod contract;
mod core;
pub mod error;
pub mod events;
mod jwt;
pub mod notices;
pub mod queries;
mod realtime;
pub mod secrets;
pub mod state;

pub use crate::actions::{Action, ActionError};
pub use crate::config::CoreConfig;
pub use crate::contract::{
    ApiRequest, ApiResponse, MaintenanceEvent, RealtimeEvent, RealtimeStatus, SessionEvent, SessionKind, SessionState,
    SseEvent,
};
pub use crate::core::Core;
pub use crate::error::CoreError;
pub use crate::events::CoreEvent;
pub use crate::queries::Query;
pub use crate::notices::{pet_needs, Notice, NoticeKind, NoticePriority};
pub use crate::secrets::{FileStore, MemoryStore, SealedFileStore, Sealer, SecretStore, Tokens};
pub use crate::state::{AccountLock, AppState, ChangeSource, LoadOptions, LoadOutcome, Slice, StateChange};

#[cfg(all(feature = "keyring-store", not(target_os = "android")))]
pub use crate::secrets::KeyringStore;
