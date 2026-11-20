# Migración al núcleo cliente en Rust (Tauri v2: escritorio, iOS, Android)

Seguimiento paso a paso. La arquitectura y el porqué están en
[`specs/spec-43-nucleo-rust-tauri.md`](specs/spec-43-nucleo-rust-tauri.md).

**Estados:** ⬜ no empezado · 🟡 en progreso · ✅ terminado y verificado · ➖ descartado (con su motivo)

Cada paso se marca 🟡 al empezarlo y ✅ al terminarlo, en el mismo commit que el trabajo. Si algo
se desvía del plan, se anota en «Desviaciones» al final.

## Resumen

| Fase | Qué consigue | Pasos | Estado |
|---|---|---|---|
| 1 | Toda la red del escritorio pasa por Rust; ningún token en el webview | 24 / 24 | ✅ |
| 2 | El estado global vive en Rust; `App.svelte` solo se suscribe | 5 / 6 | 🟡 |
| 3 | Dominios restantes y fin de la pasarela `api_request` | 4 / 4 (2 descartados) | ✅ |
| 4 | Targets Android e iOS con su UI y plugins nativos; se borra la app Kotlin | 8 / 10 | 🟡 |
| 5 | Live Activity / Dynamic Island y widgets | 6 / 7 | 🟡 |
| 6 | App de Apple Watch compañera del iPhone ([spec 44](specs/spec-44-reloj-apple-watch.md)) | 10 / 13 | 🟡 |

## Estado actual (2026-11-20): dónde se paró y cómo retomar

El trabajo se detuvo aquí a petición. Esta sección es la foto; el detalle de cada paso está en las
fases de abajo y en las secciones de verificación del final.

### Qué hay

- **Fases 1 a 3, terminadas y fusionadas** (PR 209). El escritorio habla con el backend solo a
  través del núcleo en Rust (`crates/pockai-core`): sesión, tiempo real, chat, estado global,
  avisos y 85 acciones y 67 consultas tipadas. Ningún token en el webview.
- **Fase 4, primer tramo, fusionado** (PR 210). El shell de Tauri es una librería con entrada para
  móvil, el proyecto Android está generado y versionado, y la app arranca en el emulador.
- **Biblioteca `@pockai/ui`, fusionada** (PR 211 y 212). Contiene el kit (20 componentes), los
  estilos y veinticuatro pantallas de dominio: Tienda, Mochila, Inicio, Cuenta, Eclosión, Misiones,
  Vínculo, Temporada, Cofres, Raid, Torneo, Entrenamiento y (rama `claude/pantallas-sprites`)
  Armario, Arena, Cocina, Minijuegos, Aventura, Perfil, Amigos, Visitas, Clanes, Mente, Hábitat y Chat. Las usan el escritorio y la app de Android.
- **Motor de sprites compartido** (rama `claude/pantallas-sprites`): `@pockai/scene/sprites`, con
  `PetMiniAvatar` y `EggSprite` en `@pockai/ui`.
- **App móvil compartida (`shared/mobile`, `@pockai/mobile`)**: una sola app para Android e iOS. Trae
  el shell (`MobileApp.svelte`), el reflejo del núcleo (`core.ts`), el sonido, los avisos, la
  disposición del móvil (`styles/app.css`) y los 20 contenedores de pantalla. `apps/android` y
  `apps/ios` son la cáscara: `index.html`, Vite, su `app.css` y una `MobileConfig`.
- **App de Android (`apps/android`) y de iOS (`apps/ios`)**: Mascota (Inicio, Charla, Vínculo, Huevos, Armario, Mente, Hábitat), Mochila, Jugar
  (Minijuegos, Arena, Raid, Torneo, Entrenar, Cocina, Aventura), Tienda (Tienda, Cofres), Progreso (Misiones, Temporada) y Cuenta
  (Cuenta, Perfil, Amigos, Visitas, Clanes; desde el nombre de la cabecera). Jugar, Cofres, Armario y lo social aún no se han
  probado en el emulador.

### Qué falta, por orden

1. **Probar en el emulador** Jugar entera, Cofres, Armario, lo social entero y el huevo de sprites.
2. **Pantallas a la biblioteca** (4.4 y 4.5): hechas todas, con sus escenas (sala del hábitat,
   sala del amigo y hábitat del clan; en Android, la casa del amigo sigue siendo la cabecera
   sencilla). Falta en Android el clima local.
3. **iOS**: hecho (4.2, 4.3, 4.6, 4.8, 4.9) y la fase 5 salvo la prueba en dispositivo. Falta un
   iPhone de verdad y el `.ipa` firmado (hace falta un Team ID de Apple, que va por
   `APPLE_DEVELOPMENT_TEAM`, nunca en `tauri.ios.conf.json`).
4. **Plugins nativos** (4.7, 4.8): hechos en las dos plataformas, dentro de `tauri-plugin-pockai`.
   En Android, sesión cifrada con el Keystore y avisos con WorkManager (ver «Plugins nativos de
   Android»), probados en el emulador con un backend de pega. En iOS, el Keychain y
   `BGAppRefreshTask`; falta ver una pasada en segundo plano de verdad, que el sistema concede
   cuando quiere.
5. **App Kotlin**: borrada (4.10, ver «La app Kotlin, retirada»).
6. **Fase 5**: hecha salvo el paso 5.7, la prueba en un dispositivo (iPhone con Dynamic Island y
   Android 16). La política está en `surfaces.rs`, la Live Activity en `PockaiSurfaces.swift`, la isla
   y el widget en `PockaiWidgets`, y la notificación en curso de Android en `PockaiSurfaces.kt`.
7. **Fase 6**: app de Apple Watch compañera ([spec 44](specs/spec-44-reloj-apple-watch.md)), hecha y
   probada en el simulador. Faltan pulsar los botones en el reloj, la complicación en una esfera, el
   hardware, el job de CI y automatizar el empaquetado. Y queda una comprobación que puede ahorrar
   trabajo: desde iOS 18 y watchOS 11 una Live Activity del iPhone **se refleja sola** en el Smart
   Stack del reloj, así que en la prueba del paso 5.7 hay que mirar la muñeca.

### Pantallas que quedan, por tipo (2026-11-20)

| Tipo | Pantallas | Qué las ata al escritorio | Cómo se mueven |
|---|---|---|---|
| (a) Sprites, datos estáticos y sonido | Hechas todas: Armario, Arena, Cocina, Minijuegos y Aventura | — | Patrón de siempre; los efectos de un juego van por el puerto de sonido (`setUiSound`) |
| (b) Estado de pantalla alimentado por tiempo real | Hechas todas: Amigos, Visitas y Clanes | Las escenas siguen en el escritorio (sala del amigo, casa, hábitat del clan) | Decidido: feed social compartido, no núcleo (ver «Lo social: decisión»). Las escenas, en un hueco de momento |
| (c) Funciones del escritorio | Hechas todas: Mente, Hábitat y Chat | Hábitat: la sala isométrica con arrastre a la ventana, modo pantalla completa y muebles de habilidades. Chat: IA local, herramientas del equipo, voz y pagos con Stripe | Lo compartible a la biblioteca y lo del escritorio en huecos; en Android, sin pagos (normas de Google Play) ni IA local |
| (d) Perfil | Hecha | — | — |

Pendiente aparte: el motor de sprites (`@pockai/scene/sprites`) y el registro de la escena PixiJS
(`@pockai/scene`, `assets.ts`) descubren las mismas hojas cada uno a su manera. Unificarlos es
otra tarea.

### Cómo se parte una pantalla

Regla de la biblioteca: datos por props, avisos por eventos, nada de núcleo, backend ni plataforma.

- **Si ya solo pinta** (Tienda, Mochila): se mueve con `git mv` a `shared/ui/src` y se exporta en
  `index.ts`.
- **Si carga sus datos** (Misiones, Vínculo, Temporada): se parte en vista y contenedor. La vista
  va a la biblioteca con `data`, `loading`, `error` y eventos (`refresh`, `claim`…). El
  contenedor del escritorio conserva nombre y props y llama a `api.*`; el del móvil va en
  `shared/mobile/src/screens/` (lo usan las dos apps) y usa `query` y `perform` de `@pockai/client`.
- **Si tiene algo propio de una plataforma** (la casita arrastrable de Inicio): la vista deja un
  hueco (`slot`) y cada app lo rellena. Los sprites ya no cuentan como propios: están en
  `@pockai/scene/sprites` y la vista los usa directamente (el huevo de Eclosión).
- Los ajustes táctiles y de ancho del móvil van en `shared/mobile/styles/app.css`, con sus bloques
  `:root[data-platform='android']` y `:root[data-platform='ios']` para lo que cambie entre los dos;
  en `apps/*/src/app.css` solo lo que es de una sola app (en iOS, el rebote del WKWebView y la zona
  segura lateral). Los estilos de un componente ganan a un selector simple: hay que usar
  `main .screen .clase`.
- Una pantalla nueva del móvil va a `@pockai/mobile`, no a una app. En `apps/*` solo cabe lo que de
  verdad cambia entre sistemas, y si cambia, entra por `MobileConfig` (`shared/mobile/src/config.ts`):
  una opción solo existe ahí si hoy tiene dos valores distintos.
- Lo que una acción cambia en el estado (saldo, mascota, inventario) lo pone al día el núcleo, por
  la ruta de la acción (`state_on_response` en `state.rs`). Si una ruta nueva cambia el estado,
  se le añade ahí con su test; el contenedor solo pide `stateRefresh` mientras tanto.
- Si dos contenedores repetirían la misma lógica de pantalla (la sesión de la mazmorra, los textos
  de un aviso), va a la biblioteca como funciones puras junto a la vista (`training.ts`,
  `chests.ts`…).

### Cómo se prueba

- **Escritorio**: `pnpm --filter petai-desktop test` (438 tests) y el modo demo
  (`pnpm --filter petai-desktop run demo`, puerto 5175). La ejecución de tests acaba en rojo por dos
  rechazos no capturados, anteriores a esta migración: `game-data/balance` en
  `game-data.client.spec.ts` y `sprites/ignisaur_idle` en `asset-loader.spec.ts`.
- **Android en el emulador** (Windows; ver también «Compilar para Android en Windows»):
  1. Base de datos desechable: `createdb petai_core_e2e`, `prisma migrate deploy` y
     `prisma:seed` con `DATABASE_URL` apuntando a ella. No se usa `petai_dev`.
  2. Backend en el puerto 3100 contra esa base, con `EMAIL_VERIFICATION_REQUIRED=false` y
     `HANDLE_REQUIRED=false`.
  3. Emulador `Medium_Phone_API_37.0` y `adb reverse tcp:3100 tcp:3100`.
  4. `VITE_API_URL=http://127.0.0.1:3100`, `tauri android build --debug --target x86_64 --apk`,
     copiar la `.so` a `jniLibs/x86_64` y `gradlew assembleX86_64Debug -x rustBuildX86_64Debug`.
  5. Instalar el APK y entrar con la cuenta de la semilla.
  6. Al terminar: desinstalar la app, apagar el emulador y borrar la base de datos. La compilación
     toca `desktop/src-tauri/gen/schemas/acl-manifests.json` y `shared/openapi/openapi.json`: se
     restauran con `git checkout`.

## Verificado: la app móvil compartida y la UI de iOS (2026-11-20)

En un Mac **sin Xcode y sin cargo** (solo Command Line Tools), que es todo lo que se puede
comprobar de esto sin el proyecto nativo:

- `@pockai/mobile`: `typecheck` y `check` limpios (0 errores; 1 aviso, el de `initialFriend` en
  `VisitsScreen`, que ya estaba).
