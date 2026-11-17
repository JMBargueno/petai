# Spec: Lógica de negocio del escritorio en Rust (protección de IP)

## ID
37 — Mover la lógica de negocio propietaria de `desktop/src` (Svelte/TS) a comandos Tauri en Rust

## Estado
**Propuesta — pendiente de aprobación.** No se ha tocado código. Este documento recoge el
inventario, los criterios, el diseño y el plan por fases. Se irá actualizando en cada fase con lo
que se haga de verdad (sección «Registro de cambios» al final).

## Resumen
El frontend de Pockai Desktop (Svelte 5 + Vite) se compila a JS y viaja dentro del `.exe`/`.dmg`:
cualquiera puede extraerlo y leerlo casi como el original. Rust se compila a código nativo, que es
bastante más costoso de revertir. Este spec decide **qué** lógica del cliente compensa mover a
`desktop/src-tauri/src` como `#[tauri::command]`, **cómo** se expone al frontend (`invoke` y
eventos `emit`/`listen`) y **cómo** se mantienen los tests.

Svelte se queda con todo lo que es UI, render, animación y física por frame.

## Qué protege esto y qué no (expectativas realistas)
- **Sí protege** los *algoritmos*: reglas de transición, umbrales combinados con probabilidades,
  ponderaciones y políticas (qué decide la mascota y cuándo). En nativo optimizado no hay nombres de
  variables ni estructura legible.
- **No protege los literales.** Las frases de los barks, las listas de palabras clave o los textos
  de reacción se sacan de un binario nativo con `strings` en un segundo. Moverlos a Rust apenas los
  oculta. Lo que gana es la **lógica de selección**, no el catálogo.
- **No oculta la interfaz IPC.** Los nombres de los comandos y la forma de los payloads se ven al
  inspeccionar el webview (DevTools en debug, o leyendo el JS). Se describe *qué* se pide, no *cómo*
  se decide.
- **No sustituye al servidor.** Lo que es valioso de verdad o afecta a la economía del juego
  (recompensas, puntuaciones, progresión, prompts de IA, claves) tiene que vivir en el backend. Por
  ejemplo, hoy el cliente calcula la puntuación de los minijuegos y la envía con `finishMinigame`:
  moverla a Rust no resuelve ese problema de confianza; solo el backend puede validarla.
- **Fuera de alcance**: ofuscación, anti-debugging, empaquetadores o cualquier técnica evasiva.
  Tampoco se meten secretos en el binario (restricción del propietario).

## Criterios de clasificación
Cada módulo se evalúa con cuatro preguntas:

1. **Frecuencia y sincronía de la llamada.** Hoy todo es síncrono. `invoke` es IPC asíncrono con
   JSON en ambos sentidos (del orden de 0,1–1 ms). Algo que corre en cada frame (`requestAnimationFrame`,
   paso fijo de 1/120 s) **no** puede pasar por `invoke` sin cambiar el comportamiento. Algo que corre
   cada pocos segundos o ya es `async` sí.
2. **Valor de IP.** ¿Es una regla propia del producto (personalidad, decisiones, políticas) o
   código genérico/presentación (formatear fechas, mapear iconos, física estándar)?
3. **Paridad entre plataformas.** Si el mismo algoritmo debe dar el mismo resultado en TS, Kotlin y
   Swift (o coincidir con el backend), moverlo solo en escritorio rompe la referencia común.
4. **Impacto en tests.** Qué specs de Vitest dependen del módulo y cómo se reescriben.

## Inventario de `desktop/src`

