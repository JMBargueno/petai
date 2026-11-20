//! Lo nativo de iOS, por una interfaz en C (no por `run_mobile_plugin`): el trabajo en segundo plano
//! corre sin Tauri, igual que en Android, así que Swift llama directamente a estas funciones.
//!
//! - `pockai_care_sync`: lo llama el `BGAppRefreshTask` que registra `PockaiBackground.swift`. Pide
//!   las mascotas y devuelve en JSON el aviso de cuidado más urgente, el resumen del widget y las
//!   órdenes para las superficies vivas (`{"notice": …, "widget": …, "surfaces": …}`).
//! - `pockai_surfaces_poll`: con la app abierta, para mantener la Live Activity al día sin esperar a
//!   que el sistema conceda una pasada en segundo plano.
//! - `pockai_wrist_push`: el resumen para el Apple Watch, solo si cambió algo que se vea (spec 44).
//! - `pockai_wrist_snapshot`: el mismo resumen, siempre, para cuando el reloj lo pide él.
//! - `pockai_wrist_perform`: una intención del reloj (dar de comer, bañar, dormir), ya resuelta por
//!   el núcleo, y el resumen nuevo.
//! - `pockai_string_free`: Swift devuelve cada cadena aquí; la memoria es de Rust.
//!
//! La sesión no pasa por aquí: en iOS va al llavero del sistema (crate `keyring`), que el núcleo usa
//! solo con su configuración, sin nada nativo de por medio.

use std::ffi::{c_char, CStr, CString};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use pockai_core::{Core, CoreConfig, CoreEvent, Slice, SurfaceDiff, WristRequest};
use tokio::sync::broadcast::error::RecvError;
use serde::Serialize;
use serde_json::json;

/// Un solo núcleo por proceso: lo crea quien llegue antes (la app o la pasada en segundo plano) y el
/// otro lo reutiliza. Con dos, cada uno renovaría con su copia del refresh token y el backend
/// cerraría la sesión al ver uno ya canjeado.
static CORE: Mutex<Option<Core>> = Mutex::new(None);

fn shared_core(make: impl FnOnce() -> Core) -> Core {
    CORE.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(make).clone()
}

/// El núcleo que usará la app desde `setup`. Lo guarda para que la pasada en segundo plano lo
/// reutilice en lugar de construir otro, y deja vigiladas las superficies vivas.
pub(crate) fn core_for_app(make: impl FnOnce() -> Core) -> Core {
    let core = shared_core(make);
    watch_surfaces(core.clone());
    core
}

/// Lo que Swift deja registrado para que le avisemos de que hay superficies que repasar.
///
/// Va así, y no con un `extern "C"` a una función de Swift, porque esta librería se enlaza sola
/// (`cargo build --lib`) antes de juntarse con el target de la app: un símbolo que solo existe allí
/// dejaría la librería sin resolver.
static NOTIFY: AtomicUsize = AtomicUsize::new(0);

/// Lo llama `PockaiBackground.swift` al arrancar. Con `None` se desengancha.
///
/// # Safety
/// `callback` tiene que ser una función válida mientras la app viva.
#[no_mangle]
pub unsafe extern "C" fn pockai_surfaces_set_callback(callback: Option<extern "C" fn()>) {
    NOTIFY.store(callback.map_or(0, |f| f as usize), Ordering::Release);
}

/// Avisa a Swift, si se ha registrado.
fn notify_swift() {
    let ptr = NOTIFY.load(Ordering::Acquire);
    if ptr != 0 {
        // SAFETY: solo se guarda aquí, desde `pockai_surfaces_set_callback`, y siempre una `fn()`.
        let callback: extern "C" fn() = unsafe { std::mem::transmute(ptr) };
        callback();
    }
}

/// Mientras la app esté abierta, lo que se ve fuera de ella sigue al estado: la Live Activity a los
/// huevos, y el widget de la pantalla de inicio a la mascota activa. Cada vez que cambian (un huevo
/// nuevo, uno que eclosiona, una mascota que come, otra que se elige, o al cerrar sesión) se le pide
/// a Swift que repase. Qué enseñar lo decide el núcleo; aquí solo se le da el aviso.
///
/// Sin esto, el resumen del widget solo se escribiría en las pasadas en segundo plano, que el
/// sistema concede cuando quiere: el widget se quedaría en «Abre Pockai» por mucho que se abriera.
fn watch_surfaces(core: Core) {
    let mut events = core.subscribe();
    tauri::async_runtime::spawn(async move {
        notify_swift();
        loop {
            match events.recv().await {
                // El inventario y el usuario también: los botones del reloj dependen de la mochila
                // (comida, medicina, Piedra de Evolución) y el resumen lleva monedas y gemas. Sin
                // esto, comprar o gastar en el iPhone no empuja nada y el reloj se queda con un
                // botón gris que ya debería estar activo.
                Ok(CoreEvent::State(change))
                    if matches!(
                        change.slice,
                        Slice::Eggs | Slice::Pets | Slice::ActivePetId | Slice::Inventory | Slice::User
                    ) => {}
                Ok(CoreEvent::Session(_)) => {}
                Ok(_) => continue,
                Err(RecvError::Lagged(_)) => {}
                Err(RecvError::Closed) => break,
            }
            notify_swift();
        }
    });
}