- `@pockai/android-ui` y `@pockai/ios-ui`: `check` y `build` limpios. Los dos paquetes empaquetan
  los mismos 70 ficheros de sonido (692 KB) y el mismo `dist/assets` (19 MB) que antes de mover el
  código, así que los `import.meta.glob` de `audio.ts` siguen encontrando los assets desde su nueva
  casa.
- Los 16 tests visuales del kit (`apps/android`, Playwright): en verde, con las tres plataformas.
- `pnpm validate:all` y `validate:colors` (con `shared/mobile` y `apps/ios` ya en `ROOTS`): en verde.
- Escritorio: `build` y los 436 tests, en verde. Su `svelte-check` sigue con 15 errores anteriores a
  esto (`api.ts`, `asset-cache-tauri.ts`, `Ico.svelte`…), en ficheros que este trabajo no toca; CI
  no corre ese script para el escritorio.
- En el navegador, el servidor de `apps/ios` (5185): el muestrario con `?gallery` se pinta como
  `ios`, y la app sin núcleo enseña su aviso («la app de iPhone»). Sin errores en la consola, que es
  lo que delataría una segunda copia de Svelte.

## Verificado en el simulador de iOS (2026-11-20)

Mac con Xcode 26.6 (SDK de iOS 26.5), Rust 1.100 con `aarch64-apple-ios` y `aarch64-apple-ios-sim`,
simulador «iPhone 17 Pro» con iOS 26.5, contra un backend local en el 3000 con base desechable
(`petai_core_e2e`) y la cuenta de la semilla:

- **El núcleo compila para Apple a la primera**: `cargo build -p petai-desktop --lib --target
  aarch64-apple-ios-sim`, sin un solo error. `keyring` con `apple-native` y rustls, sin tocar nada.
- `tauri ios init` genera `gen/apple` con el identificador `com.petai.app` (acabar en `.app` no dio
  problema) y el `deploymentTarget` 16.2 de `tauri.ios.conf.json`, así que ese fichero es válido.
- Recorrido: entrar, permiso de avisos (el plugin de notificaciones de Tauri vale igual en iOS),
  eclosionar el huevo de la semilla, Inicio con las necesidades y la iniciativa (spec 41), Jugar con
  dos minijuegos (arena en pixel art y el Pockai de protagonista, control táctil, resultado validado
  por el servidor) y Arena, y una compra en la Tienda. El saldo de la cabecera siguió a cada acción
  (1000 → 1040 al eclosionar, 1040 → 1015 al comprar), y en la base quedaron la mascota, las dos
  `MinigameSession` y el objeto comprado: la ruta acción → núcleo → backend → estado → UI va entera.
- El sprite del huevo, los iconos de objetos y los fondos de los minijuegos se pintan en el
  WKWebView, sin nada que incrustar a mano.
- El simulador llega al `localhost` del Mac directamente: no hace falta el `adb reverse` de Android.

Desviaciones encontradas y resueltas:

- `tauri ios init` arrastra CocoaPods y lo quiere instalar con `sudo gem`. Se instaló con Homebrew
  (`brew install cocoapods`), que no pide contraseña. También hacen falta `xcodegen` e
  `idevicesyslog`, que el propio `init` instala.
- El `Info.plist` de `desktop/src-tauri` se fusionaba también en el de iOS **al compilar** (no al
  hacer `init`), y colaba las claves `NSLocation*` del escritorio en una app que no usa CoreLocation.
  Se renombró a `Info.macos.plist` y se referencia desde `bundle.macOS.infoPlist`: Tauri recoge solo
  `Info.plist` e `Info.ios.plist` por su nombre.

No verificado en iOS: un dispositivo físico, el `.ipa` firmado y una pasada de `BGAppRefreshTask`
de verdad (el sistema las concede cuando quiere).

### Sin verificar

- En Android: comprar el pase de temporada (la temporada de la semilla está finalizada), el
  selector de mascota activa (hace falta una segunda mascota) y el temblor del icono del huevo.
- En el escritorio dentro de la app de Tauri: el kit y las pantallas compartidas solo se han visto
  en el modo demo del navegador. Tampoco se han oído los sonidos de abrir un modal o ganar monedas.
- El chat con respuesta real de un modelo, `release.yml` con el workspace, macOS y Linux, y un
  dispositivo físico o ARM.

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
- ✅ 1.5.1 Spec 43 y enmienda de la constitución (§III y stack)
- ✅ 1.5.2 Verificación: tests Rust y vitest, app real contra backend local, modo demo

## Fase 2 — Estado global en Rust
- 🟡 2.1 DTO tipados de `user`, `pet`, `egg`, `inventory`, `shop` — aplazado a la fase 3 (ver desviaciones): el estado guarda el JSON del backend tal cual
- ✅ 2.2 `state.rs`: slices con revisión y reductores de `pet:update`, logros y recompensas
- ✅ 2.3 `loadInitialData` y `pollPet` salen de `App.svelte` (carga, zona horaria, sondeo y mascota activa en Rust)
- ✅ 2.4 `state_snapshot` + evento `core://state`; stores en `desktop/src/lib/appState.ts`
- ✅ 2.5 Snapshot en disco (`state.json`) para arranque instantáneo y lectura sin conexión
- ✅ 2.6 `App.svelte` refleja `appState`; `ControlPanel`, `PetView` y `HabitatWidget` siguen recibiendo props

## Fase 3 — Dominios restantes
- ✅ 3.1 Avisos de necesidades, recordatorios y bandeja en el núcleo (`notices.rs`, evento `core://notice`). La iniciativa (`initiative.ts`) se queda en la UI: ver decisiones
- ✅ 3.2 Entorno: estado ambiental del servidor, latido y cambios por tiempo real en el núcleo. El clima se queda en la UI: ver decisiones
- ➖ 3.3 Social: la visita en curso pasa a la fase 5; visitantes y clanes se quedan en la UI: ver decisiones
- ➖ 3.4 Skills de escritorio, digest de contexto y ajustes: se quedan en la UI: ver decisiones
- ✅ 3.5 Acciones y consultas tipadas (`actions.rs`, `queries.rs`; commands `perform` y `query`): 85 acciones y 67 consultas, que cubren todo lo que pasaba por `minigameRequest` más cuidado, huevos y tienda
- ✅ 3.6 Retirada la pasarela `api_request` y `coreFetch`: el inicio de sesión, el alta, las lecturas de estado, el canje y el mantenimiento van por acciones y consultas. `api.ts` y el transporte web se conservan para el modo demo y los tests

## Fase 4 — Móvil
- ✅ 4.1 `main.rs` → `lib.rs` con `mobile_entry_point`; lo de escritorio en `desktop.rs` bajo `cfg(desktop)` y un shell mínimo en `mobile.rs`
- ✅ 4.2 `tauri android init` y `tauri ios init` hechos, con `gen/android` y `gen/apple` versionados; las dos apps compilan, se instalan y funcionan (Android en el emulador, iOS en el simulador)
- ✅ 4.3 `tauri.android.conf.json`, `tauri.ios.conf.json` y capacidades por plataforma (`capabilities/mobile.json`) hechos. El de iOS lo validó el CLI al generar el proyecto: el `deploymentTarget` 16.2 y el identificador salen de ahí
- 🟡 4.4 `shared/ui` (`@pockai/ui`): tokens, fuentes, estilos, los 20 componentes del kit y las pantallas de dominio Tienda, Mochila, Inicio, Cuenta, Eclosión, Misiones, Vínculo, Temporada, Cofres, Raid, Torneo y Entrenamiento, usadas por el escritorio y por Android. Armario, Arena, Cocina, Minijuegos, Aventura, Perfil y el motor de sprites (`@pockai/scene/sprites`, `PetMiniAvatar`, `EggSprite`, `ReplayViewer`) en rama. Quedan las pestañas de la tabla «Pantallas que quedan, por tipo»
- 🟡 4.5 `apps/android`: UI Svelte hecha con `@pockai/ui`: Mascota (Inicio, Vínculo, Huevos), Mochila, Tienda, Progreso (Misiones, Temporada) y Cuenta, probadas en el emulador; Jugar (Minijuegos, Arena, Raid, Torneo, Entrenar, Cocina, Aventura), Tienda › Cofres, Mascota › Armario y el huevo de sprites, sin probar en él. Faltan el resto de pantallas del juego
- ✅ 4.6 `apps/ios` (`@pockai/ios-ui`): la UI Svelte, con el juego entero, probada en el simulador (ver «Verificado en el simulador de iOS»). La app móvil es una sola (`shared/mobile`, `@pockai/mobile`): el shell, la navegación, el reflejo del núcleo, el sonido, los avisos y los 20 contenedores de pantalla los comparten Android e iOS, y cada `apps/*` solo pone su plataforma, su `app.css` y su `MobileConfig`
- ✅ 4.7 Sesión en móvil: iOS usa el Keychain (crate `keyring`); Android, un fichero de la app cifrado con el Keystore (`SealedFileStore` + `PockaiKeystore`), que adopta el fichero en claro de antes
- ✅ 4.8 Avisos de cuidado en segundo plano, con el mismo `care_sync` del núcleo en las dos plataformas, dentro de `tauri-plugin-pockai` (no un plugin aparte): en Android, WorkManager y el widget de la pantalla de inicio; en iOS, `BGAppRefreshTask` (`PockaiBackground.swift`) y el widget de WidgetKit
- ✅ 4.9 CI: job `android-tauri` (APK de depuración), job `ios-tauri` (runner de macOS: el núcleo para `aarch64-apple-ios-sim` y la UI de iOS; el `.ipa` no, que exige firma) y, en el job `desktop`, `@pockai/mobile` y el `check` + `build` de las dos UIs móviles
- ✅ 4.10 Borrar `mobile/android`, su job de CI y las referencias en docs y skills (las specs y los informes antiguos se quedan como registro)

## Fase 5 — Superficies nativas
- ✅ 5.1 `surfaces.rs`: política pura `AppState → descriptor` y la diferencia `start`/`update`/`end`, con 15 tests. Hoy publica el huevo incubando, que es lo único del estado con hora de fin conocida; la visita en curso entrará cuando el estado lleve la suya
- ➖ 5.2 Sin plugin aparte ni paquete Swift: lo de iOS va dentro de `tauri-plugin-pockai` (`src/ios.rs`, interfaz en C), como lo de Android va en `src/android.rs`. Los `ActivityAttributes` viven en `gen/apple/Shared/`, que compilan la app y la extensión (ver desviaciones)
- ✅ 5.3 `PockaiSurfaces.swift`: abre, actualiza y cierra la Live Activity con lo que manda el núcleo, con `pushType: nil`
- ✅ 5.4 Widget Extension `PockaiWidgets`: isla expandida, compacta y mínima, y pantalla de bloqueo
- ✅ 5.5 App Group `group.com.petai.app` y el resumen (`PetGlance`) que lee el widget de inicio. Dos trampas que costaron un rato: el App Group hay que declararlo en `entitlements.properties` de **project.yml**, porque `xcodegen` regenera el fichero `.entitlements` desde ahí y, si no está, lo deja vacío; y el resumen hay que escribirlo también con la app abierta (`watch_surfaces` sigue `Pets` y `ActivePetId`, no solo `Eggs`), porque si solo se escribiera en las pasadas en segundo plano el widget se quedaría en «Abre Pockai» para siempre. Sin sprites pre-horneados: el widget usa símbolos del sistema (ver desviaciones)
- ✅ 5.6 Android: `PockaiSurfaces.kt`, una notificación en curso con cronómetro por actividad, sobre la misma política. El widget Glance ya estaba
- ⬜ 5.7 Prueba en dispositivo (iPhone con Dynamic Island, Android 16)

Y de la fase 4: ✅ 4.8, `BGAppRefreshTask` en iOS (`PockaiBackground.swift`), con el mismo `care_sync`
del núcleo que usa WorkManager en Android.

## Fase 6 — Apple Watch (reloj)

