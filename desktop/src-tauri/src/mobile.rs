//! El shell en móvil (Android e iOS): una ventana a pantalla completa con la UI de la plataforma y
//! el núcleo cliente. Los plugins nativos (almacén seguro, sync en segundo plano, widgets y Live
//! Activities) se registran aquí según se vayan añadiendo. En Android, la sesión cifrada y los avisos
//! de cuidado en segundo plano van dentro de `tauri-plugin-pockai`, que necesita saber el nombre de
//! esta librería para cargarla con la app cerrada.

use crate::api_base_url;

pub fn run() {
    tauri::Builder::default()
        // Núcleo cliente: toda la comunicación con el backend pasa por aquí, no por el webview.
        .plugin(tauri_plugin_pockai::init(tauri_plugin_pockai::PockaiConfig {
            base_url: api_base_url(),
            android_library: Some(env!("CARGO_CRATE_NAME")),
        }))
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("error al arrancar Pockai");
}
