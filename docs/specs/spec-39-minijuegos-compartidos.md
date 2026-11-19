# Spec 39: minijuegos compartidos, mejoras y Pruebas de los Seis Flujos

Documento autocontenido. Define **dónde viven los minijuegos** (un paquete compartido por todos los
clientes y por el servidor), **qué fallaba**, **cómo se valida una partida**, **las mejoras de los
tres juegos clásicos** y **seis juegos nuevos** ligados al lore de los elementos.

Estado: **fases 1 y 3 hechas; fases 2 y 4, en parte** (Android con el embed, variantes accesibles,
pausa, las seis Pruebas, el Pockai dentro del juego y arte propio, sí; la Semilla del día, iOS y
modding, no). El detalle está en la sección 8. Los juegos se diseñan con la skill
`pockai-minigame-architect`; el brief de cada uno está en `docs/minijuegos/<id>.md`.

## 1. Punto de partida (análisis)

| Pieza | Dónde | Nota |
|---|---|---|
| Sesiones, recompensas, antitrampas | `backend/src/modules/minigames/minigames.service.ts` | El servidor emitía semilla y duración; el cliente solo enviaba la puntuación final |
| Reglas numéricas | `shared/game-data/balance.json` → `minigames` | Duración, duración mínima, techo de puntos por segundo, recompensas |
| Variantes accesibles | `shared/game-data/accessibility.json` → `minigames`, `GET /accessibility/minigames/accessible` | Ningún cliente las usaba |
| Juegos de escritorio | `desktop/src/components/games/*.svelte` | Reglas «canónicas» |
| Juegos de Android | `mobile/android/.../ui/play/MiniGames.kt` | Reimplementación a mano, con otras reglas |
| iOS | — | No existe todavía |
| Modding | `minigameUrl` en `modding.schemas.ts` | Sin contrato de juego detrás |

### Problemas encontrados y cómo quedan

| # | Problema | Estado |
|---|---|---|
| 1 | La misma semilla daba partidas distintas: escritorio usaba mulberry32 y Android `kotlin.random.Random(seed)`, con reglas distintas en los tres juegos | **Resuelto**: un único núcleo para todos (§2); Android usa el embed |
| 2 | Android podía romper el techo de `reflex` (objetivos cada 0,25 s, más de 2 pt/s) | **Resuelto**: Android ya no tiene reglas propias |
| 3 | `memory_match` recortaba partidas perfectas (24 puntos con techo de 1 pt/s) y rechazaba como «corta» una partida perfecta de menos de 15 s | **Resuelto**: techo 3 pt/s y duración mínima 8 s (24 ≤ 3 × 8) |
| 4 | Android jugaba Reflejos con cualquier id desconocido (`else -> ReflexGame`) | **Resuelto**: el embed avisa con `error` |
| 5 | `listGames()` no devolvía `energyCost`; el aviso de energía del escritorio nunca salía | **Resuelto** |
| 6 | `minigame:finished` no llevaba `gameId` | **Resuelto** |
| 7 | El catálogo estaba en mapas a mano en cada cliente | **Resuelto**: registro único (`registry.ts`) |
| 8 | Arte de emoji; el Pockai no aparece en sus juegos | **Resuelto**: arte propio y la mascota del jugador dentro (§2.6) |
| 9 | El servidor no podía verificar la partida, solo acotarla | **Resuelto**: repite la partida (§3) |
| 10 | Las variantes accesibles no las usaba nadie | **Resuelto**: «Modo accesible» en escritorio y Android |

## 2. Arquitectura: `@pockai/minigames`

Mismo patrón que `@pockai/scene`: el escritorio importa el código fuente; Android (e iOS) cargan el
bundle `dist/embed/` en un WebView y hablan con él por un puente JSON; **el backend importa solo la
lógica** (`@pockai/minigames/logic`, compilada a CommonJS en `dist/node/`).

