# El contrato de un minijuego

La norma es `docs/specs/spec-39-minijuegos-compartidos.md` §2 y §3. Aquí va lo que necesitas para no romperla.

## Las tres piezas

| Pieza | Archivo | Qué sabe |
|---|---|---|
| Lógica | `shared/minigames/src/games/<id>.ts` | Las reglas. Ni DOM, ni reloj, ni imágenes |
| Vista | `shared/minigames/src/views/<id>View.ts` | Pintar el estado y traducir ratón, teclado y toque a entradas |
| Registro | `shared/minigames/src/logic.ts` (lógica) y `src/registry.ts` (vista, icono, `howTo`) | Qué juegos existen |

El backend compila **solo** lo que cuelga de `src/logic.ts` (`tsconfig.node.json` → `dist/node`). Si la lógica importa algo de la vista, de `assets.ts` o de `pet.ts`, el backend deja de compilar.

## `GameDefinition` (`src/core/types.ts`)

```ts
export const miJuego: GameDefinition<Estado, Entrada> = {
  id: 'mi_juego',
  inputKeys: { move: ['x'], tap: [] },   // campos numéricos de cada entrada, en orden
  coalesce: ['move'],                    // entradas continuas: solo cuenta la última del tick
  init({ seed, durationSeconds, variant }) { … },   // variant: 'standard' | 'easy'
  parseInput(raw) { … },                 // valida sin confiar: devuelve la entrada o null
  input(state, input) { … },             // se aplica al inicio del tick; ignora lo que no tenga sentido
  step(state) { … },                     // avanza un tick (1/60 s)
  score: (s) => s.score,
  over: (s) => s.tick >= s.durationTicks,
};
```

## Determinismo

La misma semilla y el mismo registro de entradas tienen que dar la misma puntuación y los mismos ticks en V8 (escritorio, Node) y en JavaScriptCore (iOS). El servidor repite la partida y la rechaza si no coincide.

- **Todo el azar** sale de `createRng(seed)` (`core/rng.ts`, mulberry32), guardado en el estado. Nunca `Math.random`.
- **El orden de las llamadas al generador es parte de las reglas.** Si añades una tirada en medio, cambian todas las partidas. Tira siempre las mismas veces en cada aparición, aunque no uses el valor.
- **Nunca `Array.sort` con comparador aleatorio**: cada motor lo resuelve distinto. Para barajar, el Fisher-Yates de `core/rng.ts`.
- **El tiempo son ticks** (`TICKS_PER_SECOND = 60`, `secondsToTicks`). Nada de `Date.now`, `performance.now` ni `setTimeout` en la lógica.
- **Enteros siempre que puedas.** La suma de decimales es igual en todos los motores, pero `Math.sin`, `Math.pow` y compañía no están garantizados bit a bit: no los uses en la lógica. Una curva se hace con una tabla o con tramos lineales.
- **Las entradas se redondean en la vista** antes de `ctx.push` (posición en px lógicos enteros): el registro viaja más corto y no depende del tamaño de la pantalla. La arena tiene un tamaño lógico fijo (p. ej. 340×260) y la vista la escala.
- **La vista no decide nada.** Si un destello, un sonido o una animación dependen de algo, ese algo está en el estado (`lastDelta`, `streak`), no en un temporizador de la vista.
- La mascota del jugador **no entra en la lógica**: ni su especie ni su Flujo. Lo que dependa de ella (la afinidad) lo aplica el servidor al dar la recompensa.

## El techo

El servidor recorta cualquier partida que supere `maxScorePerSecond × max(segundos jugados, minDurationSeconds)`.

1. Calcula el máximo teórico de tus reglas: cada cuánto se puede puntuar y cuánto como mucho. Escríbelo en el comentario de las constantes del juego.
2. `maxScorePerSecond` en `balance.json` va por encima de esa cuenta, redondeado, con algo de margen.
3. `minDurationSeconds` es lo que tarda la partida más corta posible que sea legítima. En un juego que acaba al completar el tablero, es lo que tarda un bot perfecto; en uno de tiempo fijo, menos de la mitad de la duración.
4. `src/games.spec.ts` juega cientos de semillas con un **bot perfecto** (reacciona en un tick y no falla) y comprueba en cada tick `score(t) ≤ maxScorePerSecond × max(t, minDurationSeconds)`. Añade el bot de tu juego para las dos variantes. Si las rachas o los multiplicadores rompen el techo, falla aquí.

Multiplicadores y rachas: acótalos. Una racha sin tope convierte el techo en una cuenta imposible.

## Registro y repetición

- Cada entrada se guarda con su tick; `packLog` la empaqueta como `[Δtick, kind, ...valores]` usando `inputKeys`. Por eso todos los campos de una entrada son **numéricos**.
- El registro tiene tope (`maxLogEntries`). Una entrada continua sin `coalesce` lo revienta en segundos.
- La repetición es obligatoria en los juegos con `element` y opcional en los demás mientras `minigames.requireReplay` sea `false`.

## Qué se rompe al cambiar reglas

- **El servidor usa la lógica compilada.** Tras tocar un juego: `pnpm --filter @pockai/minigames build:node`. Si no, rechaza las partidas por no coincidir.
- **Cliente y servidor salen a la vez.** Un Android con el bundle antiguo jugará con las reglas viejas y, si el juego exige repetición, sus partidas se rechazarán hasta que actualice. En un clásico sin repetición obligatoria se aceptan, acotadas por el techo. Dilo al cerrar.
- **Cambiar la duración o el techo** en `balance.json` no necesita compilar, pero el test del bot perfecto tiene que seguir pasando.
- **Un mensaje nuevo o un campo obligatorio** en `src/protocol.ts` sube `MINIGAME_PROTOCOL_VERSION`. Los campos opcionales con valor por defecto no.

## La vista (`src/views/types.ts`)

```ts
interface GameView<S> {
  mount(root: HTMLElement, ctx: ViewContext, initial: S): void;
  render(state: S): void;      // cada frame
  status(state: S): string;    // marcador del HUD (se anuncia con role="status")
  dispose(): void;             // quita todos los listeners
}
```

- `ctx.push(input)` encola una entrada para el tick siguiente; `ctx.reducedMotion`; `ctx.pet` es la mascota (`pockai-in-game.md`).
- Ayudas: `el`, `button` (con `aria-label`), `on`, `toLogical`, `pct`, `typing` (no te quedes las teclas de un campo de texto o de otro botón).
- Las teclas de movimiento llaman a `preventDefault` para no mover el scroll del panel.
- Si la ventana pierde el foco con una tecla pulsada, el `keyup` no llega: suéltalas en `blur`.
- El anfitrión (`src/host.ts`) pone el HUD, la pausa y el bucle; la vista no gestiona tiempo ni pausa.
