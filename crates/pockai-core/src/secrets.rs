//! Dónde se guarda la sesión. En el escritorio y en iOS es el llavero del sistema; en Android, un
//! fichero de la app cifrado con el Keystore ([`SealedFileStore`] con el [`Sealer`] de la plataforma).

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
/// sistema ya aísla esa carpeta de las demás apps. Hoy solo se lee para pasarla a [`SealedFileStore`].
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

/// Cifra y descifra la sesión con una clave que no sale del dispositivo (en Android, el Keystore).
/// Lo implementa la plataforma; el núcleo solo decide qué se guarda y cuándo.
pub trait Sealer: Send + Sync {
    /// El texto cifrado, o `None` si la clave no está disponible.
    fn seal(&self, plain: &[u8]) -> Option<String>;
    /// El texto en claro, o `None` si no se puede descifrar (otra clave, datos dañados…).
    fn open(&self, sealed: &str) -> Option<Vec<u8>>;
}

/// La sesión cifrada en la carpeta privada de la app (Android). Al abrirla por primera vez adopta la
/// de [`FileStore`] (en claro, de versiones anteriores): la vuelve a guardar cifrada y borra la otra.
///
/// - Si no se puede cifrar, la sesión vive solo en memoria: nunca se escribe en claro.
/// - Si no se puede descifrar (la clave se perdió al reinstalar o al restaurar una copia en otro
///   dispositivo), se borra el fichero y se empieza sin sesión, en vez de fallar en cada arranque.
pub struct SealedFileStore<S: Sealer> {
    path: PathBuf,
    legacy: PathBuf,
    sealer: S,
    /// Copia en memoria: la sesión sigue viva en este proceso aunque falle el disco o la clave.
    fallback: MemoryStore,
}

impl<S: Sealer> SealedFileStore<S> {
    const FILE: &'static str = "session.sealed";

    pub fn new(data_dir: PathBuf, sealer: S) -> Self {
        Self {
            path: data_dir.join(Self::FILE),
            legacy: data_dir.join(FileStore::FILE),
            sealer,
            fallback: MemoryStore::default(),
        }
    }

    fn read_sealed(&self) -> Option<Tokens> {
        let raw = std::fs::read_to_string(&self.path).ok()?;
        let tokens = self.sealer.open(raw.trim()).and_then(|plain| serde_json::from_slice(&plain).ok());
        if tokens.is_none() {
            log::warn!("[núcleo] la sesión guardada no se puede descifrar: se descarta");
            let _ = std::fs::remove_file(&self.path);
        }
        tokens
    }

    /// La sesión en claro de versiones anteriores: se cifra y, solo si eso sale bien, se borra.
    fn adopt_legacy(&self) -> Option<Tokens> {
        let tokens: Tokens = serde_json::from_str(&std::fs::read_to_string(&self.legacy).ok()?).ok()?;
        if self.write(&tokens) {
            let _ = std::fs::remove_file(&self.legacy);
        }
        Some(tokens)
    }

    fn write(&self, tokens: &Tokens) -> bool {
        let Ok(plain) = serde_json::to_vec(tokens) else { return false };
        let Some(sealed) = self.sealer.seal(&plain) else {
            log::warn!("[núcleo] no se pudo cifrar la sesión: queda solo en memoria");
            return false;
        };
        if let Some(dir) = self.path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let tmp = self.path.with_extension("sealed.tmp");
        if std::fs::write(&tmp, sealed).is_ok() && std::fs::rename(&tmp, &self.path).is_ok() {
            true
        } else {
            log::warn!("[núcleo] no se pudo guardar la sesión en disco");
            false
        }
    }
}

impl<S: Sealer> SecretStore for SealedFileStore<S> {
    fn load(&self) -> Option<Tokens> {
        if let Some(tokens) = self.fallback.load() {
            return Some(tokens);
        }
        let tokens = self.read_sealed().or_else(|| self.adopt_legacy())?;
        self.fallback.save(&tokens);
        Some(tokens)
    }