Compañera del iPhone: una superficie de lectura y tres gestos, no un cliente. La arquitectura, las
trampas de Xcode y lo que falta están en
[`specs/spec-44-reloj-apple-watch.md`](specs/spec-44-reloj-apple-watch.md). Se montó encima de lo que
ya había (`surfaces.rs`, la interfaz en C de `ios.rs`, `gen/apple/Shared/` y el `project.yml`): no hay
crate, plugin ni paquete Swift nuevos.

- ✅ 6.0 Documentación: la spec 44 y los enlaces desde la spec 43, este documento, `PANTALLAS.md`,
  `ROADMAP.md`, `PROYECTO.md`, el README y la enmienda 1.2.0 de la constitución
- ✅ 6.1 `crates/pockai-core/src/wrist.rs`: `WristSnapshot`, `snapshot`, `buttons`, `resolve`,
  `should_send` y `complication`, reutilizando `pet_glance` y la lista de `surfaces()`, con 15 tests
  (incluido uno que comprueba que el resumen no lleva tokens) y el fixture
  `tests/fixtures/wrist-snapshot.json`. Módulo aparte y no dentro de `surfaces.rs`: una cosa es qué
  actividades vivas abrir y otra qué enseñar y qué se puede hacer
- ✅ 6.2 `ios.rs`: `pockai_wrist_push` (solo si cambió algo que se vea), `pockai_wrist_snapshot`,
  `pockai_wrist_perform` y `pockai_wrist_forget`, en la misma interfaz en C que `pockai_care_sync`.
  El empujón al reloj va dentro del bucle `watch_surfaces` que ya existía
- ✅ 6.3 `gen/apple/Shared/PockaiWrist.swift` con los tipos `Codable`, en las `sources` de los cuatro
  targets, y `gen/apple/Tests/PockaiWristFixture.swift`, un programa suelto que decodifica el fixture
  que escribe Rust (ver «Cómo se prueba» en la spec 44)
- ✅ 6.4 `PockaiWristLink.swift`: `WCSessionDelegate` en el proceso del iPhone, con
  `updateApplicationContext`, `transferCurrentComplicationUserInfo` comprobando presupuesto, y
  recepción de `sendMessage` y `didReceiveUserInfo`. Se enciende en `pockaiBackgroundRegister`, antes
  de que arranque la app, porque un mensaje del reloj despierta el proceso con el webview muerto
- ✅ 6.5 Targets `PockaiWatch` y `PockaiWatchComplications` en `gen/apple/project.yml`, con
  `watchOS: 10.0`, `WKApplication`, `WKCompanionAppBundleIdentifier` y el App Group
  `group.com.petai.app.watchkitapp` en `entitlements.properties`. **No** son dependencia del target de
  iPhone: ver desviaciones
- ✅ 6.6 Pantallas SwiftUI: Vitales (el sprite del Pockai, el anillo de XP y las **cinco** constantes
  —la salud no se pintaba—, con la hora del último dato), En marcha (las cuentas atrás con
  `ProgressView(timerInterval:)`), Cuidar (los cinco botones con su motivo si están grises, y con el
  objeto que eligió el núcleo) y Monedero. Con `accessibilityLabel` en todo, que no había ninguna
- 🟡 6.7 Acciones: `sendMessage` con respaldo en `transferUserInfo`, `request_id`, caducidad, cola
  visible y la pantalla que no se toca mientras se espera. El camino entero está probado contra el
  backend real (`el_reloj_da_de_comer_de_verdad` en `tests/backend_real.rs`: el núcleo eligió el
  `sweet_coral` por ser la favorita de la especie, el hambre pasó de 80 a 100 y la intención repetida
  se rechazó). Falta **pulsar el botón en el reloj**: para eso hay que tocar la pantalla a mano
- 🟡 6.8 `PockaiWatchComplications`: las cuatro familias (circular, esquina, en línea y rectangular) y
  su timeline desde el App Group del reloj, con `WidgetCenter.reloadAllTimelines()` al recibir
  contexto. Compila y lee el resumen; **falta verla puesta en una esfera**. Ya no recalcula en Swift
  la constante más baja: la decide `wrist.rs` y viaja en el resumen
- ⬜ 6.9 Prueba en hardware (iPhone y Apple Watch emparejados). Necesita un Team ID
- ✅ 6.10 CI y empaquetado: `scripts/build-watch-app.sh` mete el reloj dentro del `Pockai.app`, y el
  job `ios-tauri` compila el reloj y corre la comprobación del contrato. Esa comprobación además
  **compara clave a clave**: antes solo decodificaba, y `JSONDecoder` ignora en silencio lo que no
  conoce, así que un campo nuevo de Rust pasaba en verde
- ✅ 6.11 El arte: catálogo del reloj con los sprites de las 16 especies (4 etapas × 5 ánimos), los
  objetos y el set de iconos propio, horneado por `scripts/generate-watch-assets.ts`; icono de app y
  acento de marca. De paso, el huevo de marca llega a **iOS y Android**, que llevaban el marcador
  genérico de `tauri init` (`scripts/generate-app-icons.mjs`)
- ✅ 6.12 Contrato ancho y dos acciones más: `WristPet` (especie, etapa, Flujo, XP, vínculo y la
  constante más baja), el monedero, el objeto elegido en cada botón, y **curar** y **evolucionar**.
  Arreglado de camino que `watch_surfaces` no escuchaba `Inventory` ni `User`, así que comprar o
  gastar en el iPhone no empujaba nada al reloj
- 🟡 6.13 Siri: cinco `AppIntent` con su `AppShortcutsProvider`, que activan su propia `WCSession` y
  esperan a que lo esté (el sistema puede lanzarlos con la app fría). Compilan y se registran;
  **falta decir un atajo de verdad**

### Verificado en el simulador (2026-11-20)

Con el backend local en el 3000, la app de iPhone en el simulador «iPhone 17 Pro» y un «Apple Watch
Series 11 (46mm)» emparejado:

- La app del reloj arranca y, sin resumen, enseña «Abre Pockai en el iPhone».
- Con la app de iPhone abierta y con sesión, el resumen cruza y el reloj pinta la mascota de verdad:
  «Emi2, Nv. 1, Contento», hambre 80 y felicidad 90, los mismos números que el teléfono.
- Tras dar de comer (por el test contra el backend), el iPhone empujó el resumen nuevo y el reloj pasó
  a 100 y 100 sin que nadie lo tocara.
- En el App Group del reloj queda el resumen con el botón de bañar en gris y su motivo («Ya está
  limpia», con la higiene en 90), que es la política del núcleo decidiendo sobre datos reales.

No verificado: pulsar los botones en el reloj (conducir el simulador de watchOS desde la terminal
necesita permisos de accesibilidad), la complicación puesta en una esfera, y cualquier cosa en
hardware.

## Desviaciones respecto al plan

- **El reloj no es dependencia del target de iPhone** (6.5). `tauri ios build` llama a xcodebuild con
  un `-sdk iphonesimulator` **global**, que pisa el `SDKROOT` de los targets de watchOS y los compila
  contra iOS (`'accessoryCorner' is unavailable in iOS`). El reloj se compila con su propio
  `xcodebuild -sdk watchsimulator` y se mete en la app con un `cp -R` a `Pockai.app/Watch/`, que es lo
  que hace que el iPhone lo dé por instalado (`appInstalled: YES`) y lo instale en el reloj. Ver la
  spec 44 §7.
- **El producto del reloj se llama `PockaiWatch`, no `Pockai`** (6.5). Con el mismo nombre que el del
  iPhone, los dos targets escribirían `Pockai.app` en el mismo `Products` y xcodebuild falla
  («Multiple commands produce»). Lo que ve el usuario es `CFBundleDisplayName`, que sigue siendo
  Pockai.
- **Tres botones, no cuatro** (6.7). La recompensa diaria se quedó fuera: las misiones no están en el
  `AppState`, así que decidir si ofrecerla obligaría a preguntar al servidor y el resumen dejaría de
  ser una función pura del estado. Dar un mimo no existe en el backend (no hay ruta de caricia: el
  vínculo sube como efecto de las demás interacciones).
- **`wrist.rs` es un módulo propio, no parte de `surfaces.rs`** (6.1), aunque usa su `surfaces()`:
  una cosa es qué actividades vivas abrir y cerrar, y otra qué enseñar en la muñeca y qué se puede
  pulsar.

- **Nada de `tauri-plugin-pockai-surfaces` ni de un paquete Swift `PockaiActivityKit`** (5.2). Lo
  nativo de cada plataforma vive dentro de `tauri-plugin-pockai` (`src/ios.rs` y `src/android.rs`),
  que es donde ya estaban el Keystore y los avisos de cuidado: un plugin aparte solo para esto
  duplicaría el puente y el núcleo compartido. Los `ActivityAttributes` tampoco necesitan un paquete
  Swift: ActivityKit solo exige que el **mismo tipo** lo compilen los dos procesos, y para eso basta
  con `gen/apple/Shared/`, que está en las `sources` de la app y de la extensión.
- **Rust no llama a Swift; Swift registra un callback** (`pockai_surfaces_set_callback`). Un
  `extern "C"` a una función del target de la app deja la librería sin resolver al enlazarla sola
  (`cargo build --lib`), que es justo lo que hace el script de Xcode.
- **Sin sprites pre-horneados en el widget** (5.5). El resumen que el núcleo deja en el App Group
  (`PetGlance`) trae el ánimo como texto (`happy`, `hungry`…) y el widget lo pinta con símbolos del
  sistema. Hornear los PNG de cada especie y etapa es trabajo de la cadena de arte, no del núcleo, y
  el widget ya es legible sin ellos.

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


## Decisiones de la fase 3: qué no se mueve al núcleo

Al entrar en cada módulo se ha aplicado la frontera de la spec 43 (reglas sin UI al núcleo;
presentación en la UI). Estos se quedan donde están, y por qué:

- **Iniciativa (`initiative.ts`)**. Es un temporizador alrededor de una llamada cuyo resultado es
  una frase que dice la mascota, y lo dispara la presencia del dueño que detecta el cerebro de
  escritorio. El móvil usará su propio canal de iniciativa del backend. Se revisará en la fase 4.
- **Clima local** (`refreshLocalWeather`). No habla con el backend: va del equipo a Open-Meteo, y el
  parseo vive en `@pockai/scene/weather`, que se queda en TypeScript.
- **Visitantes y clanes** (`visitors.ts`, `clan-store.ts`). Son estado de pantalla alimentado por el
  tiempo real, sin persistencia ni reglas de negocio propias.
- **Viaje de visita** (`visitTravel.ts`). Mezcla un hecho (mi mascota está de visita hasta tal hora)
  con fases de animación que dependen de qué componentes están en pantalla. El hecho pasará al núcleo
  en la fase 5, que es donde tiene consumidor (la Live Activity de «visita en curso»).
- **Skills de escritorio y digest de contexto**. Son funciones exclusivas del escritorio (cursor,
  ventanas, hábitos de uso): no hay nada que compartir con el móvil.
- **Ajustes** (tema, audio, atajo, onboarding). Preferencias visuales de cada UI; el `localStorage`
  de cada plataforma basta.

## Verificado en la app: fase 3 (2026-11-20)

Compilación de desarrollo contra un backend local: el núcleo carga el estado ambiental (hora del día,
actividad) y manda el latido; al eclosionar desde la UI añade la mascota y refresca huevos y saldo;
al dar de comer desde la UI baja el inventario él solo (5 → 4) y la UI lo refleja; un aviso metido en
la bandeja del núcleo aparece en el contador de la app.

No se ha visto en la app: el aviso de necesidades (la mascota de prueba no bajó de los umbrales) ni
un recordatorio vencido. Ambos están cubiertos por los tests del núcleo.

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

## Verificado en la app: acciones y consultas tipadas (2026-11-20)

