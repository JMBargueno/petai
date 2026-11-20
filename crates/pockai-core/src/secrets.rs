//! Dónde se guarda la sesión. En el escritorio es el llavero del sistema; en móvil lo pondrá un
//! plugin nativo (Keychain / Keystore) que implemente [`SecretStore`].

use std::path::PathBuf;
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
#[cfg(all(feature = "keyring-store", not(target_os = "android")))]
pub struct KeyringStore {
    account: String,
    /// Copia en memoria por si el llavero falla al escribir: la sesión sigue viva en este proceso.
    fallback: MemoryStore,
}

#[cfg(all(feature = "keyring-store", not(target_os = "android")))]
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

#[cfg(all(feature = "keyring-store", not(target_os = "android")))]
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

/// La sesión en un fichero de la carpeta privada de la app. Es lo que se usa en Android, donde el
/// sistema ya aísla esa carpeta de las demás apps; cifrarla con el Keystore queda para el plugin
/// nativo de almacén seguro.
pub struct FileStore {
    path: PathBuf,
    /// Copia en memoria por si el disco falla: la sesión sigue viva en este proceso.
    fallback: MemoryStore,
}

impl FileStore {
    const FILE: &'static str = "session.json";

    pub fn new(data_dir: PathBuf) -> Self {
        Self { path: data_dir.join(Self::FILE), fallback: MemoryStore::default() }
    }
}

impl SecretStore for FileStore {
    fn load(&self) -> Option<Tokens> {
        if let Some(tokens) = self.fallback.load() {
            return Some(tokens);
        }
        serde_json::from_str(&std::fs::read_to_string(&self.path).ok()?).ok()
    }

    fn save(&self, tokens: &Tokens) {
        self.fallback.save(tokens);
        let Ok(raw) = serde_json::to_vec(tokens) else { return };
        if let Some(dir) = self.path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        // Escritura atómica: un corte a mitad no deja el fichero a medias.
        let tmp = self.path.with_extension("json.tmp");
        if std::fs::write(&tmp, raw).is_ok() {
            let _ = std::fs::rename(&tmp, &self.path);
        } else {
            log::warn!("[núcleo] no se pudo guardar la sesión en disco");
        }
    }

    fn clear(&self) {
        self.fallback.clear();
        let _ = std::fs::remove_file(&self.path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_sesion_en_fichero_sobrevive_a_un_reinicio_y_se_borra_al_salir() {
        let dir = std::env::temp_dir().join(format!("pockai-filestore-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let tokens = Tokens { access: "a".into(), refresh: "r".into() };

        FileStore::new(dir.clone()).save(&tokens);
        // Otra instancia (otro arranque) la encuentra.
        let restarted = FileStore::new(dir.clone());
        assert_eq!(restarted.load(), Some(tokens));

        restarted.clear();
        assert_eq!(FileStore::new(dir.clone()).load(), None);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
