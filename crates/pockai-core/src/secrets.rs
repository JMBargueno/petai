//! Dónde se guarda la sesión. En el escritorio es el llavero del sistema; en móvil lo pondrá un
//! plugin nativo (Keychain / Keystore) que implemente [`SecretStore`].

use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// Par de tokens de la sesión. El refresh token rota en cada uso.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tokens {
    pub access: String,
    pub refresh: String,
}

pub trait SecretStore: Send + Sync {
    fn load(&self) -> Option<Tokens>;
    fn save(&self, tokens: &Tokens);
    fn clear(&self);
}

/// Almacén en memoria: para tests y como último recurso si el llavero del sistema no responde
/// (la sesión dura entonces lo que dure el proceso).
#[derive(Default)]
pub struct MemoryStore(Mutex<Option<Tokens>>);

impl MemoryStore {
    pub fn with(tokens: Tokens) -> Self {
        Self(Mutex::new(Some(tokens)))
    }
}

impl SecretStore for MemoryStore {
    fn load(&self) -> Option<Tokens> {
        self.0.lock().unwrap().clone()
    }
    fn save(&self, tokens: &Tokens) {
        *self.0.lock().unwrap() = Some(tokens.clone());
    }
    fn clear(&self) {
        *self.0.lock().unwrap() = None;
    }
}

/// Llavero del sistema: Credential Manager (Windows), Keychain (macOS) o Secret Service (Linux).
/// La entrada lleva el servidor en el nombre, para que una compilación de desarrollo y la de
/// producción no compartan sesión.
#[cfg(feature = "keyring-store")]
pub struct KeyringStore {
    account: String,
    /// Copia en memoria por si el llavero falla al escribir: la sesión sigue viva en este proceso.
    fallback: MemoryStore,
}

#[cfg(feature = "keyring-store")]
impl KeyringStore {
    const SERVICE: &'static str = "Pockai";

    pub fn new(base_url: &str) -> Self {
        let host = base_url.split("://").nth(1).unwrap_or(base_url);
        Self { account: format!("session@{host}"), fallback: MemoryStore::default() }
    }

    fn entry(&self) -> Option<keyring::Entry> {
        keyring::Entry::new(Self::SERVICE, &self.account)
            .map_err(|e| log::warn!("[núcleo] llavero no disponible: {e}"))
            .ok()
    }
}

#[cfg(feature = "keyring-store")]
impl SecretStore for KeyringStore {
    fn load(&self) -> Option<Tokens> {
        if let Some(tokens) = self.fallback.load() {
            return Some(tokens);
        }
        let raw = self.entry()?.get_password().ok()?;
        serde_json::from_str(&raw).ok()
    }

    fn save(&self, tokens: &Tokens) {
        self.fallback.save(tokens);
        let Some(entry) = self.entry() else { return };
        let Ok(raw) = serde_json::to_string(tokens) else { return };
        if let Err(e) = entry.set_password(&raw) {
            log::warn!("[núcleo] no se pudo guardar la sesión en el llavero: {e}");
        }
    }

    fn clear(&self) {
        self.fallback.clear();
        if let Some(entry) = self.entry() {
            let _ = entry.delete_credential();
        }
    }
}