```
shared/minigames/
  index.html, vite.config.ts      página embed (`build:embed` → dist/embed/; `?demo=<id>&easy` para probar)
  tsconfig.node.json              lógica → CommonJS para el backend (`build:node`, también en postinstall)
  src/core/rng.ts                 mulberry32 + Fisher-Yates (misma secuencia en todos los motores JS)
  src/core/types.ts               GameDefinition, GameInput, variantes, ticks
  src/core/runner.ts              bucle a paso fijo (60 ticks/s), cola de entradas, registro, replay()
  src/core/log.ts                 registro empaquetado [Δtick, kind, ...valores] y su validación
  src/games/<id>.ts               lógica pura de los 9 juegos: init / input / step / score / over
  src/logic.ts                    entrada sin DOM (lo que importa el backend)
  src/views/<id>.ts               vista DOM sin framework (botones reales: teclado y lector de pantalla)
  src/registry.ts                 id → definición + vista + icono + instrucciones
  src/host.ts                     mountMinigame(el, opts) → { pause, resume, dispose }
  src/protocol.ts                 mensajes anfitrión ⇄ juego, MINIGAME_PROTOCOL_VERSION = 2
  src/bridge.ts, src/embed/       puente Android/iOS/iframe y entrada del bundle
```

**Por qué vistas DOM y no PixiJS.** Conservan la accesibilidad (botones con `aria-label`, Tab +
Enter, avisos `aria-live`) y el bundle sigue siendo pequeño (~90 KB con el arte). La mascota no
necesitó PixiJS: se hornea con `@pockai/scene/bake` en un canvas suelto (§2.6).

### 2.1 Determinismo

- Todo el azar sale de `createRng(seed)`. Nunca `Array.sort` con comparador aleatorio: cada motor
  (V8, JavaScriptCore) lo resuelve distinto y la partida dejaría de poder repetirse.
- El tiempo de juego son **ticks** de 1000/60 ms, no el reloj de pared. El runner convierte el
  tiempo real en ticks y aplica las entradas al inicio del tick siguiente.
- Cada entrada se registra con su tick. `replay(def, opts, log, maxTicks?)` reproduce la partida y
  devuelve la misma puntuación.
- Las entradas continuas (posición del puntero) se funden por tick (`coalesce`) y se redondean, para
  que el registro sea pequeño: una partida de 45 s cabe en ~30 KB de JSON.

### 2.2 Protocolo del embed (v3)

Anfitrión → juego: `start { gameId, seed, durationSeconds, variant?, reducedMotion?, pet? }`, `pause`,
`resume`, `dispose`.
Juego → anfitrión: `ready { protocol }`, `score { score }`, `paused { paused }`,
`finished { gameId, score, ticks, log }`, `error { message }`.

Android: `addJavascriptInterface(obj, "AndroidBridge")` y `window.pockaiMinigame.receive(<json>)`
(`MinigameView.kt`, tarea Gradle `syncPockaiMinigames`). iOS: `webkit.messageHandlers.pockai`.

### 2.3 Pausa

El juego se pausa solo al perder el foco u ocultar la ventana (en el WebView, cuando la app pasa a
segundo plano) y muestra «En pausa — Seguir». Como la sesión del servidor caduca a los 300 s, tras
**2 minutos** en pausa la partida termina con lo conseguido (`MAX_PAUSE_MS`), para no perderla.

### 2.4 Datos

Las reglas de recompensa, el techo, el elemento y los premios en objeto están en `balance.json`; las
variantes, en `accessibility.json`. `scripts/validate-game-data.js` exige variante accesible para
cada juego, un elemento real para las Pruebas y que el objeto de `itemDrop` exista en `foods.json`.
Un test del paquete exige que lógica, registro y `balance.json` tengan los mismos juegos.

### 2.5 Techo comprobado

`games.spec.ts` lee `balance.json` y, para cada juego y variante, juega cientos de semillas con un bot
perfecto (reacción en 1 tick, nunca falla) comprobando en cada tick:

```
score(t) ≤ maxScorePerSecond × max(t, minDurationSeconds)
```

Un cambio de reglas que rompa el techo falla en CI (job de escritorio).

### 2.6 La mascota dentro del juego y el arte

- `start.pet` (v3, opcional): `{ species, stage?, palette?, pattern?, visualSeed? }`. Sin él sale la
  especie por defecto, así un anfitrión antiguo sigue jugando.
- `src/pet.ts` hornea la hoja y la anima; la vista la recibe en `ctx.pet` (`play`, `face`). **La
  lógica no recibe la mascota**: no cambia reglas ni puntuación, y el servidor repite la partida sin ella.
- Las hojas no van en el bundle: el escritorio pasa un `resolvePetSheet` con su registro y el embed
  las pide a `../species/…` (los assets compartidos de la app en Android).
- El arte de cada juego (piezas y fondo) está en `shared/assets/minigames/<id>/`
  (`docs/ART_PIPELINE.md` §11).

