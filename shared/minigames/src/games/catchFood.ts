import { createRng, shuffle } from '../core/rng';
import { TICKS_PER_SECOND, secondsToTicks, type GameDefinition, type GameOptions } from '../core/types';

/**
 * Cosecha del Éter (`catch_food`). Cuando sube la marea del Éter, las corrientes sueltan éter
 * condensado sobre el Santuario: tu Pockai corre a recoger los frutos antes de que se deshagan.
 *
 * - Cada fruto es de un Flujo. Recogerlo da 1; si es del Flujo de la **marea** que sube, 2.
 * - La marea cambia cada 15 s y cada marea trae más frutos, más deprisa y con más polvo estático.
 * - **Racha:** cada 5 frutos seguidos sin tocar polvo, +1.
 * - El **polvo estático** no quita nada: rompe la racha y deja al Pockai 0,75 s sin poder recoger.
 *
 * Techo. Tras un fruto de la marea, los dos siguientes nunca lo son (`TIDE_GAP`), así que tres
 * frutos seguidos valen como mucho 2 + 1 + 1 = 4, y con la racha, 23 puntos cada 15 frutos (1,54 por
 * fruto). La aparición más rápida es un objeto cada 0,5 s → 3,07 pt/s en el peor tramo; contando las
 * mareas lentas, 126 puntos en 45 s (2,8 pt/s). Por debajo del techo de 3 del servidor.
 */
export const CATCH_FOOD = {
  W: 340,
  H: 260,
  /** Línea del suelo: donde pisa el Pockai. */
  PET_Y: 232,
  /** Altura a la que recoge (su lomo). */
  CATCH_Y: 206,
  CATCH_HALF: 28,
  /** px/s. La misma con teclas que siguiendo al puntero: el Pockai corre, no se teletransporta. */
  SPEED: 420,
  /** Flujo de cada tipo de fruto, por índice. */
  FLOWS: ['fire', 'water', 'plant', 'electric', 'shadow', 'light'],
  TIDE_TICKS: secondsToTicks(15),
  /** Cada marea: ticks entre apariciones, probabilidad de polvo estático y velocidad de caída. */
  TIDES: [
    { spawnTicks: 36, staticChance: 0.15, speedMul: 1 },
    { spawnTicks: 33, staticChance: 0.2, speedMul: 1.15 },
    { spawnTicks: 30, staticChance: 0.25, speedMul: 1.3 },
  ],
  /** Tras un fruto de la marea, cuántos frutos seguidos no pueden serlo. */
  TIDE_GAP: 2,
  STREAK_EVERY: 5,
  STUN_TICKS: secondsToTicks(0.75),
} as const;

export interface FallingItem {
  id: number;
  x: number;
  y: number;
  vy: number;
  /** Índice de Flujo del fruto (0..5) o −1 para el polvo estático. */
  kind: number;
  /** Es del Flujo de la marea que subía cuando apareció: vale doble. */
  tide: boolean;
}

/** Qué pasó la última vez que el Pockai tocó algo (para que la vista reaccione). */
export interface CatchEvent {
  tick: number;
  /** Puntos ganados; 0 si fue polvo estático. */
  delta: number;
  kind: number;
  tide: boolean;
  /** La racha llegó a un múltiplo de 5 con este fruto. */
  streakBonus: boolean;
}

export interface CatchFoodState {
  speedMul: number;
  /** Media anchura de la zona de recogida (más ancha en la variante accesible). */
  catchHalf: number;
  rng: () => number;
  durationTicks: number;
  tick: number;
  petX: number;
  /** Adónde va el Pockai siguiendo al puntero; `null` si se mueve con teclas. */
  targetX: number | null;
  dir: -1 | 0 | 1;
  items: FallingItem[];
  nextId: number;
  spawnAcc: number;
  score: number;
  caught: number;
  streak: number;
  bestStreak: number;
  /** Tick hasta el que el Pockai no puede recoger (tocó polvo estático). */
  stunnedUntil: number;
  /** Orden de los Flujos de las mareas de esta partida. */
  tideOrder: number[];
  /** Frutos aparecidos desde el último de la marea. */
  sinceTide: number;
  last: CatchEvent | null;
}

export type CatchFoodInput = { kind: 'move'; x: number } | { kind: 'dir'; d: -1 | 0 | 1 };

const C = CATCH_FOOD;
const clampX = (x: number) => Math.min(C.W - C.CATCH_HALF, Math.max(C.CATCH_HALF, x));

/** Número de marea en curso (0, 1, 2…). */
export const tideIndex = (s: Pick<CatchFoodState, 'tick'>) => Math.floor(s.tick / C.TIDE_TICKS);
/** Índice del Flujo de la marea en curso. */
export const tideFlow = (s: Pick<CatchFoodState, 'tick' | 'tideOrder'>) => s.tideOrder[tideIndex(s) % s.tideOrder.length];
/** ¿El Pockai está con estática y no puede recoger? */
export const isStunned = (s: Pick<CatchFoodState, 'tick' | 'stunnedUntil'>) => s.tick < s.stunnedUntil;

