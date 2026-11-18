# Spec 39: minijuegos compartidos, mejoras y Pruebas de los Seis Flujos

Documento autocontenido. Define **dónde viven los minijuegos** (un paquete compartido por todos los
clientes), **qué falla hoy**, **cómo mejorar los tres juegos existentes** y **seis juegos nuevos**
ligados al lore de los elementos.

Estado: **fase 1 implementada** (paquete `shared/minigames` con los tres juegos actuales, escritorio
conectado, arreglos de backend). Las fases 2–4 están en la sección 7.

## 1. Qué existe hoy (análisis)

| Pieza | Dónde | Nota |
|---|---|---|
| Sesiones, recompensas, antitrampas | `backend/src/modules/minigames/minigames.service.ts` | El servidor emite semilla y duración; el cliente solo envía la puntuación final |
| Reglas numéricas | `shared/game-data/balance.json` → `minigames` | Duración, duración mínima, techo de puntos por segundo, recompensas |
| Variantes accesibles | `shared/game-data/accessibility.json` → `minigames`, `GET /accessibility/minigames/accessible` | Ningún cliente las usa |
| Juegos de escritorio | `desktop/src/components/games/*.svelte` (hasta la fase 1) | Reglas «canónicas» |
| Juegos de Android | `mobile/android/.../ui/play/MiniGames.kt` | Reimplementación a mano, con otras reglas |
| iOS | — | No existe todavía |
| Modding | `minigameUrl` en `modding.schemas.ts` | Sin contrato de juego detrás |

### Problemas encontrados

1. **La misma semilla da partidas distintas.** Escritorio usa mulberry32; Android usa
   `kotlin.random.Random(seed)`. Además las reglas difieren:

   | Juego | Escritorio | Android |
   |---|---|---|
   | `catch_food` | 1 objeto cada 0,55 s, piedra 🪨 | 1 cada 0,45–0,85 s, bomba 💣, otra comida |
   | `memory_match` | carta vuelve a los 700 ms; 2 pt/pareja + bonus de rapidez − fallos/3 | 600 ms, otra fórmula |
   | `reflex` | objetivo cada 1,0–1,4 s; 2 pt si < 0,4 s, si no 1 | cada 0,25–0,8 s; 1 pt siempre |

   La semilla del servidor solo sirve de ficha de sesión: no hay forma de que dos clientes (ni el
   servidor) reproduzcan la misma partida.
2. **Android puede romper el techo de `reflex`.** Con objetivos cada 0,25 s se pasa de
   `maxScorePerSecond: 2`; la puntuación se recorta o el servidor la rechaza.
3. **`memory_match` recortaba partidas perfectas.** 8 parejas × 2 + 8 de bonus = 24 puntos con
   `maxScorePerSecond: 1`: si terminabas en menos de 24 s, el cliente recortaba y te robaba puntos.
   *Arreglado en fase 1*: `maxScorePerSecond: 2` (24 ≤ 2 × 15 s de duración mínima).
4. **Android juega Reflejos con cualquier id desconocido** (`else -> ReflexGame`).
5. **`listGames()` no devolvía `energyCost`**, así que el aviso «Sin energía suficiente» del
   escritorio nunca salía. *Arreglado en fase 1.*
6. **`minigame:finished` no llevaba `gameId`**: imposibles las misiones o logros por juego.
   *Arreglado en fase 1.*
7. **El catálogo está en tres mapas a mano** (`ICONS`, `COMPONENTS`, `HOW` en Svelte) más el `when`
   de Kotlin. Un juego nuevo obliga a tocar todos los clientes.
8. **Arte de emoji.** El Pockai no aparece en sus propios juegos y `foods.json` no se usa.
9. **El servidor no puede verificar la partida**, solo acotarla (techo por segundo, duración
   mínima, límite diario).

## 2. Arquitectura: `@pockai/minigames`

Mismo patrón que `@pockai/scene`: el escritorio importa el código fuente; Android e iOS cargan un
bundle `dist/embed/` en un WebView y hablan con él por un puente JSON.

