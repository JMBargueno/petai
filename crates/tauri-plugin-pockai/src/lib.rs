//! Puente entre el núcleo cliente (`pockai-core`) y la UI.
//!
//! - **Commands** (`plugin:pockai|…`): la UI pide algo y espera la respuesta.
//! - **Events** (`core://…`): el núcleo avisa de cambios de sesión, mantenimiento y tiempo real.
//! - **Channels**: flujos largos, como el chat en streaming.
//!
//! Los tipos de las cargas se definen en `pockai_core::contract` y de ahí se generan los de la UI.

use std::collections::HashMap;
use std::sync::Mutex;

use pockai_core::{
    ApiRequest, ApiResponse, AppState, Core, CoreConfig, CoreEvent, KeyringStore, LoadOptions, LoadOutcome,
    MaintenanceEvent, RealtimeStatus, SessionEvent, SessionState, Slice, SseEvent,
};
use serde_json::{Map, Value};
use tauri::ipc::Channel;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::oneshot;

pub const EVENT_SESSION: &str = "core://session";
pub const EVENT_MAINTENANCE: &str = "core://maintenance";
pub const EVENT_REALTIME: &str = "core://realtime";
pub const EVENT_REALTIME_STATUS: &str = "core://realtime-status";
pub const EVENT_STATE: &str = "core://state";
pub const EVENT_NOTICE: &str = "core://notice";

/// Lo que el shell de cada plataforma le dice al puente al registrarlo.
pub struct PockaiConfig {
    /// URL del backend, sin `/v1`.
    pub base_url: String,
}

/// Chats en curso, por id: permite cancelar el flujo desde la UI.
#[derive(Default)]
struct Chats(Mutex<HashMap<String, oneshot::Sender<()>>>);

#[tauri::command]
async fn api_request(core: State<'_, Core>, request: ApiRequest) -> Result<ApiResponse, String> {
    core.request(request).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn chat_stream(
    core: State<'_, Core>,
    chats: State<'_, Chats>,
    id: String,
    request: ApiRequest,
    on_event: Channel<SseEvent>,
) -> Result<ApiResponse, String> {
    let (cancel, cancelled) = oneshot::channel();
    chats.0.lock().unwrap().insert(id.clone(), cancel);

    let result = tokio::select! {
        result = core.stream(request, move |event| { let _ = on_event.send(event); }) => {
            result.map_err(|e| e.to_string())
        }
        _ = cancelled => Err("cancelado".to_string()),
    };

    chats.0.lock().unwrap().remove(&id);
    result
}

#[tauri::command]
async fn chat_cancel(chats: State<'_, Chats>, id: String) -> Result<(), String> {
    if let Some(cancel) = chats.0.lock().unwrap().remove(&id) {
        let _ = cancel.send(());
    }
    Ok(())
}

#[tauri::command]
async fn session_state(core: State<'_, Core>) -> Result<SessionState, String> {
    Ok(core.session_state())
}

#[tauri::command]
async fn session_logout(core: State<'_, Core>) -> Result<(), String> {
    core.logout();
    Ok(())
}

/// Sesión que guardaba el webview en versiones anteriores: pasa al llavero una sola vez.
#[tauri::command]
async fn session_import_legacy(
    core: State<'_, Core>,
    access_token: String,
    refresh_token: String,
    device_id: Option<String>,
) -> Result<bool, String> {
    Ok(core.import_legacy(access_token, refresh_token, device_id))
}

#[tauri::command]
async fn realtime_start(core: State<'_, Core>) -> Result<(), String> {
    core.realtime_start();
    Ok(())
}

#[tauri::command]
async fn realtime_stop(core: State<'_, Core>) -> Result<(), String> {
    core.realtime_stop();
    Ok(())
}

#[tauri::command]
async fn state_snapshot(core: State<'_, Core>) -> Result<AppState, String> {
    Ok(core.state_snapshot())
}

#[tauri::command]
async fn state_load(core: State<'_, Core>, options: LoadOptions) -> Result<LoadOutcome, String> {
    Ok(core.state_load(options).await)
}

#[tauri::command]
async fn state_refresh(core: State<'_, Core>, slice: Slice) -> Result<(), String> {
    core.state_refresh(slice).await
}

#[tauri::command]
async fn state_apply_pet(core: State<'_, Core>, pet: Value, add: bool) -> Result<(), String> {
    core.state_apply_pet(pet, add);
    Ok(())
}

#[tauri::command]
async fn state_patch_pet(core: State<'_, Core>, id: String, patch: Map<String, Value>) -> Result<(), String> {
    core.state_patch_pet(&id, patch);
    Ok(())
}

#[tauri::command]
async fn state_select_pet(core: State<'_, Core>, id: String) -> Result<(), String> {
    core.state_select_pet(&id);
    Ok(())
}

#[tauri::command]
async fn inbox_push(core: State<'_, Core>, notice: Value) -> Result<(), String> {
    core.inbox_push(notice);
    Ok(())
}

#[tauri::command]
async fn inbox_take(core: State<'_, Core>) -> Result<Vec<Value>, String> {
    Ok(core.inbox_take())
}

#[tauri::command]
async fn inbox_mark_all_read(core: State<'_, Core>) -> Result<(), String> {
    core.inbox_mark_all_read();
    Ok(())
}

fn forward<R: Runtime>(app: &AppHandle<R>, event: CoreEvent) {
    let result = match event {
        CoreEvent::Session(kind) => app.emit(EVENT_SESSION, SessionEvent { kind }),
        CoreEvent::Maintenance(body) => app.emit(EVENT_MAINTENANCE, MaintenanceEvent { body }),
        CoreEvent::Realtime(event) => app.emit(EVENT_REALTIME, event),
        CoreEvent::RealtimeStatus { connected } => app.emit(EVENT_REALTIME_STATUS, RealtimeStatus { connected }),
        CoreEvent::State(change) => app.emit(EVENT_STATE, change),
        CoreEvent::Notice(notice) => app.emit(EVENT_NOTICE, notice),
    };
    if let Err(e) = result {
        log::warn!("[puente] no se pudo emitir un evento a la UI: {e}");
    }
}

pub fn init<R: Runtime>(config: PockaiConfig) -> TauriPlugin<R> {
    Builder::new("pockai")
        .invoke_handler(tauri::generate_handler![
            api_request,
            chat_stream,
            chat_cancel,
            session_state,
            session_logout,
            session_import_legacy,
            realtime_start,
            realtime_stop,
            state_snapshot,
            state_load,
            state_refresh,
            state_apply_pet,
            state_patch_pet,
            state_select_pet,
            inbox_push,
            inbox_take,
            inbox_mark_all_read
        ])
        .setup(move |app, _api| {
            let data_dir = app.path().app_config_dir().ok();
            let cfg = CoreConfig::desktop(config.base_url, data_dir);
            let secrets = Box::new(KeyringStore::new(&cfg.base_url));
            let core = Core::new(cfg, secrets);

            // Todo lo que anuncia el núcleo llega a la UI como evento de Tauri.
            let mut events = core.subscribe();
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    match events.recv().await {
                        Ok(event) => forward(&handle, event),
                        Err(RecvError::Lagged(skipped)) => {
                            log::warn!("[puente] la UI va con retraso: {skipped} eventos descartados");
                        }
                        Err(RecvError::Closed) => break,
                    }
                }
            });

            app.manage(core);
            app.manage(Chats::default());
            Ok(())
        })
        .build()
}