Compilación de desarrollo contra un backend local, llamando a los métodos reales de `api.ts`: 29
consultas y 17 acciones de arena, misiones, cofres, logros, hábitat, visitas, clanes (crear, escribir,
leer, salir), mente, iniciativa, vínculo, armario, temporadas, historias, cocina, entrenamiento, IA y
recordatorios. Todas responden; los errores del servidor (404, 400) llegan a la UI con su mensaje y su
estado, y los cambios de cuenta y de estrategia se reflejan en el estado del núcleo.

El resto de variantes no se ha ejercitado una a una: se generaron con un script a partir de `api.ts`
(misma ruta, mismo método, mismos campos) y comparten el camino de las probadas.

## Verificado en la app: sin pasarela (2026-11-20)

Compilación de desarrollo contra un backend local: entrar desde el formulario de la app; el command
`api_request` ya no existe en el puente; una contraseña incorrecta devuelve su error sin cerrar la
sesión abierta; el registro de una cuenta nueva abre sesión y a la UI le llegan los tokens
sustituidos; nickname ocupado y libre; búsqueda por nickname; canje de un código inválido; petición
de recuperación de contraseña; comprobación de mantenimiento; y lecturas de usuario, mascotas, huevos
(con su hora de eclosión), inventario, catálogo y tienda. Ningún token en `localStorage`.

No se ha visto en la app: confirmar el cambio de contraseña con el código ni verificar el correo
(hacen falta los códigos que el backend manda por correo).

## Verificado: fase 4, primer tramo (2026-11-20)

- El escritorio compila y arranca con el shell convertido en librería.
- La UI de Android, alojada en el shell de escritorio contra un backend local: una contraseña
  incorrecta muestra su error; entrar; eclosionar; dar de comer (5 → 4); dormir y despertar; salir.
  Todo el estado que pinta sale del núcleo.
- Esa prueba destapó un fallo: el canal en tiempo real solo lo arrancaba la UI de escritorio, así que
  en otra UI no llegaban los cambios que el servidor hace por su cuenta (el saldo se quedaba atrás).
  Ahora lo arranca el núcleo al cargar el estado.

No verificado: nada de esto ha corrido en un dispositivo o emulador Android. La compilación del núcleo
para Android (OpenSSL incluido) solo la comprueba el CI.

## Verificado en el emulador de Android (2026-11-20)

APK de depuración (x86_64) en un emulador con Android 17 (API 37), contra un backend local:

- La app arranca y el núcleo en Rust funciona dentro del APK.
- Entrar, eclosionar, dar de comer (5 → 4) y dormir desde la UI; el saldo del núcleo coincide con el
  del servidor.
- El canal en tiempo real conecta, entrega `pet:update`, `pet:action` y `achievement:unlocked`, y se
  recupera solo cuando caduca el token (`auth:expired` → renovar → reconectar).
- La sesión sobrevive a cerrar y volver a abrir la app; al salir se borran la sesión y el estado
  guardados. Ningún token en el webview.

Lo que hizo falta para llegar aquí:

- **Cliente Socket.IO propio.** El crate `rust_socketio` arrastraba el TLS del sistema, que en
  Android exige compilar OpenSSL (y desde Windows no se pudo). Como el canal solo recibe, se sustituyó
  por un cliente mínimo sobre WebSocket con el mismo TLS en Rust puro que usa el resto del núcleo
  (`realtime.rs`). OpenSSL ya no está en el árbol de dependencias de ninguna plataforma.
- **`ActionError.detail`.** El porqué técnico de un fallo de red, para diagnóstico (la UI no lo enseña).

## Compilar para Android en Windows

- Variables: `ANDROID_HOME` (SDK) y `NDK_HOME` (NDK r27c); targets de Rust `x86_64-linux-android`
  (emulador) y `aarch64-linux-android` (dispositivos).
- `tauri android build` falla al final con «Failed to create a symbolic link» si Windows no tiene
  activado el **Modo de desarrollador**. Sin activarlo: copiar
  `target/<target>/debug/libpetai_desktop_lib.so` a
  `desktop/src-tauri/gen/android/app/src/main/jniLibs/<abi>/` y lanzar
  `gradlew assembleX86_64Debug -x rustBuildX86_64Debug`.
- Gradle necesita `-Djdk.net.unixdomain.tmpdir=C:/t` también en el proceso que lo lanza
  (`GRADLE_OPTS` y `JAVA_TOOL_OPTIONS`), y que exista `C:/t`.
- En el emulador de API 37 las apps no llegan a `10.0.2.2`. Funciona con `adb reverse tcp:3000
  tcp:3000` y la app compilada con `VITE_API_URL=http://127.0.0.1:3000`.

## @pockai/ui: biblioteca de componentes compartida (2026-11-20)

`shared/ui` reúne lo que es solo presentación y sirve a las tres UIs:

- **Estilos**: `fonts.css` (Bowlby One e Inter), `tokens.css` (colores, espaciados, radios, tipografía),
  `base.css` (botones, tarjetas, campos) y `kit.css`. Cada app los carga una vez y añade su hoja
  propia con lo suyo (la ventana transparente del escritorio; la página y los 48 px táctiles en móvil).
- **Componentes**: los 20 del kit que tenía el escritorio (`Button`, `Card`, `Modal`, `ProgressBar`,
  `CurrencyPill`, `Notice`…), más `Ico` y `focusTrap`. Se movieron con `git mv`, sin reescribirlos.
- **Sin sonido dentro**: `Modal` y `CurrencyPill` sonaban; ahora avisan (`onUiFeedback`) y cada app
  decide. El escritorio les pone sus efectos en `main.ts`.

Reglas para lo que entre a partir de ahora: datos por props, avisos por eventos, nada de núcleo,
backend ni plataforma. Navegación y disposición de pantallas se quedan en cada app.

El escritorio conserva sus rutas de siempre (`components/ui`, `components/Ico.svelte`,
`lib/ui/focusTrap`) como reexportaciones del paquete, para no tocar sus ~40 componentes.

Verificado: 438 tests y compilación del escritorio; el escritorio en modo demo se ve igual que antes;
la app de Android en el emulador con el kit (inicio de sesión, mascota, alimentar, salir).

### Pantallas de dominio compartidas (2026-11-20)

`ShopView`, `BackpackView` e `ItemIcon` pasan del escritorio a `@pockai/ui`. Ya eran
presentacionales (estado por props, lo que pide el jugador por eventos), así que se movieron sin
reescribirlas. Cada app pone el contenedor: el escritorio en `ControlPanel.svelte`, Android en
`apps/android/src/App.svelte`, y ambos atienden los mismos eventos (`buy`, `use`, `go`) pidiendo
la acción al núcleo. La navegación (pestañas de Android, panel del escritorio) no se comparte.

Cómo decidir si una pantalla del escritorio puede compartirse: si solo importa del kit y de otros
presentacionales, se mueve tal cual. Si importa `lib/api`, `lib/sprites`, `lib/audio` o algo del
escritorio (arrastre del hábitat, ventana), antes hay que partirla.

Verificado: Tienda del escritorio en modo demo (iconos, compra, saldo); en el emulador de Android,
comprar en la Tienda (1120 → 1110 monedas, manzanas 5 → 6) y usar un objeto de la Mochila (6 → 5).

### Inicio y Cuenta compartidas (2026-11-20)

Estas dos pantallas no eran presentacionales del todo, así que se partieron:

- **Inicio** → `PetHomeView` (ficha, constantes, cuidados, comida y selector de mascota) en la
  biblioteca. La casita de la que se saca al Pockai arrastrando es del escritorio: se queda en
  `desktop/src/components/views/HomeView.svelte`, que la mete en el hueco `habitat` de la vista
  compartida. `habitatToggle={false}` quita «A casa» donde la mascota no sale de su hábitat (móvil).
- **Cuenta** → `AccountView` y `SocialAvatar` en la biblioteca. El canje de códigos llamaba a
  `api.redeemVoucher`: el formulario pasa a `RedeemCodeCard` (props `busy`, `error`, `ok`; evento
  `redeem`) y `RedeemVoucherCard` del escritorio queda como contenedor, en el hueco `redeem`.
- `lib/ui/maps.ts` (elementos, rarezas, iconos de recompensa) pasa a `@pockai/ui/maps`; el
  escritorio conserva la ruta con una reexportación.

Patrón para lo que venga: lo común a la biblioteca, lo propio de una plataforma en un hueco
(`slot`) que rellena su contenedor.

Android usa `PetHomeView` en lugar de su ficha hecha a mano y gana la pestaña Cuenta (sin canje de
códigos todavía). El cambio de mascota activa va por `stateSelectPet` del núcleo.

Verificado en el escritorio en modo demo: ficha, dar de comer (5 → 4), llevar a casa (aparece la
casita y desaparece «A casa»), Cuenta y canje de un código. 438 tests del escritorio; compilan
escritorio y UI de Android. **Sin verificar:** la ficha y Cuenta en el emulador de Android.

### Eclosión compartida (2026-11-20)

`HatchView` pasa a la biblioteca. Lo único que la ataba al escritorio era el huevo animado
(`EggSprite`, que usa el motor de sprites): ahora la vista tiene un hueco `egg` que recibe la
animación del momento (`anim`: `idle`, `shake`, `crack`, `hatch`) y el escritorio pone ahí su
`EggSprite`. Sin nada en el hueco sale un icono que tiembla mientras eclosiona. El texto del botón
para pasar a la recién nacida es una prop (`switchLabel`): el escritorio dice «Sacar a … al
escritorio».

Android gana la pestaña Huevos con esa pantalla (nombre opcional, cuenta atrás, comprar un huevo)
en lugar de su tarjeta con un botón. De momento con el icono: el huevo de sprites llegará cuando el
motor de sprites salga del escritorio. Su eclosión no tiene las fases de grietas del escritorio: el
huevo tiembla mientras responde el servidor.

Verificado en el escritorio en modo demo: huevo de sprites en el hueco, eclosión con sus fases y
aviso del nacimiento. 438 tests; compilan escritorio y UI de Android. **Sin verificar:** la pestaña
Huevos en el emulador de Android.

### Mascota, Huevos y Cuenta en el emulador (2026-11-20)

APK de depuración (x86_64) en el emulador de API 37, contra un backend local con base de datos
desechable y la cuenta de la semilla:

- **Huevos**: eclosionar el huevo inicial con nombre («Chispa», un Magmadillo), aviso del
  nacimiento, comprar otro huevo (1290 → 1240 monedas) y su cuenta atrás.
- **Mascota**: la ficha compartida con elemento, rareza, patrón y nivel; dar de comer (5 → 4
  manzanas), bañar, dormir y despertar.
- **Cuenta**: datos del jugador y cerrar sesión (vuelve al inicio de sesión). Al reinstalar la app
  la sesión se conserva.

Un ajuste salió de la prueba: los chips de comida medían 42 px de alto porque el estilo del
componente ganaba al de la app; el selector de `apps/android/src/app.css` es ahora más específico
y miden 48 px.

Sin verificar: el selector de mascota activa (hace falta una segunda mascota) y el temblor del
icono del huevo durante la eclosión (el servidor local responde antes de poder verlo).

### Misiones, Vínculo y Temporada compartidas (2026-11-20)

Primeras pestañas que cargaban sus propios datos. El patrón: la pestaña se parte en **vista**
(biblioteca) y **contenedor** (cada app).

- `MissionsView`, `BondingView` y `SeasonsView` en `@pockai/ui`: reciben los datos, `loading` y
  `error` por props y avisan con `refresh`, `claim` y `buyPass`. La confirmación de compra del
  pase es estado de la vista y se cierra sola cuando `busy` vuelve a `false`.
- En el escritorio, `MissionsTab`, `BondingTab` y `SeasonsTab` conservan nombre y props, pero ya
  solo cargan con `api.*` y pintan la vista.