```
shared/minigames/
  index.html, vite.config.ts      página embed y build (`build:embed` → dist/embed/)
  src/core/rng.ts                 mulberry32 + shuffle (misma secuencia que escena y escritorio)
  src/core/types.ts               GameDefinition, GameInput, InputLog
  src/core/runner.ts              bucle a paso fijo (60 ticks/s), cola de entradas, inputLog, replay()
  src/games/<id>.ts               lógica pura, sin DOM: init / input / step / score / over
  src/views/<id>.ts               vista DOM sin framework (botones reales: teclado y lector de pantalla)
  src/registry.ts                 id → definición + vista + icono + instrucciones + controles
  src/host.ts                     mountMinigame(el, opts) → { dispose }
  src/protocol.ts                 mensajes anfitrión ⇄ juego, MINIGAME_PROTOCOL_VERSION
  src/bridge.ts, src/embed/       puente Android/iOS/iframe y entrada del bundle
```

**Por qué vistas DOM y no PixiJS (todavía).** Los tres juegos actuales son DOM: así se conserva la
accesibilidad de Parejas (botones con `aria-label`, Tab + Enter) y el bundle es mínimo. La lógica
(`games/`) no sabe nada de la vista, así que cuando el Pockai entre en el juego (fase 2) se puede
añadir una vista PixiJS que use `PetSprite` de `@pockai/scene` sin tocar reglas ni tests.

### 2.1 Determinismo

- Todo el azar sale de `createRng(seed)`.
- El tiempo de juego son **ticks** de 1000/60 ms, no el reloj de pared. El runner convierte el
  tiempo real en ticks y aplica las entradas al inicio del tick siguiente.
- Cada entrada se guarda como `{ tick, ...input }`. `replay(def, opts, log)` reproduce la partida y
  devuelve la misma puntuación. Es la base de la validación en servidor (fase 3).

### 2.2 Protocolo del embed

Anfitrión → juego: `start { gameId, seed, durationSeconds, variant?, theme?, reducedMotion? }`,
`dispose`.
Juego → anfitrión: `ready { protocol }`, `score { score }`, `finished { gameId, score, ticks, inputLog }`,
`error { message }`.

Android: `addJavascriptInterface(obj, "AndroidBridge")` y `window.pockaiMinigame.receive(<json>)`.
iOS: `webkit.messageHandlers.pockai`. Sin anfitrión, `?demo=<gameId>` arranca una partida de prueba.

### 2.3 Datos

Las reglas de recompensa y el techo siguen en `balance.json`; las variantes, en
`accessibility.json`. `scripts/validate-game-data.js` exige que cada juego de `balance` tenga su
variante accesible, y un test del paquete exige que cada juego de `balance` tenga entrada en el
registro (y al revés).

### 2.4 Techo comprobado

El test `ceiling.spec.ts` lee `balance.json` y, para 500 semillas, juega con un bot perfecto
(reacción en 1 tick, nunca falla) y comprueba en cada tick:

```
score(t) ≤ maxScorePerSecond × max(t, minDurationSeconds)
```

Antes era un argumento en un comentario; ahora un cambio de reglas que rompa el techo falla en CI.

## 3. Reglas canónicas de los juegos actuales

Se toman las de escritorio, con táctil añadido (pointer events en todas las vistas).

| Juego | Duración | Regla | Por qué no supera el techo |
|---|---|---|---|
| `catch_food` | 45 s (mín. 20) | 1 objeto cada 0,55 s, 20 % piedras (−1, mínimo 0), comida +1 | ≤ 1,82 objetos/s × 1 < 3 pt/s |
| `memory_match` | 90 s (mín. 15) | 8 parejas × 2 + bonus (≤ 8) − fallos/3, al terminar | máx. 24 ≤ 2 × 15 |
| `reflex` | 30 s (mín. 10) | objetivo cada 1,0–1,4 s, dura 0,9 s; 2 pt si < 0,4 s, si no 1 | ≤ 1 objetivo/s × 2 = 2 pt/s |

## 4. Mejoras de los juegos existentes (fase 2)

### Transversales

- **El Pockai juega.** Vista PixiJS con `PetSprite`: en Atrapa la comida es él quien recoge; en
  Reflejos y Parejas celebra y se frustra. La partida ya emite `minigame_finished` por tiempo real.
- **Arte del juego**: comida en pixel art de `foods.json`, glifos de elementos en vez de emoji.
- **Variantes accesibles conectadas** a los ajustes de accesibilidad (ya existen en datos).
- **Pausa explícita** al perder el foco o minimizar. Desde la fase 1 el tiempo de juego avanza con
  `requestAnimationFrame`, así que ya se congela con la ventana oculta, pero sin aviso; y la sesión
  del servidor caduca a los 300 s (`sessionTtlSeconds`) aunque el juego esté parado. La pausa debe
  mostrarse y limitar su duración para no perder la partida.