    fn save(&self, tokens: &Tokens) {
        self.fallback.save(tokens);
        self.write(tokens);
        // Con un par nuevo, el refresh token en claro ya está canjeado: reutilizarlo en otro arranque
        // haría que el backend cerrase todas las sesiones. Se borra aunque no se haya podido cifrar.
        let _ = std::fs::remove_file(&self.legacy);
    }

    fn clear(&self) {
        self.fallback.clear();
        let _ = std::fs::remove_file(&self.path);
        let _ = std::fs::remove_file(&self.legacy);
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

    /// Cifrado de pega: invierte los bytes y los pasa a hex. `broken` simula una clave perdida.
    struct FakeSealer {
        broken: bool,
    }

    impl Sealer for FakeSealer {
        fn seal(&self, plain: &[u8]) -> Option<String> {
            if self.broken {
                return None;
            }
            Some(plain.iter().rev().map(|b| format!("{b:02x}")).collect())
        }
        fn open(&self, sealed: &str) -> Option<Vec<u8>> {
            if self.broken {
                return None;
            }
            let bytes: Option<Vec<u8>> =
                (0..sealed.len()).step_by(2).map(|i| u8::from_str_radix(sealed.get(i..i + 2)?, 16).ok()).collect();
            Some(bytes?.into_iter().rev().collect())
        }
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pockai-sealed-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn sealed(dir: &PathBuf, broken: bool) -> SealedFileStore<FakeSealer> {
        SealedFileStore::new(dir.clone(), FakeSealer { broken })
    }

    #[test]
    fn la_sesion_cifrada_no_se_guarda_en_claro_y_sobrevive_a_un_reinicio() {
        let dir = temp_dir("roundtrip");
        let tokens = Tokens { access: "acceso-secreto".into(), refresh: "renovar".into() };

        sealed(&dir, false).save(&tokens);
        let raw = std::fs::read_to_string(dir.join("session.sealed")).unwrap();
        assert!(!raw.contains("acceso-secreto"));
        assert!(!dir.join("session.json").exists());

        let restarted = sealed(&dir, false);
        assert_eq!(restarted.load(), Some(tokens));
        restarted.clear();
        assert_eq!(sealed(&dir, false).load(), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn adopta_la_sesion_en_claro_y_la_borra_una_vez_cifrada() {
        let dir = temp_dir("legacy");
        let tokens = Tokens { access: "a".into(), refresh: "r".into() };
        FileStore::new(dir.clone()).save(&tokens);

        assert_eq!(sealed(&dir, false).load(), Some(tokens.clone()));
        assert!(!dir.join("session.json").exists());
        assert!(dir.join("session.sealed").exists());
        assert_eq!(sealed(&dir, false).load(), Some(tokens));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sin_clave_la_sesion_queda_en_memoria_y_no_se_escribe_en_claro() {
        let dir = temp_dir("nokey");
        let tokens = Tokens { access: "a".into(), refresh: "r".into() };
        FileStore::new(dir.clone()).save(&tokens);

        // La de antes se usa, y no se borra mientras siga siendo la buena.
        let store = sealed(&dir, true);
        assert_eq!(store.load(), Some(tokens.clone()));
        assert!(dir.join("session.json").exists());

        let rotated = Tokens { access: "a2".into(), refresh: "r2".into() };
        store.save(&rotated);
        assert_eq!(store.load(), Some(rotated));
        assert!(!dir.join("session.sealed").exists());
        // Ni el par nuevo se escribe en claro ni se deja el viejo, ya canjeado.
        assert!(!dir.join("session.json").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn si_no_se_puede_descifrar_se_descarta_y_se_empieza_sin_sesion() {
        let dir = temp_dir("lost");
        sealed(&dir, false).save(&Tokens { access: "a".into(), refresh: "r".into() });

        assert_eq!(sealed(&dir, true).load(), None);
        assert!(!dir.join("session.sealed").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