export const catchFood: GameDefinition<CatchFoodState, CatchFoodInput> = {
  id: 'catch_food',
  coalesce: ['move'],
  inputKeys: { move: ['x'], dir: ['d'] },
  init({ seed, durationSeconds, variant }: GameOptions) {
    const easy = variant === 'easy';
    const rng = createRng(seed);
    return {
      // Variante accesible (accessibility.json): caída a la mitad y zona de recogida ×3.
      speedMul: easy ? 0.5 : 1,
      catchHalf: easy ? C.CATCH_HALF * 3 : C.CATCH_HALF,
      tideOrder: shuffle([0, 1, 2, 3, 4, 5], rng),
      rng,
      durationTicks: secondsToTicks(durationSeconds),
      tick: 0,
      petX: C.W / 2,
      targetX: null,
      dir: 0,
      items: [],
      nextId: 0,
      spawnAcc: 0,
      score: 0,
      caught: 0,
      streak: 0,
      bestStreak: 0,
      stunnedUntil: 0,
      sinceTide: C.TIDE_GAP,
      last: null,
    };
  },
  parseInput(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (r.kind === 'move' && typeof r.x === 'number' && Number.isFinite(r.x)) return { kind: 'move', x: r.x };
    if (r.kind === 'dir' && (r.d === -1 || r.d === 0 || r.d === 1)) return { kind: 'dir', d: r.d };
    return null;
  },
  input(s, inp) {
    if (inp.kind === 'move') {
      s.targetX = clampX(inp.x);
    } else {
      s.dir = inp.d;
      // Las teclas mandan: el Pockai deja de seguir al puntero.
      if (inp.d !== 0) s.targetX = null;
    }
  },
  step(s) {
    if (s.tick >= s.durationTicks) return;
    const dt = 1 / TICKS_PER_SECOND;
    const stepX = C.SPEED * dt;
    if (s.dir !== 0) s.petX = clampX(s.petX + s.dir * stepX);
    else if (s.targetX !== null) {
      const gap = s.targetX - s.petX;
      s.petX = Math.abs(gap) <= stepX ? s.targetX : s.petX + (gap > 0 ? stepX : -stepX);
    }

    const tide = C.TIDES[Math.min(tideIndex(s), C.TIDES.length - 1)];
    const flow = tideFlow(s);
    s.spawnAcc += 1;
    if (s.spawnAcc >= tide.spawnTicks) {
      s.spawnAcc = 0;
      // Siempre cuatro tiradas por aparición, se usen o no: el orden del generador es parte de las reglas.
      const isStatic = s.rng() < tide.staticChance;
      const x = 16 + s.rng() * (C.W - 32);
      const vy = (90 + s.rng() * 70) * tide.speedMul * s.speedMul;
      let kind = Math.floor(s.rng() * C.FLOWS.length);
      let ofTide = false;
      if (isStatic) kind = -1;
      else {
        // Dos frutos de la marea nunca caen seguidos (ver el techo): el que tocaría pasa al Flujo siguiente.
        if (kind === flow && s.sinceTide < C.TIDE_GAP) kind = (kind + 1) % C.FLOWS.length;
        ofTide = kind === flow;
        s.sinceTide = ofTide ? 0 : s.sinceTide + 1;
      }
      s.items.push({ id: s.nextId++, x, y: -16, vy, kind, tide: ofTide });
    }

    const stunned = isStunned(s);
    const remaining: FallingItem[] = [];
    for (const it of s.items) {
      it.y += it.vy * dt;
      const reach = !stunned && it.y >= C.CATCH_Y - 10 && it.y <= C.CATCH_Y + 16 && Math.abs(it.x - s.petX) < s.catchHalf;
      if (reach && it.kind < 0) {
        s.streak = 0;
        s.stunnedUntil = s.tick + C.STUN_TICKS;
        s.last = { tick: s.tick, delta: 0, kind: -1, tide: false, streakBonus: false };
      } else if (reach) {
        s.caught += 1;
        s.streak += 1;
        if (s.streak > s.bestStreak) s.bestStreak = s.streak;
        const streakBonus = s.streak % C.STREAK_EVERY === 0;
        const delta = (it.tide ? 2 : 1) + (streakBonus ? 1 : 0);
        s.score += delta;
        s.last = { tick: s.tick, delta, kind: it.kind, tide: it.tide, streakBonus };
      } else if (it.y < C.H + 20) {
        remaining.push(it);
      }
    }
    s.items = remaining;
    s.tick += 1;
  },
  score: (s) => s.score,
  over: (s) => s.tick >= s.durationTicks,
};
