/**
 * Qué hace el Pockai en su sala cuando nadie le dice nada: pasear, alegrarse o usar un mueble.
 *
 * Antes era una tirada al azar entre los tipos de mueble. Ahora lo decide el mismo selector por
 * utilidad que el escritorio (`@pockai/mind`): con hambre va al comedero, sucio a la fuente,
 * cansado se sienta y contento juega; y su personalidad inclina la balanza. Los pesos viven en
 * `shared/game-data/balance.json → personality.room`.
 *
 * Funciones puras: el reloj y el azar llegan de fuera.
 */
import { neutralDims, selectByUtility, isValidDims, type Dims, type Rng, type UtilityCandidate, type UtilityConfig } from '@pockai/mind';
import balance from '../../../game-data/balance.json';
import type { Cell } from '../iso/pathfind';
import type { Interaction } from '../protocol';

export interface RoomNeeds {
  hunger: number;
  energy: number;
  hygiene: number;
  happiness: number;
}

/** Lo que el anfitrión cuenta a la sala sobre el Pockai. Opcional: sin ello se porta de forma neutra. */
export interface RoomMind {
  dims: Dims;
  needs: RoomNeeds;
  /** Semilla del azar de la sala: misma semilla y misma situación, mismas decisiones. */
  seed: number;
}

export interface RoomActionConfig {
  base: number;
  weights?: Partial<Dims>;
  /** Mueble que hace falta para esta acción (si no hay ninguno en la sala, no se ofrece). */
  interaction?: Interaction;
  cooldownMs?: number;
  boost?: Partial<Record<'lowHunger' | 'highHunger' | 'lowHygiene' | 'highHygiene' | 'lowEnergy' | 'highEnergy' | 'lowHappiness' | 'highHappiness', number>>;
  requires?: { sunny?: boolean };
}

export interface RoomConfig {
  antiRepeat: UtilityConfig;
  needs: { low: number; high: number };
  actions: Record<string, RoomActionConfig>;
}

export const ROOM_CONFIG = (balance as unknown as { personality: { room: RoomConfig } }).personality.room;

export const NEUTRAL_NEEDS: RoomNeeds = { hunger: 60, energy: 60, hygiene: 60, happiness: 60 };

export interface RoomAction {
  id: string;
  /** Mueble a usar; `null` = no usa ninguno (pasea o se alegra). */
  interaction: Interaction | null;
}

export interface RoomChoiceInput {
  mind: RoomMind | null;
  /** Interacciones con al menos un mueble de suelo en la sala. */
  available: ReadonlySet<Interaction>;
  /** Buen tiempo y de día. */
  sunny: boolean;
  recent: readonly string[];
  lastAt: Readonly<Record<string, number>>;
  now: number;
  rng: Rng;
}

function needsFactor(a: RoomActionConfig, n: RoomNeeds, cfg: RoomConfig): number {
  const b = a.boost;
  if (!b) return 1;
  const { low, high } = cfg.needs;
  let f = 1;
  if (b.lowHunger && n.hunger <= low) f *= b.lowHunger;
  if (b.highHunger && n.hunger >= high) f *= b.highHunger;
  if (b.lowHygiene && n.hygiene <= low) f *= b.lowHygiene;
  if (b.highHygiene && n.hygiene >= high) f *= b.highHygiene;
  if (b.lowEnergy && n.energy <= low) f *= b.lowEnergy;
  if (b.highEnergy && n.energy >= high) f *= b.highEnergy;
  if (b.lowHappiness && n.happiness <= low) f *= b.lowHappiness;
  if (b.highHappiness && n.happiness >= high) f *= b.highHappiness;
  return f;
}

/** Acciones posibles ahora mismo, con su multiplicador de necesidades. */
export function roomCandidates(input: Pick<RoomChoiceInput, 'mind' | 'available' | 'sunny'>, cfg: RoomConfig = ROOM_CONFIG): UtilityCandidate[] {
  const needs = input.mind?.needs ?? NEUTRAL_NEEDS;
  const out: UtilityCandidate[] = [];
  for (const [id, a] of Object.entries(cfg.actions)) {
    if (a.interaction && !input.available.has(a.interaction)) continue;
    if (a.requires?.sunny && !input.sunny) continue;
    out.push({ id, base: a.base, weights: a.weights, cooldownMs: a.cooldownMs, factor: needsFactor(a, needs, cfg) });
  }
  return out;
}

/** Elige la siguiente acción. `null` solo si la configuración no deja ninguna. */
export function chooseRoomAction(input: RoomChoiceInput, cfg: RoomConfig = ROOM_CONFIG): RoomAction | null {
  const id = selectByUtility({
    candidates: roomCandidates(input, cfg),
    dims: input.mind?.dims ?? neutralDims(),
    recent: input.recent,
    lastAt: input.lastAt,
    now: input.now,
    rng: input.rng,
    cfg: cfg.antiRepeat,
  });
  if (!id) return null;
  return { id, interaction: cfg.actions[id].interaction ?? null };
}

const parseCell = (key: string): Cell => {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
};

const dist2 = (a: Cell, b: Cell) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Celdas de una huella, de la más cercana a la más lejana (a igual distancia, el orden recibido). */
export function cellsByDistance(cells: readonly string[], from: Cell): Cell[] {
  return cells
    .map((key, i) => ({ cell: parseCell(key), i }))
    .sort((a, b) => dist2(a.cell, from) - dist2(b.cell, from) || a.i - b.i)
    .map((c) => c.cell);
}

/** Muebles ordenados por cercanía (por su celda más próxima): el Pockai va al que le pilla más a mano. */
export function byNearest<T extends { cells: readonly string[] }>(candidates: readonly T[], from: Cell): T[] {
  return candidates
    .map((c, i) => ({ c, i, d: Math.min(...c.cells.map((k) => dist2(parseCell(k), from))) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.c);
}

const clampVital = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 60);

/** Valida lo que llega por el puente (JSON de la app nativa). Devuelve `null` si no sirve. */
export function parseRoomMind(raw: unknown): RoomMind | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (!isValidDims(m.dims)) return null;
  const dims = {} as Dims;
  for (const [k, v] of Object.entries(m.dims)) {
    if (k in neutralDims()) dims[k as keyof Dims] = Math.min(100, Math.max(0, v as number));
  }
  const n = (m.needs && typeof m.needs === 'object' ? m.needs : {}) as Record<string, unknown>;
  return {
    dims,
    needs: { hunger: clampVital(n.hunger), energy: clampVital(n.energy), hygiene: clampVital(n.hygiene), happiness: clampVital(n.happiness) },
    seed: typeof m.seed === 'number' && Number.isFinite(m.seed) ? Math.floor(m.seed) >>> 0 : 0,
  };
}
