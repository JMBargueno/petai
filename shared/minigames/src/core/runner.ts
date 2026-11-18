import { TICK_MS, type GameDefinition, type GameInput, type GameOptions, type LoggedInput } from './types';

/**
 * Ejecuta una definición en tiempo real: convierte el tiempo de pared en ticks fijos, aplica las
 * entradas en cola al inicio del tick siguiente y guarda el registro para poder repetir la partida.
 */
export interface Runner<S> {
  readonly state: S;
  readonly tick: number;
  readonly log: readonly LoggedInput[];
  /** Encola una entrada; se aplicará al inicio del próximo tick. */
  push(input: GameInput): void;
  /** Avanza `ms` de tiempo real (acotado para no simular de golpe tras una pausa larga). */
  advance(ms: number): void;
  score(): number;
  over(): boolean;
}

/** Variante de `def` sin genéricos, para los mapas de juegos. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameDefinition = GameDefinition<any, any>;

/** Máximo de tiempo real que se simula por llamada (p. ej. al volver de otra pestaña). */
const MAX_ADVANCE_MS = 250;

export function createRunner<S, I extends GameInput>(def: GameDefinition<S, I>, opts: GameOptions): Runner<S> {
  const state = def.init(opts);
  const log: LoggedInput[] = [];
  const queue: I[] = [];
  let tick = 0;
  let acc = 0;

  const runTick = () => {
    for (const input of queue.splice(0)) {
      def.input(state, input);
      log.push({ ...input, tick });
    }
    def.step(state);
    tick += 1;
  };

  return {
    state,
    get tick() {
      return tick;
    },
    log,
    push(raw) {
      const input = def.parseInput(raw);
      if (!input || def.over(state)) return;
      const last = queue[queue.length - 1];
      if (last && last.kind === input.kind && def.coalesce?.includes(input.kind)) queue[queue.length - 1] = input;
      else queue.push(input);
    },
    advance(ms) {
      acc += Math.min(Math.max(0, ms), MAX_ADVANCE_MS);
      while (acc >= TICK_MS && !def.over(state)) {
        acc -= TICK_MS;
        runTick();
      }
    },
    score: () => def.score(state),
    over: () => def.over(state),
  };
}

/**
 * Repite una partida a partir de la semilla y el registro de entradas. Devuelve la puntuación y los
 * ticks jugados. Las entradas no válidas, desordenadas o posteriores al final se descartan.
 * `maxTicks`: la partida terminó antes de tiempo en el cliente (pausa demasiado larga); se repite
 * solo hasta ahí, porque en algunos juegos la puntuación sigue cambiando sin entradas.
 */
export function replay<S, I extends GameInput>(
  def: GameDefinition<S, I>,
  opts: GameOptions,
  log: readonly unknown[],
  maxTicks = Infinity,
): { score: number; ticks: number } {
  const state = def.init(opts);
  let tick = 0;
  let i = 0;
  const entries = log.filter(
    (e): e is LoggedInput =>
      !!e && typeof e === 'object' && Number.isInteger((e as LoggedInput).tick) && (e as LoggedInput).tick >= 0,
  );
  while (!def.over(state) && tick < maxTicks) {
    while (i < entries.length && entries[i].tick <= tick) {
      if (entries[i].tick === tick) {
        const input = def.parseInput(entries[i]);
        if (input) def.input(state, input);
      }
      i += 1;
    }
    def.step(state);
    tick += 1;
  }
  return { score: def.score(state), ticks: tick };
}