- En Android, los contenedores están en `apps/android/src/screens/` y piden los datos al núcleo
  con `query`. Tras reclamar una misión o comprar el pase piden `stateRefresh('user')` para que el
  saldo se ponga al día.
- La navegación de Android pasa a parecerse a la del escritorio: Mascota tiene secciones (Inicio,
  Vínculo, Huevos) y hay una pestaña Progreso (Misiones, Temporada). Huevos deja de ser pestaña.

Verificado en el escritorio en modo demo: Vínculo; reclamar una misión («Has recibido 50 monedas ·
20 XP», pasa a Reclamada); comprar el pase con su confirmación (cuesta 30, tienes 40; se cierra y
queda «Pase activo»). 438 tests; compilan escritorio y UI de Android. **Sin verificar:** estas tres
pantallas y la navegación por secciones en el emulador de Android.

### Vínculo, Misiones y Temporada en el emulador (2026-11-20)

Misma receta (APK x86_64, API 37, backend local con base de datos desechable):

- **Secciones**: Mascota › Inicio, Vínculo y Huevos; Progreso › Misiones y Temporada. «Ir a
  eclosionar un huevo» lleva a Mascota › Huevos.
- **Vínculo**: carga al entrar y refleja lo que se hace (dar de comer +2,0, dormir +0,5 en el
  historial).
- **Misiones**: tras dormir a la mascota, «Pon a dormir a tu pet» pasa a 1/1; al reclamarla sale el
  aviso, queda «Reclamada» y el saldo de la cabecera sube (1040 → 1045 monedas).
- **Temporada**: se pinta, pero la de la semilla está finalizada.

Dos ajustes de maquetación salieron de la prueba, ambos en `apps/android/src/app.css`: las cuatro
cifras de Misiones y los cinco desbloqueos de Vínculo no cabían en fila en el ancho de un móvil;
ahora van en dos y tres columnas.

Sin verificar en Android: comprar el pase de temporada (hace falta una temporada activa; en el
escritorio en modo demo sí está probado).

### Cofres, Raid, Torneo y Entrenamiento compartidos (2026-11-20)

Mismo patrón que Misiones: vista en `@pockai/ui` (`ChestsView`, `RaidView`, `TournamentView`,
`TrainingView`), contenedor del escritorio con el nombre de siempre (`ChestsTab`, `RaidTab`…) y
contenedor de Android en `apps/android/src/screens/`. Tres novedades:

- **El núcleo pone al día el estado tras estas acciones.** Atacar a la raid y terminar la mazmorra
  vuelven a pedir mascotas y saldo; empezar la mazmorra, las mascotas (gasta energía); inscribirse
  en el torneo, el saldo; abrir o comprar un cofre, saldo e inventario. Así los contenedores de
  Android no piden `stateRefresh`. Test: `atacar_a_la_raid_y_abrir_un_cofre_ponen_al_dia_…`.
- **Lógica de pantalla compartida.** La sesión de la mazmorra (pisos, corazones, piso revelado,
  mensaje final, sesión retomada) son funciones puras en `training.ts`; los precios de los cofres
  salen de `balance.json` en `chests.ts`; los avisos de raid, torneo y compra de cofre también
  están en la biblioteca. Las confirmaciones (inscribirse, comprar con gemas) son estado de la
  vista y se cierran solas cuando termina la petición.
- **Navegación de Android.** Nueva pestaña Jugar (Raid, Torneo, Entrenar) y Tienda con secciones
  (Tienda, Cofres). Con seis pestañas los botones no llegaban a 48 px en un móvil de 360 px, así que
  Cuenta sale de la barra y se abre tocando el nombre en la cabecera.

También se corrigió el modo demo: los cofres sembrados tenían ids (`ch-1`, `ch-2`) que el
generador de ids del mock repetía al comprar, y el cofre comprado no aparecía.

Verificado en el escritorio en modo demo: Raid (se pinta; con la mascota dormida el botón queda
desactivado con su aviso); Torneo (confirmación, inscripción, «Ya estás inscrito», gemas 40 → 25);
Entrenamiento (entrar, elegir Fuego, piso revelado y aviso del turno); Cofres (abrir uno con sus
premios, comprar con gemas pasando por la confirmación y con monedas, 1250 → 1175, aviso y
cofre nuevo en «Mis cofres»). 20 tests de estado del núcleo; 438 tests del escritorio; compilan
escritorio y UI de Android.

**Sin verificar:** nada de este tramo en el emulador de Android (ni las cuatro pantallas ni la
navegación nueva), ni atacar a la raid con una mascota despierta, ni una mazmorra completa hasta
el final.

### Motor de sprites compartido y Armario (2026-11-20)

- **Motor**: `sprites.ts`, `AnimationController`, `asset-loader`, `asset-cache` y `accessories.ts`
  pasan de `desktop/src/lib` a `shared/scene/src/sprites` (export `@pockai/scene/sprites`, y
  `@pockai/scene/sprites/<módulo>` para cada fichero). Las rutas `@shared/assets/…` pasan a
  relativas para que Android las resuelva sin el alias del escritorio. `eventMap` y `petActions`
  (reacciones de la mascota del escritorio) se quedan. El escritorio conserva sus rutas como
  reexportaciones; las de `asset-loader` y `asset-cache` apuntan a su módulo, no al índice, para
  no arrastrar las cargas que hace `sprites.ts` al importarse.
- **Componentes**: `PetMiniAvatar` y `EggSprite` pasan a `@pockai/ui`. `HatchView` pinta el huevo
  de sprites por sí misma, así que Android lo tiene sin código propio.
- **Armario**: `WardrobeView` en la biblioteca, `WardrobeTab` como contenedor y
  `WardrobeScreen` en Android (Mascota › Armario). El núcleo vuelve a pedir el saldo tras
  comprar una prenda y las mascotas tras equiparla (test
  `comprar_y_equipar_una_prenda_ponen_al_dia_saldo_y_mascota`).
- **Modo demo**: el mock sirve el catálogo real de prendas (`accessories.json`), comprar y equipar.

Verificado en el escritorio en modo demo: Armario con el arte de cada prenda, comprar las gafas
(1250 → 950 monedas) y equiparlas; la mascota del escritorio lleva su prenda; el huevo de sprites
en Eclosión desde la vista compartida. Tests de escena (335), del escritorio (438) y del núcleo;
compilan escritorio, escena y UI de Android (que ya incluye las hojas de especies).

**Sin verificar:** nada de esto en el emulador de Android.

### Arena compartida (2026-11-20)

- **Vista**: `ArenaView` en `@pockai/ui`. Los borradores (puntos por repartir, habilidades
  marcadas, la confirmación del reparto) son de la vista y se rehacen solo cuando el perfil cambia
  de verdad (puntos, estadísticas o habilidades), no al cambiar la estrategia. La sección visible
  (Pelea, Historial, Ranking) la lleva el contenedor, porque abrir una repetición vuelve a Pelea.
- **Visor de repeticiones**: `ReplayViewer` y `replay.ts` (fotogramas a partir del registro del
  servidor, función pura) pasan a `@pockai/ui`. `speciesPalette` y `visitorSeed` (dibujar una
  mascota de la que solo se sabe la especie) pasan al motor de sprites; `visitors.ts` reexporta
  `visitorSeed`.
- **Contenedores**: `ArenaTab` en el escritorio; `ArenaScreen` en Android (Jugar › Arena, la
  primera sección).
- **Núcleo**: tras una pelea aplica la mascota que trae la respuesta y vuelve a pedir el saldo
  (test `una_pelea_de_arena_aplica_la_mascota_y_refresca_el_saldo`).
- **Modo demo**: no tenía pelea ni detalle de una pelea del historial (respondía `{ok:true}` y no
  pasaba nada); ahora sirve una pelea corta con su repetición.

Verificado en el escritorio en modo demo: buscar rival (victoria, ELO 1340 → 1354, saldo
1250 → 1275) y su repetición con los dos luchadores dibujados por el motor compartido; abrir una
pelea del historial (vuelve a Pelea con «Fuego vs Luna»); el ranking con tu puesto; repartir 2
puntos con su confirmación, que se cierra sola. 438 tests del escritorio, 23 de estado del núcleo;
compilan escritorio, escena y UI de Android.

**Sin verificar:** nada de esto en el emulador; guardar habilidades y cambiar la estrategia (el
catálogo del demo no trae habilidades).

### Cocina compartida y puerto de sonido (2026-11-20)

- **Puerto de sonido** (`shared/ui/src/sound.ts`): las pantallas que son un juego piden efectos por
  id (`uiSfx`, `uiLoop`, `uiStopLoop`) sin saber cómo suenan. Cada app instala su motor con
  `setUiSound`: el escritorio, el suyo (`lib/audio`) en `main.ts`. Android aún no instala
  ninguno, así que su Cocina y sus minijuegos van sin sonido. `onUiFeedback` sigue para los momentos del kit
  (abrir un modal, ganar monedas).
- **Vista**: `CookingView` en `@pockai/ui` con el juego entero (dictado, reloj, olla caliente,
  sonidos, gesto del Pockai). El contenedor carga el recetario, empieza (la sesión llega por
  `session` y arranca el dictado) y sirve (la nota llega por `result`). `dishes.ts` (arte de los
  platos) pasa a la biblioteca.
- **Contenedores**: `CookingTab` en el escritorio; `CookingScreen` en Android (Jugar › Cocina).
- **Núcleo**: empezar a cocinar vuelve a pedir las mascotas (gasta energía) y servir, el saldo
  (test `cocinar_pone_al_dia_la_energia_y_servir_el_saldo`).

Verificado en el escritorio en modo demo: recetario con el arte de los platos, el Pockai dicta la
receta (con su sprite en la cocina), echar los cuatro ingredientes en orden, «¡Plato perfecto!»
con su buff y el repaso de la receta, y volver al recetario con los buffs activos. El mock del demo
no paga las monedas al servir, así que el saldo de la cabecera no sube allí. 438 tests del
escritorio, 24 de estado del núcleo; compilan escritorio y UI de Android.

**Sin verificar:** nada de esto en el emulador; en el demo, la olla caliente quemándose y el reloj
agotándose; que suenen los efectos (no se ha escuchado).

### Minijuegos compartidos (2026-11-20)

- **Anfitrión**: `MinigameHost` pasa a `@pockai/ui`. Monta el juego de `@pockai/minigames` con las
  hojas del motor de sprites compartido (`petSheetUrls`) y el puerto de sonido, que ahora acepta
  la clave y el fundido de los bucles (la forma de `SoundEngine`). `@pockai/ui` y la UI de Android
  dependen de `@pockai/minigames`.
- **Vista**: `MinigamesView` con la lista, la cuenta atrás, la partida y el resultado, y sus
  sonidos. El modo accesible es una preferencia del dispositivo (`localStorage`). El contenedor
  carga la lista, empieza (la sesión llega por `session`) y guarda la partida (`busy` mientras
  tanto; la recompensa llega por `result`). Se corrigió un `tone="success"` que `Notice` no
  admite (heredado del escritorio).
- **Contenedores**: `MinigamesTab` en el escritorio; `MinigamesScreen` en Android (Jugar ›
  Minijuegos, la primera sección, como en el escritorio).
- **Núcleo**: empezar un minijuego vuelve a pedir las mascotas; terminarlo aplica la mascota de la
  respuesta y vuelve a pedir saldo e inventario (test
  `terminar_un_minijuego_aplica_la_mascota_y_refresca_saldo_e_inventario`).

Verificado en el escritorio en modo demo: la lista con sus 9 juegos y su arte; Pesca de Códices
con su cuenta atrás, la partida con el sprite de la mascota, un códice pescado y el resultado
(+24 monedas, +18 XP, +6 felicidad); volver a la lista. 438 tests del escritorio, 25 de estado del
núcleo; compilan escritorio y UI de Android.

