import { describe, expect, it } from 'vitest';
import { createRng, hashSeed, neutralDims, type Dims } from '@pockai/mind';
import { BARKS_CATALOG } from '../barks';
import { DESKTOP_SKILLS } from '../types/desktopSkills';
import { DESK_CONFIG as cfg } from './deskConfig';
import { DESK_BEHAVIORS, type DeskCommand } from './deskBehaviors';
import { candidatesFor, creditOf, initialBrain, mayBark, meets, resolveMode, stepBrain, type BrainState } from './deskBrain';
import { LEARNING_CONFIG } from './learningStore';
import { buildSituation, cursorKindOf, moodOf, type DeskSituation, type RawSituation } from './deskSituation';
import { stepLocomotion } from './locomotion';

const SCREEN = { w: 1600, h: 900 };
const SIZE = 128;
const GROUND = SCREEN.h - SIZE;

type Overrides = Partial<Omit<RawSituation, 'body' | 'cursor' | 'pet'>> & {
  body?: Partial<RawSituation['body']>;
  cursor?: Partial<RawSituation['cursor']>;
  pet?: Partial<NonNullable<RawSituation['pet']>>;
};

function raw(o: Overrides = {}): RawSituation {
  return {
    now: 0,
    dims: neutralDims(),
    away: false,
    held: false,
    busy: false,
    screen: SCREEN,
    idleMs: 0,
    foreground: null,
    appCategory: 'generic',
    timeOfDay: null,
    pomodoro: 'idle',
    skills: {},
    reducedMotion: false,
    ball: null,
    ...o,
    pet: { hunger: 70, energy: 70, hygiene: 70, happiness: 60, sick: false, sleeping: false, element: 'fire', ...o.pet },
    body: { x: 700, y: GROUND, size: SIZE, dir: 1, surface: 'ground', moving: false, ...o.body },
    cursor: { x: 0, y: 0, onScreen: false, vx: 0, speed: 0, stillMs: 0, ...o.cursor },
  };
}

const sit = (o: Overrides = {}): DeskSituation => buildSituation(raw(o), cfg);

/**
 * Simula la vista: ejecuta las órdenes de movimiento con la locomoción real y devuelve lo que
 * hizo el cerebro en cada tic. Así los tests recorren las conductas de principio a fin.
 */
function simulate(opts: { ticks: number; seed?: string; over?: (t: number) => Overrides; dims?: Dims }) {
  const rng = createRng(hashSeed(opts.seed ?? 'test'));
  let state: BrainState = initialBrain(0);
  const body = { x: 700, y: GROUND, dir: 1 as 1 | -1, surface: 'ground' as RawSituation['body']['surface'] };
  let loco: { targetX: number | null; targetY: number | null; speed: number } | null = null;
  const started: string[] = [];
  const all: DeskCommand[] = [];
  const modes: string[] = [];

  for (let i = 0; i < opts.ticks; i++) {
    const now = i * cfg.thinkMs;
    if (loco) {
      const step = stepLocomotion(body.x, body.y, loco, cfg.thinkMs);
      body.x = step.x;
      body.y = step.y;
      if (step.dir) body.dir = step.dir;
      if (step.arrived) loco = null;
    }
    const o = opts.over?.(now) ?? {};
    const situation = sit({
      ...o,
      now,
      dims: opts.dims ?? o.dims ?? neutralDims(),
      body: { ...body, moving: loco !== null, ...o.body },
    });
    const before = state.active?.id;
    const out = stepBrain(state, situation, rng, cfg);
    state = out.state;
    if (state.active && state.active.id !== before) started.push(state.active.id);
    modes.push(state.mode);
    for (const c of out.commands) {
      all.push(c);
      if (c.type === 'move') {
        loco = { targetX: c.x, targetY: c.y ?? null, speed: cfg.speeds[c.speed] };
      } else if (c.type === 'stop') loco = null;
      else if (c.type === 'surface') body.surface = c.surface;
      else if (c.type === 'drop') {
        body.surface = 'ground';
        body.y = GROUND;
        loco = null;
      } else if (c.type === 'perch') {
        body.surface = 'perched';
        body.x = c.x;
        body.y = c.y;
        loco = null;
      }
    }
  }
  return { started, commands: all, modes, state, body };
}

