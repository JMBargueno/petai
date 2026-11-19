use std::path::PathBuf;

/// Configuración del núcleo. La fija el shell de cada plataforma al arrancar.
#[derive(Debug, Clone)]
pub struct CoreConfig {
    /// URL del backend, sin `/v1` ni barra final (p. ej. `https://game-api.pockai.world`).
    pub base_url: String,
    /// Valor de la cabecera `X-Client` y del campo `client` del socket: `desktop`, `android` o `ios`.
    /// El backend lo usa para aplicar el mantenimiento solo a la web o solo a las apps.
    pub client: String,
    /// Campo `platform` del socket (presencia del dispositivo): `desktop` o `mobile`.
    pub platform: String,
    /// Carpeta de datos de la app. Guarda el id estable del dispositivo. Sin ella el id es volátil.
    pub data_dir: Option<PathBuf>,
}

impl CoreConfig {
    pub fn desktop(base_url: impl Into<String>, data_dir: Option<PathBuf>) -> Self {
        Self {
            base_url: normalize_base_url(&base_url.into()),
            client: "desktop".into(),
            platform: "desktop".into(),
            data_dir,
        }
    }
}

/// Quita espacios y barras finales: las rutas siempre empiezan por `/`.
pub fn normalize_base_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}
