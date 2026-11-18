// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai_cli;

use serde::Deserialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Muestra y enfoca la ventana principal (bandeja, segunda instancia…).
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// La primera vez que se ejecuta la app se activa «Iniciar con Windows». Un marcador en la carpeta
/// de configuración evita reactivarlo si el usuario lo desactiva después en Ajustes › Aplicación.
fn enable_autostart_on_first_run(app: &tauri::AppHandle) {
    let Ok(dir) = app.path().app_config_dir() else { return };
    let marker = dir.join("autostart-initialized");
    if marker.exists() {
        return;
    }
    if app.autolaunch().enable().is_ok() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(&marker, b"1");
    }
}

/// Rectángulo interactivo en píxeles CSS (coordenadas del viewport del webview).
#[derive(Clone, Copy, Deserialize)]
struct HitRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(serde::Serialize, Clone, Debug, Default)]
pub struct ActiveWindowInfo {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub title: String,
    pub is_valid: bool,
}

#[derive(Default)]
struct HitRegions(Mutex<Vec<HitRect>>);

/// El frontend informa de las zonas interactivas (mascota, panel, botón).
#[tauri::command]
fn set_hit_regions(state: State<HitRegions>, rects: Vec<HitRect>) {
    *state.0.lock().unwrap() = rects;
}

/// Atajo global registrado para la habilidad «Invocación rápida» (si hay uno).
#[derive(Default)]
struct SummonShortcut(Mutex<Option<Shortcut>>);

/// Posición del cursor en píxeles CSS del webview, para llevar a la mascota hasta él.
#[derive(serde::Serialize, Clone)]
struct SummonPosition {
    x: f64,
    y: f64,
}

/// Cambia el atajo global de «Invocación rápida». `None` o vacío lo desactiva.
/// Si el nuevo atajo no es válido o está ocupado se devuelve un error y se mantiene el anterior.
#[tauri::command]
fn set_summon_shortcut(
    app: tauri::AppHandle,
    state: State<SummonShortcut>,
    accelerator: Option<String>,
) -> Result<(), String> {
    let wanted = match accelerator.as_deref().map(str::trim) {
        Some(a) if !a.is_empty() => Some(
            a.parse::<Shortcut>()
                .map_err(|e| format!("Atajo no válido ({a}): {e}"))?,
        ),
        _ => None,
    };
    let gs = app.global_shortcut();
    let mut current = state.0.lock().unwrap();
    if *current == wanted {
        return Ok(());
    }
    if let Some(next) = wanted {
        gs.register(next)
            .map_err(|e| format!("No se pudo registrar el atajo (¿lo usa otra aplicación?): {e}"))?;
    }
    if let Some(prev) = current.take() {
        let _ = gs.unregister(prev);
    }
    *current = wanted;
    Ok(())
}

/// Al pulsar el atajo: muestra la ventana y avisa al frontend con la posición del cursor.
fn on_summon_shortcut(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    let _ = window.show();
    let pos = match (window.cursor_position(), window.inner_position(), window.scale_factor()) {
        (Ok(cursor), Ok(origin), Ok(scale)) => Some(SummonPosition {
            x: (cursor.x - origin.x as f64) / scale,
            y: (cursor.y - origin.y as f64) / scale,
        }),
        _ => None,
    };
    let _ = window.emit("quick-summon", pos);
}

