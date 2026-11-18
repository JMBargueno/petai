import { describe, expect, it } from 'vitest';
import balance from '../../game-data/balance.json';
import accessibility from '../../game-data/accessibility.json';
import { createRng } from './core/rng';
import { createRunner, replay, type AnyGameDefinition } from './core/runner';
import { maxLogEntries, packLog, unpackLog } from './core/log';
import { TICKS_PER_SECOND, TICK_MS, type GameInput, type GameVariant } from './core/types';
import { GAME_DEFINITIONS } from './logic';
import type { CatchFoodState } from './games/catchFood';
import { memoryMatch, type MemoryMatchState } from './games/memoryMatch';
import { reflex, type ReflexState } from './games/reflex';
import type { PulsoState } from './games/pulsoVoltaico';
import type { CorrienteState } from './games/corrienteDatos';
import { cellMatches, flow, type RaizState } from './games/raizFractal';
import type { CifradoState } from './games/cifrado';
import type { FaroState } from './games/faroClaridad';
import type { ForjaState } from './games/forjaTermica';
import { MINIGAMES } from './registry';
import { parseHostMessage } from './protocol';

type Rules = { durationSeconds: number; minDurationSeconds: number; maxScorePerSecond: number };
const rules = balance.minigames.games as Record<string, Rules>;

// ---------- Bots perfectos (leen el estado; reaccionan en un tick) ----------

type Bot<S> = (s: S) => GameInput[];

const BOTS: Record<string, Bot<any>> = {
  catch_food: (s: CatchFoodState) => {
    const good = s.items.filter((it) => it.kind >= 0).sort((a, b) => b.y - a.y)[0];
    return good ? [{ kind: 'move', x: good.x }] : [];
  },
  memory_match: (s: MemoryMatchState) => {
    const i = s.matched.findIndex((m) => !m);
    if (i < 0 || s.lockedUntil >= 0) return [];
    const j = s.deck.findIndex((f, k) => k !== i && f === s.deck[i]);
    return [{ kind: 'flip', i }, { kind: 'flip', i: j }];
  },
  reflex: (s: ReflexState) => (s.target ? [{ kind: 'hit' }] : []),
  pulso_voltaico: (s: PulsoState) => s.notes.filter((n) => !n.grade && n.hit === s.tick).map((n) => ({ kind: 'tap', lane: n.lane })),
  corriente_datos: (s: CorrienteState) => {
    const next = s.objects.filter((o) => o.kind === 'packet').sort((a, b) => a.spawn + a.fall - (b.spawn + b.fall))[0];
    return next ? [{ kind: 'lane', l: next.lane }] : [];
  },
  raiz_fractal: (s: RaizState) => {
    const i = s.board.cells.findIndex((_, k) => !cellMatches(s.board, k));
    return i >= 0 ? [{ kind: 'rotate', i }] : [];
  },
  cifrado: (s: CifradoState) => (s.phase === 'input' ? [{ kind: 'press', g: s.sequence[s.pos] }] : []),
  faro_claridad: (s: FaroState) => {
    if (s.aim >= 0 && s.corrupt[s.aim]) return [];
    const c = s.corrupt.findIndex(Boolean);
    return [{ kind: 'aim', c }];
  },
  forja_termica: (s: ForjaState) => (s.temp < s.zone - 4 ? [{ kind: 'pump' }] : []),
};

/** Juega con un bot y comprueba el techo en cada tick. Devuelve la puntuación final. */
function playWithCeiling(def: AnyGameDefinition, bot: Bot<any>, seed: number, r: Rules, variant: GameVariant) {
  const s = def.init({ seed, durationSeconds: r.durationSeconds, variant });
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
      throw new Error(`${def.id}/${variant} semilla ${seed}: ${def.score(s)} puntos a los ${t.toFixed(2)} s > techo ${ceiling}`);
    }
  }
  return def.score(s);
}

const IDS = Object.keys(GAME_DEFINITIONS);

describe('techo de puntos (balance.json)', () => {
  for (const id of IDS) {
    for (const [variant, seeds] of [['standard', 300], ['easy', 80]] as const) {
      it(`${id} (${variant}): un bot perfecto nunca supera maxScorePerSecond × max(t, minDuration)`, () => {
        let best = 0;
        for (let seed = 1; seed <= seeds; seed++) best = Math.max(best, playWithCeiling(GAME_DEFINITIONS[id], BOTS[id], seed * 7919, rules[id], variant));
        // El bot tiene que puntuar de verdad, si no el test no prueba nada.
        expect(best).toBeGreaterThan(0);
      });
    }
  }

  it('memory_match: la partida perfecta (24) cabe en el techo de la duración mínima', () => {
    const r = rules.memory_match;
    expect(24).toBeLessThanOrEqual(r.maxScorePerSecond * r.minDurationSeconds);
  });
});

// ---------- Determinismo, repetición y registro empaquetado ----------