### Mover — Fase 1 (recomendado)
| Módulo | Qué contiene | Por qué moverlo | Riesgo |
|---|---|---|---|
| `lib/contextAwareness.ts` (`categorizeWindowTitle`) | Clasificación de la ventana activa en categorías (coding, music, video, gaming, reading) por palabras clave, con accesorio y comentario de reacción. | Regla propia de la «Conciencia de la app en foco». Además, **el título de la ventana dejaría de llegar a JS**: hoy viaja de Rust a JS solo para clasificarse, y la nota de privacidad de `deskContext.ts` dice «nunca títulos de ventana». | Muy bajo: la llamada ya es `await fetchActiveWindow()` dentro del intervalo de 3 s. |
| `lib/windowPerching.ts` (`calculatePerchTarget`) | Cálculo del punto donde la mascota se posa sobre la barra de título. | Va junto a lo anterior: el mismo comando nativo devuelve el objetivo ya calculado. Valor de IP bajo, pero elimina el último uso de las coordenadas crudas en JS. | Muy bajo (misma llamada asíncrona). |
| `lib/pomodoro.ts` | Máquina de estados del Pomodoro (idle → work → break → work…), contador de sesiones, eventos `work_start` / `work_finish` / `break_finish`. | Es justo el caso del punto 4 del encargo: un temporizador en Rust que **empuja** el estado al frontend con `emit`. Deja la máquina de estados fuera del JS. | Bajo-medio: hay que mantener un store espejo porque `deskContext` y `contextDigest` lo leen síncronamente. |
| `lib/barks.ts` (`BarksEngine`) | Selección de pensamientos espontáneos: prioridad por necesidades vitales (<25), inactividad, app, hora y clima; 75 % contextual frente a genérico; historial anti-repetición de 15. | Es parte del «cerebro» de la mascota. Corre cada 65 s, así que el coste del IPC es irrelevante. | Bajo. Ojo: las frases siguen siendo extraíbles (ver arriba). |

### Mover — Fase 2 (tras validar la fase 1)
| Módulo | Qué contiene | Por qué esperar |
|---|---|---|
| `lib/behaviorEngine.ts` (`BehaviorEngine`) | Estados idle / wander / zoomies / stalking / peeking / petting / high_five, umbrales de caricia, probabilidades y objetivos de movimiento. | Es el «cerebro» de movimiento y el de más valor de IP del cliente. `update()` se llama desde el intervalo de 3 s de `PetView.svelte` (ya `async`), así que es viable. Pero `recordStroke()` se llama en **cada `mousemove`** sobre la mascota y devuelve un booleano síncrono que dispara la caricia; pasarlo a `invoke` añade un ciclo de IPC (imperceptible, pero hay que reordenar el handler). Mejor hacerlo cuando el patrón de la fase 1 esté probado. |
| `lib/contextDigest.ts` (política) | Contadores de minutos por categoría y franja de 4 h, límites (240/2400/30), escalado proporcional y política de reintentos (429 → 20 h, HTTP → 1 h, red → 10 min). | Es lógica propia, pero el estado vive en `localStorage`. Moverlo implica persistir en el directorio de datos de la app desde Rust y migrar el estado guardado. Si la categoría ya no llega a JS (fase 1), el contador por minuto tendrá que vivir en Rust de todos modos o recibir la categoría ya clasificada. |
| `lib/fileAnalyzer.ts` (`detectFileType`, acciones sugeridas) | Tabla de extensiones → categoría/acciones sugeridas. | Valor de IP bajo; solo si se quiere completar el «cerebro» del escritorio. `buildFilePrompt` tiene un test de paridad con el límite del chat del backend. |

