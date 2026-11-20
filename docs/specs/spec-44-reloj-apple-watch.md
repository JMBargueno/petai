# Spec 44: app de Apple Watch compañera del iPhone

Documento autocontenido. Define **qué es el reloj dentro de la arquitectura** (una superficie de
lectura y unos pocos gestos, no un cliente), **qué le llega y cómo**, **qué le puede mandar al
iPhone** y **qué falta**.

Estado: **hecha y probada en el simulador** (fase 6 de la [spec 43](spec-43-nucleo-rust-tauri.md)).
El avance paso a paso y lo que queda está en
[`../MIGRACION_NUCLEO_RUST.md`](../MIGRACION_NUCLEO_RUST.md).

**El backend no cambia.**

## 1. Antes de nada: puede que sobre la mitad

Desde iOS 18 y watchOS 11, **una Live Activity del iPhone se refleja sola en el Smart Stack del Apple
Watch, sin ningún target de watchOS**. La fase 5 ya publica la actividad del huevo incubando, así que
es probable que las cuentas atrás ya se vieran en la muñeca sin esta spec. **Sin comprobar**: hace
falta un reloj de verdad (el paso 5.7).

| Qué | Lo da la fase 5, reflejada | Lo da esta spec |
|---|---|---|
| Cuentas atrás (hoy el huevo) | Debería, **sin comprobar** | Sí, en su propia página |
| Avisos de cuidado en la muñeca | Debería (el iPhone refleja sus notificaciones locales), **sin comprobar** | — |
| Las constantes vitales de un vistazo | No | Sí |
| Complicación en la esfera | No | Sí |
| Dar de comer, bañar, dormir, curar o evolucionar desde el reloj | No | Sí |
| El Pockai dibujado, no un icono genérico | No | Sí |
| Monedas y gemas de un vistazo | No | Sí |

## 2. Qué es y qué no es

El reloj es una **superficie**, como el widget de la pantalla de inicio: el núcleo decide y el nativo
dibuja.

**No es**, y conviene que quede escrito:

- **No es una app de Tauri.** Tauri 2 no tiene target watchOS.
- **No reutiliza nada de la UI.** watchOS no tiene WKWebView, así que `@pockai/mobile`, `@pockai/ui` y
  `@pockai/scene` no entran. Todo es SwiftUI escrito a mano y pequeño a propósito. Lo que sí
  comparte es el **arte**: los sprites y el set de iconos propio se hornean a un catálogo de Xcode
  (§4.1), que es la única forma de tenerlos sin un webview.
- **No es un cliente del backend.** Ni sesión, ni tokens, ni HTTP, ni Socket.IO. La regla de la spec 43
  («quien no es el núcleo no ve ningún token») se extiende al reloj y se prueba con un test
  (`el_resumen_no_lleva_tokens`).
- **No lleva el núcleo dentro.** `aarch64-apple-watchos` es tier 3 en Rust y `pockai-core` arrastra
  `reqwest` + rustls (ring), `tokio-tungstenite` y `keyring`. No se compila para watchOS.
- **No tiene estado propio.** No recalcula constantes, no proyecta el deterioro, no resuelve
  conflictos. Lo único que calcula es la aritmética de las cuentas atrás.

## 3. Arquitectura

Montada encima de lo que ya había, sin crate, plugin ni paquete Swift nuevos:

```
backend ── socket / HTTP ──> pockai-core ── AppState ──> wrist.rs
                                               snapshot() / buttons() / resolve()
                                               (funciones puras, 15 tests)
                                                     │
                                   tauri-plugin-pockai/src/ios.rs   (interfaz en C, ya existía)
                                     pockai_wrist_push · pockai_wrist_snapshot
                                     pockai_wrist_perform · pockai_wrist_forget
                                                     │
                            gen/apple/Sources/petai-desktop/PockaiWristLink.swift
                                     (WCSessionDelegate, en el proceso del iPhone)
                                                     │  applicationContext · complicationUserInfo
                              ═════════════ WatchConnectivity ═════════════
                                                     │  sendMessage · transferUserInfo
                        PockaiWatch (SwiftUI)  +  PockaiWatchComplications (WidgetKit)
                                                     │
                            gen/apple/Shared/PockaiWrist.swift   (los tipos Codable)
```

