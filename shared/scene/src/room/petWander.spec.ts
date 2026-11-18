import { describe, expect, it } from 'vitest';
import { createRng, hashSeed, neutralDims, pushRecent, type Dims } from '@pockai/mind';
import type { Interaction } from '../protocol';
import { parseHostMessage } from '../protocol';
import {
  ROOM_CONFIG as cfg,
  NEUTRAL_NEEDS,
  byNearest,
  cellsByDistance,
  chooseRoomAction,
  parseRoomMind,
  roomCandidates,
  type RoomMind,
  type RoomNeeds,
} from './petWander';

const ALL = new Set<Interaction>(['eat', 'bathe', 'play', 'sit', 'sleep']);

function mind(needs: Partial<RoomNeeds> = {}, dims: Partial<Dims> = {}): RoomMind {
  return { dims: { ...neutralDims(), ...dims }, needs: { ...NEUTRAL_NEEDS, ...needs }, seed: 1 };
}

/** Simula `turns` decisiones, una cada 5 s, y devuelve lo elegido. */
function run(m: RoomMind | null, opts: { turns?: number; seed?: string; available?: Set<Interaction>; sunny?: boolean } = {}) {
  const rng = createRng(hashSeed(opts.seed ?? 'sala'));
  let recent: string[] = [];
  const lastAt: Record<string, number> = {};
  const picks: string[] = [];
  for (let i = 0; i < (opts.turns ?? 400); i++) {
    const now = i * 5000;
    const action = chooseRoomAction({ mind: m, available: opts.available ?? ALL, sunny: opts.sunny ?? false, recent, lastAt, now, rng });
    if (!action) break;
    picks.push(action.id);
    recent = pushRecent(recent, action.id, cfg.antiRepeat.window);
    lastAt[action.id] = now;
  }
  return picks;
}

const count = (picks: string[], id: string) => picks.filter((p) => p === id).length;

describe('qué hace el Pockai en su sala', () => {
  it('es determinista con la misma semilla', () => {
    expect(run(mind(), { seed: 'a' })).toEqual(run(mind(), { seed: 'a' }));
  });

  it('con hambre va mucho más al comedero', () => {
    expect(count(run(mind({ hunger: 10 })), 'eat')).toBeGreaterThan(count(run(mind({ hunger: 90 })), 'eat') * 2);
  });

  it('sucio va mucho más a la fuente', () => {
    expect(count(run(mind({ hygiene: 10 })), 'bathe')).toBeGreaterThan(count(run(mind({ hygiene: 90 })), 'bathe') * 2);
  });

  it('cansado se sienta más y juega menos', () => {
    const tired = run(mind({ energy: 15 }));
    const fresh = run(mind({ energy: 90 }));
    expect(count(tired, 'sit')).toBeGreaterThan(count(fresh, 'sit'));
    expect(count(tired, 'play')).toBeLessThan(count(fresh, 'play'));
  });

  it('la personalidad inclina la balanza: el inquieto juega, el tranquilo se sienta', () => {
    const lively = run(mind({}, { temper: 95 }));
    const calm = run(mind({}, { temper: 5 }));
    expect(count(lively, 'play')).toBeGreaterThan(count(calm, 'play'));
    expect(count(calm, 'sit')).toBeGreaterThan(count(lively, 'sit'));
  });

  it('no ofrece muebles que la sala no tiene', () => {
    const picks = run(mind({ hunger: 5 }), { available: new Set<Interaction>(['sit']) });
    expect(count(picks, 'eat')).toBe(0);
    expect(count(picks, 'bathe')).toBe(0);
    expect(count(picks, 'sit')).toBeGreaterThan(0);
  });

  it('solo se alegra con buen tiempo', () => {
    expect(count(run(mind(), { sunny: false }), 'cheer')).toBe(0);
    expect(count(run(mind(), { sunny: true }), 'cheer')).toBeGreaterThan(0);
  });

  it('sin muebles ni sol sigue teniendo algo que hacer', () => {
    const picks = run(mind(), { available: new Set(), turns: 20 });
    expect(picks).toHaveLength(20);
    expect(new Set(picks)).toEqual(new Set(['stroll']));
  });

  it('no repite la misma acción más de dos veces seguidas si hay otra', () => {
    const picks = run(mind({ hunger: 5 }), { turns: 300 });
    for (let i = 2; i < picks.length; i++) {
      expect(picks[i] === picks[i - 1] && picks[i] === picks[i - 2], `@${i}`).toBe(false);
    }
  });

  it('respeta el enfriamiento del comedero aunque tenga hambre', () => {
    const rng = createRng(4);
    const lastAt = { eat: 0 };
    for (let i = 0; i < 50; i++) {
      const a = chooseRoomAction({ mind: mind({ hunger: 0 }), available: ALL, sunny: false, recent: [], lastAt, now: cfg.actions.eat.cooldownMs! - 1, rng });
      expect(a?.id).not.toBe('eat');
    }
  });

  it('sin datos del anfitrión se porta de forma neutra (apps antiguas)', () => {
    const picks = run(null);
    expect(picks.length).toBe(400);
    expect(count(picks, 'stroll')).toBeGreaterThan(count(picks, 'eat'));
    expect(roomCandidates({ mind: null, available: ALL, sunny: false }).every((c) => c.factor === 1)).toBe(true);
  });

  it('cada acción con mueble devuelve su interacción', () => {
    const rng = createRng(2);
    const a = chooseRoomAction({ mind: mind({ hunger: 0 }), available: new Set<Interaction>(['eat']), sunny: false, recent: ['stroll', 'stroll'], lastAt: {}, now: 0, rng });
    expect(a).toEqual({ id: 'eat', interaction: 'eat' });
  });
});

