/// Fallos del núcleo que no son una respuesta HTTP: una respuesta 4xx/5xx llega como
/// [`crate::ApiResponse`] con su estado, para que la UI la trate igual que un `fetch`.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    /// Sin conexión, DNS, TLS o corte a mitad de respuesta.
    #[error("sin conexión con el servidor: {0}")]
    Network(String),
    /// La petición no es válida (método desconocido, ruta que no empieza por `/`).
    #[error("petición no válida: {0}")]
    InvalidRequest(String),
}
