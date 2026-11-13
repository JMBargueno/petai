// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Deserialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State,
};

/// Rectángulo interactivo en píxeles CSS (coordenadas del viewport del webview).
#[derive(Clone, Copy, Deserialize)]
struct HitRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Default)]
struct HitRegions(Mutex<Vec<HitRect>>);

/// El frontend informa de las zonas interactivas (mascota, panel, botón).
#[tauri::command]
fn set_hit_regions(state: State<HitRegions>, rects: Vec<HitRect>) {
    *state.0.lock().unwrap() = rects;
}

/// Bucle de detección de cursor: la ventana ignora los eventos del ratón
/// (click-through) salvo cuando el cursor está sobre una zona interactiva.
fn spawn_click_through_loop(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut ignoring: Option<bool> = None;
        loop {
            std::thread::sleep(Duration::from_millis(30));
            let Some(window) = app.get_webview_window("main") else { continue };
            if !window.is_visible().unwrap_or(false) {
                continue;
            }
            let (Ok(cursor), Ok(origin), Ok(scale)) = (
                window.cursor_position(),
                window.inner_position(),
                window.scale_factor(),
            ) else {
                continue;
            };
            let cx = (cursor.x - origin.x as f64) / scale;
            let cy = (cursor.y - origin.y as f64) / scale;

            let over_interactive = app
                .state::<HitRegions>()
                .0
                .lock()
                .unwrap()
                .iter()
                .any(|r| cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h);

            let should_ignore = !over_interactive;
            if ignoring != Some(should_ignore) {
                if window.set_ignore_cursor_events(should_ignore).is_ok() {
                    ignoring = Some(should_ignore);
                }
            }
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(HitRegions::default())
        .invoke_handler(tauri::generate_handler![set_hit_regions])
        .setup(|app| {
            spawn_click_through_loop(app.handle().clone());

            // Configurar Menú de la Bandeja del Sistema (System Tray)
            let toggle = MenuItem::with_id(app, "toggle", "Mostrar/Ocultar Mascota", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Salir de PetAI", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &quit])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = if window.is_visible().unwrap_or(false) {
                                window.hide()
                            } else {
                                window.show()
                            };
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running PetAI desktop application");
}
