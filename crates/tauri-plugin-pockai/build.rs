const COMMANDS: &[&str] = &[
    "chat_stream",
    "chat_cancel",
    "session_state",
    "session_logout",
    "session_import_legacy",
    "realtime_start",
    "realtime_stop",
    "state_snapshot",
    "state_load",
    "state_refresh",
    "state_apply_pet",
    "state_patch_pet",
    "state_select_pet",
    "inbox_push",
    "inbox_take",
    "inbox_mark_all_read",
    "set_present",
    "perform",
    "query",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