- **Récord personal** por juego y desglose de la puntuación en el resultado.
- **Semilla del día**: misma semilla para todos durante 24 h, con clasificación propia. Es justa
  porque las partidas son deterministas.
- **Misiones y logros por juego**: ahora posible porque el evento lleva `gameId`
  (p. ej. «Saca 40 en Atrapa la comida», logro «Reflejos de Pulso Voltaico»).
- **Sonido y vibración** (táctil), respetando el movimiento reducido.
- **Afinidad**: si el elemento del Pockai coincide con el del juego, +25 % de felicidad y vínculo.
  Nunca puntos ni monedas, para no romper la clasificación.

### Atrapa la comida

- Dificultad creciente: la velocidad de caída sube con el tiempo; la frecuencia no (techo intacto).
- Rachas visibles (×3, ×5…) que dan felicidad extra al final.
- La comida favorita de la especie brilla y da felicidad (no puntos).
- Objeto «glitch» (estática del Éter) que invierte los controles 2 s.

### Parejas

- Cartas con los glifos de los 6 elementos y siluetas de especies descubiertas.
- Tablero según la variante (4×2 fácil, 4×4 normal, 6×4 experto con más duración).
- Bonus por racha sin fallos; modo pista en la variante accesible.

### Reflejos

- Señuelos de Sombra que no se deben pulsar (−1).
- En los últimos 10 s, dos objetivos a la vez (manteniendo ≤ 2 pt/s de media).
- Mostrar el tiempo medio de reacción en ms al terminar.

## 5. Juegos nuevos: las Pruebas de los Seis Flujos

Cada elemento del Éter (LORE §4) tiene su prueba. Son juegos que un Pockai de ese Flujo «entiende»:
la afinidad da felicidad y vínculo extra, no puntos.

### 5.1 `pulso_voltaico` — Eléctrico (ritmo)

*«Viven en el milisegundo.»* Tres carriles de cable; los pulsos bajan a ritmo y hay que pulsar el
carril cuando el pulso cruza la línea de sinapsis.

- 40 s (mín. 15). Tempo y patrón generados por la semilla (frases de 4 compases, 90–130 BPM).
- Perfecto (±60 ms) 2 pt, bien (±140 ms) 1 pt, fallo 0 y rompe la racha.
- **Techo**: como mucho 1,5 notas/s × 2 = 3 pt/s → `maxScorePerSecond: 3`.
- Controles: teclas J K L / ← ↓ →, tocar el carril, clic.
- Accesible: sin tiempo, cada nota espera en la línea hasta que se pulsa (1 pt por nota).
- Datos: la paleta del Pockai colorea los pulsos; su `skills.json` eléctrica da nombre a las frases.

### 5.2 `corriente_datos` — Agua (carriles)

*«Fluyen alrededor de los obstáculos.»* El Pockai nada por un torrente de datos de 4 carriles:
recoge paquetes (+1) y esquiva bloques corruptos (pierde la racha y 1 s de aturdimiento).

- 45 s (mín. 20). Patrón de paquetes y obstáculos de la semilla; la velocidad sube cada 15 s.
- **Techo**: como mucho 2 paquetes/s → `maxScorePerSecond: 2`.
- Controles: ← → / A D, deslizar, clic en el carril.
- Accesible: velocidad ×0,5 y sin aturdimiento.
- Datos: el sprite del Pockai en su pose de nado (animación `walk`).

### 5.3 `raiz_fractal` — Planta (puzle)

*«Código vivo que crece como árboles binarios.»* Una rejilla de piezas de raíz (recta, codo, T); se
giran para conectar la semilla con el sol y el agua. Al conectar, la raíz florece y llega el
siguiente tablero, más grande (4×4 → 5×5 → 6×6).

- 90 s (mín. 20). Tableros con solución garantizada: se genera el camino con la semilla y después
  se giran las piezas al azar.
- 5 pt por tablero + 1 por cada flor (casilla extra conectada).
- **Techo**: un tablero no se resuelve en menos de 4 s (mínimo de giros × animación de 0,25 s) y
  vale como mucho 9 → `maxScorePerSecond: 2,25`.