**Sin verificar:** nada de esto en el emulador (ni que el juego responda al tacto allí); el modo
accesible; un error del juego a mitad de partida.

### Aventura compartida (2026-11-20)

- **Escena**: `StorySceneView` pasa a `@pockai/ui`. Lo que la ataba al escritorio era el clima
  (`environmentalStatus`) y el sonido: el clima es ahora una prop (`weather`) que pasa cada app si
  lo tiene, y el sonido va por el puerto (`uiSfxFirst`, nuevo: el primero de varios ids que suene).
  El núcleo no guarda el clima local (en la fase 3 se quedó en la UI), así que en Android la escena
  usa su propio ambiente.
- **Vista**: `AdventureView` con la narración (escena, fase, reacción, final), marcada por los
  hitos de la escena. El contenedor carga el día, empieza la historia (llega por `started`) y manda
  cada respuesta (llega por `answered`).
- **Contenedores**: `AdventureTab` en el escritorio (con el clima de `environmentalStatus`);
  `AdventureScreen` en Android (Jugar › Aventura).
- **Núcleo**: solo la respuesta que cierra la historia (trae `completed`) vuelve a pedir mascotas,
  saldo e inventario (test `solo_la_respuesta_que_cierra_una_historia_refresca_el_saldo`).

Con esto el grupo (a) de la tabla está entero.

Verificado en el escritorio en modo demo: la lista de historias del día; «La primera rotura» con
la escena compartida (el Pockai entra andando y al llegar aparecen las respuestas), la
consecuencia y el voto de la comunidad, las tres escenas y el final («Victoria · +30 XP, +20
monedas» con su recuerdo); de vuelta, «2 de 3 historias por vivir hoy». 438 tests del escritorio,
26 de estado del núcleo; compilan escritorio y UI de Android.

**Sin verificar:** nada de esto en el emulador (ni que PixiJS dibuje la escena en el WebView de
Android); el clima real en la escena del escritorio (el demo no trae clima); continuar una
historia a medias.

### Perfil compartido (2026-11-20)

- **Piezas**: `ProfileView` (la ficha de un perfil, propio o ajeno) ya solo pintaba y pasa tal cual a
  `@pockai/ui`, con `profile-format.ts`, `badge-icons.ts` y la insignia de logro, que se llama
  `AchievementBadge` en la biblioteca (ya había un `Badge`). El escritorio conserva sus rutas;
  la ventana de perfil de otro jugador (`UserProfileModal`) usa la vista de la biblioteca.
- **Vista**: `MyProfileView` con tu perfil, la privacidad y la colección filtrada. Editar la
  vitrina y los filtros son de la vista; el contenedor carga, guarda la vitrina y cambia la
  privacidad.
- **Contenedores**: `ProfileTab` en el escritorio (sigue recargando al desbloquear un logro, salvo
  con la vitrina en edición); `ProfileScreen` en Android, como sección de Cuenta (Cuenta · Perfil).
- El test de `badge-icons` lee ahora el fuente en `shared/ui`.

Con esto quedan solo los grupos (b) y (c) de la tabla, que necesitan una decisión antes.

Verificado en el escritorio en modo demo: Mi Perfil (cabecera, vitrina, estadísticas); editar la
vitrina, añadir una insignia y guardar («Vitrina actualizada.», sale del modo edición); hacer
privado el perfil; abrir el perfil de otro jugador desde Amigos. 438 tests del escritorio; compilan
escritorio y UI de Android.

**Sin verificar:** nada de esto en el emulador; en Android, que el perfil se recargue al
desbloquear un logro (allí solo carga al abrirlo).

### Lo social: decisión y Amigos (2026-11-20)

**Decisión: el estado social no sube al núcleo; se comparte en TypeScript.** Los visitantes de tu
hábitat, el chat y los objetivos de clan son estado de pantalla: sin persistencia ni reglas, y casi
toda su lógica ya era pura. Lo que faltaba en Android no era dónde guardarlo sino quién lo llenara,
y el núcleo ya reenvía todos los eventos de tiempo real a cualquier UI (`onRealtime`). Llevarlo a
Rust habría sido modelar visitantes, mensajes y objetivos (estado, eventos y tipos generados) sin
que nada fuera de la pantalla lo consuma. Si la fase 5 necesita algo fuera de la pantalla, se sube
esa pieza entonces, como la visita en curso, que sigue prevista para la fase 5.

- **`@pockai/ui/social`**: los tipos de lo social (`types.ts`, antes en el `api.ts` del
  escritorio, que ahora los reexporta), los stores y su lógica (`visitors.ts`, `clans.ts`, antes en
  `desktop/src/lib`, que conserva sus rutas) y `connectSocialFeed(on)`, que suscribe los eventos
  `habitat:*` y `clan:*` y escribe en los stores. Cada app le pasa su fuente: el escritorio, su
  socket (también en el modo demo); Android, `onRealtime` (en `core.ts`, que reparte los eventos por
  nombre y vacía los stores al cerrar sesión).
- **Lo propio del escritorio** sigue en `App.svelte`, colgado de los mismos eventos: la reacción de
  la mascota a una visita, los avisos del sistema, la celebración del objetivo de clan y el viaje
  por el portal (`visitTravel`).
- **Amigos**: `FriendsView` en la biblioteca (con `handle.ts`, la validación del nickname);
  `FriendsTab` como contenedor, que conserva su ventana de perfil. En Android, `FriendsScreen`
  en Cuenta › Amigos (no queda hueco en la barra), con su propia ventana de perfil sobre
  `ProfileView` y sin «Visitar» (`canVisit={false}`) hasta que llegue Visitas.
- **Android** compila ahora con los tipos de Vite (`vite/client` en su `tsconfig`): `core.ts` importa
  el motor de sprites a través de lo social, y `tsc` necesita entender `import.meta.glob` y los PNG.

Verificado en el escritorio en modo demo: Amigos (solicitudes, presencia, «1 en línea»); un
nickname mal escrito se avisa sin preguntar al servidor; pedir amistad a @lucia (el campo se vacía);
aceptar a Dani; abrir el perfil de Marta con «Visitar». 438 tests del escritorio (con los de
`visitors` y `clan-store` sobre las rutas de siempre); compilan escritorio y UI de Android.

**Sin verificar:** nada de esto en el emulador; que un visitante o un mensaje de clan llegue en
vivo por el feed (el modo demo no emite esos eventos).

**Siguiente:** Visitas y Clanes. Llevan escenas (la sala del amigo, la escena de casa, el hábitat
del clan) que de momento irán en un hueco que rellena el escritorio.

### Visitas compartidas (2026-11-20)

- **Vista**: `VisitsView` en `@pockai/ui`: selector de amigo, su tarjeta con los cuidados, empezar
  y terminar la visita (con su mensaje) e historial. Las escenas van en dos huecos: `scene` (cabecera
  de la casa del amigo; por defecto un banner sencillo) y `room` (su sala durante la visita en vivo;
  por defecto, nada).
- **Lo puro de las visitas** (`social/visits.ts`): las constantes (`VISIT_MESSAGE_MAX`,
  `VISIT_ENERGY_COST`, que el `api.ts` del escritorio reexporta), deducir la visita en curso del
  historial (`ongoingVisitFrom`, antes en `activeVisit.ts`, que conserva el store) y la fecha
  relativa del historial.
- **Escritorio**: `VisitTab` como contenedor con lo suyo: el store de la visita en curso, el viaje
  por el portal, `HomeScene` en `scene`, la sala del amigo y el diálogo de la visita en `room`, y
  la ventana de perfil.
- **Android**: `VisitsScreen` en Cuenta › Visitas. Deduce la visita en curso del historial (la
  fase 5 la llevará al núcleo) y va sin escenas. Amigos gana «Visitar», que lleva a Visitas con ese
  amigo elegido.
- **Núcleo**: cuidar la mascota de un amigo vuelve a pedir el usuario (XP); visitar un hábitat,
  mascotas y usuario (energía); terminar la visita no pide nada (test
  `visitar_un_habitat_pone_al_dia_la_energia_y_terminar_no_toca_nada`).

Verificado en el escritorio en modo demo: Visitas con la casa del amigo en el hueco; alimentar a
Luna («+12 XP»); empezar la visita con mensaje (aparece la sala del amigo en su hueco, el selector
marca «En visita» y el campo se vacía); terminarla; «Visitar» desde Amigos abre Visitas con ese
amigo elegido. 438 tests del escritorio, 27 de estado del núcleo; compilan escritorio y UI de
Android.

**Sin verificar:** nada de esto en el emulador; el viaje por el portal en el escritorio con la
mascota en pantalla (en el demo estaba dormida).

### Clanes compartidos (2026-11-20)

- **Puerto en vez de vista + contenedor.** Clanes tiene unas veinte llamadas con mucha lógica entre
  ellas (confirmaciones en dos pasos, rangos, chat que se queda abajo, objetivos). Partirla como las
  demás habría repetido esa lógica en dos contenedores. La pantalla entera vive en `ClansView` y
  recibe `clansApi` (`social/clansApi.ts`): las operaciones que necesita más `errorText`. El
  escritorio lo implementa con su `api`; Android, con `query` y `perform` del núcleo. Es una
  excepción a «datos por props, avisos por eventos», documentada en la vista.
- **El hábitat del clan** envuelve la cabecera del clan, así que no es un hueco normal: la vista
  recibe `habitat` (un componente opcional) y pinta la cabecera dentro; sin él (Android), la
  cabecera va sola.
- `chatScroll.ts` (pegarse al final del chat) pasa a la biblioteca.
- **Android**: `ClansScreen` en Cuenta › Clanes. El chat y los objetivos llegan en vivo por el feed
  social.
- **Modo demo**: los mensajes sembrados del clan tenían ids (`m-1`…) que el generador del mock
  repetía, y un mensaje enviado no aparecía.

Verificado en el escritorio en modo demo: Clanes con el hábitat envolviendo la cabecera; enviar un
mensaje al chat; sumar progreso a un objetivo (31/50 → 32/50); invitar con un nickname mal escrito
(se avisa sin preguntar al servidor); editar el Nexo (aviso y el formulario se cierra; el mock no
guarda el nombre). 438 tests del escritorio; compilan escritorio y UI de Android.

**Sin verificar:** nada de esto en el emulador; crear, unirse, salir, expulsar, cambiar rangos y
disolver un clan (no se ha probado en el demo).

Con esto lo social está entero. Queda el grupo (c): Chat/IA, Mente y Hábitat, ligados a funciones
del escritorio.

### Mente compartida (2026-11-20)

Mente resultó compartible entera: lo que la ataba al escritorio eran textos y lógica pura.

- `mind.ts` (dimensiones, capas de memoria, fechas relativas) y los tipos de la mente
  (`mindTypes.ts`, antes en `api.ts`, que los reexporta) pasan a `@pockai/ui`.
- De `initiative.ts` pasan solo los niveles de charla y sus textos (`talk.ts`); el reloj de la
  iniciativa se queda en el escritorio. De `learningStore.ts`, los textos de lo aprendido
  (`learned.ts`, con `@pockai/mind`, nueva dependencia de la biblioteca); el store y el refuerzo
  se quedan.
- `MindView` en la biblioteca; `MindTab` como contenedor (guarda el nivel de charla al momento y
  lo deshace si el servidor falla); `MindScreen` en Android (Mascota › Mente).

Verificado en el escritorio en modo demo: Mente con personalidad, nivel de charla y lo aprendido;
cambiar a «Hablador» (el texto pasa de cada 17 a cada 7 minutos). 438 tests del escritorio;
compilan escritorio y UI de Android.

**Sin verificar:** nada de esto en el emulador.

### Hábitat compartido (2026-11-20)

