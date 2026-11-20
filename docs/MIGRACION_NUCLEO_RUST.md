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
| 4 | Targets Android e iOS con su UI y plugins nativos; se borra la app Kotlin | 1 / 10 | 🟡 |
| 5 | Live Activity / Dynamic Island y widgets | 0 / 7 | ⬜ |

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
  estilos y dieciocho pantallas de dominio: Tienda, Mochila, Inicio, Cuenta, Eclosión, Misiones,
  Vínculo, Temporada, Cofres, Raid, Torneo, Entrenamiento y (rama `claude/pantallas-sprites`)
  Armario, Arena, Cocina, Minijuegos, Aventura y Perfil. Las usan el escritorio y la app de Android.
- **Motor de sprites compartido** (rama `claude/pantallas-sprites`): `@pockai/scene/sprites`, con
  `PetMiniAvatar` y `EggSprite` en `@pockai/ui`.
- **App de Android (`apps/android`)**: Mascota (Inicio, Vínculo, Huevos, Armario), Mochila, Jugar
  (Minijuegos, Arena, Raid, Torneo, Entrenar, Cocina, Aventura), Tienda (Tienda, Cofres), Progreso (Misiones, Temporada) y Cuenta
  (Cuenta, Perfil; desde el nombre de la cabecera). Jugar, Cofres, Armario y Perfil aún no se han
  probado en el emulador.

### Qué falta, por orden

1. **Probar en el emulador** Jugar entera, Cofres, Armario, Perfil y el huevo de sprites.
2. **Más pantallas a la biblioteca** (4.4 y 4.5), por tramos según la tabla de abajo. Decidido:
   el motor de sprites se comparte (no un hueco por app).
3. **iOS** (4.2, 4.3, 4.6): `tauri ios init`, `tauri.ios.conf.json` y `apps/ios`. Necesita un Mac.
4. **Plugins nativos** (4.7, 4.8): sesión cifrada con el Keystore en Android (hoy es un fichero
   privado de la app) y sincronización en segundo plano con avisos de cuidado.
5. **Borrar la app Kotlin** (`mobile/android`), su job de CI y sus referencias (4.10). Condición
   acordada: que la app de Tauri tenga portados el widget y la sincronización. Aún no se cumple.
6. **Fase 5**: Live Activity / Dynamic Island, WidgetKit y su equivalente en Android. Sin empezar.

### Pantallas que quedan, por tipo (2026-11-20)

| Tipo | Pantallas | Qué las ata al escritorio | Cómo se mueven |
|---|---|---|---|
| (a) Sprites, datos estáticos y sonido | Hechas todas: Armario, Arena, Cocina, Minijuegos y Aventura | — | Patrón de siempre; los efectos de un juego van por el puerto de sonido (`setUiSound`) |
| (b) Estado de pantalla alimentado por tiempo real | Amigos, Visitas, Clanes | `visitors.ts`, `clan-store.ts`, `activeVisit`, `visitTravel` (se quedaron en la UI en la fase 3) | Antes, decidir si ese estado sube al núcleo; sin eso, Android no tiene de dónde leerlo |
| (c) Funciones del escritorio | Chat/IA, Mente, partes de Hábitat | `hermesLocal`, `aiCli`, `deskContext`, `desktopSkillsStore`, `initiative`, `brain`, arrastre de ventana | No van enteras: frontera de la spec 43. El móvil tendrá su contenedor o una vista reducida con huecos |
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
  contenedor del escritorio conserva nombre y props y llama a `api.*`; el de Android va en
  `apps/android/src/screens/` y usa `query` y `perform` de `@pockai/client`.
- **Si tiene algo propio de una plataforma** (la casita arrastrable de Inicio): la vista deja un
  hueco (`slot`) y cada app lo rellena. Los sprites ya no cuentan como propios: están en
  `@pockai/scene/sprites` y la vista los usa directamente (el huevo de Eclosión).
- En Android, los ajustes táctiles y de ancho van en `apps/android/src/app.css`. Los estilos de un
  componente ganan a un selector simple: hay que usar `main .screen .clase`.
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
- 🟡 4.2 `tauri android init` hecho y `gen/android` versionado; la app compila, se instala y funciona en el emulador. Falta `tauri ios init` (necesita un Mac)
- 🟡 4.3 `tauri.android.conf.json` y capacidades por plataforma (`capabilities/mobile.json`) hechos; falta `tauri.ios.conf.json`
- 🟡 4.4 `shared/ui` (`@pockai/ui`): tokens, fuentes, estilos, los 20 componentes del kit y las pantallas de dominio Tienda, Mochila, Inicio, Cuenta, Eclosión, Misiones, Vínculo, Temporada, Cofres, Raid, Torneo y Entrenamiento, usadas por el escritorio y por Android. Armario, Arena, Cocina, Minijuegos, Aventura, Perfil y el motor de sprites (`@pockai/scene/sprites`, `PetMiniAvatar`, `EggSprite`, `ReplayViewer`) en rama. Quedan las pestañas de la tabla «Pantallas que quedan, por tipo»
- 🟡 4.5 `apps/android`: UI Svelte hecha con `@pockai/ui`: Mascota (Inicio, Vínculo, Huevos), Mochila, Tienda, Progreso (Misiones, Temporada) y Cuenta, probadas en el emulador; Jugar (Minijuegos, Arena, Raid, Torneo, Entrenar, Cocina, Aventura), Tienda › Cofres, Mascota › Armario y el huevo de sprites, sin probar en él. Faltan el resto de pantallas del juego
- ⬜ 4.6 `apps/ios`: UI Svelte
- 🟡 4.7 Sesión en móvil: iOS usa el Keychain (crate `keyring`); Android, un fichero privado de la app (`FileStore`). Falta cifrarlo con el Keystore en un plugin nativo
- ⬜ 4.8 `tauri-plugin-pockai-bgsync`: WorkManager / BGAppRefreshTask + avisos de cuidado
- 🟡 4.9 CI: job `android-tauri` que compila el APK de depuración. Falta todo lo de iOS
- ⬜ 4.10 Borrar `mobile/android`, su job de CI y las referencias en docs, specs y skills

## Fase 5 — Superficies nativas
- ⬜ 5.1 `surfaces.rs`: política pura `AppState → descriptor`, y la visita en curso como parte del estado del núcleo
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