/// Detección nativa Win32 de la ventana activa en primer plano.
#[tauri::command]
fn get_active_window_info(app: tauri::AppHandle) -> ActiveWindowInfo {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsString;
        use std::os::windows::ffi::OsStringExt;

        #[repr(C)]
        #[derive(Default, Debug, Clone, Copy)]
        struct RECT {
            left: i32,
            top: i32,
            right: i32,
            bottom: i32,
        }

        extern "system" {
            fn GetForegroundWindow() -> isize;
            fn GetWindowRect(hwnd: isize, lp_rect: *mut RECT) -> i32;
            fn IsWindowVisible(hwnd: isize) -> i32;
            fn GetWindowTextW(hwnd: isize, lp_string: *mut u16, n_max_count: i32) -> i32;
        }

        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd == 0 || IsWindowVisible(hwnd) == 0 {
                return ActiveWindowInfo::default();
            }

            // Si la ventana activa es nuestra propia ventana de Tauri, no posarse en ella
            if let Some(main_win) = app.get_webview_window("main") {
                if let Ok(main_hwnd) = main_win.hwnd() {
                    if main_hwnd.0 as isize == hwnd {
                        return ActiveWindowInfo::default();
                    }
                }
            }

            let mut rect = RECT::default();
            if GetWindowRect(hwnd, &mut rect) == 0 {
                return ActiveWindowInfo::default();
            }

            let mut buf = [0u16; 512];
            let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), 512);
            let title = if len > 0 {
                OsString::from_wide(&buf[..len as usize])
                    .to_string_lossy()
                    .into_owned()
            } else {
                String::new()
            };

            let Some(main_win) = app.get_webview_window("main") else {
                return ActiveWindowInfo::default();
            };
            let (Ok(origin), Ok(scale)) = (main_win.inner_position(), main_win.scale_factor()) else {
                return ActiveWindowInfo::default();
            };

            let x = (rect.left as f64 - origin.x as f64) / scale;
            let y = (rect.top as f64 - origin.y as f64) / scale;
            let w = (rect.right - rect.left) as f64 / scale;
            let h = (rect.bottom - rect.top) as f64 / scale;

            if w < 100.0 || h < 100.0 {
                return ActiveWindowInfo::default();
            }

            ActiveWindowInfo {
                x,
                y,
                w,
                h,
                title,
                is_valid: true,
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // `app` solo se usa en Windows; evita el warning de variable sin usar en macOS/Linux
        let _ = app;
        ActiveWindowInfo::default()
    }
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
        // Debe ir primero: si ya hay una instancia (p. ej. oculta en la bandeja), se muestra esa
        // en vez de abrir otra.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // Solo se registra el atajo de «Invocación rápida»; se ignora el soltar la tecla
                    if event.state() == ShortcutState::Pressed {
                        on_summon_shortcut(app);
                    }
                })
                .build(),
        )
        .manage(HitRegions::default())
        .manage(SummonShortcut::default())
        .manage(ai_cli::CliProcs::default())
        .invoke_handler(tauri::generate_handler![
            set_hit_regions,
            get_active_window_info,
            set_summon_shortcut,
            ai_cli::run_ai_cli,
            ai_cli::cancel_ai_cli,
            ai_cli::detect_ai_cli
        ])
        // Cerrar la ventana (Alt+F4, «Cerrar ventana» en la barra de tareas) solo la oculta: Pockai
        // sigue en la bandeja. Para salir del todo, menú de la bandeja › «Salir de Pockai».
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            enable_autostart_on_first_run(app.handle());

            // La ventana transparente cubre el área útil del monitor (sin tapar la
            // barra de tareas) para que la mascota pueda moverse por toda la pantalla.
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let area = monitor.work_area();
                    let _ = window.set_position(area.position);
                    let _ = window.set_size(area.size);
                }
            }
            spawn_click_through_loop(app.handle().clone());

            // Configurar Menú de la Bandeja del Sistema (System Tray)
            let toggle = MenuItem::with_id(app, "toggle", "Mostrar/Ocultar Mascota", true, None::<&str>)?;
            let updates = MenuItem::with_id(app, "updates", "Buscar actualizaciones", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Salir de Pockai", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &updates, &quit])?;

            // Sin `.icon(...)` el icono de la bandeja sale vacío: se usa el icono de la app
            // (bundle.icon de tauri.conf.json).
            let mut tray_builder = TrayIconBuilder::with_id("main").tooltip("Pockai");
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            let _tray = tray_builder
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
                    "updates" => {
                        // El frontend hace la comprobación (plugin updater) y la mascota cuenta el resultado.
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.emit("check-updates", ());
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
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running PetAI desktop application");
}

#[cfg(test)]
mod tests {
    use super::Shortcut;

    /// Los aceleradores que genera `captureShortcut` (desktop/src/lib/summonShortcut.ts) deben
    /// ser válidos para el plugin global-shortcut.
    #[test]
    fn acepta_los_atajos_del_frontend() {
        for a in [
            "Ctrl+Alt+P",
            "Shift+Super+1",
            "Alt+Up",
            "Ctrl+Alt+Num1",
            "Ctrl+Alt+-",
            "Ctrl+Alt+F5",
            "Ctrl+Shift+Space",
            "Alt+Shift+K",
        ] {
            assert!(a.parse::<Shortcut>().is_ok(), "atajo rechazado: {a}");
        }
    }
}