### Se queda en Svelte/TS
| Módulo | Motivo |
|---|---|
| `lib/physics/petPhysics.ts`, `lib/toys/toyPhysics.ts` | Paso fijo de 1/120 s en cada frame dentro de `requestAnimationFrame`. Por IPC dejaría de ser síncrono y determinista. Física genérica, poco valor de IP. |
| `lib/animation/*` (`AnimationController`, `eventMap`, `petActions`), `lib/speech-queue.ts` | Presentación: qué animación o bocadillo se muestra y cuándo. |
| `lib/mind.ts`, `lib/visitors.ts`, `lib/profile-format.ts`, `lib/ui/maps.ts`, `lib/badge-icons.ts` | Formateo y presentación de datos que ya decide el servidor (el cerebro real está en el backend, spec 36). |
| `lib/prng.ts`, `lib/sprites.ts` | Su propio comentario lo exige: Mulberry32 «debe ser idéntico en TypeScript, Kotlin y Swift». Además se usa al pintar. |
| `lib/rng.ts` + `components/games/*` | `rng()` se llama en cada aparición dentro del bucle del minijuego, y la semilla del servidor implica paridad. La puntuación debe validarla el backend (ver arriba). |
| `lib/thinkTags.ts` | Copia de `backend/src/modules/ai/think-tags.ts`; procesa *streaming* trozo a trozo. |
| `lib/api.ts`, `lib/socket.ts`, `lib/environmental.ts`, `lib/hermesLocal.ts`, `lib/updater.ts`, `lib/game-data.client.ts`, `lib/asset-*` | Clientes de red y caché. No contienen reglas de negocio; las reglas están en el servidor. |
| `lib/types/desktopSkills.ts`, `lib/stores/desktopSkillsStore.ts` | Registro de habilidades con test de paridad contra el backend (`desktopIntelligence.spec.ts`). El servidor vuelve a comprobar cada habilidad. |
| `lib/clickthrough.ts`, `lib/summonShortcut.ts`, `lib/window-visibility.ts` | Ya delegan en Rust lo nativo; el resto es pegamento de UI. |
| Todos los `.svelte` | UI. Solo cambian las llamadas a los módulos movidos. |

## Diseño en Rust

### Estructura
`main.rs` tiene hoy 342 líneas con todo junto. Se separa así, sin cambiar lo que ya existe:

```
desktop/src-tauri/src/
  main.rs              // builder, plugins, tray, setup (como ahora) + registro de comandos nuevos
  commands.rs          // #[tauri::command] finos: validan, bloquean el estado y llaman a logic::*
  logic/
    mod.rs
    desk_context.rs    // categorize_window_title, perch_target  (puro)
    pomodoro.rs        // PomodoroMachine: start/pause/resume/stop/tick  (puro, sin hilos)
    barks.rs           // catálogo + BarksEngine<R: Rng>  (puro)
    behavior.rs        // fase 2
```

- **Núcleo puro separado de los comandos.** `logic::*` no conoce Tauri: recibe datos y devuelve
  datos. Así `cargo test` no necesita `AppHandle` ni ventana.
- **Estado en `tauri::State<Mutex<…>>`**, igual que `HitRegions` y `SummonShortcut` hoy.
- **Tipos serde** con `#[serde(rename_all = "camelCase")]` para que el JSON coincida con las
  interfaces TS actuales (`timeLeft`, `sessionsCompleted`, `accessoryIcon`…).
- **Aleatoriedad inyectable.** Barks y comportamiento usan `Math.random()`. En Rust se abstrae tras un
  trait pequeño (`fn next_f64(&mut self) -> f64`) con una implementación por defecto y otra con
  semilla para los tests. Para la implementación por defecto hay dos opciones: añadir el crate
  `rand` (dependencia nueva, estándar) o un xorshift/Mulberry32 propio sembrado con la hora
  (sin dependencias). **Recomendación:** `rand` con `SmallRng`; es lo convencional y está muy auditado.
- Edición 2021, Tauri 2, comentarios y mensajes de error en castellano como el resto de `main.rs`.

### Comandos y eventos — Fase 1

**1. Contexto de escritorio** (sustituye a `get_active_window_info` en el frontend)

```rust
#[tauri::command]
fn get_desk_context(app: AppHandle, pet_size: f64, classify: bool) -> DeskContext;

#[derive(Serialize)] #[serde(rename_all = "camelCase")]
struct DeskContext {
    perch: Option<PerchTarget>,               // { x, y } o None si no hay ventana válida
    category: Option<ContextCategoryInfo>,    // solo si classify == true (habilidad activa)
}
```

- Reutiliza el código Win32 actual de `get_active_window_info` (se extrae a una función interna).
- El título se clasifica en Rust y **no se devuelve**.
- `classify` lo decide el frontend con `isSkillActive('context_awareness', …)`, igual que hoy.
- `get_active_window_info` se mantiene registrado durante la transición y se retira al final de la
  fase 1, cuando nadie lo use.

**2. Pomodoro**

