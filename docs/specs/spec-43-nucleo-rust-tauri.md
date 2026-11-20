# Spec 43: núcleo cliente en Rust y Tauri v2 para escritorio, iOS y Android

Documento autocontenido. Define **dónde vive la lógica de cliente** (un núcleo en Rust compartido por
las tres plataformas), **qué se queda en la UI**, **cómo hablan entre sí** y **en qué orden se migra**.

Estado: **fases 1 a 5 hechas** (la red, el estado global y todas las llamadas del escritorio van por
el núcleo, con tipo propio; Android e iOS tienen su app y sus plugins nativos; las superficies vivas
están, salvo la prueba en dispositivo). La fase 6, el reloj, está planificada. El avance paso a paso se
lleva en [`../MIGRACION_NUCLEO_RUST.md`](../MIGRACION_NUCLEO_RUST.md).

Sustituye el planteamiento de clientes nativos separados (Compose y SwiftUI) de la spec 27 y de
`PROYECTO.md`: habrá una sola app Tauri v2 con una UI por plataforma. **El backend no cambia.**

## 1. Punto de partida

| Pieza | Dónde | Problema |
|---|---|---|
| Cliente de la API | `desktop/src/lib/api.ts` (~130 llamadas) | Vive en el webview; solo 23 llamadas están tipadas con OpenAPI |
| Sesión | `localStorage` del webview | Tokens en texto plano, al alcance de cualquier script de la página |
| Renovación del token | `api.ts`, `environmental.ts`, `socket.ts` | Tres caminos distintos; el refresh token rota y reutilizarlo cierra todas las sesiones |
| Estado global | variables locales de `App.svelte` | No hay almacén; nada puede leerlo fuera del webview (widgets, segundo plano) |
| Rust del escritorio | `desktop/src-tauri` | Solo trabajo de sistema (bandeja, sensores, CLI de IA, ubicación) |
| Android | `mobile/android` (Kotlin) | Reescribe a mano cliente HTTP, DTO y tiempo real |
| iOS | — | No existe |

## 2. Arquitectura

```
Cargo.toml                      workspace: desktop/src-tauri + crates/*
crates/
  pockai-core/                  Rust puro, sin Tauri: red, sesión, tiempo real, contrato
  tauri-plugin-pockai/          puente: commands, events y channels
  tauri-plugin-pockai-secure/   Keychain / Keystore                          (fase 4)
  tauri-plugin-pockai-bgsync/   WorkManager / BGAppRefreshTask               (fase 4)
  tauri-plugin-pockai-surfaces/ Live Activity, WidgetKit, Glance             (fase 5)
desktop/                        UI de escritorio + shell Tauri de los tres targets
apps/android/, apps/ios/        cáscara de cada móvil: plataforma, estilos y configuración  (fase 4)
shared/client/                  @pockai/client: tipos generados y funciones para hablar con el núcleo
shared/mobile/                  @pockai/mobile: la app móvil común a Android e iOS (shell, navegación, pantallas)  (fase 4)
shared/ui/                      @pockai/ui: tokens y componentes comunes     (fase 4)
shared/{mind,minigames,scene,audio,game-data,assets,openapi}   sin cambios
```

`desktop/` no se mueve: CI, `release.yml`, `.claude/launch.json`, la documentación y las skills
`pockai-*` usan esa ruta.

**Una UI por target.** Las dos móviles son la misma app: `@pockai/mobile` trae el shell, la
navegación y los contenedores de pantalla, y `apps/android` y `apps/ios` solo fijan su plataforma,
sus estilos propios y una `MobileConfig` (una opción solo existe ahí si hoy tiene dos valores
distintos). Tauri fusiona `tauri.conf.json` con `tauri.android.conf.json` y
`tauri.ios.conf.json`. La base apunta a `desktop/`; cada fichero de plataforma sobrescribe
`build.devUrl`, `build.frontendDist`, `build.beforeDevCommand`, `build.beforeBuildCommand`,
`identifier` y `app.windows`, así cada compilación empaqueta solo su UI. Las capacidades se separan con
`"platforms"`. En Rust, lo que solo existe en escritorio (bandeja, sensores, CLI de IA, atajo global,
autoarranque, actualizador, instancia única) queda bajo `#[cfg(desktop)]`.