describe('a qué mueble y por dónde', () => {
  it('ordena las celdas de una huella por cercanía', () => {
    expect(cellsByDistance(['2,2', '3,2', '2,3', '3,3'], { x: 6, y: 6 })[0]).toEqual({ x: 3, y: 3 });
    expect(cellsByDistance(['2,2', '3,2'], { x: 0, y: 2 })[0]).toEqual({ x: 2, y: 2 });
  });

  it('prefiere el mueble más cercano', () => {
    const far = { id: 'lejos', cells: ['10,8'] };
    const near = { id: 'cerca', cells: ['2,1', '3,1'] };
    expect(byNearest([far, near], { x: 1, y: 1 }).map((f) => f.id)).toEqual(['cerca', 'lejos']);
  });
});

describe('datos que llegan por el puente', () => {
  it('acepta una mente válida y acota los valores', () => {
    const m = parseRoomMind({ dims: { ...neutralDims(), temper: 400 }, needs: { hunger: -5, energy: 30 }, seed: 12.7 });
    expect(m?.dims.temper).toBe(100);
    expect(m?.needs).toEqual({ hunger: 0, energy: 30, hygiene: 60, happiness: 60 });
    expect(m?.seed).toBe(12);
  });

  it('rechaza lo que no es una mente', () => {
    expect(parseRoomMind(null)).toBeNull();
    expect(parseRoomMind({ dims: { curiosity: 'mucha' } })).toBeNull();
    expect(parseRoomMind('hola')).toBeNull();
  });

  it('setActivity admite `mind` y sigue valiendo sin él', () => {
    const withMind = parseHostMessage({ type: 'setActivity', activity: 'idle', rest: 'idle', mind: { dims: neutralDims(), needs: NEUTRAL_NEEDS, seed: 3 } });
    expect(withMind).toMatchObject({ type: 'setActivity', activity: 'idle', mind: { seed: 3 } });
    const plain = parseHostMessage({ type: 'setActivity', activity: 'sleep' });
    expect(plain).toEqual({ type: 'setActivity', activity: 'sleep' });
    // Una mente inválida se descarta sin tirar el mensaje
    expect(parseHostMessage({ type: 'setActivity', activity: 'idle', mind: 'x' })).toEqual({ type: 'setActivity', activity: 'idle' });
  });
});