const count = (list: string[], id: string) => list.filter((x) => x === id).length;
const types = (cmds: DeskCommand[]) => cmds.map((c) => c.type);

describe('catálogo de conductas', () => {
  it('cada conducta de balance.json tiene guion y viceversa', () => {
    expect(Object.keys(cfg.behaviors).sort()).toEqual(Object.keys(DESK_BEHAVIORS).sort());
  });

  it('las habilidades que exigen las conductas existen en el registro', () => {
    const ids = DESKTOP_SKILLS.map((s) => s.id);
    for (const [id, b] of Object.entries(cfg.behaviors)) {
      if (b.requires?.skill) expect(ids, id).toContain(b.requires.skill);
    }
  });

  it('las frases que piden las conductas existen en el catálogo', () => {
    const { commands } = simulate({
      ticks: 4000,
      over: (t) => ({
        timeOfDay: ['morning', 'afternoon', 'evening', 'night', 'late_night'][Math.floor(t / 400000) % 5],
        pet: { happiness: t % 600000 < 300000 ? 20 : 90 },
      }),
    });
    const barks = commands.filter((c) => c.type === 'bark') as Extract<DeskCommand, { type: 'bark' }>[];
    expect(barks.length).toBeGreaterThan(0);
    for (const b of barks) expect(Object.keys(BARKS_CATALOG), b.category).toContain(b.category);
  });
});

describe('pizarra de situación', () => {
  it('el ánimo sigue el mismo criterio que el servidor', () => {
    const base = { hunger: 70, energy: 70, hygiene: 70, happiness: 60, sick: false };
    expect(moodOf(base)).toBe('calm');
    expect(moodOf({ ...base, sick: true })).toBe('sick');
    expect(moodOf({ ...base, hunger: 10 })).toBe('hungry');
    expect(moodOf({ ...base, energy: 10 })).toBe('exhausted');
    expect(moodOf({ ...base, happiness: 90 })).toBe('happy');
    expect(moodOf({ ...base, happiness: 10 })).toBe('sad');
  });

  it('clasifica el cursor por velocidad y quietud', () => {
    expect(cursorKindOf(0, cfg.cursor.stillMs, cfg.cursor)).toBe('still');
    expect(cursorKindOf(cfg.cursor.fastPxPerS, 0, cfg.cursor)).toBe('fast');
    expect(cursorKindOf(100, 0, cfg.cursor)).toBe('slow');
    expect(cursorKindOf(500, 0, cfg.cursor)).toBe('moving');
  });

  it('sin inactividad del sistema la deduce del cursor con un umbral más largo', () => {
    const s = sit({ idleMs: null, cursor: { stillMs: cfg.idle.napAfterMs } });
    expect(s.idleIsNative).toBe(false);
    expect(s.idleMs).toBeLessThan(cfg.idle.napAfterMs);
    expect(sit({ idleMs: null, cursor: { stillMs: cfg.idle.napAfterMs * cfg.idle.cursorOnlyFactor } }).idleMs).toBe(
      cfg.idle.napAfterMs,
    );
  });

  it('tecleando = entrada reciente con el cursor quieto', () => {
    expect(sit({ idleMs: 500, cursor: { stillMs: cfg.idle.typingStillMs } }).typing).toBe(true);
    expect(sit({ idleMs: 500, cursor: { stillMs: 100 } }).typing).toBe(false);
    expect(sit({ idleMs: null, cursor: { stillMs: cfg.idle.typingStillMs } }).typing).toBe(false);
  });
});