/** Jugador aleatorio a través del runner (con tiempos de frame irregulares). */
function randomSession(def: AnyGameDefinition, seed: number, durationSeconds: number, variant: GameVariant = 'standard') {
  const runner = createRunner(def, { seed, durationSeconds, variant });
  const r = createRng(seed ^ 0x5bd1e995);
  const kinds = Object.keys(def.inputKeys);
  while (!runner.over()) {
    if (r() < 0.25) {
      const kind = kinds[Math.floor(r() * kinds.length)];
      const input: GameInput = { kind };
      // Valores plausibles para cada campo; los que no lo sean, el juego los descarta.
      for (const k of def.inputKeys[kind]) input[k] = k === 'x' ? Math.round(r() * 340) : k === 'd' ? (r() < 0.5 ? -1 : 1) : Math.floor(r() * 16) - (k === 'c' ? 1 : 0);
      runner.push(input);
    }
    runner.advance(TICK_MS * (0.5 + r() * 2));
  }
  return { score: runner.score(), ticks: runner.tick, log: [...runner.log] };
}

describe('determinismo', () => {
  for (const id of IDS) {
    it(`${id}: semilla + registro empaquetado reproducen la misma puntuación`, () => {
      const def = GAME_DEFINITIONS[id];
      const duration = rules[id].durationSeconds;
      for (const seed of [1, 42, 2024, 99991, 2 ** 31 - 2]) {
        for (const variant of ['standard', 'easy'] as const) {
          const played = randomSession(def, seed, duration, variant);
          const opts = { seed, durationSeconds: duration, variant };
          const again = replay(def, opts, played.log);
          expect(again).toEqual({ score: played.score, ticks: played.ticks });
          // Viaje completo: empaquetar → JSON → desempaquetar → repetir (lo que hace el servidor).
          const wire = JSON.parse(JSON.stringify(packLog(def, played.log)));
          const unpacked = unpackLog(def, wire, maxLogEntries(duration * TICKS_PER_SECOND));
          expect(unpacked).not.toBeNull();
          expect(replay(def, opts, unpacked!)).toEqual(again);
        }
      }
    });
  }

  it('unpackLog rechaza registros mal formados o demasiado largos', () => {
    const def = GAME_DEFINITIONS.catch_food;
    expect(unpackLog(def, [[0, 'move', 10], [3, 'dir', -1]])).toEqual([
      { kind: 'move', tick: 0, x: 10 },
      { kind: 'dir', tick: 3, d: -1 },
    ]);
    expect(unpackLog(def, 'nope')).toBeNull();
    expect(unpackLog(def, [[-1, 'move', 10]])).toBeNull();
    expect(unpackLog(def, [[0, 'teleport', 10]])).toBeNull();
    expect(unpackLog(def, [[0, 'move']])).toBeNull();
    expect(unpackLog(def, [[0, 'move', 'x']])).toBeNull();
    expect(unpackLog(def, [[0, 'dir', 5]])).toBeNull();
    expect(unpackLog(def, [[0, 'move', 1], [0, 'move', 2]], 1)).toBeNull();
  });

  it('replay descarta entradas no válidas y respeta maxTicks', () => {
    const opts = { seed: 7, durationSeconds: 5 };
    const clean = replay(reflex as never, opts, []);
    expect(replay(reflex as never, opts, [null, 'x', { tick: -1, kind: 'hit' }, { tick: 3, kind: 'nope' }])).toEqual(clean);
    expect(replay(reflex as never, opts, [], 60).ticks).toBe(60);
  });

  it('memory_match conserva el barajado de escritorio (mulberry32 + Fisher-Yates)', () => {
    const a = memoryMatch.init({ seed: 123, durationSeconds: 90 }).deck;
    expect(memoryMatch.init({ seed: 123, durationSeconds: 90 }).deck).toEqual(a);
    expect([...a].sort()).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
    expect(memoryMatch.init({ seed: 123, durationSeconds: 90, variant: 'easy' }).deck).toHaveLength(8);
  });

  it('raiz_fractal: los tableros tienen solución y no empiezan resueltos', () => {
    const def = GAME_DEFINITIONS.raiz_fractal;
    for (let seed = 1; seed <= 200; seed++) {
      const s = def.init({ seed, durationSeconds: 90 }) as RaizState;
      expect(flow(s.board).solved).toBe(false);
      expect(flow({ ...s.board, cells: s.board.solution.map((m, i) => (m >= 0 ? m : s.board.cells[i])) }).solved).toBe(true);
    }
  });
});

// ---------- Catálogo y datos ----------

describe('catálogo', () => {
  it('lógica, registro y balance.json tienen los mismos juegos', () => {
    expect(Object.keys(GAME_DEFINITIONS).sort()).toEqual(Object.keys(rules).sort());
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
    expect(parseHostMessage({ ...ok, variant: 'easy' })).toMatchObject({ variant: 'easy' });
    expect(parseHostMessage(JSON.stringify(ok))).toMatchObject(ok);
    expect(parseHostMessage({ type: 'dispose' })).toEqual({ type: 'dispose' });
    expect(parseHostMessage({ type: 'pause' })).toEqual({ type: 'pause' });
    expect(parseHostMessage({ type: 'start', gameId: 'reflex', seed: 1.5, durationSeconds: 30 })).toBeNull();
    expect(parseHostMessage({ type: 'start', gameId: 'reflex', seed: 1, durationSeconds: -1 })).toBeNull();
    expect(parseHostMessage('{no json')).toBeNull();
    expect(parseHostMessage(null)).toBeNull();
  });
});
