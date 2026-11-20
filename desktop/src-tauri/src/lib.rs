//! Shell de Tauri de Pockai para escritorio, iOS y Android.
//!
//! La lógica de cliente vive en el núcleo (`crates/pockai-core`) y llega a la UI por el puente
//! (`tauri-plugin-pockai`), igual en las tres plataformas. Aquí solo queda lo propio de cada una:
//! en escritorio, la ventana transparente, la bandeja y los sensores (`desktop.rs`); en móvil, un
//! shell mínimo (`mobile.rs`) al que se irán sumando los plugins nativos.

#[cfg(desktop)]
mod ai_cli;
#[cfg(desktop)]
mod desk_sense;
#[cfg(desktop)]
mod desktop;
#[cfg(desktop)]
mod location;
#[cfg(mobile)]
mod mobile;

/// URL del backend. En desarrollo es el backend local (o `POCKAI_API_URL` si se define al arrancar);
/// en una compilación de producción es el `VITE_API_URL` con el que se compiló (ver `build.rs`),
/// el mismo que usa el frontend en el modo demo.
pub(crate) fn api_base_url() -> String {
    const LOCAL: &str = "http://127.0.0.1:3000";
    if cfg!(debug_assertions) {
        std::env::var("POCKAI_API_URL")
            .ok()
            .or_else(|| option_env!("POCKAI_API_URL").map(str::to_string))
            .unwrap_or_else(|| LOCAL.to_string())
    } else {
        option_env!("POCKAI_API_URL").unwrap_or(LOCAL).to_string()
    }
}

/// Punto de entrada común. En móvil lo llama el proyecto nativo (Kotlin o Swift) que genera Tauri.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    desktop::run();
    #[cfg(mobile)]
    mobile::run();
}
