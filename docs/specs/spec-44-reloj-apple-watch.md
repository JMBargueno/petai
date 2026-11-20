# Spec 44: app de Apple Watch compañera del iPhone

Documento autocontenido. Define **qué es el reloj dentro de la arquitectura** (una superficie de
lectura y tres gestos, no un cliente), **qué le llega y cómo**, **qué le puede mandar al iPhone** y
**qué falta**.

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
| Dar de comer, bañar o dormir desde el reloj | No | Sí |

## 2. Qué es y qué no es

El reloj es una **superficie**, como el widget de la pantalla de inicio: el núcleo decide y el nativo
dibuja.

**No es**, y conviene que quede escrito:

- **No es una app de Tauri.** Tauri 2 no tiene target watchOS.
- **No reutiliza nada de la UI.** watchOS no tiene WKWebView, así que `@pockai/mobile`, `@pockai/ui` y
  `@pockai/scene` no entran. Todo es SwiftUI escrito a mano, y pequeño a propósito: unas 400 líneas.
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
| Complicaciones | `desktop/src-tauri/gen/apple/PockaiWatchComplications/` |
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

Y una más: `WKApplication = true` (el target único de watchOS moderno; la clave antigua
`WKWatchKitApp` no vale) y `WKCompanionAppBundleIdentifier = com.petai.app`.

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

El ánimo sale de `pet_glance`, que sigue los mismos umbrales que los avisos (`pet_needs`): no hay dos
criterios en la app. **Sin sprites**: símbolos del sistema, como el widget de iOS (desviación del paso
5.5). Un resumen real ocupa unos 440 bytes.

## 5. Cuándo se actualiza (no hay push)

El backend no tiene endpoint para registrar tokens de push (spec 43 §5), así que al reloj no se le
puede despertar desde el servidor. Todo va sobre horas absolutas.

| Momento | Camino |
|---|---|
| iPhone abierto y cambia el estado | El bucle `watch_surfaces` de `ios.rs` (que ya seguía `Pets`, `ActivePetId` y `Eggs`) llama a `PockaiWristLink.push()` → `updateApplicationContext` |
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

## 6. Los tres botones

Todos sobre `Action` del núcleo. No se abre ninguna pasarela nueva.

| Botón | `Action` | Cuándo va gris |
|---|---|---|
| Dar de comer | `Feed { pet_id, item_id }` | Durmiendo, o sin comida en la mochila |
| Bañar | `Clean { pet_id }` | Durmiendo, o con la higiene ya en 80 (lo rechazaría el backend) |
| A dormir / Despertar | `Sleep` / `Wake` | Nunca: es un botón que alterna según cómo esté |

El reloj manda `{"action":"feed"}` **sin ítem**: el `item_id` lo resuelve Rust con el inventario,
prefiriendo la comida favorita de la especie y, si no la hay, la más barata. El reloj no conoce la
mochila ni debería.

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

El reloj no sale del `tauri ios build` (§3.1, punto 2). Son dos pasos:

```bash
# 1. La app de iPhone, como siempre
pnpm --filter petai-desktop exec tauri ios build --debug --target aarch64-sim

# 2. El reloj, con su propio SDK
cd desktop/src-tauri/gen/apple
xcodebuild -project petai-desktop.xcodeproj -target PockaiWatch -configuration debug \
  -sdk watchsimulator -arch arm64 SYMROOT=/tmp/pockai-watch build

# 3. Meterlo dentro de la app de iPhone, que es lo que hace que el iPhone lo dé por instalado
#    (`appInstalled: YES` en WCSession) y lo instale en el reloj emparejado
cp -R /tmp/pockai-watch/debug-watchsimulator/PockaiWatch.app "<Pockai.app>/Watch/"
xcrun simctl install <iPhone> "<Pockai.app>"
```

Sin el paso 3, el iPhone ve `appInstalled: NO` y el contexto no se entrega: el reloj se queda en «Abre
Pockai en el iPhone» para siempre. Automatizar ese copiado (un script o un `postBuildScript`) está
pendiente.

## 8. Cómo se prueba

| Qué | Cómo | Estado |
|---|---|---|
| La política: resumen, botones, elección de comida, caducidad, repetidos, throttle, complicación y que no se filtran tokens | `cargo test -p pockai-core` (15 tests en `wrist.rs`) | ✅ |
| Los tipos de Swift no se han separado de los de Rust | `Tests/PockaiWristFixture.swift` sobre el fixture que escribe Rust | ✅ |
| Que compila | `cargo check --workspace` y `xcodebuild -target PockaiWatch -sdk watchsimulator` | ✅ |
| La acción entera contra el backend real | `POCKAI_E2E_URL=… cargo test -p pockai-core --test backend_real -- --ignored el_reloj` | ✅ |
| El resumen cruzando de verdad a un reloj | Simulador emparejado, con la app de iPhone y el backend local | ✅ |
| Pulsar los botones en el reloj | A mano, en el simulador o en hardware | ⬜ |
| La complicación en una esfera | A mano | ⬜ |
| Hardware de verdad | iPhone + Apple Watch emparejados | ⬜ |

Regenerar el fixture cuando cambie el contrato:

```bash
cargo test -p pockai-core fixture_del_reloj -- --ignored
```

## 9. Lo que falta

1. **Pulsar los botones y ver la complicación en una esfera.** El camino de la acción está probado de
   punta a punta contra el backend (§8), pero el toque en sí no: driver el simulador de watchOS desde
   la terminal no se puede sin dar permisos de accesibilidad.
2. **Hardware.** `isReachable`, el comportamiento de `transferUserInfo` y el presupuesto de
   complicaciones solo se comprueban de verdad en un iPhone y un Apple Watch reales. Hace falta un
   Team ID (`APPLE_DEVELOPMENT_TEAM`).
3. **Automatizar el empaquetado del reloj dentro de la app** (§7).
4. **El job de CI**: el `ios-tauri` corre en `macos-15`, así que puede compilar el reloj y correr la
   comprobación del fixture. Sin añadir todavía.
5. **Mirar la muñeca en el paso 5.7** (§1): puede que la mitad de esto ya la diera el reflejo
   automático.
6. **Las demás cuentas atrás**: hoy `surfaces()` solo publica el huevo. La visita, el sueño y la
   aventura entran cuando el estado lleve su hora de fin (ya anotado en el paso 5.1).