describe('modo superior', () => {
  it('sigue el orden de prioridad', () => {
    const fullscreen = { x: 0, y: 0, w: 1600, h: 900, fullscreen: true, id: 1 };
    expect(resolveMode(sit({ away: true, held: true }), cfg)).toBe('away');
    expect(resolveMode(sit({ pet: { sleeping: true }, held: true }), cfg)).toBe('asleep');
    expect(resolveMode(sit({ held: true, foreground: fullscreen }), cfg)).toBe('held');
    expect(resolveMode(sit({ foreground: fullscreen, busy: true }), cfg)).toBe('hidden');
    expect(resolveMode(sit({ busy: true }), cfg)).toBe('busy');
    expect(resolveMode(sit({ pomodoro: 'work', skills: { pomodoro_companion: true } }), cfg)).toBe('focus');
    expect(resolveMode(sit({ pomodoro: 'work' }), cfg)).toBe('free');
  });

  it('la siesta por ausencia necesita la habilidad presence_sense', () => {
    const idle = { idleMs: cfg.idle.napAfterMs };
    expect(resolveMode(sit(idle), cfg)).toBe('free');
    expect(resolveMode(sit({ ...idle, skills: { presence_sense: true } }), cfg)).toBe('napping');
  });
});

describe('decisión', () => {
  it('es determinista: misma semilla y mismas situaciones, mismas órdenes', () => {
    const a = simulate({ ticks: 600, seed: 'x' });
    const b = simulate({ ticks: 600, seed: 'x' });
    expect(a.commands).toEqual(b.commands);
    expect(a.started.length).toBeGreaterThan(10);
  });

  it('dos personalidades opuestas se comportan distinto', () => {
    const high = simulate({ ticks: 20000, dims: { ...neutralDims(), temper: 95, curiosity: 90 } }).started;
    const low = simulate({ ticks: 20000, dims: { ...neutralDims(), temper: 5, curiosity: 10 } }).started;
    expect(count(high, 'zoomies')).toBeGreaterThan(count(low, 'zoomies'));
    expect(count(low, 'rest_sit')).toBeGreaterThan(count(high, 'rest_sit') * 1.5);
    expect(count(high, 'look_around')).toBeGreaterThan(count(low, 'look_around'));
  });

  it('no repite la misma conducta más de dos veces seguidas', () => {
    for (const seed of ['a', 'b', 'c']) {
      const { started } = simulate({ ticks: 6000, seed });
      for (let i = 2; i < started.length; i++) {
        expect(started[i] === started[i - 1] && started[i] === started[i - 2], `${seed}@${i}`).toBe(false);
      }
    }
  });

  it('respeta el enfriamiento del choca-cinco', () => {
    let state = initialBrain(0);
    const rng = createRng(1);
    const offers: number[] = [];
    for (let i = 0; i < 12000; i++) {
      const now = i * cfg.thinkMs;
      const s = sit({ now, cursor: { x: 800, y: 800, onScreen: true, speed: 400, stillMs: 0 } });
      const before = state.active?.id;
      state = stepBrain(state, s, rng, cfg).state;
      if (state.active?.id === 'high_five_offer' && before !== 'high_five_offer') offers.push(now);
    }
    expect(offers.length).toBeGreaterThan(1);
    for (let i = 1; i < offers.length; i++) {
      expect(offers[i] - offers[i - 1]).toBeGreaterThanOrEqual(cfg.behaviors.high_five_offer.cooldownMs!);
    }
  });

  it('sin habilidades no usa ninguna conducta que las exija', () => {
    const state = initialBrain(0);
    const s = sit({ cursor: { x: 900, y: 800, onScreen: true, speed: 2000, stillMs: 0 }, idleMs: 100 });
    const ids = candidatesFor('free', s, state, cfg).map((c) => c.id);
    for (const id of ids) expect(cfg.behaviors[id].requires?.skill, id).toBeUndefined();
  });

  it('con poca energía descarta carreras y prefiere sentarse', () => {
    const state = initialBrain(0);
    const tired = candidatesFor('free', sit({ pet: { energy: 20 } }), state, cfg);
    expect(tired.find((c) => c.id === 'zoomies')).toBeUndefined();
    const rested = candidatesFor('free', sit({ pet: { energy: 70 } }), state, cfg);
    const factor = (list: typeof tired) => list.find((c) => c.id === 'rest_sit')!.factor!;
    expect(factor(tired)).toBeGreaterThan(factor(rested));
  });

  it('con «reducir movimiento» no ofrece carreras ni persecuciones', () => {
    const state = initialBrain(0);
    const s = sit({
      reducedMotion: true,
      skills: { cursor_play: true },
      cursor: { x: 900, y: 800, onScreen: true, speed: 2000, stillMs: 0 },
    });
    const ids = candidatesFor('free', s, state, cfg).map((c) => c.id);
    expect(ids).not.toContain('zoomies');
    expect(ids).not.toContain('cursor_chase');
  });

  it('una conducta desconocida en datos no rompe los requisitos', () => {
    expect(meets({ skill: 'no_existe' }, sit(), initialBrain(0), cfg)).toBe(false);
    expect(meets(undefined, sit(), initialBrain(0), cfg)).toBe(true);
  });
});