## 3. Validación en el servidor (fase 3)

1. `POST /minigames/:id/start { petId, variant? }`: el servidor guarda la **variante** en la sesión
   (`MinigameSession.variant`, migración `20261124100000_minigame_variant`) junto a la semilla.
2. `POST /minigames/sessions/:id/finish { score, ticks, log }`:
   - Las defensas de siempre: un solo uso, caducidad, duración mínima, techo por segundo.
   - `ticks` no puede superar la duración ni el tiempo real transcurrido (no se juega más rápido
     que el reloj).
   - `log` se desempaqueta y valida entrada a entrada (tipo conocido, valores numéricos, tope de
     tamaño). Uno mal formado se rechaza entero.
   - El servidor **repite la partida** con la semilla y la variante de la sesión y solo la acepta si
     da la misma puntuación y los mismos ticks. La respuesta lleva `verified: true`.
3. **Cuándo es obligatorio el registro.** Para las seis Pruebas (juegos con `element`), siempre: no
   hay clientes antiguos que las jueguen bien (un Android antiguo las mostraría y jugaría Reflejos
   en su lugar). Para los tres clásicos, solo si `balance.minigames.requireReplay` es `true`; mientras
   sea `false` se aceptan sin registro (`verified: false`) por los clientes antiguos. **Hasta
   activarlo, la repetición no frena las trampas en los clásicos**: basta con no enviar registro.
   Un juego puede forzarlo con su propio `requireReplay`.

El cliente ya **no recorta** la puntuación: la envía tal cual con su registro.

**Desarrollo local.** El backend carga la lógica compilada (`shared/minigames/dist/node`). Se
regenera en `pnpm install` y en `build`, `start`, `start:dev` y `start:debug` del backend. Si se
arranca de otra forma (p. ej. `ts-node src/main.ts`) tras cambiar un juego, hay que ejecutar antes
`pnpm --filter @pockai/minigames build:node`, o el servidor rechazará las partidas por no coincidir.

## 4. Reglas de los juegos clásicos

| Juego | Duración | Regla | Techo | Variante accesible |
|---|---|---|---|---|
| `catch_food` Cosecha del Éter | 45 s (mín. 20) | El Pockai recoge frutos de los Flujos: +1, +2 si es de la marea (cambia cada 15 s), +1 cada 5 seguidos; el polvo estático rompe la racha y lo deja 0,75 s sin recoger | ≤ 2,8 pt/s < 3 | caída a la mitad, zona de recogida ×3 |
| `memory_match` Cristal de Recuerdos | 90 s (mín. 8) | Destello inicial de 2 s; 8 parejas × 2 + bonus (≤ 8) − fallos/3 | máx. 24 ≤ 3 × 8 | 4 parejas, destello de 3 s; brilla la pareja de la faceta destapada |
| `reflex` Pesca de Códices | 30 s (mín. 10) | Aflora algo cada 1,0–1,4 s, dura 0,9 s; Códice: 2 pt si < 0,4 s, si no 1; 1 de cada 5 es un señuelo que enreda el sedal 1 s | ≤ 2 pt/s | el Códice espera; 1 pt siempre; sin señuelos |

Los tres se rediseñaron con lore, arte propio y la mascota dentro; el detalle de cada uno y la cuenta
de su techo están en `docs/minijuegos/<id>.md`. La Cosecha suelta una Manzana Crujiente (40 % con 75
puntos o más). Las seis Pruebas conservan sus reglas y estrenan arte y mascota.

## 5. Las Pruebas de los Seis Flujos

Cada elemento del Éter (LORE §4) tiene su prueba. **Afinidad**: si la especie del Pockai es de ese
elemento, la partida da +25 % de felicidad (`elementAffinityBonus`). Nunca puntos ni monedas, para no
romper las clasificaciones.