/// Lo que devuelve una pasada en segundo plano, ya con las superficies.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackgroundSync {
    #[serde(flatten)]
    care: pockai_core::CareSync,
    surfaces: SurfaceDiff,
}

/// El reloj en milisegundos desde la época.
fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Lee una cadena de C, o `None` si es nula o no es UTF-8.
///
/// # Safety
/// `ptr` tiene que ser nulo o apuntar a una cadena terminada en cero y viva durante la llamada.
unsafe fn text(ptr: *const c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    CStr::from_ptr(ptr).to_str().ok().map(str::to_string)
}

/// Devuelve una cadena a Swift. La memoria es de Rust: hay que devolverla con [`pockai_string_free`].
fn out(json: Option<String>) -> *mut c_char {
    json.and_then(|s| CString::new(s).ok()).map(CString::into_raw).unwrap_or(std::ptr::null_mut())
}

/// Una pasada en segundo plano: pide las mascotas y devuelve qué avisar, qué enseñar en el widget y
/// qué hacer con las superficies vivas. Devuelve nulo si no se pudo (sin red, error del servidor):
/// Swift lo toma como «vuelve a intentarlo en la siguiente pasada».
///
/// # Safety
/// `data_dir` y `base_url` tienen que ser cadenas de C válidas. El resultado se libera con
/// [`pockai_string_free`].
#[no_mangle]
pub unsafe extern "C" fn pockai_care_sync(data_dir: *const c_char, base_url: *const c_char) -> *mut c_char {
    let result = catch_unwind(AssertUnwindSafe(|| -> Option<String> {
        let data_dir = text(data_dir)?;
        let base_url = text(base_url)?;
        let core = shared_core(|| {
            let cfg = CoreConfig::mobile(base_url, "ios", Some(PathBuf::from(data_dir)));
            // La misma sesión que la app: el llavero del sistema, con el servidor en el nombre de la
            // entrada (así desarrollo y producción no la comparten).
            let secrets: Box<dyn pockai_core::SecretStore> = Box::new(pockai_core::KeyringStore::new(&cfg.base_url));
            Core::new(cfg, secrets)
        });
        match tauri::async_runtime::block_on(core.care_sync()) {
            Ok(care) => {
                let surfaces = core.surfaces_diff(now_millis());
                serde_json::to_string(&BackgroundSync { care, surfaces }).ok()
            }
            Err(e) => {
                log::info!("[ios] aviso de cuidados aplazado: {e}");
                None
            }
        }
    }));
    out(result.ok().flatten())
}

/// El resumen de la mascota activa para el widget de la pantalla de inicio, con el estado que el
/// núcleo ya tiene. Devuelve nulo si no hay núcleo o no hay mascota (sin sesión), y entonces Swift
/// borra el resumen y el widget vuelve a «Abre Pockai».
///
/// # Safety
/// El resultado se libera con [`pockai_string_free`].
#[no_mangle]
pub unsafe extern "C" fn pockai_widget_poll() -> *mut c_char {
    let result = catch_unwind(AssertUnwindSafe(|| -> Option<String> {
        let core = CORE.lock().unwrap_or_else(|e| e.into_inner()).clone()?;
        serde_json::to_string(&core.pet_glance()?).ok()
    }));
    out(result.ok().flatten())
}

/// Qué hacer con las superficies vivas según el estado que el núcleo ya tiene, sin pedir nada al
/// servidor. Con la app abierta se llama cuando cambian los huevos. Devuelve nulo si no hay núcleo
/// todavía o si no hay nada que cambiar, para que Swift no haga trabajo de más.
///
/// # Safety
/// El resultado se libera con [`pockai_string_free`].
#[no_mangle]
pub unsafe extern "C" fn pockai_surfaces_poll() -> *mut c_char {
    let result = catch_unwind(AssertUnwindSafe(|| -> Option<String> {
        let core = CORE.lock().unwrap_or_else(|e| e.into_inner()).clone()?;
        let diff = core.surfaces_diff(now_millis());
        if diff.is_empty() {
            return None;
        }
        serde_json::to_string(&diff).ok()
    }));
    out(result.ok().flatten())
}