```rust
#[tauri::command] fn pomodoro_start(work_minutes: u32, break_minutes: u32) -> PomodoroState;
#[tauri::command] fn pomodoro_pause() -> PomodoroState;
#[tauri::command] fn pomodoro_resume() -> PomodoroState;
#[tauri::command] fn pomodoro_stop() -> PomodoroState;
#[tauri::command] fn pomodoro_get_state() -> PomodoroState;
```

- Eventos emitidos por Rust:
  - `pomodoro://state` → `PomodoroState` completo en cada tic (1 s) y tras cada comando.
  - `pomodoro://event` → `{ eventType: "work_start" | "work_finish" | "break_finish" }`.
- Un hilo (`std::thread`, como `spawn_click_through_loop`) hace `tick()` cada segundo solo mientras
  `is_running`.
- En TS, `pomodoro.ts` conserva **la misma API pública** (`pomodoroStore`, `startPomodoro`…):
  - las funciones pasan a llamar a `invoke`;
  - un `listen('pomodoro://state')` alimenta `pomodoroStore`, que queda como **espejo de solo lectura**.
    `deskContext.buildClientContext` y `contextDigest` siguen leyéndolo con `get()` sin cambios;
  - `listen('pomodoro://event')` vuelve a lanzar el `CustomEvent('petai:pomodoro_event')` de siempre,
    así `PetView.svelte` y `contextDigest.ts` no cambian.
- Diferencia de comportamiento a asumir: `startPomodoro()` pasa de actualizar el store en el mismo
  tic a actualizarlo cuando vuelve el `invoke` (< 1 ms). Las funciones devuelven `Promise<void>`;
  los llamadores actuales (`AiTab.svelte`, `PomodoroWidget.svelte`) no usan el valor de retorno.

**3. Barks**

```rust
#[tauri::command] fn barks_generate(state: State<BarksState>, ctx: BarkContext) -> String;
#[tauri::command] fn barks_clear_history(state: State<BarksState>);
```

- `BarkContext` replica la interfaz TS (todos los campos opcionales).
- El historial de recientes (15) vive en `BarksState`.
- `PetView.svelte` cambia `barksEngine.generateBark(ctx)` por `await invoke('barks_generate', { ctx })`
  dentro del mismo `setInterval` de 65 s.

### Comandos — Fase 2 (resumen)
- `behavior_update(dt, cursor, pet, screen_width) -> BehaviorDecision`,
  `behavior_record_stroke(delta) -> bool`, `behavior_start_high_five() -> bool`,
  `behavior_complete_high_five() -> bool`. Estado en `State<Mutex<BehaviorEngine>>`.
- `context_digest_*`: contador por minuto en Rust con persistencia en `app_data_dir`, migrando la
  clave `petai:context_digest:v1` de `localStorage` la primera vez. El envío HTTP sigue en TS
  (usa la sesión de `api.ts`); Rust solo decide **qué** y **cuándo** se envía.

## Modo navegador (sin Tauri)
Algunos módulos ya comprueban `'__TAURI_INTERNALS__' in window` (por ejemplo `fetchActiveWindow`).
Con la lógica en Rust, al ejecutar `vite` en un navegador normal:
- **Recomendación:** sin *fallback* en TS (si no, la lógica volvería a viajar en el JS). Las
  funciones movidas pasan a no hacer nada: no hay barks, el Pomodoro no arranca y no hay contexto.
- Alternativa: mantener una copia TS solo en builds de desarrollo (`import.meta.env.DEV`), con el
  riesgo de que ambas versiones se desincronicen.

## Tests
`vitest run` corre en Node, sin runtime de Tauri. Los specs afectados por la fase 1 son:

