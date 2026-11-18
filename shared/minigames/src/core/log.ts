import type { GameDefinition, GameInput, LoggedInput } from './types';

/**
 * Registro empaquetado: cada entrada es `[Δtick, kind, ...valores]`, con Δtick relativo a la
 * entrada anterior y los valores en el orden de `inputKeys`. Una partida de 45 s de Atrapa la
 * comida (un movimiento por tick como mucho) cabe en ~30 KB de JSON.
 */
export type PackedEntry = [number, string, ...number[]];

/** Tope de entradas de un registro: nadie mete más de 4 entradas por tick de juego. */
export const maxLogEntries = (durationTicks: number) => durationTicks * 4 + 16;

export function packLog<I extends GameInput>(def: GameDefinition<unknown, I>, log: readonly LoggedInput[]): PackedEntry[] {
  let prev = 0;
  return log.map((e) => {
    const keys = def.inputKeys[e.kind] ?? [];
    const out: PackedEntry = [e.tick - prev, e.kind, ...keys.map((k) => Number(e[k]))];
    prev = e.tick;
    return out;
  });
}

/**
 * Desempaqueta y valida un registro que llega de fuera (cliente → servidor). Devuelve `null` si
 * cualquier entrada está mal formada: un registro dudoso no se repite a medias.
 */
export function unpackLog<I extends GameInput>(
  def: GameDefinition<unknown, I>,
  raw: unknown,
  maxEntries = Infinity,
): LoggedInput[] | null {
  if (!Array.isArray(raw) || raw.length > maxEntries) return null;
  const out: LoggedInput[] = [];
  let tick = 0;
  for (const e of raw) {
    if (!Array.isArray(e) || e.length < 2) return null;
    const [dt, kind, ...values] = e as unknown[];
    if (!Number.isInteger(dt) || (dt as number) < 0 || typeof kind !== 'string') return null;
    const keys = def.inputKeys[kind];
    if (!keys || values.length !== keys.length) return null;
    if (!values.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
    tick += dt as number;
    const entry: LoggedInput = { kind, tick };
    keys.forEach((k, i) => (entry[k] = values[i]));
    if (!def.parseInput(entry)) return null;
    out.push(entry);
  }
  return out;
}