| id | Elemento | Mecánica | Duración | Techo | Accesible |
|---|---|---|---|---|---|
| `pulso_voltaico` | Eléctrico | Ritmo en 3 carriles; perfecto (±4 ticks) 2 pt, bien (±9) 1. Tempo 90–130 BPM de la semilla | 40 s (mín. 15) | notas a ≥ 55 ticks → ≤ 2,2 pt/s; techo 3 | caída ×1,5 más lenta, ventanas ×3 |
| `corriente_datos` | Agua | 4 carriles; paquete +1, bloque corrupto = 1 s aturdido. Más rápido cada 15 s | 45 s (mín. 20) | una fila con un paquete cada 0,5 s → 2 pt/s | corriente a la mitad, sin aturdimiento |
| `raiz_fractal` | Planta | Girar raíces para llevar la savia de la semilla al borde derecho; 4×4 → 5×5 → 6×6 | 90 s (mín. 20) | 5 pt por tablero y 1,5 s de floración entre tableros → 3,3 pt/s; techo 4 | resalta la siguiente pieza mal girada |
| `cifrado` | Sombra | Repetir la secuencia de glifos; cada ronda +1; un fallo repite la secuencia | 60 s (mín. 15) | solo puntúa la primera vez cada posición, y la ronda se reproduce entera antes (≥ 42 ticks/glifo) → 1,43 pt/s; techo 2 | reproducción ×1,5 más lenta y botón «Repetir secuencia» |
| `faro_claridad` | Luz | Rejilla 8×6 a oscuras; el haz quieto 0,5 s sobre un bit corrupto lo purifica; la corrupción se extiende y al 60 % acaba la partida | 45 s (mín. 20) | 1 casilla y 30 ticks por bit → 2 pt/s | propagación a la mitad |
| `forja_termica` | Fuego | Un botón: avivar sube la temperatura, se enfría sola; 3 s en la franja = pieza (+4); pasar de 96° la quema | 45 s (mín. 15) | 4 pt / 3 s = 1,34 pt/s; techo 1,5 | franja ×2, enfriamiento a la mitad |

**Premio de la Forja**: con 40 puntos o más, 50 % de probabilidad de una Baya Ígnea (`spicy_berry`)
al inventario (`itemDrop` en `balance.json`). Lo decide el servidor tras validar la partida.

Controles: todas admiten ratón, teclado y táctil (carriles con J K L / flechas / 1 2 3; Cifrado con
1–6; Forja mantener pulsado o Espacio).

## 6. Clientes

- **Escritorio** (`MinigamesTab.svelte`, `MinigameHost.svelte`): lista desde el servidor filtrada
  por los juegos que conoce el paquete, insignia del elemento (marca «afín» si coincide con la
  especie), interruptor **Modo accesible** (preferencia del equipo), envío de `ticks` y `log`, y
  aviso de objeto ganado y de afinidad en el resultado.
- **Android** (`MinigameView.kt`, `PlayScreen.kt`): el WebView carga el embed; la app envía `start`
  al recibir `ready` (y comprueba la versión del protocolo), pausa en `ON_PAUSE`, y manda `ticks` y
  `log` al servidor. Mismo interruptor de modo accesible. `MiniGames.kt` se eliminó.
- **iOS**: pendiente de la app; usará el mismo embed con `webkit.messageHandlers.pockai`.

## 7. Fuera de alcance

- Multijugador en tiempo real.
- Monetización dentro de los minijuegos.

## 8. Fases

| Fase | Contenido | Hecho | Pendiente |
|---|---|---|---|
| 1 | Paquete compartido con los 3 juegos; escritorio conectado; `energyCost`; `gameId` en el evento; techo de Parejas; validación de variantes | Todo | — |
| 2 | Android con el embed; mejoras de §4 | Android usa el embed (`MiniGames.kt` eliminado); variantes accesibles conectadas; pausa con límite; glifos de elementos en Parejas; reacción media en Reflejos | Récord personal y desglose; misiones y logros por juego (el evento ya lleva `gameId`); sonido y vibración; dos objetivos a la vez en Pesca de Códices; el fondo de Cristal de Recuerdos y las piezas de Forja Térmica (prompts listos, sin generar) |
| 3 | Validación por repetición en el servidor | Variante en la sesión, registro empaquetado, repetición y comparación; obligatoria en las Pruebas | Activar `requireReplay` para los clásicos cuando no queden clientes antiguos |
| 4 | Pruebas, Semilla del día, iOS, modding | Las seis Pruebas con afinidad y premio de la Forja, en escritorio y Android | Semilla del día con clasificación; iOS (no hay app); minijuegos de modding sobre `GameDefinition`; ecos en Cifrado |

**Decisión abierta**: la variante accesible se elige libremente al empezar y da las mismas
recompensas (spec 32). En varios juegos es más fácil puntuar con ella, así que puede usarse para
ganar más monedas. Opciones: aceptarlo (accesibilidad sin castigo), o topar las monedas de la
variante `easy` por debajo del máximo normal.
