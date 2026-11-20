//! Lo nativo de Android, por JNI directo (no por `run_mobile_plugin`): el núcleo necesita el
//! Keystore al construirse, dentro de `setup`, y el trabajo en segundo plano corre sin Tauri.
//!
//! - [`KeystoreSealer`]: cifra la sesión con `app.pockai.core.PockaiKeystore` (AES-GCM, la clave no
//!   sale del Keystore).
//! - `CareSync`: WorkManager despierta a la app cada ~30 min y llama a
//!   `Java_app_pockai_core_CareSync_check`, que usa el mismo [`Core`] que la app si ya está en marcha.
//! - `PockaiWidget`: el widget de la pantalla de inicio. Con la app abierta se actualiza en cuanto
//!   cambia la mascota (o se cierra la sesión); con la app cerrada, en cada pasada de `CareSync`.
//!
//! Las clases de la app se buscan una sola vez desde un hilo de Java (o con el cargador de clases de
//! la actividad) y se guardan como referencias globales: `FindClass` desde un hilo nativo, como los
//! de tokio, no las encuentra.

use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use jni::objects::{GlobalRef, JClass, JObject, JString, JValue};
use jni::sys::jstring;
use jni::{JNIEnv, JavaVM};
use pockai_core::{Core, CoreConfig, CoreEvent, SealedFileStore, Sealer, Slice};
use tokio::sync::broadcast::error::RecvError;

const KEYSTORE_CLASS: &str = "app/pockai/core/PockaiKeystore";
const CARE_SYNC_CLASS: &str = "app/pockai/core/CareSync";
const WIDGET_CLASS: &str = "app/pockai/core/PockaiWidget";
const SURFACES_CLASS: &str = "app/pockai/core/PockaiSurfaces";

struct Java {
    vm: JavaVM,
    keystore: GlobalRef,
    care_sync: GlobalRef,
    widget: GlobalRef,
    surfaces: GlobalRef,
    /// El contexto de la aplicación (no el de la actividad, que puede destruirse). Solo existe si
    /// la app está abierta; el trabajo en segundo plano actualiza el widget por su cuenta.
    app_context: Option<GlobalRef>,
}

static JAVA: OnceLock<Java> = OnceLock::new();

/// Un solo núcleo por proceso: lo crea quien llegue antes (la app o el trabajo en segundo plano) y
/// el otro lo reutiliza. Con dos, cada uno renovaría con su copia del refresh token y el backend
/// cerraría la sesión al ver uno ya canjeado.
static CORE: Mutex<Option<Core>> = Mutex::new(None);

fn shared_core(make: impl FnOnce() -> Core) -> Core {
    CORE.lock().unwrap().get_or_insert_with(make).clone()
}

/// Guarda la máquina virtual y las clases, desde un hilo de Java (la entrada JNI del trabajo en
/// segundo plano): ahí `FindClass` usa el cargador de clases de la app.
fn bind_from_env(env: &mut JNIEnv) -> jni::errors::Result<&'static Java> {
    if let Some(java) = JAVA.get() {
        return Ok(java);
    }
    let keystore = env.find_class(KEYSTORE_CLASS)?;
    let care_sync = env.find_class(CARE_SYNC_CLASS)?;
    let widget = env.find_class(WIDGET_CLASS)?;
    let surfaces = env.find_class(SURFACES_CLASS)?;
    let java = Java {
        vm: env.get_java_vm()?,
        keystore: env.new_global_ref(keystore)?,
        care_sync: env.new_global_ref(care_sync)?,
        widget: env.new_global_ref(widget)?,
        surfaces: env.new_global_ref(surfaces)?,
        app_context: None,
    };
    Ok(JAVA.get_or_init(|| java))
}

/// Lo mismo desde `setup`, con la actividad que Tauri deja en `ndk_context` y su cargador de clases.
fn bind_from_context() -> Result<&'static Java, String> {
    if let Some(java) = JAVA.get() {
        return Ok(java);
    }
    let ctx = ndk_context::android_context();
    // SAFETY: tao inicializa `ndk_context` con la máquina virtual y la actividad antes de `setup`.
    let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| e.to_string())?;
    let activity = unsafe { JObject::from_raw(ctx.context().cast()) };
    let java = {
        let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
        let loaded = (|| -> jni::errors::Result<(GlobalRef, GlobalRef, GlobalRef, GlobalRef, GlobalRef)> {
            let loader = env.call_method(&activity, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])?.l()?;
            let mut load = |name: &str| -> jni::errors::Result<GlobalRef> {
                let name = env.new_string(name.replace('/', "."))?;
                let class = env
                    .call_method(&loader, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;", &[JValue::Object(&name)])?
                    .l()?;
                env.new_global_ref(class)
            };
            let (keystore, care_sync, widget) = (load(KEYSTORE_CLASS)?, load(CARE_SYNC_CLASS)?, load(WIDGET_CLASS)?);
            let surfaces = load(SURFACES_CLASS)?;
            let app = env.call_method(&activity, "getApplicationContext", "()Landroid/content/Context;", &[])?.l()?;
            Ok((keystore, care_sync, widget, surfaces, env.new_global_ref(app)?))
        })();
        if loaded.is_err() {
            let _ = env.exception_clear();
        }
        loaded.map_err(|e| e.to_string())?
    };
    let (keystore, care_sync, widget, surfaces, app) = java;
    Ok(JAVA.get_or_init(|| Java { vm, keystore, care_sync, widget, surfaces, app_context: Some(app) }))
}

