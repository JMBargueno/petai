import { describe, expect, it } from 'vitest';
import balance from '../../game-data/balance.json';
import accessibility from '../../game-data/accessibility.json';
import { createRng } from './core/rng';
import { createRunner, replay } from './core/runner';
import { TICKS_PER_SECOND, TICK_MS, type GameDefinition, type GameInput } from './core/types';
import { catchFood, type CatchFoodState } from './games/catchFood';
import { memoryMatch, type MemoryMatchState } from './games/memoryMatch';
import { reflex, type ReflexState } from './games/reflex';
import { MINIGAMES } from './registry';
import { parseHostMessage } from './protocol';

type Rules = { durationSeconds: number; minDurationSeconds: number; maxScorePerSecond: number };
const rules = balance.minigames.games as Record<string, Rules>;

// ---------- Bots perfectos (leen el estado; reaccionan en un tick) ----------

type Bot<S> = (s: S) => GameInput[];

const catchBot: Bot<CatchFoodState> = (s) => {
  // Se coloca bajo la comida buena más baja; ignora las piedras.
  const good = s.items.filter((it) => it.kind >= 0).sort((a, b) => b.y - a.y)[0];
  return good ? [{ kind: 'move', x: good.x }] : [];
};

const memoryBot: Bot<MemoryMatchState> = (s) => {
  // Conoce el mazo: destapa una pareja entera en cada tick.
  const i = s.matched.findIndex((m) => !m);
  if (i < 0 || s.lockedUntil >= 0) return [];
  const j = s.deck.findIndex((f, k) => k !== i && f === s.deck[i]);
  return [{ kind: 'flip', i }, { kind: 'flip', i: j }];
};

const reflexBot: Bot<ReflexState> = (s) => (s.target ? [{ kind: 'hit' }] : []);

/** Juega con un bot y comprueba el techo en cada tick. Devuelve la puntuación final. */
function playWithCeiling<S>(def: GameDefinition<S, GameInput>, bot: Bot<S>, seed: number, r: Rules) {
  const s = def.init({ seed, durationSeconds: r.durationSeconds });
  let tick = 0;
  while (!def.over(s)) {
    for (const inp of bot(s)) {
      const parsed = def.parseInput(inp);
      if (parsed) def.input(s, parsed);
    }
    def.step(s);
    tick += 1;
    const t = tick / TICKS_PER_SECOND;
    const ceiling = r.maxScorePerSecond * Math.max(t, r.minDurationSeconds);
    if (def.score(s) > ceiling) {
      throw new Error(`${def.id} semilla ${seed}: ${def.score(s)} puntos a los ${t.toFixed(2)} s > techo ${ceiling}`);
    }
  }
  return def.score(s);
}

const CASES: [string, GameDefinition<any, GameInput>, Bot<any>][] = [
  ['catch_food', catchFood as never, catchBot],
  ['memory_match', memoryMatch as never, memoryBot],
  ['reflex', reflex as never, reflexBot],
];

describe('techo de puntos (balance.json)', () => {
  for (const [id, def, bot] of CASES) {
    it(`${id}: un bot perfecto nunca supera maxScorePerSecond × max(t, minDuration)`, () => {
      let best = 0;
      for (let seed = 1; seed <= 500; seed++) best = Math.max(best, playWithCeiling(def, bot, seed * 7919, rules[id]));
      // El bot tiene que puntuar de verdad, si no el test no prueba nada.
      expect(best).toBeGreaterThan(0);
    });
  }

  it('memory_match: la partida perfecta (24) cabe en el techo de la duración mínima', () => {
    const r = rules.memory_match;
    expect(24).toBeLessThanOrEqual(r.maxScorePerSecond * r.minDurationSeconds);
  });
});

// ---------- Determinismo y repetición ----------

/** Jugador aleatorio a través del runner (con tiempos de frame irregulares). */
function randomSession(def: GameDefinition<any, GameInput>, seed: number, durationSeconds: number) {
  const runner = createRunner(def, { seed, durationSeconds });
  const r = createRng(seed ^ 0x5bd1e995);
  while (!runner.over()) {
    const roll = r();
    if (def.id === 'catch_food') {
      if (roll < 0.3) runner.push({ kind: 'move', x: r() * 340 });
      else if (roll < 0.35) runner.push({ kind: 'dir', d: (Math.floor(r() * 3) - 1) as -1 | 0 | 1 });
    } else if (def.id === 'memory_match') {
      if (roll < 0.2) runner.push({ kind: 'flip', i: Math.floor(r() * 16) });
    } else if (roll < 0.15) {
      runner.push({ kind: 'hit' });
    }
    runner.advance(TICK_MS * (0.5 + r() * 2));
  }
  return { score: runner.score(), ticks: runner.tick, log: [...runner.log] };
}

describe('determinismo', () => {
  for (const [id, def] of CASES) {
    it(`${id}: semilla + registro de entradas reproducen la misma puntuación`, () => {
      for (const seed of [1, 42, 2024, 99991, 2 ** 31 - 2]) {
        const played = randomSession(def, seed, rules[id].durationSeconds);
        const again = replay(def, { seed, durationSeconds: rules[id].durationSeconds }, played.log);
        expect(again).toEqual({ score: played.score, ticks: played.ticks });
        // El registro sobrevive a JSON (es lo que viaja por el puente y, en fase 3, al servidor).
        expect(replay(def, { seed, durationSeconds: rules[id].durationSeconds }, JSON.parse(JSON.stringify(played.log)))).toEqual(again);
      }
    });
  }

  it('replay descarta entradas no válidas', () => {
    const opts = { seed: 7, durationSeconds: 5 };
    const clean = replay(reflex as never, opts, []);
    expect(replay(reflex as never, opts, [null, 'x', { tick: -1, kind: 'hit' }, { tick: 3, kind: 'nope' }])).toEqual(clean);
  });

  it('memory_match conserva el barajado de escritorio (mulberry32 + Fisher-Yates)', () => {
    const a = memoryMatch.init({ seed: 123, durationSeconds: 90 }).deck;
    const b = memoryMatch.init({ seed: 123, durationSeconds: 90 }).deck;
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
  });
});

// ---------- Catálogo y datos ----------

describe('catálogo', () => {
  it('el registro y balance.json tienen los mismos juegos', () => {
    expect(Object.keys(MINIGAMES).sort()).toEqual(Object.keys(rules).sort());
  });

  it('cada juego tiene variante accesible en accessibility.json', () => {
    for (const id of Object.keys(rules)) expect(accessibility.minigames).toHaveProperty(id);
  });
});

describe('protocolo', () => {
  it('acepta start válido (también como texto JSON) y rechaza basura', () => {
    const ok = { type: 'start', gameId: 'reflex', seed: 5, durationSeconds: 30 };
    expect(parseHostMessage(ok)).toMatchObject({ ...ok, variant: 'standard', reducedMotion: false });
    expect(parseHostMessage(JSON.stringify(ok))).toMatchObject(ok);
    expect(parseHostMessage({ type: 'dispose' })).toEqual({ type: 'dispose' });
    expect(parseHostMessage({ type: 'start', gameId: 'reflex', seed: 1.5, durationSeconds: 30 })).toBeNull();
    expect(parseHostMessage({ type: 'start', gameId: 'reflex', seed: 1, durationSeconds: -1 })).toBeNull();
    expect(parseHostMessage('{no json')).toBeNull();
    expect(parseHostMessage(null)).toBeNull();
  });
});