## 3. Frontera entre el núcleo y la UI

| Vive en el núcleo (Rust) | Se queda en la UI (Svelte / TypeScript) |
|---|---|
| HTTP, cabecera `X-Client`, errores, mantenimiento | Render, animación, física de la mascota y los juguetes |
| Tokens, renovación, puertas `EMAIL_NOT_VERIFIED` y `HANDLE_REQUIRED` | Navegación, modales, formularios, avisos visuales |
| Socket.IO y chat en streaming | `@pockai/mind`, escena, minijuegos y audio |
| Estado global: sesión, usuario, mascotas, huevos, inventario, tienda, clanes, visitas, entorno (fase 2) | Cerebro de escritorio (`lib/brain`), frases, posarse en ventanas |
| Reglas de cliente sin UI: umbrales de necesidades, recordatorios, viaje de visita, latidos (fase 3) | Estado efímero y preferencias puramente visuales |
| Persistencia: secretos, caché, bandeja de avisos, ajustes | Hermes local (loopback) y la CLI de IA (que ya es Rust) |

Regla: **el webview no hace `fetch` ni abre sockets contra el backend, y no ve ningún token.**

`@pockai/mind`, `@pockai/minigames`, `@pockai/scene` y `@pockai/audio` **no se portan a Rust**: el
backend ejecuta los mismos paquetes (RNG de combate, replay de minijuegos, autonomía) y no se puede
tocar, así que una segunda implementación solo añadiría riesgo de divergencia.

## 4. Contrato

Los tipos se definen en `crates/pockai-core/src/contract.rs` y se generan a TypeScript con `ts-rs` en
`shared/client/src/bindings/` (`cargo test -p pockai-core export_bindings`). CI falla si el generado
difiere del versionado.

| Tipo | Nombre | Para qué |
|---|---|---|
| Command | `plugin:pockai\|chat_stream`, `chat_cancel` | Chat; los eventos llegan por un `Channel<SseEvent>` |
| Command | `plugin:pockai\|session_state`, `session_logout`, `session_import_legacy` | Sesión |
| Command | `plugin:pockai\|realtime_start`, `realtime_stop` | Canal en tiempo real |
| Event | `core://session` | `active`, `loggedOut`, `expired`, `unverified`, `handleRequired` |
| Event | `core://maintenance` | Cuerpo del 503 `MAINTENANCE` |
| Event | `core://realtime`, `core://realtime-status` | Eventos del servidor y estado de la conexión |
| Command | `plugin:pockai\|state_snapshot`, `state_load`, `state_refresh`, `state_apply_pet`, `state_patch_pet`, `state_select_pet` | Estado global |
| Command | `plugin:pockai\|perform` | Lo que el jugador hace, con tipo propio (`Action`, 85 variantes): sesión y alta, cuidado, tienda, arena, clanes… |
| Command | `plugin:pockai\|query` | Lo que la UI quiere saber, con tipo propio (`Query`, 67 variantes): listas, perfiles, historiales… |
| Command | `plugin:pockai\|inbox_push`, `inbox_take`, `inbox_mark_all_read`, `set_present` | Bandeja de avisos y presencia del jugador |
| Event | `core://notice` | El núcleo pide avisar de algo (necesidad de la mascota, recordatorio vencido) |
| Event | `core://state` | `{slice, rev, value, source}` con la parte del estado que cambia |

No hay pasarela genérica hacia la API: la UI solo puede pedir lo que está en `Action` o en `Query`
(la fase 1 tuvo una, `api_request`, que se retiró al terminar la fase 3).

En la UI, `@pockai/client` envuelve todo esto: `perform`, `query`, `coreStream`,
`onSession`, `onRealtime`… El estado se pide con `stateSnapshot` y se sigue con `onStateChange`; en el escritorio lo refleja `desktop/src/lib/appState.ts`.