| Pieza | Dónde |
|---|---|
| La política, pura y con tests | [`crates/pockai-core/src/wrist.rs`](../../crates/pockai-core/src/wrist.rs) |
| Fixture del contrato | `crates/pockai-core/tests/fixtures/wrist-snapshot.json` |
| Interfaz en C | [`crates/tauri-plugin-pockai/src/ios.rs`](../../crates/tauri-plugin-pockai/src/ios.rs) |
| Tipos Swift compartidos | `desktop/src-tauri/gen/apple/Shared/PockaiWrist.swift` |
| `WCSession` en el iPhone | `desktop/src-tauri/gen/apple/Sources/petai-desktop/PockaiWristLink.swift` |
| App del reloj | `desktop/src-tauri/gen/apple/PockaiWatch/` |
| Atajos de Siri | `desktop/src-tauri/gen/apple/PockaiWatch/PockaiWatchIntents.swift` |
| Complicaciones | `desktop/src-tauri/gen/apple/PockaiWatchComplications/` |
| El arte horneado | `desktop/src-tauri/gen/apple/WatchArt/PockaiArt.xcassets` ([§4.1](#41-el-arte-desviación-del-paso-55-revisada)) |
| Quien lo hornea | [`scripts/generate-watch-assets.ts`](../../scripts/generate-watch-assets.ts) |
| Icono de app y acento | [`scripts/generate-app-icons.mjs`](../../scripts/generate-app-icons.mjs) |
| Empaquetado | [`scripts/build-watch-app.sh`](../../scripts/build-watch-app.sh) |
| Comprobación del contrato en Swift | `desktop/src-tauri/gen/apple/Tests/PockaiWristFixture.swift` |

`wrist.rs` es un módulo aparte y no parte de `surfaces.rs`, aunque usa su `surfaces()` para las
cuentas atrás: `surfaces.rs` decide qué actividades vivas abrir y cerrar, y esto decide qué enseñar y
qué se puede hacer. Son dos preguntas distintas sobre el mismo estado.

### 3.1 Los targets del proyecto Xcode

`desktop/src-tauri/gen/apple/project.yml` está versionado y se edita a mano (ahí se declaró
`PockaiWidgets` en la fase 5). Ahora hay cuatro targets:

| Target | Tipo | Identificador |
|---|---|---|
| `petai-desktop_iOS` | app iOS | `com.petai.app` |
| `PockaiWidgets` | extensión WidgetKit (iOS) | `com.petai.app.widgets` |
| `PockaiWatch` | aplicación watchOS | `com.petai.app.watchkitapp` |
| `PockaiWatchComplications` | extensión WidgetKit (watchOS) | `com.petai.app.watchkitapp.complications` |

Tres cosas que costaron una tarde y conviene no volver a descubrir:

1. **El producto del reloj no se puede llamar `Pockai`**, como el del iPhone: los dos escribirían
   `Pockai.app` en el mismo `Products` y xcodebuild se planta («Multiple commands produce»). Se llama
   `PockaiWatch.app`; lo que ve el usuario es `CFBundleDisplayName`, que sigue siendo Pockai.
2. **El reloj no puede ser dependencia del target de iPhone.** `tauri ios build` llama a xcodebuild
   con un `-sdk iphonesimulator` **global**, que pisa el `SDKROOT` de los targets de watchOS y los
   compila contra iOS (`'accessoryCorner' is unavailable in iOS`). Por eso el reloj se compila aparte
   y se mete en la app en un paso de empaquetado (§7).
3. **El App Group va en `entitlements.properties` de `project.yml`**, nunca en el `.entitlements` a
   mano: `xcodegen` regenera ese fichero desde el proyecto y, si no está declarado, lo deja vacío. Es
   la misma trampa del paso 5.5.

Y tres más:

- `WKApplication = true` (el target único de watchOS moderno; la clave antigua `WKWatchKitApp` no
  vale) y `WKCompanionAppBundleIdentifier = com.petai.app`.
- **El `appiconset` del reloj no lleva `scale`.** Con `scale` presente, `actool` pasa al esquema
  antiguo por tallas y exige el juego completo de roles de `idiom: "watch"`
  (38/40/42/44/45/49/51 mm). La forma moderna es una sola entrada `universal` con
  `platform: watchos` y 1024×1024. Y nada de `appearances`: watchOS no tiene icono claro y oscuro.
- **El acento del reloj es el violeta claro** (`#b3a8ff`), no el `#5c4ade` de iOS: watchOS no tiene
  modo claro, así que el valor universal es el único que se ve, y el oscuro sobre la esfera negra
  es casi ilegible. Comprobado en el simulador.
- `ASSETCATALOG_COMPILER_APPICON_NAME` **ya lo pone xcodegen** por defecto en los targets
  `application`; lo que había que cambiar era el
  `ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: ""`, que estaba vacío justo para callar el aviso
  de acento ausente.

### 3.2 Dos App Groups, no uno

Un App Group **no cruza dispositivos**: iPhone y reloj son dos aparatos con dos *sandboxes*.

- `group.com.petai.app` — iPhone: la app y `PockaiWidgets` (fase 5).
- `group.com.petai.app.watchkitapp` — reloj: la app del reloj y sus complicaciones.

El salto entre los dos lo hace WatchConnectivity, nunca un fichero compartido.

## 4. El resumen (`WristSnapshot`)

| Campo | Para qué |
|---|---|
| `rev` | La revisión del estado del núcleo. El reloj **descarta** un resumen cuyo `(rev, generatedAt)` sea anterior al que ya tiene: WatchConnectivity no garantiza el orden de entrega |
| `generatedAt`, `staleAt` | Frescura. A los 30 minutos el reloj pinta las constantes apagadas con «Visto a las HH:MM» en lugar de proyectar el deterioro, que es cosa del servidor |
| `signedIn` | Sin sesión el reloj solo sabe pedir que se abra el iPhone |
| `pet` | El [`PetGlance`](../../crates/pockai-core/src/care.rs) que ya existía y que ya lee el widget de iOS |
| `surfaces` | Las cuentas atrás con hora de fin conocida, las mismas de la Live Activity |
| `buttons` | Qué se puede hacer ahora, con su motivo si está gris. Lo decide Rust, nunca Swift |

`pet` ya no es el `PetGlance` pelado: es un `WristPet` que lo **envuelve** (`#[serde(flatten)]`, así
que el JSON sigue plano) y le suma lo que solo la muñeca necesita: `speciesId` y `stage` para elegir
el sprite, `element` para teñir, `xp`/`xpNeeded` para el anillo de nivel, `bonding`, y `lowest`/
`lowestValue`, la constante que peor está. **No se ensancha `PetGlance`** porque lo escribe el widget
de iOS en su App Group y lo lee con campos no opcionales: una clave obligatoria nueva dejaría sin
decodificar lo ya guardado y el widget se caería a «Abre Pockai».

El monedero va **empaquetado** (`wallet: { coins, gems }`) y no suelto, para que `should_send` lo
cubra con una sola comparación; un campo de primer nivel que no esté en esa comparación cambiaría sin
que el iPhone lo mandara nunca.

El ánimo sale de `pet_glance`, que sigue los mismos umbrales que los avisos (`pet_needs`): no hay dos
criterios en la app. Un resumen real ocupa algo más de un kilobyte, y hay un test que lo mantiene por
debajo de 4 KB.

### 4.1 El arte (desviación del paso 5.5, revisada)

La spec decía «sin sprites: símbolos del sistema». Ya no: el reloj dibuja **el Pockai del jugador**
y usa **el set de iconos propio** de la casa, los mismos 49 SVG que pintan el escritorio y el móvil.

`scripts/generate-watch-assets.ts` (`pnpm generate:watch-assets`) hornea el catálogo y se commitea:

| Qué | De dónde | Cuántas |
|---|---|---|
| `pockai/<especie>_<etapa>_<pose>` | `shared/assets/species/**` con `bakePixels` | 16 × 4 etapas × 5 poses |
| `item/<id>` | `shared/assets/items/*.png`, tal cual | 13 |
| `ui/<nombre>` | `shared/ui/src/icons/*.outline.svg`, aplanado y rasterizado | 15 |
| `element/<flujo>` | `GUIA_ARTISTICA.md` §3.6 | 7 |

Las cinco poses son **los cinco `mood` que decide `care.rs`** (`idle`, `sleep`, `sick`, `sad`,
`hungry`), ni una más: el reloj no anima nada, así que `eat` o `happy` serían láminas sin público.

Cuatro cosas que costaron un rato y conviene no volver a descubrir:

1. **El catálogo va en `WatchArt/`, no en `Shared/`.** `Shared/` está en las `sources` de los cuatro
   targets: ahí dentro metería las láminas del reloj en la app de iPhone y en su widget. Y hacen
   falta **dos copias** (está declarado en los dos targets de watchOS) porque una extensión de
   WidgetKit no lee los assets de la app que la contiene.
2. **Los SVG del set hay que aplanarlos.** Usan `currentColor`, `var(--icon-bg, transparent)` y
   `var(--icon-accent, …)`, que ningún rasterizador resuelve. Se sustituyen y se rasterizan con
   `@resvg/resvg-js`; el catálogo los marca `template-rendering-intent`, así que el color lo pone
   SwiftUI. No se mete SVG crudo: el importador de Xcode es quisquilloso y un fallo rompe el build.
3. **Los imagesets declaran `"scale": "2x"`.** Sin eso Xcode los trata como talla única y mapea
   píxel a punto: un sprite de 92 px saldría midiendo 92 pt.
4. **Las carpetas llevan `provides-namespace`.** Si no, `Image("pockai/ignisaur_baby_idle")` no
   encuentra nada; y haría falta igual, porque hay un `ui/hatch` y un `pockai/egg_idle`.

**Lo que sigue fuera**: el sprite usa la **paleta por defecto de la especie**, no la del jugador. Sin
shiny, sin accesorios y sin `visualSeed`: para eso habría que hornear en el iPhone y mandar la lámina
dentro del resumen.

## 5. Cuándo se actualiza (no hay push)

El backend no tiene endpoint para registrar tokens de push (spec 43 §5), así que al reloj no se le
puede despertar desde el servidor. Todo va sobre horas absolutas.

| Momento | Camino |
|---|---|
| iPhone abierto y cambia el estado | El bucle `watch_surfaces` de `ios.rs` llama a `PockaiWristLink.push()` → `updateApplicationContext`. Sigue `Pets`, `ActivePetId`, `Eggs` y, desde que los botones dependen de la mochila y el resumen lleva monedero, también `Inventory` y `User` |
| Se abre la app del reloj | `sendMessage` con `refresh`, que **despierta el proceso del iPhone**. Es la única vía fiable de «refrescar ahora» |
| iPhone en segundo plano | El `BGAppRefreshTask` del paso 4.8 ya llamaba a `care_sync`; ahora además empuja el resumen |
| Complicación con la app del reloj cerrada | `transferCurrentComplicationUserInfo`, con el presupuesto comprobado (50 al día, en `remainingComplicationUserInfoTransfers`) |
| Avisos de cuidado | El iPhone refleja sus notificaciones locales en el reloj cuando está bloqueado |
| Nada de lo anterior | El último resumen, apagado, con su hora |

Qué sale y qué no lo decide el núcleo: `pockai_wrist_push` devuelve nulo si no ha cambiado nada que se
vea, con un hueco mínimo de 15 segundos (`should_send`, con test). Es la misma idea que
`surfaces_diff`.

**Aviso sobre las complicaciones.** Hay informes de que `transferCurrentComplicationUserInfo` no
refresca las complicaciones de WidgetKit, y un ingeniero de Apple lo ha llamado un fallo del
framework. Por eso el diseño no depende de ese camino: la complicación se construye con una *timeline*
desde el resumen guardado en el App Group del reloj (una entrada ahora, otra en cada hora de fin y
otra en `staleAt`) y se recarga con `WidgetCenter.reloadAllTimelines()` cuando la app del reloj recibe
contexto. La transferencia dirigida es un extra.

## 6. Los cinco botones

Todos sobre `Action` del núcleo. No se abre ninguna pasarela nueva.

| Botón | `Action` | Cuándo va gris |
|---|---|---|
| Dar de comer | `Feed { pet_id, item_id }` | Durmiendo, o sin comida en la mochila |
| Bañar | `Clean { pet_id }` | Durmiendo, o con la higiene ya en 80 (lo rechazaría el backend) |
| A dormir / Despertar | `Sleep` / `Wake` | Nunca: es un botón que alterna según cómo esté |
| Curar | `Heal { pet_id, item_id }` | Durmiendo, o sin medicina que sirva |
| Evolucionar | `Evolve { pet_id }` | Durmiendo, si no es adulta, si le falta nivel 50 o si no hay Piedra de Evolución |

El reloj manda `{"action":"feed"}` **sin ítem**: el `item_id` lo resuelve Rust con el inventario,
prefiriendo la comida favorita de la especie y, si no la hay, la más corriente. El reloj no conoce la
mochila ni debería. Lo que sí recibe es **qué objeto se eligió** (`itemId` e `itemName` en el botón),
para pintar la Baya Ígnea en vez de un cubierto genérico; eso no le da conocimiento nuevo de la
mochila, porque la decisión ya está tomada.

Dos reglas de la elección que no son obvias:

- **Curar no se cierra por «no está enferma».** El backend (`pets.service.ts`, `heal()`) no lo exige:
  pide una medicina con `kind == "medicine"` y `effects.curesSick` **o** `effects.health > 0`.
  Cerrarlo por `sick` escondería el botón justo en el caso útil, la salud baja sin enfermedad.
- **Ni «la más barata» a secas.** El Néctar del Origen vale cero en las dos monedas porque no se
  vende (`availability: "hidden"`) y lo cura todo: esa regla gastaría el objeto más raro del juego
  desde la muñeca y sin preguntar. Primero lo que se vende, lo más corriente de ello; lo que no se
  vende, solo si no hay otra cosa.

**Siri.** Los mismos cinco, como `AppIntent` en `PockaiWatchIntents.swift`, que mandan exactamente la
misma intención. Lo delicado no es la disponibilidad (App Intents es watchOS 9+) sino que **el
sistema puede lanzar un intent con la app sin arrancar**: por eso no reutilizan `PockaiWatchStore`,
sino que activan su propia `WCSession` y **esperan** a `activationDidCompleteWith` antes de mandar.
Sin alcance van a la cola y lo dicen, en lugar de contestar «hecho».

**El doble pinch** (`.handGestureShortcut(.primaryAction)`, watchOS 11) va en **un solo botón de toda
la escena**: `TabView(.verticalPage)` mantiene vivas las cuatro páginas a la vez y dos
`.primaryAction` compitiendo dejan el comportamiento indefinido. Se aplica con `if #available` y **no
se sube el deployment target**: watchOS 11 dejaría fuera Series 4, 5 y SE.

**Lo que no está, y por qué:**

- **Dar un mimo** no existe en el backend. Las únicas acciones de mascota son `feed`, `clean`, `sleep`,
  `wake`, `evolve`, `use-item`, `heal`, `activate` y tres `PATCH`: el vínculo sube como *efecto* de
  esas interacciones, no hay ruta de caricia, y el backend no cambia.
- **La recompensa diaria** se quedó fuera: las misiones no están en el `AppState`, así que ofrecerla
  obligaría a consultar al servidor para decidir si pintar un botón, y el resumen dejaría de ser una
  función pura del estado. Entra el día que el estado lleve las misiones.

### El camino de una acción

```
Botón SwiftUI → sendMessage si hay alcance; si no, transferUserInfo (la cola del sistema)
  → PockaiWristLink.handle → pockai_wrist_perform
  → wrist::resolve(intención, estado, ahora, vistos) -> Action
  → core.perform → backend → state_on_response
  → vuelve el resumen nuevo por el replyHandler y por applicationContext
```

Tres defensas, las tres con test:

1. **`request_id`**: el núcleo recuerda los últimos 32 y descarta repetidos. `transferUserInfo` puede
   entregar dos veces tras un reinicio, y pagar dos manzanas por un doble envío se nota.
2. **Caducidad**: con más de 30 minutos, el iPhone la descarta. Dar de comer media hora tarde puede ser
   lo contrario de lo que el jugador quería. Un reloj **adelantado** no se penaliza: solo cuenta el
   retraso.
3. **El mismo juez**: `resolve` vuelve a mirar `buttons()`, así que el reloj no puede colar una acción
   que su propia pantalla enseñaba en gris.

Mientras se espera, lo que se ve **no se toca**: los números que pinta el reloj son los del iPhone.

## 7. Cómo se compila e instala

El reloj no sale del `tauri ios build` (§3.1, punto 2), así que son dos comandos:

```bash
# 1. La app de iPhone, como siempre
pnpm --filter petai-desktop exec tauri ios build --debug --target aarch64-sim

# 2. El reloj: lo compila con su propio SDK y lo mete dentro del Pockai.app que dejó el paso 1
scripts/build-watch-app.sh                       # --device para hardware
```

El segundo paso es el que hace que el iPhone dé el reloj por instalado (`appInstalled: YES` en
`WCSession`) y lo instale en el reloj emparejado. Sin él, el iPhone ve `appInstalled: NO`, el
contexto no se entrega y el reloj se queda en «Abre Pockai en el iPhone» para siempre.

Y el arte, cuando cambien los sprites o los iconos:

```bash
pnpm generate:watch-assets     # el catálogo del reloj (§4.1); se commitea
pnpm generate:app-icons        # el icono de marca de las cuatro apps
```

**Para probar con el App Group hay que firmar.** Con `CODE_SIGNING_ALLOWED=NO` no se embeben los
*entitlements*, así que el grupo `group.com.petai.app.watchkitapp` no existe y la complicación no
puede leer el resumen. En la CI da igual (solo compila); en el simulador, no.

## 8. Cómo se prueba

| Qué | Cómo | Estado |
|---|---|---|
| La política: resumen, botones, elección de comida y medicina, puertas de la evolución, caducidad, repetidos, throttle, complicación y que no se filtran tokens | `cargo test -p pockai-core` (21 tests en `wrist.rs`) | ✅ |
| Los tipos de Swift no se han separado de los de Rust | `Tests/PockaiWristFixture.swift` sobre el fixture que escribe Rust | ✅ (en la CI) |
| Que compila | `cargo check --workspace` y `xcodebuild -target PockaiWatch -sdk watchsimulator` | ✅ (en la CI) |
| Que el set de iconos cumple su spec | `node .claude/skills/pockai-ui-icons-architect/scripts/check_icons.mjs` | ✅ |
| La acción entera contra el backend real | `POCKAI_E2E_URL=… cargo test -p pockai-core --test backend_real -- --ignored el_reloj` | ✅ |
| El resumen cruzando de verdad a un reloj | Simulador emparejado, con la app de iPhone y el backend local | ✅ |
| Las cuatro pantallas, con el sprite y los iconos | Simulador de reloj, con un resumen puesto a mano en el App Group (§8.1) | ✅ |
| Pulsar los botones en el reloj | A mano, en el simulador o en hardware | ⬜ |
| La complicación en una esfera | A mano | ⬜ |
| Un atajo de Siri | A mano | ⬜ |
| Hardware de verdad | iPhone + Apple Watch emparejados | ⬜ |

Regenerar el fixture cuando cambie el contrato:

```bash
cargo test -p pockai-core fixture_del_reloj -- --ignored
```

**El test de Swift compara clave a clave**, no solo decodifica. Hacía falta: `JSONDecoder` ignora en
silencio las claves que no conoce, así que un campo que Rust añadiera y Swift no declarase pasaba en
verde. Ahora el fichero se parsea también como diccionario y se comparan los dos conjuntos de claves;
si falta una, el error dice cuál y dónde.

### 8.1 Ver las pantallas sin un iPhone

El reloj pinta lo que haya en su App Group, así que se le puede poner un resumen a mano y mirar las
cuatro páginas sin levantar el iPhone ni el backend:

```bash
scripts/build-watch-app.sh                  # firmado: si no, no hay App Group
xcrun simctl install <reloj> /tmp/.../PockaiWatch.app
# el resumen, como Data bajo `pockai.wrist.snapshot`, en
# <dispositivo>/data/Containers/Shared/AppGroup/<id>/Library/Preferences/group.com.petai.app.watchkitapp.plist
xcrun simctl launch <reloj> com.petai.app.watchkitapp
xcrun simctl io <reloj> screenshot /tmp/reloj.png
```

No sustituye a pulsar los botones (§9.1): comprueba lo que se dibuja, no lo que se manda.

## 9. Lo que falta

1. **Pulsar los botones y ver la complicación en una esfera.** El camino de la acción está probado de
   punta a punta contra el backend (§8), pero el toque en sí no: driver el simulador de watchOS desde
   la terminal no se puede sin dar permisos de accesibilidad.
2. **Hardware.** `isReachable`, el comportamiento de `transferUserInfo` y el presupuesto de
   complicaciones solo se comprueban de verdad en un iPhone y un Apple Watch reales. Hace falta un
   Team ID (`APPLE_DEVELOPMENT_TEAM`).
3. ~~Automatizar el empaquetado del reloj dentro de la app~~: `scripts/build-watch-app.sh` (§7).
4. ~~El job de CI~~: `ios-tauri` compila el reloj y corre la comprobación del contrato.
5. **Mirar la muñeca en el paso 5.7** (§1): puede que la mitad de esto ya la diera el reflejo
   automático.
6. **Las demás cuentas atrás**: hoy `surfaces()` solo publica el huevo. La visita, el sueño y la
   aventura entran cuando el estado lleve su hora de fin (ya anotado en el paso 5.1).
7. **El sprite del jugador, no el de la especie** (§4.1): shiny, accesorios y paleta propia piden
   hornear en el iPhone y mandar la lámina dentro del resumen.