describe('perfiles de app y foco', () => {
  it('con música baila; sin ella, nunca', () => {
    expect(count(simulate({ ticks: 6000, over: () => ({ appCategory: 'music' }) }).started, 'dance')).toBeGreaterThan(0);
    expect(count(simulate({ ticks: 6000 }).started, 'dance')).toBe(0);
  });

  it('en juegos se aparta, no corre y no habla', () => {
    const { started, state } = simulate({ ticks: 4000, over: () => ({ appCategory: 'gaming' }) });
    expect(started).toContain('retreat_corner');
    expect(started).not.toContain('zoomies');
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) expect(mayBark(state, sit({ appCategory: 'gaming' }), cfg, rng)).toBe(false);
  });

  it('con código habla menos que en el escritorio', () => {
    const state = initialBrain(0);
    const talk = (app: string) => {
      const rng = createRng(9);
      let n = 0;
      for (let i = 0; i < 1000; i++) if (mayBark(state, sit({ appCategory: app }), cfg, rng)) n++;
      return n;
    };
    expect(talk('generic')).toBe(1000);
    expect(talk('coding')).toBeLessThan(450);
    expect(talk('coding')).toBeGreaterThan(150);
  });

  it('en el trabajo de un Pomodoro solo descansa o mira, y no habla', () => {
    const over = () => ({ pomodoro: 'work' as const, skills: { pomodoro_companion: true } });
    const { started, commands, state } = simulate({ ticks: 4000, over });
    expect(started.length).toBeGreaterThan(5);
    for (const id of started) expect(cfg.focus, id).toContain(id);
    expect(types(commands)).not.toContain('bark');
    expect(mayBark(state, sit(over()), cfg, createRng(1))).toBe(false);
  });
});