/// Llama a un método estático `(String) -> String?` de una clase guardada.
fn call_string(java: &Java, class: &GlobalRef, method: &str, arg: &str) -> Option<String> {
    let mut env = java.vm.attach_current_thread().ok()?;
    let result = (|| -> jni::errors::Result<Option<String>> {
        let arg = env.new_string(arg)?;
        let class: &JClass = class.as_obj().into();
        let out = env
            .call_static_method(class, method, "(Ljava/lang/String;)Ljava/lang/String;", &[JValue::Object(&arg)])?
            .l()?;
        if out.is_null() {
            return Ok(None);
        }
        let out = JString::from(out);
        let text: String = env.get_string(&out)?.into();
        Ok(Some(text))
    })();
    match result {
        Ok(text) => text,
        Err(e) => {
            let _ = env.exception_clear();
            log::warn!("[android] {method} falló: {e}");
            None
        }
    }
}

/// Cifra la sesión con la clave AES-GCM del Android Keystore.
pub struct KeystoreSealer(&'static Java);

impl Sealer for KeystoreSealer {
    fn seal(&self, plain: &[u8]) -> Option<String> {
        call_string(self.0, &self.0.keystore, "seal", std::str::from_utf8(plain).ok()?)
    }
    fn open(&self, sealed: &str) -> Option<Vec<u8>> {
        call_string(self.0, &self.0.keystore, "open", sealed).map(String::into_bytes)
    }
}

/// El núcleo de la app con la sesión cifrada. Si el Keystore no responde, la sesión vive en memoria.
fn build_core(base_url: String, data_dir: Option<PathBuf>, java: Option<&'static Java>) -> Core {
    let cfg = CoreConfig::mobile(base_url, "android", data_dir.clone());
    let secrets: Box<dyn pockai_core::SecretStore> = match (data_dir, java) {
        (Some(dir), Some(java)) => Box::new(SealedFileStore::new(dir, KeystoreSealer(java))),
        _ => Box::new(pockai_core::MemoryStore::default()),
    };
    Core::new(cfg, secrets)
}

/// El núcleo para `setup`: el que ya creó el trabajo en segundo plano, o uno nuevo. Además programa
/// ese trabajo con la URL, la carpeta de datos y la librería que tiene que cargar, y mantiene el
/// widget al día mientras la app esté abierta.
pub(crate) fn core_for_app(base_url: String, data_dir: Option<PathBuf>, library: Option<&str>) -> Core {
    let java = bind_from_context().map_err(|e| log::warn!("[android] sin JNI: {e}")).ok();
    let core = shared_core(|| build_core(base_url.clone(), data_dir.clone(), java));
    if let Some(java) = java {
        if let (Some(dir), Some(library)) = (&data_dir, library) {
            if let Err(e) = schedule_care_sync(java, dir, &base_url, library) {
                log::warn!("[android] no se pudo programar el aviso de cuidados: {e}");
            }
        }
        watch_widget(java, core.clone());
        watch_surfaces(java, core.clone());
    }
    core
}

/// Las superficies vivas (fase 5): con la app abierta, la notificación en curso sigue a los huevos.
/// Qué abrir, actualizar o cerrar lo decide `surfaces.rs`; aquí solo se le pasa a Kotlin.
fn watch_surfaces(java: &'static Java, core: Core) {
    let mut events = core.subscribe();
    tauri::async_runtime::spawn(async move {
        push_surfaces(java, &core);
        loop {
            match events.recv().await {
                Ok(CoreEvent::State(change)) if change.slice == Slice::Eggs => {}
                Ok(CoreEvent::Session(_)) => {}
                Ok(_) => continue,
                Err(RecvError::Lagged(_)) => {}
                Err(RecvError::Closed) => break,
            }
            push_surfaces(java, &core);
        }
    });
}

/// `PockaiSurfaces.apply(context, json)`. Si no hay nada que cambiar, no se llama.
fn push_surfaces(java: &Java, core: &Core) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let diff = core.surfaces_diff(now);
    if diff.is_empty() {
        return;
    }
    let Ok(json) = serde_json::to_string(&diff) else { return };
    let Some(context) = &java.app_context else { return };
    let Ok(mut env) = java.vm.attach_current_thread() else { return };
    let result = (|| -> jni::errors::Result<()> {
        let json = env.new_string(json)?;
        let class: &JClass = java.surfaces.as_obj().into();
        env.call_static_method(
            class,
            "apply",
            "(Landroid/content/Context;Ljava/lang/String;)V",
            &[JValue::Object(context.as_obj()), JValue::Object(&json)],
        )?;
        Ok(())
    })();
    if let Err(e) = result {
        let _ = env.exception_clear();
        log::warn!("[android] no se pudieron actualizar las superficies: {e}");
    }
}