/// El resumen para el Apple Watch con el estado que el núcleo ya tiene (spec 44). Devuelve nulo si
/// no hay núcleo todavía; sin sesión devuelve un resumen vacío, que es lo que el reloj necesita para
/// enseñar «abre Pockai» en lugar de datos de quien se fue.
///
/// # Safety
/// El resultado se libera con [`pockai_string_free`].
#[no_mangle]
pub unsafe extern "C" fn pockai_wrist_snapshot() -> *mut c_char {
    let result = catch_unwind(AssertUnwindSafe(|| -> Option<String> {
        let core = CORE.lock().unwrap_or_else(|e| e.into_inner()).clone()?;
        serde_json::to_string(&core.wrist_snapshot(now_millis())).ok()
    }));
    out(result.ok().flatten())
}

/// El resumen para el reloj **solo si hay algo nuevo que se vea**. Devuelve nulo si no hay núcleo
/// o si nada ha cambiado desde el último envío, para que Swift no gaste el presupuesto de
/// WatchConnectivity. Es la hermana de `pockai_surfaces_poll`.
///
/// # Safety
/// El resultado se libera con [`pockai_string_free`].
#[no_mangle]
pub unsafe extern "C" fn pockai_wrist_push() -> *mut c_char {
    let result = catch_unwind(AssertUnwindSafe(|| -> Option<String> {
        let core = CORE.lock().unwrap_or_else(|e| e.into_inner()).clone()?;
        serde_json::to_string(&core.wrist_push(now_millis())?).ok()
    }));
    out(result.ok().flatten())
}

/// Olvida lo último que se le mandó al reloj, para que el siguiente resumen salga sí o sí. Lo llama
/// Swift cuando el reloj dice que no tiene nada guardado (se reinstaló, o es la primera vez).
#[no_mangle]
pub extern "C" fn pockai_wrist_forget() {
    let _ = catch_unwind(AssertUnwindSafe(|| {
        if let Some(core) = CORE.lock().unwrap_or_else(|e| e.into_inner()).clone() {
            core.wrist_forget();
        }
    }));
}

/// Lo que ha pulsado el jugador en el reloj. `request` es el JSON de un `WristRequest`.
///
/// Devuelve siempre un JSON con el resultado: `{"ok": <resumen>}` si se hizo, o
/// `{"error": {"reason": …}, "message": "…", "snapshot": <resumen>}` si no. El reloj enseña el
/// mensaje y pinta el resumen que venga, así que un rechazo no le deja la pantalla a medias.
/// Devuelve nulo solo si no hay núcleo o el JSON no se entiende.
///
/// # Safety
/// `request` tiene que ser una cadena de C válida. El resultado se libera con
/// [`pockai_string_free`].
#[no_mangle]
pub unsafe extern "C" fn pockai_wrist_perform(request: *const c_char) -> *mut c_char {
    let result = catch_unwind(AssertUnwindSafe(|| -> Option<String> {
        let body = text(request)?;
        let req: WristRequest = serde_json::from_str(&body).ok()?;
        let core = CORE.lock().unwrap_or_else(|e| e.into_inner()).clone()?;
        let now = now_millis();
        match tauri::async_runtime::block_on(core.wrist_perform(&req, now)) {
            Ok(snapshot) => serde_json::to_string(&json!({ "ok": snapshot })).ok(),
            Err(reject) => {
                log::info!("[ios] el reloj pidió algo que no se pudo hacer: {}", reject.message());
                serde_json::to_string(&json!({
                    "error": reject,
                    "message": reject.message(),
                    "snapshot": core.wrist_snapshot(now),
                }))
                .ok()
            }
        }
    }));
    out(result.ok().flatten())
}

/// Devuelve a Rust una cadena que entregó este módulo. Con un puntero nulo no hace nada.
///
/// # Safety
/// `ptr` tiene que ser nulo o un puntero que haya devuelto una función de este módulo, y solo se
/// puede liberar una vez.
#[no_mangle]
pub unsafe extern "C" fn pockai_string_free(ptr: *mut c_char) {
    if !ptr.is_null() {
        drop(CString::from_raw(ptr));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Libera y devuelve lo que entregó una función de este módulo.
    unsafe fn taken(ptr: *mut c_char) -> Option<String> {
        if ptr.is_null() {
            return None;
        }
        let text = CStr::from_ptr(ptr).to_str().ok().map(str::to_string);
        pockai_string_free(ptr);
        text
    }

    #[test]
    fn con_punteros_nulos_no_revienta() {
        unsafe {
            assert!(pockai_care_sync(std::ptr::null(), std::ptr::null()).is_null());
            pockai_string_free(std::ptr::null_mut());
        }
    }

    #[test]
    fn sin_nucleo_todavia_no_hay_superficies_que_tocar() {
        // `pockai_surfaces_poll` antes de que la app arranque: nulo, no un pánico.
        unsafe { assert_eq!(taken(pockai_surfaces_poll()), None) };
    }
}
