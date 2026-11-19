# Migración al núcleo cliente en Rust (Tauri v2: escritorio, iOS, Android)

Seguimiento paso a paso. La arquitectura y el porqué están en
[`specs/spec-42-nucleo-rust-tauri.md`](specs/spec-42-nucleo-rust-tauri.md).

**Estados:** ⬜ no empezado · 🟡 en progreso · ✅ terminado y verificado

Cada paso se marca 🟡 al empezarlo y ✅ al terminarlo, en el mismo commit que el trabajo. Si algo
se desvía del plan, se anota en «Desviaciones» al final.

## Resumen

| Fase | Qué consigue | Pasos | Estado |
|---|---|---|---|
| 1 | Toda la red del escritorio pasa por Rust; ningún token en el webview | 24 / 24 | ✅ |
| 2 | El estado global vive en Rust; `App.svelte` solo se suscribe | 5 / 6 | 🟡 |
| 3 | Dominios restantes y fin de la pasarela `api_request` | 0 / 6 | ⬜ |
| 4 | Targets Android e iOS con su UI y plugins nativos; se borra la app Kotlin | 0 / 10 | ⬜ |
| 5 | Live Activity / Dynamic Island y widgets | 0 / 7 | ⬜ |

## Fase 1 — Núcleo + escritorio

### 1.0 Preparación
- ✅ 1.0.1 Crear este documento de seguimiento
- ✅ 1.0.2 Workspace Cargo en la raíz (`desktop/src-tauri` + `crates/*`), `Cargo.lock` en la raíz
- ✅ 1.0.3 Ajustar CI (`cargo check/test --workspace --locked`) y revisar `release.yml`

### 1.1 `crates/pockai-core` (Rust puro, sin Tauri)
- ✅ 1.1.1 `config`: URL base, `X-Client`, plataforma, directorio de datos
- ✅ 1.1.2 `secrets`: trait `SecretStore`, llavero del sistema y almacén en memoria para tests
- ✅ 1.1.3 `http` + `auth`: petición autenticada, refresco único, un reintento por 401, puertas 403
- ✅ 1.1.4 `maintenance`: detección del 503 `MAINTENANCE`
- ✅ 1.1.5 `events`: `CoreEvent` por canal de difusión
- ✅ 1.1.6 `sse`: chat por `POST` + `text/event-stream`
- ✅ 1.1.7 Prueba de concepto de Socket.IO en Rust contra un servidor de prueba
- ✅ 1.1.8 `realtime`: conexión a `/realtime`, reconexión tras `auth:expired`
- ✅ 1.1.9 Tests del núcleo (`wiremock`): refresco único, rotación, puertas, mantenimiento, SSE

### 1.2 Puente Tauri y contrato tipado
- ✅ 1.2.1 `crates/tauri-plugin-pockai`: commands (`api_request`, `chat_stream`, `session_*`, `realtime_*`)
- ✅ 1.2.2 Events `core://session`, `core://maintenance`, `core://realtime`
- ✅ 1.2.3 Tipos TS generados desde Rust en `shared/client/src/bindings/`
- ✅ 1.2.4 Registrar el plugin y su permiso en `desktop/src-tauri`

### 1.3 `shared/client` (`@pockai/client`)
- ✅ 1.3.1 `coreFetch` (compatible con `fetch`) sobre `api_request`
- ✅ 1.3.2 Suscripción a eventos y canal de chat

### 1.4 Corte en el escritorio
- ✅ 1.4.1 `api.ts`: transporte por `coreFetch`; tokens fuera del webview
- ✅ 1.4.2 `socket.ts` sobre `core://realtime`
- ✅ 1.4.3 `environmental.ts` sin refresco propio
- ✅ 1.4.4 Migración única de la sesión guardada en `localStorage` al llavero

### 1.5 Cierre
- ✅ 1.5.1 Spec 42 y enmienda de la constitución (§III y stack)
- ✅ 1.5.2 Verificación: tests Rust y vitest, app real contra backend local, modo demo

