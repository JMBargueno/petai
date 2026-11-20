// Registra la tarea de fondo antes de que arranque la app.
//
// `BGTaskScheduler` exige registrar el manejador antes de que termine el arranque, y la app de Tauri
// no tiene un AppDelegate propio en el que engancharse (`main.mm` solo llama a `ffi::start_app()`,
// y ese fichero lo genera `tauri ios init`). Un constructor corre antes de `main`, así que llega a
// tiempo sin tocar nada generado.
//
// Lo que hace el registro está en `PockaiBackground.swift`; esto solo lo llama.

extern "C" void pockai_background_register(void);

__attribute__((constructor)) static void pockai_bootstrap(void) {
    pockai_background_register();
}