### Cómo trata el núcleo una petición

1. Si la llamada va con sesión, añade el access token.
2. Ante un 401 renueva y repite **una vez**. Solo hay una renovación en curso; las demás peticiones
   esperan y reutilizan el token nuevo.
3. Las rutas `/auth/*` no se renuevan, salvo `/auth/verify-email/*`.
4. Un 403 con `EMAIL_NOT_VERIFIED` o `HANDLE_REQUIRED` no es un problema de token: emite `core://session`.
5. La sesión solo se da por caducada si el servidor rechaza el refresh token (400 o 401). Un fallo de
   red o un 5xx la conserva.
6. Una respuesta correcta de `/auth/*` con un par de tokens abre sesión; a la UI le llegan sustituidos
   por `"core"`.
7. Un 503 `MAINTENANCE` emite `core://maintenance`.

### Tiempo real

El núcleo se conecta a `/realtime` con `{token, deviceId, platform, client}`. Cuando el servidor avisa
con `auth:expired` y corta, renueva el token y reconecta. Otros cortes se reintentan con espera
creciente (1 s a 60 s). El id del dispositivo se guarda en la carpeta de datos de la app.

## 5. Límites que impone el backend

- **No hay endpoint para registrar tokens de push** (FCM o APNs). Live Activities y widgets solo se
  actualizan con la app viva o en los refrescos en segundo plano que conceda el sistema, así que se
  diseñan sobre marcas de tiempo. Tampoco se puede despertar un Apple Watch:
  ver la [spec 44](spec-44-reloj-apple-watch.md), que lo resuelve pasando por el iPhone.
- **`/sync` es un prototipo.** «Sin conexión» significa caché de lectura del último estado, no una
  cola de cambios.
- **OpenAPI tipa 97 de 98 cuerpos de petición pero solo 49 de 295 respuestas**, y el tiempo real y el
  chat no están en él. Los DTO de Rust se escriben a mano, dominio a dominio.
- **No hay verificación de StoreKit ni inicio de sesión social.** Quedan fuera de esta spec.

## 6. Fases

| Fase | Qué consigue | Estado |
|---|---|---|
| 1 | Workspace, `pockai-core`, puente, `@pockai/client`; `api.ts`, `socket.ts` y `environmental.ts` del escritorio pasan por el núcleo | Hecha |
| 2 | Estado global en Rust (`state.rs`): carga, sondeo, tiempo real y snapshot en disco; `App.svelte` solo lo refleja | Hecha |
| 3 | Avisos y entorno en el núcleo; acciones y consultas con tipo propio para todos los dominios; se retira `api_request` | Hecha |
| 4 | Targets Android e iOS con su UI; plugins de almacén seguro y sync en segundo plano; se borra `mobile/android` | Hecha (quedan pantallas de Android) |
| 5 | Live Activity / Dynamic Island, WidgetKit y su equivalente en Android | Hecha (falta la prueba en dispositivo) |
| 6 | App de Apple Watch compañera del iPhone ([spec 44](spec-44-reloj-apple-watch.md)) | Pendiente |

### Orden de migración de la lógica TypeScript

| # | Qué | Origen | Fase |
|---|---|---|---|
| 1 | Transporte, sesión, renovación, mantenimiento | `api.ts`, `maintenance.ts`, `environmental.ts` | 1 |
| 2 | Tiempo real | `socket.ts` | 1 |
| 3 | Chat en streaming | `api.ts` (`chatStream`) | 1 |
| 4 | Estado global | `App.svelte`, `activePet.ts` | 2 |
| 5 | Avisos y recordatorios | `notifications.ts`, `notification-handler.ts`, `notification-inbox.ts`, `initiative.ts` | 3 |
| 6 | Entorno | `environmental.ts`, `location.rs` | 3 |
| 7 | Social | `visitors.ts`, `visitTravel.ts`, `activeVisit.ts`, `clan-store.ts` | 3 |
| 8 | Skills, digest y ajustes | `desktopSkillsStore.ts`, `contextDigest.ts`, claves de `localStorage` | 3 |
| 9 | Cola larga (~110 llamadas en ~30 componentes) | `api.ts` | 3 |