## Fase 2 — Estado global en Rust
- 🟡 2.1 DTO tipados de `user`, `pet`, `egg`, `inventory`, `shop` — aplazado a la fase 3 (ver desviaciones): el estado guarda el JSON del backend tal cual
- ✅ 2.2 `state.rs`: slices con revisión y reductores de `pet:update`, logros y recompensas
- ✅ 2.3 `loadInitialData` y `pollPet` salen de `App.svelte` (carga, zona horaria, sondeo y mascota activa en Rust)
- ✅ 2.4 `state_snapshot` + evento `core://state`; stores en `desktop/src/lib/appState.ts`
- ✅ 2.5 Snapshot en disco (`state.json`) para arranque instantáneo y lectura sin conexión
- ✅ 2.6 `App.svelte` refleja `appState`; `ControlPanel`, `PetView` y `HabitatWidget` siguen recibiendo props

## Fase 3 — Dominios restantes
- ⬜ 3.1 Avisos, bandeja y recordatorios (`notifications`, `notification-inbox`, `initiative`)
- ⬜ 3.2 Entorno: latido, caché de clima, geolocalización
- ⬜ 3.3 Social: visitas, viaje de visita, clanes
- ⬜ 3.4 Skills de escritorio, digest de contexto y ajustes persistidos
- ⬜ 3.5 Cola larga: commands tipados pestaña a pestaña (arena, cocina, misiones, …)
- ⬜ 3.6 Borrar `api_request`, `api.ts` y el transporte web salvo el modo demo

## Fase 4 — Móvil
- ⬜ 4.1 `main.rs` → `lib.rs` con `mobile_entry_point`; código de escritorio bajo `cfg(desktop)`
- ⬜ 4.2 `tauri android init` / `tauri ios init`; versionar `gen/android` y `gen/apple`
- ⬜ 4.3 `tauri.android.conf.json` / `tauri.ios.conf.json` y capacidades por plataforma
- ⬜ 4.4 `shared/ui` (`@pockai/ui`): tokens y componentes comunes
- ⬜ 4.5 `apps/android`: UI Svelte
- ⬜ 4.6 `apps/ios`: UI Svelte
- ⬜ 4.7 `tauri-plugin-pockai-secure`: Keychain / Keystore
- ⬜ 4.8 `tauri-plugin-pockai-bgsync`: WorkManager / BGAppRefreshTask + avisos de cuidado
- ⬜ 4.9 CI de Android e iOS
- ⬜ 4.10 Borrar `mobile/android`, su job de CI y las referencias en docs, specs y skills

## Fase 5 — Superficies nativas
- ⬜ 5.1 `surfaces.rs`: política pura `AppState → descriptor`
- ⬜ 5.2 `tauri-plugin-pockai-surfaces` (Rust) y paquete Swift `PockaiActivityKit`
- ⬜ 5.3 Plugin Swift: iniciar, actualizar y terminar la Live Activity
- ⬜ 5.4 Widget Extension: Dynamic Island y pantalla de bloqueo
- ⬜ 5.5 App Group, snapshot y sprites pre-horneados; widget de inicio (WidgetKit)
- ⬜ 5.6 Android: notificación en curso y widget Glance sobre el mismo snapshot
- ⬜ 5.7 Prueba en dispositivo (iPhone con Dynamic Island, Android 16)

## Desviaciones respecto al plan

- **Tipos con `ts-rs` en vez de `tauri-specta`** (1.2.3). `tauri-specta` sigue en versión candidata
  (2.0.0-rc) y su API cambia entre candidatas. `ts-rs` genera los tipos de las cargas; las funciones
  que llaman a los commands se escriben a mano en `shared/client/src/index.ts`.
- **El inicio de sesión no tiene command propio** (1.2.1). Pasa por `api_request`: el núcleo reconoce
  cualquier respuesta correcta de `/auth/*` con un par de tokens, abre sesión y le devuelve a la UI la
  respuesta con los tokens sustituidos. Así `api.ts` no cambia sus llamadas. Los commands tipados
  (`session_login`…) llegarán con el resto en la fase 3.
