/**
 * Contrato de un minijuego. La lógica es pura y determinista: no toca el DOM, no lee el reloj y
 * todo su azar sale de la semilla. El tiempo avanza en ticks fijos (ver `TICK_MS`), así una
 * partida se reproduce exactamente a partir de `seed + inputLog` (spec 39 §2.1).
 */

/** Ticks por segundo del tiempo de juego. */
export const TICKS_PER_SECOND = 60;
export const TICK_MS = 1000 / TICKS_PER_SECOND;

/** Variante de reglas. `easy` es la accesible (accessibility.json); hoy solo se transporta. */
export type GameVariant = 'standard' | 'easy';

export interface GameOptions {
  seed: number;
  durationSeconds: number;
  variant?: GameVariant;
}

/** Entrada del jugador. Cada juego define las suyas con `kind` como discriminante. */
export interface GameInput {
  kind: string;
  [key: string]: unknown;
}

/** Entrada registrada: se aplicó al inicio de `tick`. */
export type LoggedInput = GameInput & { tick: number };

export interface GameDefinition<S, I extends GameInput = GameInput> {
  id: string;
  init(opts: GameOptions): S;
  /** Aplica una entrada (al inicio del tick en curso). Debe ignorar las que no tengan sentido. */
  input(state: S, input: I): void;
  /** Avanza un tick. */
  step(state: S): void;
  score(state: S): number;
  over(state: S): boolean;
  /** Valida una entrada sin confiar en ella (llega del puente o del registro). */
  parseInput(raw: unknown): I | null;
  /**
   * Tipos de entrada que se funden dentro del mismo tick (solo cuenta la última), p. ej. la
   * posición del puntero. Así el registro no crece con cada `pointermove`.
   */
  coalesce?: readonly string[];
}

/** Utilidad para las definiciones: segundos de duración → ticks. */
export const secondsToTicks = (s: number) => Math.round(s * TICKS_PER_SECOND);
