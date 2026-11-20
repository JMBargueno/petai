//! El shell en móvil (Android e iOS): una ventana a pantalla completa con la UI de la plataforma y
//! el núcleo cliente. Los plugins nativos (almacén seguro, sync en segundo plano, widgets y Live
//! Activities) se registran aquí según se vayan añadiendo.

use crate::api_base_url;

pub fn run() {
    tauri::Builder::default()
        // Núcleo cliente: toda la comunicación con el backend pasa por aquí, no por el webview.
        .plugin(tauri_plugin_pockai::init(tauri_plugin_pockai::PockaiConfig { base_url: api_base_url() }))
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("error al arrancar Pockai");
}