- **Socket.IO en Rust funciona: no hizo falta el plan B** (1.1.7). Un detalle del crate
  `rust_socketio`: los eventos sin datos (`auth:expired`) llegan con nombre `message`; el núcleo los
  normaliza (`realtime.rs`, función `named`).
- **Se conserva el transporte web en `api.ts` y `socket.ts`** para el modo demo y los tests de vitest,
  que corren sin Tauri. Se elimina en el paso 3.6, salvo lo que necesite el modo demo.
- **El estado guarda el JSON del backend, sin DTO tipados** (2.1). OpenAPI no tipa la mayoría de las
  respuestas y la UI lee muchos campos que al núcleo no le importan: tipar a mano `Pet` o `User`
  enteros habría sido inventar un contrato que puede romperse con cualquier campo nuevo. El núcleo
  interpreta solo lo que necesita para decidir (`id`, `emailVerified`, `handle`, `timezone`,
  `availability`, `remainingMs`). Los DTO llegarán en la fase 3 con los commands tipados por dominio.
- **Snapshot en un fichero JSON en vez de SQLite** (2.5). Es un único documento pequeño que se
  reescribe entero; SQLite se justificará cuando haya datos con consultas (bandeja de avisos, fase 3).
- **Los stores viven en el escritorio, no en `@pockai/client`** (2.4). `desktop/src/lib/appState.ts`
  refleja el núcleo dentro de la app y hace el trabajo con `api.ts` en el modo demo. Cuando existan
  las UIs móviles (fase 4) la parte común subirá a `@pockai/client`.
- **La UI sigue entregando al núcleo las mascotas que recibe** (`state_apply_pet`). Las acciones (dar
  de comer, bañar…) aún pasan por la pasarela `api_request`, así que el núcleo no ve su respuesta; con
  los commands tipados de la fase 3 actualizará el estado él solo.


## Pendiente de verificar en la fase 1

- **Chat con respuesta real del modelo dentro de la app.** El camino completo funciona (la UI llama al
  núcleo y recibe el resultado por el canal), pero el backend de la prueba no tenía una key de IA
  válida y devolvió «Key rechazada por el proveedor». El reparto de eventos `delta`/`done` está
  cubierto por los tests del núcleo, no visto en la app.
- **`release.yml`.** No se ha ejecutado con el workspace. La URL de producción la toma ahora también
  Rust de `VITE_API_URL` al compilar: conviene revisar el primer release.

## Verificado en la app: fase 1 (2026-11-19)

Compilación de desarrollo contra un backend local con `JWT_ACCESS_EXPIRES_IN=20s`: inicio de sesión
desde la UI; sesión conservada tras recargar y tras reiniciar la app (llavero); petición correcta con
el token ya caducado; `pet:update`, `pet:action` y `achievement:unlocked` recibidos y reflejados en la
UI; claves antiguas de `localStorage` eliminadas al arrancar; ninguna petición del webview a `/v1` ni a
`socket.io`, y ningún token en `localStorage`.

## Verificado en la app: fase 2 (2026-11-19)

Compilación de desarrollo contra un backend local: tras iniciar sesión el núcleo carga usuario, huevo,
inventario y tienda y la UI los muestra; al eclosionar desde la UI el núcleo guarda la mascota, la
marca como activa, vacía los huevos y refresca el saldo él solo (logro por tiempo real); con el
backend apagado la app arranca mostrando la mascota y el saldo guardados; al cerrar sesión se borra
el estado guardado. Modo demo en el navegador: carga, dar de comer y cambios sueltos funcionan.

No se ha visto en la app: el sondeo de cada minuto, el bloqueo por correo sin verificar o sin
nickname y el ajuste de zona horaria. Los tres están cubiertos por los tests del núcleo.

## Notas

- Un test que ya fallaba antes de esta migración: `desktop/src/lib/game-data.client.spec.ts` deja un
  rechazo sin atender (`AssetNotFound: game-data/balance`). Es código sin uso y no se ha tocado.