- Controles: clic o toque gira; teclado con flechas + Espacio.
- Accesible: es por turnos; pista que resalta la siguiente pieza correcta.
- Datos: semillas de `foods.json` (`sun_seed`) como objetivo visual.

### 5.4 `cifrado` — Sombra (memoria de secuencia)

*«Nacen de los secretos guardados.»* En la penumbra se encienden glifos en un orden; hay que
repetirlo. Cada ronda añade un glifo. Desde la ronda 5, un glifo es un «eco» que se ve pero no se
pulsa.

- 60 s (mín. 15). Secuencia de la semilla.
- 1 pt por glifo correcto; un fallo termina la ronda y vuelve a empezar la secuencia actual.
- **Techo**: la reproducción tarda ≥ 0,5 s por glifo y el jugador no puede contestar más rápido de
  lo que se reproduce → ≤ 2 pt/s → `maxScorePerSecond: 2`.
- Controles: 4–6 botones grandes, teclas 1–6.
- Accesible: «repetir secuencia» ilimitado, sin ecos, cada glifo con sonido y nombre propio.
- Datos: los 6 glifos elementales de Parejas (reutilizados).

### 5.5 `faro_claridad` — Luz (barrido)

*«Disipan la corrupción de datos.»* Una pantalla a oscuras con bits corruptos que se extienden a
las casillas vecinas. El jugador mueve un haz de luz: lo que ilumina 0,5 s se purifica (+1).

- 45 s (mín. 20). Focos iniciales y velocidad de propagación de la semilla.
- Si la corrupción cubre más del 60 % de la pantalla, la partida termina antes.
- **Techo**: purificar exige 0,5 s de haz y el haz cubre como mucho 1 bit a la vez → ≤ 2 pt/s;
  se fija `maxScorePerSecond: 2`.
- Controles: mover ratón o dedo; teclado con flechas.
- Accesible: haz el doble de grande y propagación a la mitad.
- Datos: `lore.json` para el texto final («El faro de <apodo> ha limpiado N bits»).

### 5.6 `forja_termica` — Fuego (un botón)

*«El calor de los procesadores al límite.»* Mantener la forja en la zona justa: pulsar aviva el
fuelle y la temperatura cae sola. Cada 3 s dentro de la zona templa una pieza (+4). Pasarse
quema la pieza en curso.

- 45 s (mín. 15). La zona justa se mueve según la semilla.
- **Techo**: 1 pieza cada 3 s × 4 = 1,34 pt/s → `maxScorePerSecond: 1,5`.
- Controles: Espacio, clic o mantener pulsado (táctil).
- Accesible: zona justa ×2 y enfriamiento a la mitad.
- Premio extra: con más de 40 puntos, probabilidad de soltar `spicy_berry` al inventario (cocina,
  spec 15). El servidor decide el premio, no el cliente.

### 5.7 Datos de las Pruebas

Cada prueba añade en `balance.json → minigames.games.<id>` las mismas claves que hoy
(`durationSeconds`, `minDurationSeconds`, `maxScorePerSecond`, `coinsPerPoint`, `maxCoins`,
`xpPerPoint`, `maxXp`, `happiness`) más `element`, y su variante en `accessibility.json`. El
registro del paquete añade definición, vista, icono e instrucciones. El test de techo las cubre sin
cambios.

## 6. Fuera de alcance

- Multijugador en tiempo real. Las clasificaciones de la Semilla del día bastan.
- Monetización dentro de los minijuegos.

## 7. Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Paquete compartido con los 3 juegos (reglas de escritorio + táctil); escritorio conectado; `energyCost` en el listado; `gameId` en el evento; techo de Parejas; validación de variantes accesibles | Hecha |
| 2 | Mejoras de §4; Android sustituye `MiniGames.kt` por el embed (como `PockaiSceneView.kt` con `WebViewAssetLoader`) y quita sus reglas propias | Pendiente |
| 3 | Validación por repetición: `finish` acepta `inputLog`, el backend importa `@pockai/minigames`, ejecuta `replay` y compara. El techo se queda como red de seguridad | Pendiente |
| 4 | Las seis Pruebas, Semilla del día, iOS con el mismo embed, minijuegos de modding sobre el contrato `GameDefinition` | Pendiente |