No se porta, por ser código sin uso: `asset-cache-tauri.ts`, `game-data.client.ts`,
`predictive-preloader.ts` y el cargador por CDN de `sprites.ts`.

### El modo demo

`pnpm demo` corre en el navegador, sin Tauri y por tanto sin núcleo. Para eso `api.ts` y `socket.ts`
conservan el transporte web anterior, activo solo cuando `hasCore()` es falso. Los tests de vitest
usan ese mismo camino.

## 7. Dynamic Island y Live Activities (fase 5)

```
backend ── socket / HTTP ──> pockai-core ── CoreEvent ──> surfaces.rs
                                                          (AppState -> descriptor, función pura)
                                                               │ diferencia: start / update / end
                                             tauri-plugin-pockai-surfaces (run_mobile_plugin)
                                                               │
                                        ios/Sources/SurfacesPlugin.swift
                                          ├─ ActivityKit: request / update / end
                                          └─ App Group: snapshot JSON + WidgetCenter.reloadAllTimelines()
                                                               │
                                   Widget Extension «PockaiWidgets» (SwiftUI)
                                   isla expandida, compacta y mínima; pantalla de bloqueo; widget de inicio
```

- **Qué muestra:** actividades con hora de fin conocida: eclosión de un huevo, visita en curso
  (15 minutos), sueño, aventura.
- **Sin push:** la vista usa `Text(timerInterval:)` y `ProgressView(timerInterval:)` con `staleDate`,
  así la cuenta atrás avanza aunque la app esté suspendida. `pushType: nil`.
- **Tipos compartidos:** un paquete Swift local, `PockaiActivityKit`, con los `ActivityAttributes`. Lo
  incluyen el plugin y la extensión, porque ActivityKit exige el mismo tipo en ambos procesos.
- **App Group** en los entitlements de la app y de la extensión. El plugin escribe ahí el snapshot y
  los sprites ya horneados en PNG (la extensión no puede alojar un webview).
- **Proyecto Xcode:** la extensión se declara en `desktop/src-tauri/gen/apple/project.yml`;
  `NSSupportsLiveActivities` en `Info.plist`; iOS 16.2 o posterior.
- **Android:** el mismo plugin publica una notificación en curso con cronómetro y alimenta el widget
  Glance con el mismo snapshot.
- La política (`surfaces.rs`) vive en el núcleo y se prueba con `cargo test`. Swift y Kotlin solo pintan.

## 8. Cómo se prueba

| Qué | Comando |
|---|---|
| Sesión, renovación única, puertas, mantenimiento, chat (backend simulado) | `cargo test -p pockai-core` |
| Tiempo real contra un Socket.IO de verdad (necesita Node y `backend/node_modules`) | `cargo test -p pockai-core --test tiempo_real -- --ignored` |
| Núcleo contra un backend local con `JWT_ACCESS_EXPIRES_IN=20s` | `POCKAI_E2E_URL=http://127.0.0.1:3100 cargo test -p pockai-core --test backend_real -- --ignored` |
| Lado de la UI | `pnpm --filter @pockai/client test` y `pnpm --filter petai-desktop test` |
| Tipos del contrato al día | `cargo test -p pockai-core export_bindings` y `git diff shared/client/src/bindings` |

## 9. Configuración

- **URL del backend.** En desarrollo, `http://127.0.0.1:3000` (o la variable `POCKAI_API_URL` al
  arrancar). En producción, la `VITE_API_URL` con la que se compila: `desktop/src-tauri/build.rs` la lee
  del entorno o de `desktop/.env.production`, de modo que frontend y núcleo comparten un único valor.
- **Sesión.** Llavero del sistema (Credential Manager, Keychain, Secret Service), con el servidor en el
  nombre de la entrada para que desarrollo y producción no compartan sesión. La primera vez tras
  actualizar, la sesión que había en `localStorage` pasa al llavero y se borra del webview.