fn schedule_care_sync(java: &Java, dir: &std::path::Path, base_url: &str, library: &str) -> jni::errors::Result<()> {
    let Some(context) = &java.app_context else { return Ok(()) };
    let mut env = java.vm.attach_current_thread()?;
    let result = (|| {
        let dir = env.new_string(dir.to_string_lossy())?;
        let base_url = env.new_string(base_url)?;
        let library = env.new_string(library)?;
        let class: &JClass = java.care_sync.as_obj().into();
        env.call_static_method(
            class,
            "schedule",
            "(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V",
            &[JValue::Object(context.as_obj()), JValue::Object(&dir), JValue::Object(&base_url), JValue::Object(&library)],
        )?;
        Ok(())
    })();
    if result.is_err() {
        let _ = env.exception_clear();
    }
    result
}

/// Mientras la app esté abierta, el widget sigue a la mascota activa: se redibuja cuando cambian las
/// mascotas o cuál es la activa (al cerrar sesión se vacían, y el widget vuelve a «Abre la app»).
fn watch_widget(java: &'static Java, core: Core) {
    let mut events = core.subscribe();
    tauri::async_runtime::spawn(async move {
        let mut last = widget_json(&core);
        push_widget(java, last.as_deref());
        loop {
            match events.recv().await {
                Ok(CoreEvent::State(change)) if matches!(change.slice, Slice::Pets | Slice::ActivePetId) => {}
                Ok(_) => continue,
                Err(RecvError::Lagged(_)) => {}
                Err(RecvError::Closed) => break,
            }
            let now = widget_json(&core);
            if now != last {
                push_widget(java, now.as_deref());
                last = now;
            }
        }
    });
}

fn widget_json(core: &Core) -> Option<String> {
    core.pet_glance().and_then(|glance| serde_json::to_string(&glance).ok())
}

/// `PockaiWidget.update(context, json)`: guarda el resumen (o lo borra con `null`) y redibuja.
fn push_widget(java: &Java, json: Option<&str>) {
    let Some(context) = &java.app_context else { return };
    let Ok(mut env) = java.vm.attach_current_thread() else { return };
    let result = (|| -> jni::errors::Result<()> {
        let json = match json {
            Some(text) => JObject::from(env.new_string(text)?),
            None => JObject::null(),
        };
        let class: &JClass = java.widget.as_obj().into();
        env.call_static_method(
            class,
            "update",
            "(Landroid/content/Context;Ljava/lang/String;)V",
            &[JValue::Object(context.as_obj()), JValue::Object(&json)],
        )?;
        Ok(())
    })();
    if let Err(e) = result {
        let _ = env.exception_clear();
        log::warn!("[android] no se pudo actualizar el widget: {e}");
    }
}

/// `CareSync.check(dataDir, baseUrl)`: pide las mascotas y devuelve `{"notice": …, "widget": …}` en
/// JSON (cada uno puede ser `null`), o `null` (de Java) si hay que reintentar más tarde (sin red,
/// error del servidor).
#[no_mangle]
pub extern "system" fn Java_app_pockai_core_CareSync_check<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    data_dir: JString<'local>,
    base_url: JString<'local>,
) -> jstring {
    let result = catch_unwind(AssertUnwindSafe(|| -> Option<String> {
        let data_dir: String = env.get_string(&data_dir).ok()?.into();
        let base_url: String = env.get_string(&base_url).ok()?.into();
        let java = bind_from_env(&mut env).map_err(|e| log::warn!("[android] sin JNI: {e}")).ok();
        let core = shared_core(|| build_core(base_url, Some(PathBuf::from(data_dir)), java));
        match tauri::async_runtime::block_on(core.care_sync()) {
            Ok(sync) => serde_json::to_string(&sync).ok(),
            Err(e) => {
                log::info!("[android] aviso de cuidados aplazado: {e}");
                None
            }
        }
    }));
    let _ = env.exception_clear();
    match result {
        Ok(Some(json)) => env.new_string(json).map(|s| s.into_raw()).unwrap_or(std::ptr::null_mut()),
        _ => std::ptr::null_mut(),
    }
}