describe('reacciones al entorno', () => {
  it('se oculta con una ventana a pantalla completa y vuelve al quitarla', () => {
    const fullscreen = { x: 0, y: 0, w: 1600, h: 900, fullscreen: true, id: 7 };
    const { commands, modes } = simulate({
      ticks: 200,
      over: (t) => ({ foreground: t >= 20000 && t < 60000 ? fullscreen : null }),
    });
    const hides = commands.filter((c) => c.type === 'hide') as Extract<DeskCommand, { type: 'hide' }>[];
    expect(hides.map((h) => h.on)).toEqual([true, false]);
    expect(modes[60]).toBe('hidden');
    expect(modes[199]).toBe('free');
  });

  it('mientras está oculta no hace nada', () => {
    const fullscreen = { x: 0, y: 0, w: 1600, h: 900, fullscreen: true, id: 7 };
    const { commands } = simulate({ ticks: 400, over: () => ({ foreground: fullscreen }) });
    expect(commands.filter((c) => c.type !== 'hide' && c.type !== 'stop' && c.type !== 'pose')).toEqual([]);
  });

  it('duerme la siesta cuando el usuario se va y le da la bienvenida al volver', () => {
    const skills = { presence_sense: true };
    const backAt = 600_000;
    const { commands, modes } = simulate({
      ticks: 1400,
      over: (t) => ({ skills, idleMs: t < backAt ? t : 0 }),
    });
    const naps = commands.filter((c) => c.type === 'nap') as Extract<DeskCommand, { type: 'nap' }>[];
    expect(naps.map((n) => n.on)).toEqual([true, false]);
    expect(modes[Math.floor(cfg.idle.napAfterMs / cfg.thinkMs) + 2]).toBe('napping');
    const after = commands.slice(commands.findIndex((c) => c.type === 'nap' && !c.on));
    expect(after).toContainEqual({ type: 'clip', name: 'wake' });
    expect(after).toContainEqual({ type: 'bark', category: 'welcome_back' });
  });

  it('una ausencia corta no merece bienvenida', () => {
    const skills = { presence_sense: true };
    const backAt = cfg.idle.napAfterMs + 20_000;
    const { commands } = simulate({ ticks: 600, over: (t) => ({ skills, idleMs: t < backAt ? t : 0 }) });
    expect(commands).toContainEqual({ type: 'nap', on: false });
    expect(commands).not.toContainEqual({ type: 'bark', category: 'welcome_back' });
  });

  it('en brazos o dormida no decide nada', () => {
    expect(simulate({ ticks: 300, over: () => ({ held: true }) }).started).toEqual([]);
    expect(simulate({ ticks: 300, over: () => ({ pet: { sleeping: true } }) }).started).toEqual([]);
  });

  it('un clip en curso pausa el cerebro sin cancelar la conducta', () => {
    const rng = createRng(5);
    let state = initialBrain(0);
    let now = 0;
    while (!state.active) {
      now += cfg.thinkMs;
      state = stepBrain(state, sit({ now }), rng, cfg).state;
    }
    const active = state.active;
    const out = stepBrain(state, sit({ now: now + cfg.thinkMs, busy: true }), rng, cfg);
    expect(out.commands).toEqual([]);
    expect(out.state.active).toBe(active);
    expect(out.state.mode).toBe('free');
  });

  it('va a por la pelota cuando rueda', () => {
    const { commands } = simulate({ ticks: 20, over: () => ({ ball: { x: 1200, rolling: true } }) });
    expect(commands).toContainEqual({ type: 'move', x: 1200 - SIZE / 2, speed: 'run' });
  });
});

describe('conductas con el cursor (cursor_play)', () => {
  const skills = { cursor_play: true };

  it('acecha el cursor quieto y se sobresalta si se mueve', () => {
    const { started, commands } = simulate({
      ticks: 400,
      dims: { ...neutralDims(), curiosity: 100 },
      over: (t) => ({
        skills,
        cursor: { x: 1100, y: 850, onScreen: true, speed: t < 60000 ? 0 : 500, stillMs: t < 60000 ? 10000 : 0 },
      }),
    });
    expect(started).toContain('cursor_stalk');
    expect(commands.some((c) => c.type === 'move' && c.speed === 'slow')).toBe(true);
  });

  it('persigue el cursor rápido y lo celebra al alcanzarlo', () => {
    const { started, commands } = simulate({
      ticks: 300,
      dims: { ...neutralDims(), temper: 100 },
      over: () => ({ skills, cursor: { x: 1300, y: 850, onScreen: true, vx: 0, speed: 1500, stillMs: 0 } }),
    });
    expect(started).toContain('cursor_chase');
    expect(commands).toContainEqual({ type: 'clip', name: 'happy' });
  });

  it('solo un Pockai miedoso huye del cursor', () => {
    const over = () => ({
      skills,
      cursor: { x: 880, y: 850, onScreen: true, vx: -600, speed: 600, stillMs: 0 },
    });
    expect(simulate({ ticks: 600, dims: { ...neutralDims(), bravery: 5 }, over }).started).toContain('cursor_shy');
    expect(simulate({ ticks: 600, dims: { ...neutralDims(), bravery: 80 }, over }).started).not.toContain('cursor_shy');
  });

  it('solo un Pockai afectuoso acompaña al cursor', () => {
    const over = () => ({ skills, cursor: { x: 1000, y: 850, onScreen: true, vx: 0, speed: 120, stillMs: 0 } });
    expect(simulate({ ticks: 1200, dims: { ...neutralDims(), affection: 95 }, over }).started).toContain('cursor_follow');
    expect(simulate({ ticks: 1200, dims: { ...neutralDims(), affection: 40 }, over }).started).not.toContain('cursor_follow');
  });
});