| Spec | Qué prueba hoy | Plan |
|---|---|---|
| `lib/contextAwareness.spec.ts` (5 casos) | Clasificación por título. | Los casos se **portan** a `logic/desk_context.rs` (`#[cfg(test)]`). El spec TS se borra con el módulo. |
| `lib/windowPerching.spec.ts` (1 caso) | `calculatePerchTarget`. | Igual: se porta a Rust y el spec TS se sustituye por un test del adaptador con `invoke` simulado. |
| `lib/pomodoro.spec.ts` (3 casos) | start / pause-resume / stop sobre el store. | Las transiciones y los tics se portan a `logic/pomodoro.rs`. El spec TS se reescribe para el adaptador: `vi.mock('@tauri-apps/api/core')` y `vi.mock('@tauri-apps/api/event')`, comprueba que se invoca el comando correcto, que el store refleja el estado devuelto y que `pomodoro://event` relanza `petai:pomodoro_event`. |
| `lib/desktopIntelligence.spec.ts` → `buildClientContext` | Llama a `startPomodoro(30, 5)` y lee el contexto. | Se mantiene con el mismo mock: `startPomodoro` pasa a ser `await`, y el mock devuelve el estado. Las aserciones no cambian. Los casos de paridad con el backend (registro de habilidades y `buildFilePrompt`) **no se tocan**. |
| `lib/barks.spec.ts` (5 casos) | Categorías candidatas, generación y anti-repetición. | Se portan a `logic/barks.rs` con el RNG sembrado (deterministas, más fiables que ahora). El spec TS queda como test del adaptador. |

Reglas:
- Ningún caso desaparece sin su equivalente en Rust. Cada spec portado lleva un comentario con el
  nombre del test de Rust que lo sustituye.
- `cargo test` (en `desktop/src-tauri`) se ejecuta junto a `pnpm --filter petai-desktop test`. Se
  conserva el test existente `acepta_los_atajos_del_frontend`.
- Hoy el CI (`.github/workflows/ci.yml`) solo ejecuta `cargo check --manifest-path
  desktop/src-tauri/Cargo.toml --locked`; **no ejecuta `cargo test`**. En la fase 0 se añade
  `cargo test --manifest-path desktop/src-tauri/Cargo.toml --locked` en ese mismo job, para que los
  tests portados protejan de verdad.

## Plan por fases
**Fase 0 — Preparación (sin cambio de comportamiento)**
1. Separar `main.rs` en `commands.rs` y `logic/` moviendo lo existente tal cual.
2. Añadir la abstracción de RNG (y el crate `rand`, si se aprueba).
3. Verificar `cargo test` y `vitest run` en verde.

**Fase 1 — Contexto + Pomodoro + Barks** (un PR por pieza, en este orden)
1. `get_desk_context`: Rust + tests, adaptar `windowPerching.ts`/`PetView.svelte`, borrar
   `contextAwareness.ts` de la build.
2. Pomodoro: máquina de estados + hilo + eventos, adaptador TS, specs reescritos.
3. Barks: motor + catálogo en Rust, `PetView.svelte` con `invoke`, specs portados.
4. Retirar `get_active_window_info` del `invoke_handler` si ya no tiene usos.
5. Comprobar en la app real (`pnpm tauri dev`) que la mascota se posa, comenta la app activa,
   el Pomodoro avisa y los barks salen igual que antes.

**Fase 2 — Comportamiento + digest (+ archivos)**: tras validar la fase 1, con su propio PR.

**Verificación de que la lógica ya no está en el JS**: tras `vite build`, buscar en
`desktop/dist/assets/*.js` cadenas distintivas de cada módulo movido (por ejemplo
`pettingStrokeThreshold`, `zoomiesChance` o el nombre de una categoría de barks) y comprobar que no aparecen.

## Decisiones pendientes (propietario)
| Pregunta | Recomendación |
|---|---|
| Alcance de la fase 1 | Contexto + Pomodoro + Barks, como arriba. |
| Tests existentes | Portar los casos a Rust y dejar en TS solo tests de adaptador con `invoke` simulado. |
| Dependencia `rand` | Sí (`SmallRng`). |
| Modo navegador | Sin *fallback* TS; las funciones movidas pasan a no hacer nada. |
| Comportamiento (`behaviorEngine`) | Fase 2, por el `recordStroke` en cada `mousemove`. |

## Registro de cambios
- 2026-11-17 — Propuesta inicial (análisis de `desktop/src` y `src-tauri/src/main.rs`). Sin cambios de código.