- **Como Clanes, con un puerto**: la pantalla tiene mucha lógica entre llamadas (edición de la
  sala, compra y retirada, movimientos agrupados), así que vive entera en `HabitatView` y recibe
  `habitatApi` (`habitatApi.ts`).
- **Lo de cada app, opcional**: `room` (la sala isométrica; el escritorio pasa `IsoRoomView`; sin
  ella no hay sala ni edición, solo salas, catálogo, muebles colocados y buffs), `canLeave` (la
  mascota puede salir al escritorio; en el móvil no) y `hooks` (arrastrar a la mascota fuera de la
  ventana, modo hábitat a pantalla completa, paisaje, lo que dice el visitante y los muebles que
  desbloquean habilidades).
- **Contenedores**: `HabitatTab` en el escritorio pasa el puerto, la sala y los hooks;
  `HabitatScreen` en Android (Mascota › Hábitat), sin sala de momento.
- **Núcleo**: comprar un mueble vuelve a pedir el saldo (test `comprar_un_mueble_pone_al_dia_el_saldo`).

Verificado en el escritorio en modo demo: la sala con «Modo hábitat» y «Paisaje»; llevar a la
mascota a casa; editar la sala, elegir un mueble y girarlo; comprar la Fuente de Agua con su
confirmación (1250 → 850 monedas; se abre la edición). 438 tests del escritorio, 28 de estado del
núcleo; compilan escritorio y UI de Android.

**Sin verificar:** nada de esto en el emulador; arrastrar un mueble del catálogo a la sala;
arrastrar a la mascota fuera de la ventana; el modo hábitat.

### Chat compartido (2026-11-20)

- **`ChatView`** en `@pockai/ui`: la conversación (historial, envío con la respuesta en vivo,
  razonamiento plegado), las acciones que propone la mascota, el compositor, los recordatorios y
  los recuerdos. Habla por el puerto `chatApi` (`chatApi.ts`). El texto en negrita (`parseBold`)
  pasa a `chatText.ts`.
- **Lo del escritorio se queda en `AiTab`**: el selector de motor y sus ajustes (clave propia,
  Hermes local, los CLI), el uso, la suscripción Pro (Stripe) y el aviso de pago. Los motores
  locales viven dentro de su puerto: su `chatStream` decide si el turno va al servidor o al motor
  del equipo, y la vista no se entera. Las herramientas del equipo (abrir una web, el portapapeles,
  pomodoro, música, habilidades) van en `runClientTool`. Al cambiar de motor la conversación se
  vuelve a montar (`{#key}`) y carga su historial.
- **`chatTurn` en `@pockai/client`**: el turno de chat por el núcleo (mandar, repartir los
  eventos del flujo y resolverse con `done`), que antes estaba en el `api.ts` del escritorio. Lo
  usan el escritorio y Android.
- **Android**: `ChatScreen` en Mascota › Charla, con la IA de Pockai por el núcleo y su cuota.
  Sin motores locales, sin herramientas del equipo y sin pasar a Pro desde la app (los pagos irían
  por Google Play); al agotar la cuota solo se avisa.
- **Modo demo**: no tenía chat (respondía `{ok:true}` y el turno acababa en «La respuesta terminó
  sin completarse»); ahora contesta por un flujo de eventos a trozos.
- Los estilos se repartieron: cada componente se queda solo con las reglas de su marcado.

Verificado en el escritorio en modo demo: la barra del escritorio (motor, cuota, Pro) sobre la
conversación compartida con su historial; mandar un mensaje y ver la respuesta llegar a trozos;
el bocadillo de la mascota al terminar; los recuerdos por capas; abrir y cerrar los ajustes (la
conversación se vuelve a montar con su historial). 438 tests del escritorio, 2 de `@pockai/client`;
compilan escritorio y UI de Android, sin avisos de CSS.

**Sin verificar:** nada de esto en el emulador (ni el streaming por el núcleo en Android); en el
escritorio, los motores locales, la clave propia, el pago y las acciones de la mascota (el demo no
las propone); una respuesta moderada.

### Revisión del tramo antes del PR (2026-11-20)

- **Tipos de Android**: su `typecheck` (`tsc`) no mira los `.svelte`. Pasado `svelte-check` sobre
  `apps/android`: las pantallas (formas de consultas y acciones) no tenían errores; sí salieron
  los de su configuración estricta en cuatro vistas de la biblioteca (`noImplicitAny`, null) y los
  de `Segmented` en `App.svelte`, ya corregidos. Quedan solo los «No Svelte configuration» del
  entorno.
- **Caminos que el modo demo no recorre**, ahora con tests:
  - `chatTurn` (`shared/client/src/index.spec.ts`): trozos, razonamiento, herramientas y acciones a
    sus handlers; `done`; moderado; `error`; y un 429 que rechaza con su estado. Es el camino del
    chat del **escritorio en Tauri** desde este tramo (antes `coreChat` en `api.ts`).
  - `connectSocialFeed` (`desktop/src/lib/socialFeed.spec.ts`): visitantes y su escena, chat,
    objetivos, XP y roster del clan, y que al pararlo deja de escuchar. `App.svelte` ya no escribe
    en esos stores: si el feed fallara, el escritorio perdería lo social en vivo.
- **CI en local**: los pasos del job de escritorio (minijuegos, escena, cliente, UI de Android,
  escritorio, `cargo check --workspace --locked`, tests del núcleo) en verde.

Sin verificar en todo el tramo (`claude/pantallas-sprites`): nada en el emulador ni en la app de
Tauri del escritorio (todo en el modo demo del navegador); las secciones de Android con hasta siete
pastillas a 360 px.

### Sonido en Android (2026-11-20)

- `apps/android/src/audio.ts` crea el motor de `@pockai/audio` (el mismo que el escritorio y que
  los bundles de la escena y los minijuegos) y lo conecta a la biblioteca al arrancar
  (`installSound` en `main.ts`): `setUiSound` para los juegos compartidos y `onUiFeedback` para los
  momentos del kit (modal, monedas, gemas), con los mismos ids que el escritorio.
- Plataforma `scene`: suenan los sonidos sin plataforma del manifiesto; los veinte que son solo del
  escritorio no.
- Solo se empaquetan los ficheros que piden esas pantallas: `cook.*`, `mg.*`, `elem.*` y los de
  interfaz (70 ficheros, unos 760 KB). La música y los ambientes (unos 7 MB) no entran en el APK.
- Ajustes con los valores por defecto del móvil, guardados en el dispositivo (`pockai_audio`). La
  app aún no tiene pantalla de sonido.
- `.claude/launch.json` gana `pockai-android-ui` para servir la UI de Android en el navegador.

Verificado sirviendo la UI de Android en el navegador: el puerto de la biblioteca suena por el
motor de Android (`mg.countdown.go`, `cook.serve` y `elem.fire.accent` devuelven que han sonado;
un id inexistente y la música, que no se empaqueta, no), los ficheros se cargan (200) y sin
errores en la consola. Compila la UI de Android (`tsc` y build).

**Sin verificar:** oírlo en el emulador o en un dispositivo (el WebView exige un toque antes de
sonar: `attachAutoUnlock`); una pantalla de ajustes de sonido.

### Escenas en Android: la sala isométrica y la del amigo (2026-11-20)

No hace falta el bundle de la app Kotlin: la UI de Android ya corre en un WebView y dibuja
`@pockai/scene` directamente (Aventura ya lo hacía).

- **`IsoRoomView`** pasa a `@pockai/ui`. Lo que leía de stores del escritorio llega por props: el
  clima local (`weather`), el paisaje (`backdrop`), la personalidad (`dims`; sin ella, valores
  neutros) y el aviso de uso de un mueble (`useItem`). El sonido va por el puerto de la biblioteca.
  El tipo de arrastre `RoomPetDrag` va en `roomDrag.ts`.
- El `IsoRoomView.svelte` del escritorio queda como envoltorio que pone esas props desde sus stores y
  su `api`, y deja pasar el resto (props, eventos, `selectedId`, `rotate()`): Hábitat, la sala del
  amigo, el widget del modo hábitat y la casita no cambian.
- **`visitDialog.ts`** (lo que dice el entrenador visitante) pasa a `@pockai/ui/social`, y el feed
  social atiende `habitat:visitor_interaction`; el escritorio solo conserva su reacción.
- **`FriendRoomView`** pasa a la biblioteca: recibe cómo traer la sala (`loadRoom`) y, si quiere, qué
  sala usar (`roomView`; el escritorio pasa su envoltorio).
- **Android**: Hábitat con la sala (`Room.svelte`: la de la biblioteca con el uso de muebles por el
  núcleo), editar, mover y girar muebles. En el móvil la mascota está siempre en casa
  (`canLeave={false}` ya no la da por «fuera»). Visitas enseña la sala del amigo durante la visita.

Verificado en el escritorio en modo demo (ya por el componente compartido): la sala de Hábitat con
sus controles; cambiar el paisaje; editar, elegir un mueble y girarlo; empezar una visita y ver la
sala del amigo con su pie («Fuego está en casa de Luna.»). 441 tests del escritorio; compilan
escritorio y UI de Android; `svelte-check` de Android sin errores propios.

**Sin verificar:** nada de esto en el emulador: que la sala se dibuje en el WebView, y mover
muebles y tocar a la mascota con el dedo (la escena se probó con ratón). En Android no hay clima
local ni personalidad en la sala, ni el menú del visitante (`VisitDialog`).

### Escenas en Android: el hábitat del clan (2026-11-20)

- **`ClanHabitat`** pasa a `@pockai/ui` con sus piezas: `ambience2d.ts` (cielo, velo y clima en
  2D; solo usa `@pockai/scene`) y `social/clanHabitat.ts` (niveles y paseantes, sobre
  `clan-habitat.json`). Lo que leía del escritorio llega por props: cómo traer el hábitat
  (`loadHabitat`) y el clima local (`weather`). El escritorio conserva sus rutas
  (`lib/ambience-2d.ts`, que también usa `HomeScene`, y `lib/clan-habitat.ts`) y su
  `ClanHabitat.svelte` como envoltorio que pone la consulta y el clima.
- **Android**: `ClansScreen` pasa su envoltorio (`ClanHabitatView.svelte`, con la consulta por el
  núcleo) a `ClansView`: la cabecera del clan va dentro del hábitat, como en el escritorio.
- La prop `habitat` de `ClansView` se tipa como `any`: con `ComponentType` el modo estricto de
  Android no acepta un componente con props obligatorias.

Verificado en el escritorio en modo demo (ya por el componente compartido): Clanes con el hábitat
pintado envolviendo la cabecera («Nexo de Resonancia», nivel, cielo, efectos y pockais). 441 tests
del escritorio; compilan escritorio y UI de Android; `svelte-check` sin errores propios en ninguna.

**Sin verificar:** nada de esto en el emulador (que el diorama 2D y los pockais se dibujen en el
WebView). En Android, el cielo del clan sigue la hora sin clima local.

### Plugins nativos de Android: sesión cifrada y avisos de cuidado (2026-11-20)

- **Sesión cifrada (4.7)**. En el núcleo, `Sealer` (cifrar y descifrar; lo pone la plataforma) y
  `SealedFileStore`, que guarda la sesión en `session.sealed`:
  - Al abrirse por primera vez adopta el `session.json` en claro de antes: lo cifra y, solo si eso
    sale bien, lo borra.
  - Si no se puede cifrar, la sesión vive solo en memoria y nunca se escribe en claro. Con un par
    nuevo, el `session.json` viejo se borra igualmente: su refresh token ya está canjeado y
    reutilizarlo cerraría todas las sesiones.
  - Si no se puede descifrar (clave perdida al reinstalar o al restaurar una copia en otro
    dispositivo), se borra el fichero y se empieza sin sesión.
  - En Android, el `Sealer` es `PockaiKeystore` (Kotlin, AES-256-GCM con la clave en el Android
    Keystore, portado de `Crypto.kt` con alias propio).