describe('trepar y posarse', () => {
  it('trepa por la pared, recorre el techo y se deja caer', () => {
    const { started, commands, body } = simulate({
      ticks: 6000,
      dims: { ...neutralDims(), bravery: 100 },
      over: () => ({ skills: { climb_walls: true } }),
    });
    expect(started).toContain('climb');
    const order = types(commands).filter((t) => t === 'surface' || t === 'drop');
    expect(order.slice(0, 3)).toEqual(['surface', 'surface', 'drop']);
    expect(body.surface).toBe('ground');
  });

  it('se posa en la ventana, la sigue si se mueve y cae si pasa a pantalla completa', () => {
    const win = (t: number) => ({
      x: t < 100_000 ? 300 : 500,
      y: 200,
      w: 800,
      h: 500,
      fullscreen: t >= 130_000,
      id: 1,
    });
    let perchedAt = -1;
    const { commands, started } = simulate({
      ticks: 400,
      dims: { ...neutralDims(), curiosity: 100, bravery: 100 },
      over: (t) => ({ skills: { window_perching: true }, foreground: t >= 60_000 ? win(t) : null }),
    });
    expect(started).toContain('perch_window');
    const perches = commands.filter((c) => c.type === 'perch') as Extract<DeskCommand, { type: 'perch' }>[];
    perchedAt = perches[0].x;
    expect(perches[0].hop).toBe(true);
    // La ventana se desplaza 200 px: la sigue sin salto
    expect(perches.some((p) => !p.hop && Math.abs(p.x - (perchedAt + 200)) < 1)).toBe(true);
    expect(types(commands)).toContain('drop');
  });
});

describe('lo aprendido de su entrenador (spec 41, fase D)', () => {
  const factorOf = (learned: Record<string, number> | undefined, id: string) =>
    candidatesFor('free', sit({ learned }), initialBrain(0), cfg, LEARNING_CONFIG).find((c) => c.id === id)?.factor ?? 0;

  it('lo premiado pesa más y lo cortado menos, dentro de los límites', () => {
    const plain = factorOf(undefined, 'stroll');
    expect(factorOf({ stroll: 1 }, 'stroll')).toBeCloseTo(plain * LEARNING_CONFIG.factor.max, 5);
    expect(factorOf({ stroll: -1 }, 'stroll')).toBeCloseTo(plain * LEARNING_CONFIG.factor.min, 5);
    expect(factorOf({ stroll: 99 }, 'stroll')).toBeCloseTo(plain * LEARNING_CONFIG.factor.max, 5);
    expect(factorOf({ dance: 1 }, 'stroll')).toBe(plain);
  });

  it('no salta los requisitos: lo premiado sigue sin ofrecerse cuando no toca', () => {
    const tired = sit({ learned: { zoomies: 1 }, pet: { energy: 5, happiness: 60 } });
    expect(candidatesFor('free', tired, initialBrain(0), cfg, LEARNING_CONFIG).some((c) => c.id === 'zoomies')).toBe(false);
  });

  it('sin configuración de aprendizaje no cambia nada', () => {
    const a = candidatesFor('free', sit({ learned: { stroll: 1 } }), initialBrain(0), cfg);
    const b = candidatesFor('free', sit(), initialBrain(0), cfg);
    expect(a).toEqual(b);
  });

  it('el gesto va por lo que hace o acaba de hacer', () => {
    const state = initialBrain(0);
    expect(creditOf(state, 1000, LEARNING_CONFIG)).toBeNull();
    expect(creditOf({ ...state, active: { id: 'dance', startedAt: 0, phase: 0, phaseAt: 0, endsAt: 9999, data: {} } }, 1000, LEARNING_CONFIG)).toBe('dance');
    const ended = { ...state, lastEnded: { id: 'stroll', at: 1000 } };
    expect(creditOf(ended, 1000 + LEARNING_CONFIG.creditWindowMs, LEARNING_CONFIG)).toBe('stroll');
    expect(creditOf(ended, 1001 + LEARNING_CONFIG.creditWindowMs, LEARNING_CONFIG)).toBeNull();
  });
});
