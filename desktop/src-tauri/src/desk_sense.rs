//! Sentidos del escritorio para la mascota: posición global del cursor, inactividad del
//! sistema y ventana en primer plano (rectángulo y si está a pantalla completa).
//!
//! Todo se queda en el equipo: son eventos de Tauri hacia el webview, nunca una petición de
//! red. El frontend dice con `set_desk_sense` qué necesita según las habilidades activas; lo que
//! no se pide no se lee. El título de la ventana no viaja por aquí (sigue en
//! `get_active_window_info`, que solo se llama con la habilidad de contexto activa).

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

/// Qué sentidos están encendidos ahora mismo.
#[derive(Default)]
pub struct DeskSenseFlags {
    cursor: AtomicBool,
    idle: AtomicBool,
    foreground: AtomicBool,
    /// Muestreo rápido de la ventana (mientras la mascota está posada y debe seguirla).
    fast: AtomicBool,
}

#[derive(Deserialize)]
pub struct DeskSenseRequest {
    #[serde(default)]
    cursor: bool,
    #[serde(default)]
    idle: bool,
    #[serde(default)]
    foreground: bool,
    #[serde(default)]
    fast: bool,
}

#[tauri::command]
pub fn set_desk_sense(request: DeskSenseRequest, flags: tauri::State<DeskSenseFlags>) {
    flags.cursor.store(request.cursor, Ordering::Relaxed);
    flags.idle.store(request.idle, Ordering::Relaxed);
    flags.foreground.store(request.foreground, Ordering::Relaxed);
    flags.fast.store(request.fast, Ordering::Relaxed);
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
pub struct CursorPayload {
    pub x: f64,
    pub y: f64,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
pub struct ForegroundPayload {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub fullscreen: bool,
    /// Identificador opaco de la ventana: cambia cuando el primer plano pasa a ser otra.
    pub id: i64,
}

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SensePayload {
    /// Milisegundos desde la última entrada de teclado o ratón; `null` si no se pidió o la
    /// plataforma no lo da.
    pub idle_ms: Option<u64>,
    pub foreground: Option<ForegroundPayload>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

/// Clases de ventana del propio escritorio de Windows: cubren el monitor sin ser «pantalla completa».
const SHELL_CLASSES: [&str; 4] = ["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"];

/// Una ventana está a pantalla completa si tapa el monitor entero (una maximizada deja libre la
/// barra de tareas, así que no cuenta) y no es el propio escritorio.
pub fn is_fullscreen(window: Rect, monitor: Rect, class: &str) -> bool {
    if SHELL_CLASSES.contains(&class) {
        return false;
    }
    if monitor.right <= monitor.left || monitor.bottom <= monitor.top {
        return false;
    }
    window.left <= monitor.left && window.top <= monitor.top && window.right >= monitor.right && window.bottom >= monitor.bottom
}

/// Pasa un punto de píxeles físicos de pantalla a píxeles CSS del webview.
pub fn to_css(physical: f64, origin: f64, scale: f64) -> f64 {
    if scale <= 0.0 {
        return physical - origin;
    }
    (physical - origin) / scale
}

/// Limita los avisos de cursor: como mucho uno cada `MIN_INTERVAL` y solo si se movió.
pub struct CursorThrottle {
    last: Option<(f64, f64, Instant)>,
}

const CURSOR_MIN_INTERVAL: Duration = Duration::from_millis(100);
const CURSOR_MIN_MOVE: f64 = 2.0;

impl CursorThrottle {
    pub fn new() -> Self {
        Self { last: None }
    }

    pub fn should_emit(&mut self, x: f64, y: f64, now: Instant) -> bool {
        if let Some((lx, ly, at)) = self.last {
            if now.duration_since(at) < CURSOR_MIN_INTERVAL {
                return false;
            }
            if (x - lx).abs() < CURSOR_MIN_MOVE && (y - ly).abs() < CURSOR_MIN_MOVE {
                return false;
            }
        }
        self.last = Some((x, y, now));
        true
    }
}

/// Se llama desde el bucle de click-through (que ya lee el cursor cada 30 ms) con la posición
/// en píxeles CSS. Reutilizar ese bucle evita un segundo hilo sondeando el ratón.
pub fn on_cursor(app: &tauri::AppHandle, throttle: &mut CursorThrottle, x: f64, y: f64) {
    if !app.state::<DeskSenseFlags>().cursor.load(Ordering::Relaxed) {
        return;
    }
    if throttle.should_emit(x, y, Instant::now()) {
        let _ = app.emit("desk:cursor", CursorPayload { x, y });
    }
}

/// Hilo que avisa de la inactividad y de la ventana en primer plano: una vez por segundo, o
/// cada 100 ms mientras la mascota está posada en una ventana.
pub fn spawn_sense_loop(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut ticks: u32 = 0;
        loop {
            std::thread::sleep(Duration::from_millis(100));
            ticks = ticks.wrapping_add(1);
            let (want_idle, want_fg, fast) = {
                let flags = app.state::<DeskSenseFlags>();
                (
                    flags.idle.load(Ordering::Relaxed),
                    flags.foreground.load(Ordering::Relaxed),
                    flags.fast.load(Ordering::Relaxed),
                )
            };
            if !want_idle && !want_fg {
                continue;
            }
            if !(fast && want_fg) && ticks % 10 != 0 {
                continue;
            }
            let payload = SensePayload {
                idle_ms: if want_idle { platform::idle_ms() } else { None },
                foreground: if want_fg { platform::foreground(&app) } else { None },
            };
            let _ = app.emit("desk:sense", payload);
        }
    });
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{is_fullscreen, to_css, ForegroundPayload, Rect};
    use tauri::Manager;

    #[repr(C)]
    #[derive(Default, Clone, Copy)]
    struct WinRect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }

    #[repr(C)]
    struct LastInputInfo {
        cb_size: u32,
        dw_time: u32,
    }

    #[repr(C)]
    struct MonitorInfo {
        cb_size: u32,
        rc_monitor: WinRect,
        rc_work: WinRect,
        dw_flags: u32,
    }

    const MONITOR_DEFAULTTONEAREST: u32 = 2;

    extern "system" {
        fn GetForegroundWindow() -> isize;
        fn GetWindowRect(hwnd: isize, lp_rect: *mut WinRect) -> i32;
        fn IsWindowVisible(hwnd: isize) -> i32;
        fn GetClassNameW(hwnd: isize, lp_class_name: *mut u16, n_max_count: i32) -> i32;
        fn MonitorFromWindow(hwnd: isize, dw_flags: u32) -> isize;
        fn GetMonitorInfoW(h_monitor: isize, lpmi: *mut MonitorInfo) -> i32;
        fn GetLastInputInfo(plii: *mut LastInputInfo) -> i32;
        fn GetTickCount() -> u32;
    }

    fn rect(r: WinRect) -> Rect {
        Rect { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }

    /// Milisegundos desde la última entrada del usuario en todo el sistema.
    pub fn idle_ms() -> Option<u64> {
        let mut info = LastInputInfo { cb_size: std::mem::size_of::<LastInputInfo>() as u32, dw_time: 0 };
        // SAFETY: `info` es una estructura válida con `cb_size` inicializado, como exige la API.
        unsafe {
            if GetLastInputInfo(&mut info) == 0 {
                return None;
            }
            // El contador de ticks da la vuelta cada ~49 días: la resta debe ser modular
            Some(GetTickCount().wrapping_sub(info.dw_time) as u64)
        }
    }

    pub fn foreground(app: &tauri::AppHandle) -> Option<ForegroundPayload> {
        let main_win = app.get_webview_window("main")?;
        let main_hwnd = main_win.hwnd().ok()?.0 as isize;
        let origin = main_win.inner_position().ok()?;
        let scale = main_win.scale_factor().ok()?;

        // SAFETY: llamadas Win32 de solo lectura sobre identificadores que devuelve el sistema;
        // los búferes son locales y su tamaño se pasa en cada llamada.
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd == 0 || hwnd == main_hwnd || IsWindowVisible(hwnd) == 0 {
                return None;
            }
            let mut wr = WinRect::default();
            if GetWindowRect(hwnd, &mut wr) == 0 {
                return None;
            }

            let mut class_buf = [0u16; 128];
            let len = GetClassNameW(hwnd, class_buf.as_mut_ptr(), class_buf.len() as i32).max(0) as usize;
            let class = String::from_utf16_lossy(&class_buf[..len.min(class_buf.len())]);

            // Solo cuenta como pantalla completa si es en el mismo monitor que la mascota
            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            let same_monitor = monitor == MonitorFromWindow(main_hwnd, MONITOR_DEFAULTTONEAREST);
            let mut mi = MonitorInfo {
                cb_size: std::mem::size_of::<MonitorInfo>() as u32,
                rc_monitor: WinRect::default(),
                rc_work: WinRect::default(),
                dw_flags: 0,
            };
            let fullscreen = same_monitor
                && GetMonitorInfoW(monitor, &mut mi) != 0
                && is_fullscreen(rect(wr), rect(mi.rc_monitor), &class);

            Some(ForegroundPayload {
                x: to_css(wr.left as f64, origin.x as f64, scale),
                y: to_css(wr.top as f64, origin.y as f64, scale),
                w: (wr.right - wr.left) as f64 / scale,
                h: (wr.bottom - wr.top) as f64 / scale,
                fullscreen,
                id: hwnd as i64,
            })
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use super::ForegroundPayload;

    /// macOS y Linux: sin implementación todavía. El frontend deduce la inactividad del cursor
    /// y desactiva lo que depende de la ventana en primer plano.
    pub fn idle_ms() -> Option<u64> {
        None
    }

    pub fn foreground(_app: &tauri::AppHandle) -> Option<ForegroundPayload> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MONITOR: Rect = Rect { left: 0, top: 0, right: 1920, bottom: 1080 };

    #[test]
    fn pantalla_completa_tapa_el_monitor_entero() {
        assert!(is_fullscreen(MONITOR, MONITOR, "UnityWndClass"));
        // Algunas apps se pasan unos píxeles por cada lado
        assert!(is_fullscreen(Rect { left: -8, top: -8, right: 1928, bottom: 1088 }, MONITOR, "Chrome_WidgetWin_1"));
    }

    #[test]
    fn una_ventana_maximizada_no_es_pantalla_completa() {
        // Deja libre la barra de tareas (40 px)
        let maximized = Rect { left: 0, top: 0, right: 1920, bottom: 1040 };
        assert!(!is_fullscreen(maximized, MONITOR, "Notepad"));
    }

    #[test]
    fn el_escritorio_de_windows_no_cuenta() {
        for class in SHELL_CLASSES {
            assert!(!is_fullscreen(MONITOR, MONITOR, class));
        }
    }

    #[test]
    fn un_monitor_sin_tamano_no_da_falsos_positivos() {
        assert!(!is_fullscreen(MONITOR, Rect::default(), "Notepad"));
    }

    #[test]
    fn un_segundo_monitor_usa_sus_propias_coordenadas() {
        let second = Rect { left: 1920, top: 0, right: 3840, bottom: 1080 };
        assert!(is_fullscreen(second, second, "Game"));
        assert!(!is_fullscreen(MONITOR, second, "Game"));
    }

    #[test]
    fn convierte_a_pixeles_css_con_origen_y_escala() {
        assert_eq!(to_css(300.0, 100.0, 2.0), 100.0);
        assert_eq!(to_css(50.0, 100.0, 1.0), -50.0);
        // Una escala inválida no divide por cero
        assert_eq!(to_css(300.0, 100.0, 0.0), 200.0);
    }

    #[test]
    fn el_cursor_se_avisa_como_mucho_cada_100_ms_y_solo_si_se_mueve() {
        let mut t = CursorThrottle::new();
        let start = Instant::now();
        assert!(t.should_emit(10.0, 10.0, start));
        // Demasiado pronto
        assert!(!t.should_emit(200.0, 10.0, start + Duration::from_millis(30)));
        // Pasado el intervalo pero sin moverse
        assert!(!t.should_emit(10.5, 10.5, start + Duration::from_millis(150)));
        // Pasado el intervalo y movido
        assert!(t.should_emit(40.0, 10.0, start + Duration::from_millis(160)));
    }
}