- **Avisos de cuidado (4.8)**. Van dentro de `tauri-plugin-pockai`, no en un plugin aparte:
  - `CareSync` (Kotlin) programa un trabajo periódico de WorkManager (30 min, con red).
  - El trabajo carga la librería de la app y llama al núcleo por JNI
    (`Java_app_pockai_core_CareSync_check`). `Core::care_check` pide las mascotas y devuelve el aviso
    más urgente de la mascota activa con la regla de siempre (`pet_needs`). Kotlin solo muestra la
    notificación, como mucho una cada 4 horas.
  - El widget de la app Kotlin no se ha portado.
- **Un solo núcleo por proceso**. Lo crea quien llegue antes (la app o el trabajo) y el otro lo
  reutiliza. Con dos, cada uno renovaría con su copia del refresh token.
- **JNI directo**, no `run_mobile_plugin`: el núcleo necesita el Keystore al construirse, dentro de
  `setup`, y el trabajo corre sin Tauri.
  - Las clases se buscan una vez, con el cargador de la actividad o desde el hilo de Java del
    trabajo, y se guardan como referencias globales.
  - La entrada JNI va con `catch_unwind`.
  - La librería `android/` se enlaza con `.android_path("android")` en `build.rs`. Rust la programa
    al arrancar con la carpeta de datos, la URL y el nombre de la librería
    (`PockaiConfig::android_library`).
- **Permiso de notificaciones**: la UI de Android lo pide una vez al entrar (`notifications.ts`, con
  `@tauri-apps/plugin-notification`).

Verificado:
- Tests: 4 de `SealedFileStore` (con un cifrado de pega) y el de `care_check` sin sesión; 61 del
  núcleo en total.
- Compilación: compila para `x86_64-linux-android` y el APK de depuración se construye en local.
  `Java_app_pockai_core_CareSync_check` sale exportado en la `.so`.
- En el emulador, sin backend y con tokens falsos:
  - Un `session.json` en claro puesto con `run-as` pasa a `session.sealed` (base64) y desaparece.
  - Tras reiniciar, el fichero cifrado sigue intacto (se pudo abrir).
  - El trabajo se programa al arrancar.
  - Su primera ejecución con la app abierta devuelve `RETRY` (hay sesión, falla la red) sin errores.
  - Una ejecución en un proceso frío, con la app muerta, carga la librería, abre la sesión por JNI y
    devuelve `RETRY` sin errores.
- En el emulador, con un backend de pega en Node (login, renovación, `/v1/me` y una mascota con
  hambre; sin base de datos):
  - Entrar por la UI cifra la sesión (desde un hilo de tokio, no de Java).
  - Al reiniciar, la app entra directa en Inicio.
  - Con el access token invalidado, el núcleo renueva al arrancar y el fichero cifrado cambia.
  - Al entrar sale el diálogo del permiso de notificaciones.
  - El trabajo, con sesión, publica «Brasa tiene hambre · Dale de comer antes de que enferme.» con
    el icono de la app. Al tocarla se abre la app.

**Diferencias con el trabajo de la app Kotlin:**
- `CareSync` reintenta ante cualquier error del núcleo, también un 4xx como una cuenta bloqueada.
  `PetSyncWorker` daba por bueno lo que no fuera 5xx. En un trabajo periódico la espera entre
  reintentos crece, así que el ritmo de 30 min se puede alargar.
- El widget se portó después (ver «El widget de Android»).

**Sin verificar:**
- Contra el backend real, y una renovación del token hecha desde el propio trabajo en segundo plano.
- Una compilación de *release* con R8 (`consumer-rules.pro` conserva las clases que usa JNI).
- iOS (`BGAppRefreshTask`).

### El widget de Android (2026-11-20)

- **Qué enseña lo decide el núcleo**: `PetGlance` (`care.rs`) con el nombre, el nivel, el ánimo
  (`sick`, `sleeping`, `hungry`, `sad` o `happy`, con su texto) y las cinco constantes.
  - El ánimo usa los umbrales de los avisos (`pet_needs`). En la app Kotlin la tristeza empezaba en
    felicidad < 30; ahora es < 20, igual que el aviso.
  - `Core::care_sync` sustituye a `care_check` y devuelve el aviso y el resumen juntos.
- **Kotlin solo dibuja**: `PockaiWidget` (en la librería `android/` del plugin) guarda el resumen y
  pinta un `RemoteViews` con un layout XML, los iconos Lucide de la app Kotlin y colores de marca
  con modo oscuro. Al tocarlo se abre la app.
  - No usa Glance: necesitaría el compilador de Compose en el proyecto Gradle que genera Tauri.
  - Los recursos llevan el prefijo `pockai_widget_` para no chocar con los de la app.
- **Cuándo se actualiza**, como en la app Kotlin:
  - Con la app abierta, Rust lo redibuja en cuanto cambian las mascotas o la activa. Al cerrar sesión
    se vacían y el widget vuelve a «Abre la app para ver a tu mascota».
  - Con la app cerrada, en cada pasada de `CareSync`.

Verificado en el emulador con el backend de pega:
- El widget aparece en el selector con su vista previa y se coloca en la pantalla de inicio.
- Tras entrar enseña a Brasa con hambre (icono de manzana, 10 de saciedad) y al tocarlo abre la app.
- Al cerrar sesión pasa a «Abre la app…».
- Con la app muerta, el trabajo en segundo plano lo actualiza solo: se cambió la saciedad a 60 en el
  backend y el widget pasó a «Contento» con 60.

**Sin verificar:** el modo oscuro, otros tamaños del widget y otros lanzadores.

### La cuenta en Android (2026-11-20)

Antes de borrar la app Kotlin faltaba en la de Tauri todo lo de la cuenta salvo entrar. Ahora es
compartido, con el patrón de los puertos (como `chatApi`): son flujos de varios pasos que esperan al
servidor.

- **`@pockai/ui`**: `AuthLayout`, `CodeInput`, `HandleField` (con `checkHandle`) y `PockaiMark`
  salen del escritorio. Vistas nuevas con el puerto `AuthApi`:
  - `AuthView`: entrar, crear cuenta y recuperar la contraseña.
  - `VerifyEmailView`: verificar el correo.
  - `ChooseHandleView`: elegir nickname.
- **IA**: `AiKeyForm` («Mi propia clave», puerto `AiApi`) y `AiSettingsView` (IA de Pockai o clave
  propia).
  - El escritorio usa `AiKeyForm` dentro de su selector de motor.
  - Android abre `AiSettingsView` con el engranaje de Mascota › Charla.
  - Hermes local, los CLI y el pago de Pro siguen solo en el escritorio (en Android, Pro iría por
    Google Play).
- **Escritorio**: `ControlPanel` usa las tres vistas de acceso (de 1222 a 852 líneas).
- **Android**: `core.ts` guarda qué paso de alta falta (`lock`, de `LoadOutcome.lock` y de los
  eventos de sesión) y, al completar uno, vuelve a cargar el estado (`reload`). Se quita la regla
  global de `label` de la pantalla de entrada antigua.
- **Vinculación por código**: no se porta. El backend tiene `/v1/auth/device/*`, pero nadie inicia
  una vinculación (el escritorio nunca tuvo `start` ni `poll`); la app Kotlin solo tenía la mitad de
  confirmar el código. Queda decidir si se completa o se quita del backend.

Verificado:
- **Escritorio**, en el modo demo (ahora simula el alta sin verificar ni nickname, los códigos
  123456 y la clave de IA): nickname cogido; alta, verificar (código mal y bien), nickname con su
  confirmación y entrar; recuperar la contraseña (contraseñas distintas y luego bien) y entrar; clave
  propia (guardar, probar, volver a la IA de Pockai). 441 tests; `svelte-check` sin errores nuevos.
- **Android**, en el emulador con un backend de pega:
  - El alta completa: nickname cogido, crear cuenta, verificar el correo, elegir nickname, permiso de
    notificaciones y la mascota en Inicio.
  - Recuperar la contraseña: sale con sesión nueva.
  - Clave de IA propia: guardar, probar y volver a la IA de Pockai.

**Sin verificar:**
- Contra el backend real.
- «Ya lo he verificado con el enlace» y «Reenviar correo» en Android.
- El registro con invitación obligatoria.

### Lo que le quedaba a Android (2026-11-20)

Antes de borrar la app Kotlin se compararon las 99 rutas de su `ApiService.kt` con lo que llama la
app de Tauri, y sus pantallas con las de Tauri. Todo lo demás estaba cubierto. Faltaban cinco cosas, ahora
compartidas con el escritorio:

- **Canjear código**: Android usa `RedeemCodeCard` en Cuenta. `rewards.ts` (celebrar una vez por
  entrega, desglose, textos de error del canje) y `RewardToast` pasan a `@pockai/ui`.
- **Celebrar recompensas**: Android celebra `reward:received` por tiempo real y vuelve a pedir el
  saldo.
- **Iniciativa**: `createInitiativeLoop` pasa a `@pockai/ui`. Android pregunta al abrir o volver a la
  app y cuando lo dice el servidor, y enseña la frase en Inicio. Los niveles ya estaban en Mente.
- **Visitantes**:
  - Android carga al entrar los pockais que ya están de visita en tu hábitat; los que llegan o se van
    ya llegaban por tiempo real.
  - `VisitDialog` (hablar con el Pockai del amigo durante la visita) pasa a `@pockai/ui` con el
    puerto `interact` y Android lo enseña en Visitas.
- **Sonido**: `SoundSettingsView` en `@pockai/ui`. El escritorio la usa en Ajustes › Sonido.
  Android la tiene en Cuenta, solo con efectos e interfaz (la voz de la mascota y el ambiente no van
  en el APK) y con una muestra de efectos que sí va.

Quedan fuera:
- el botón «Curar» de la app Kotlin, un atajo para usar una medicina (en Android se hace desde
  Mochila, y el escritorio tampoco lo tiene);
- la vinculación por código.

Verificado:
- **Android, en el emulador con un backend de pega:**
  - la frase de bienvenida en Inicio;
  - canjear un código (uno que no vale y uno que sí): la celebración «+50 monedas, 1 × cofre de
    Oro» y el saldo al día;
  - apagar los sonidos de interfaz y que siga apagado tras reiniciar.
- **Escritorio, en el modo demo** (ahora con el código REGALO):
  - canjear un código;
  - empezar una visita y hablar con el Pockai de Marta (la respuesta y las opciones).
- 441 tests; `svelte-check` sin errores nuevos en las dos apps.

**Sin verificar:**
- En Android: los visitantes en tu hábitat y hablar con el Pockai del amigo (el backend de pega no
  tiene amigos, visitas ni hábitat; los componentes son los del escritorio).
- Que la celebración entre con su animación en el escritorio: el panel del navegador estaba oculto
  y no avanza las animaciones. En el emulador entra bien.

### La app Kotlin, retirada (2026-11-20)

Con todo lo suyo ya en la app de Tauri (ver «La cuenta en Android» y «Lo que le quedaba a Android»):

- Se borran `mobile/android` y el job `Android build (Compose)` de CI. El APK de Android lo construye el
  job `android-tauri`.
- Referencias actualizadas: README, PROYECTO, ROADMAP, ART_PIPELINE (sin la versión Kotlin de
  Mulberry32 ni el puente de la escena), DEPLOY (release con `tauri android build --aab`),
  GUIA_ARTISTICA, PANTALLAS, PENDIENTES, los checklists de las skills `pockai-architect` y
  `pockai-minigame-architect`, y los comentarios de Mulberry32 en `@pockai/scene`.
- Se quedan como están, por ser registro: las specs (`docs/specs/`), los informes (`docs/informes/`),
  el historial de la constitución y los planes de `.specify/memory/features/`.
