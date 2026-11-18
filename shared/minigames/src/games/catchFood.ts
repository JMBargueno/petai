import { createRng } from '../core/rng';
import { TICKS_PER_SECOND, secondsToTicks, type GameDefinition, type GameOptions } from '../core/types';

/**
 * Atrapa la comida: la cesta se mueve en horizontal y recoge lo que cae. Comida +1, piedra −1
 * (mínimo 0). Un objeto cada 0,55 s: ≤ 1,82 puntos/s, por debajo del techo de 3 del servidor.
 */
export const CATCH_FOOD = {
  W: 340,
  H: 260,
  BASKET_W: 64,
  BASKET_Y: 260 - 34,
  SPAWN_TICKS: secondsToTicks(0.55),
  BAD_CHANCE: 0.2,
  KEY_SPEED: 280, // px/s
  GOOD_KINDS: 4,
} as const;

export interface FallingItem {
  id: number;
  x: number;
  y: number;
  vy: number;
  /** Índice de comida (0..GOOD_KINDS-1) o −1 para la piedra. */
  kind: number;
}

export interface CatchFoodState {
  rng: () => number;
  durationTicks: number;
  tick: number;
  basketX: number;
  dir: -1 | 0 | 1;
  items: FallingItem[];
  nextId: number;
  spawnAcc: number;
  score: number;
  caught: number;
  /** Último cambio de puntuación (para el destello de la vista). */
  lastDelta: { tick: number; delta: number } | null;
}

export type CatchFoodInput = { kind: 'move'; x: number } | { kind: 'dir'; d: -1 | 0 | 1 };

const C = CATCH_FOOD;
const clampBasket = (x: number) => Math.min(C.W - C.BASKET_W / 2, Math.max(C.BASKET_W / 2, x));

export const catchFood: GameDefinition<CatchFoodState, CatchFoodInput> = {
  id: 'catch_food',
  coalesce: ['move'],
  init({ seed, durationSeconds }: GameOptions) {
    return {
      rng: createRng(seed),
      durationTicks: secondsToTicks(durationSeconds),
      tick: 0,
      basketX: C.W / 2,
      dir: 0,
      items: [],
      nextId: 0,
      spawnAcc: 0,
      score: 0,
      caught: 0,
      lastDelta: null,
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
    if (inp.kind === 'move') s.basketX = clampBasket(inp.x);
    else s.dir = inp.d;
  },
  step(s) {
    if (s.tick >= s.durationTicks) return;
    const dt = 1 / TICKS_PER_SECOND;
    s.basketX = clampBasket(s.basketX + s.dir * C.KEY_SPEED * dt);

    s.spawnAcc += 1;
    if (s.spawnAcc >= C.SPAWN_TICKS) {
      s.spawnAcc = 0;
      const bad = s.rng() < C.BAD_CHANCE;
      const x = 16 + s.rng() * (C.W - 32);
      const vy = 90 + s.rng() * 70;
      const kind = bad ? -1 : Math.floor(s.rng() * C.GOOD_KINDS);
      s.items.push({ id: s.nextId++, x, y: -16, vy, kind });
    }

    const remaining: FallingItem[] = [];
    for (const it of s.items) {
      it.y += it.vy * dt;
      const caught = it.y >= C.BASKET_Y - 8 && it.y <= C.BASKET_Y + 18 && Math.abs(it.x - s.basketX) < C.BASKET_W / 2 + 6;
      if (caught) {
        if (it.kind < 0) {
          s.score = Math.max(0, s.score - 1);
        } else {
          s.score += 1;
          s.caught += 1;
        }
        s.lastDelta = { tick: s.tick, delta: it.kind < 0 ? -1 : 1 };
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
