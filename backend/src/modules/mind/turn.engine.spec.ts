import * as fs from 'fs';
import * as path from 'path';
import { decideBehavior, validateBehavior } from './behavior.engine';
import { MemoryRow, buildLayeredMemoryBlock, selectForPrompt } from './memory.engine';
import { Dims, PersonalityConfig, StoredPersonality } from './mind.types';
import { neutralDims } from './personality.engine';
import { nextTrick, normalizeTricks, practiceTrick, trickToPerform } from './tricks.engine';
import { TurnInput, planOwnerTurn, settleOwnerTurn, subjectByName } from './turn.engine';
import { WishContext, activeWishes, activityBoosts, afterChatTurn, fulfilWish, mayShowWish, normalizeWishes } from './wishes.engine';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const cfg = balance.personality as PersonalityConfig;
const NOW = new Date('2026-11-18T12:00:00Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const AWAKE = { sleeping: false, sick: false, energy: 80 };

const row = (over: Partial<MemoryRow>): MemoryRow => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  kind: 'event',
  layer: 'episodic',
  content: 'algo',
  importance: 0.5,
  valence: 0,
  createdAt: NOW,
  ...over,
});

const input = (over: Partial<TurnInput> = {}): TurnInput => ({
  message: 'pues nada, aquí trabajando',
  pet: { id: 'pet-1', hunger: 70, energy: 70, hygiene: 70, happiness: 60, health: 100, sleeping: false, sick: false, lastInteractionAt: new Date(NOW.getTime() - 60_000) },
  dims: neutralDims(),
  stored: {},
  rows: [],
  now: NOW,
  ...over,
});

describe('Tricks Engine (spec 37 §4.6)', () => {
  const t = cfg.tricks;

  it('aprende el primer truco tras las prácticas que pide y pasa al siguiente', () => {
    let state = normalizeTricks(undefined, t);
    const first = nextTrick(state, neutralDims(), t)!;
    let learned: string | null = null;
    for (let i = 0; i < t.catalog[first].practices; i++) {
      const res = practiceTrick(state, neutralDims(), t, `d${i}`, 'self');
      state = res.state;
      learned = res.learned;
    }
    expect(learned).toBe(first);
    expect(state.known).toEqual([first]);
    expect(nextTrick(state, neutralDims(), t)).not.toBe(first);
  });

  it('veinte enseñanzas en un día no superan el tope diario', () => {
    let state = normalizeTricks(undefined, t);
    let counted = 0;
    for (let i = 0; i < 20; i++) {
      const res = practiceTrick(state, neutralDims(), t, '2026-11-18', 'teach');
      state = res.state;
      if (res.counted) counted++;
    }
    expect(counted).toBe(t.teachDailyCap);
    expect(state.taughtToday).toBe(t.teachDailyCap);
    // Al día siguiente vuelve a contar
    expect(practiceTrick(state, neutralDims(), t, '2026-11-19', 'teach').counted).toBe(true);
  });

  it('practicar por su cuenta no gasta el tope de enseñanzas', () => {
    let state = normalizeTricks(undefined, t);
    for (let i = 0; i < 2; i++) state = practiceTrick(state, neutralDims(), t, 'd', 'self').state;
    expect(state.taughtToday).toBe(0);
  });

  it('no aprende un truco para el que no tiene carácter', () => {
    const shy = { ...neutralDims(), sociability: 5, curiosity: 5, affection: 5, bravery: 5 };
    let state = normalizeTricks(undefined, t);
    for (let i = 0; i < 60; i++) state = practiceTrick(state, shy, t, `d${i}`, 'self').state;
    for (const id of state.known) {
      for (const [d, min] of Object.entries(t.catalog[id].minDims ?? {})) expect(shy[d as keyof Dims]).toBeGreaterThanOrEqual(min as number);
    }
    expect(state.known.length).toBeGreaterThan(0);
    expect(state.known.length).toBeLessThan(Object.keys(t.catalog).length);
  });

  it('no puede hacer un truco que no ha aprendido', () => {
    expect(trickToPerform(normalizeTricks(undefined, t), 0.5)).toBeNull();
    expect(validateBehavior('perform_trick', neutralDims(), AWAKE, cfg, 'owner', new Set()).ok).toBe(false);
    expect(validateBehavior('perform_trick', neutralDims(), AWAKE, cfg, 'owner', new Set(['knows_trick'])).ok).toBe(true);
  });

  it('limpia lo guardado: trucos que ya no existen, duplicados y basura', () => {
    const state = normalizeTricks({ known: ['spin', 'spin', 'volar', 7], learning: { id: 'spin', done: 2 }, taughtToday: 'muchas' }, t);
    expect(state.known).toEqual(['spin']);
    expect(state.learning).toBeNull();
    expect(state.taughtToday).toBe(0);
  });
});

describe('Wishes Engine (spec 37 §4.5)', () => {
  const w = cfg.wishes;
  const ctx = (over: Partial<WishContext> = {}): WishContext => ({
    dims: neutralDims(),
    now: NOW,
    awayMinutes: 600,
    daysSinceAdventure: 5,
    daysSinceFriend: 5,
    hasUntoldFind: false,
    canLearnTrick: true,
    energy: 80,
    sick: false,
    ...over,
  });
  const fresh = normalizeWishes(undefined);

  it('dos personalidades opuestas quieren cosas distintas con las mismas necesidades', () => {
    const explorer = activeWishes(ctx({ dims: { ...neutralDims(), curiosity: 95, bravery: 80, sociability: 10, affection: 10 } }), fresh, w);
    const cuddly = activeWishes(ctx({ dims: { ...neutralDims(), curiosity: 5, bravery: 20, sociability: 20, affection: 95 } }), fresh, w);
    expect(explorer[0]).toBe('go_explore');
    expect(cuddly[0]).toBe('be_cuddled');
    expect(explorer).not.toEqual(cuddly);
  });

  it('como mucho dos deseos a la vez', () => {
    expect(activeWishes(ctx({ hasUntoldFind: true, dims: { ...neutralDims(), curiosity: 90, sociability: 90, affection: 90 } }), fresh, w).length).toBeLessThanOrEqual(w.maxActive);
  });

  it('no desea lo que no viene a cuento', () => {
    expect(activeWishes(ctx({ daysSinceAdventure: 0 }), fresh, w)).not.toContain('go_explore');
    expect(activeWishes(ctx({ daysSinceFriend: null }), fresh, w)).not.toContain('see_friend');
    expect(activeWishes(ctx({ awayMinutes: 5 }), fresh, w)).not.toContain('be_cuddled');
    expect(activeWishes(ctx({ canLearnTrick: false }), fresh, w)).not.toContain('learn_trick');
    expect(activeWishes(ctx({ sick: true, dims: { ...neutralDims(), curiosity: 95 } }), fresh, w)).not.toContain('go_explore');
    expect(activeWishes(ctx({ hasUntoldFind: true }), fresh, w)[0]).toBe('show_find');
  });

  it('un deseo cumplido no vuelve hasta que pasa su enfriamiento', () => {
    const explorer = ctx({ dims: { ...neutralDims(), curiosity: 95, bravery: 80 } });
    const done = fulfilWish(fresh, 'go_explore', NOW, w)!;
    expect(activeWishes(explorer, done, w)).not.toContain('go_explore');
    const later = new Date(NOW.getTime() + (w.cooldownHours + 1) * 3_600_000);
    expect(activeWishes({ ...explorer, now: later }, done, w)).toContain('go_explore');
    expect(fulfilWish(fresh, 'deseo_inventado', NOW, w)).toBeNull();
  });

  it('saca un deseo como mucho cada tantos turnos', () => {
    let state = fresh;
    const shown: number[] = [];
    for (let turn = 0; turn < 30; turn++) {
      const show = mayShowWish(state, w);
      if (show) shown.push(turn);
      state = afterChatTurn(state, show ? 'go_explore' : null);
    }
    expect(shown[0]).toBe(0);
    for (let i = 1; i < shown.length; i++) expect(shown[i] - shown[i - 1]).toBeGreaterThanOrEqual(w.showEveryTurns);
    expect(shown.length).toBe(Math.ceil(30 / w.showEveryTurns));
  });

  it('en la vida autónoma favorece la actividad que lo satisface', () => {
    const boosts = activityBoosts(['go_explore', 'be_cuddled'], w);
    expect(boosts.explore).toBeGreaterThan(1);
    expect(boosts.socialize).toBeUndefined();
    expect(activityBoosts([], w)).toEqual({});
  });
});

describe('Turn Engine — un turno con su entrenador (spec 37 §4.5–4.7)', () => {
  const explorer: Dims = { ...neutralDims(), curiosity: 95, bravery: 80 };
  const lived = [
    row({ id: 'find', kind: 'find', content: 'Explorando encontré algo: una semilla solar. ¡Lo guardé para mi entrenador!', createdAt: ago(0.2) }),
    row({ id: 'visit', kind: 'encounter', subject: 'pet:brasa', content: 'Ana vino a visitarme con Brasa. Nos olisqueamos con curiosidad.', createdAt: ago(0.5) }),
    row({ id: 'emo-brasa', layer: 'emotional', kind: 'relation', key: 'emo:pet:brasa', subject: 'pet:brasa', content: 'Brasa (Pockai de Ana)', valence: 0.3 }),
    row({ id: 'emo-owner', layer: 'emotional', kind: 'relation', key: 'emo:owner', subject: 'owner', content: 'Mi entrenador', valence: 0.5 }),
    row({ id: 'adv', kind: 'adventure', content: 'Viví una aventura: la cueva de los ecos.', createdAt: ago(6), lastRecalledAt: ago(5) }),
  ];

  it('«¿qué has hecho hoy?» cuenta lo vivido y garantiza esos recuerdos en el prompt', () => {
    const plan = planOwnerTurn(input({ message: '¿Qué has hecho hoy?', rows: lived }), cfg);
    expect(plan.interpretation.intent).toBe('ask_life');
    expect(['tell_story', 'bring_gift']).toContain(plan.behavior.action);
    expect(plan.ensureIds).toEqual(expect.arrayContaining(['find', 'visit']));
    // Con un mensaje que no comparte palabras con ellos, esos recuerdos entran igual
    const sel = selectForPrompt([...lived], '¿Qué has hecho hoy?', NOW, cfg, 1400, { ensureIds: plan.ensureIds });
    const block = buildLayeredMemoryBlock(sel, NOW);
    expect(block).toContain('semilla solar');
    expect(block).toContain('Brasa');
    expect(sel.matched).toEqual(expect.arrayContaining(['find', 'visit']));
  });

  it('sin nada vivido no se inventa una historia', () => {
    const plan = planOwnerTurn(input({ message: '¿Qué has hecho hoy?' }), cfg);
    expect(plan.behavior.action).not.toBe('tell_story');
    expect(plan.ensureIds).toEqual([]);
    expect(plan.hints.join(' ')).toContain('no inventes');
  });

  it('«¿cómo está Brasa?» trae los recuerdos de Brasa', () => {
    const plan = planOwnerTurn(input({ message: '¿Cómo está Brasa?', rows: lived }), cfg);
    expect(plan.interpretation).toMatchObject({ intent: 'ask_friend', mentioned: 'Brasa' });
    expect(plan.subject).toBe('pet:brasa');
    const sel = selectForPrompt([...lived], '¿Cómo está Brasa?', NOW, cfg, 1400, { subject: plan.subject });
    expect(sel.episodic.map((m) => m.id)).toContain('visit');
    expect(sel.emotional.map((m) => m.id)).toContain('emo-brasa');
  });

  it('un nombre desconocido no inventa recuerdos: no hay sujeto y se le dice al modelo', () => {
    const plan = planOwnerTurn(input({ message: '¿Cómo está Zarpa?', rows: lived }), cfg);
    expect(plan.interpretation.mentioned).toBe('Zarpa');
    expect(plan.subject).toBeNull();
    expect(plan.hints.join(' ')).toContain('no recuerdas a nadie con ese nombre');
    expect(subjectByName(lived, 'Mi')).toBeNull();
  });

  it('enseña lo que encontró y deja de ser un deseo pendiente', () => {
    const plan = planOwnerTurn(input({ message: 'hola', rows: lived, pet: { ...input().pet, lastInteractionAt: ago(1) } }), cfg);
    expect(plan.behavior.action).toBe('bring_gift');
    // Vuelve tras un día fuera: además del hallazgo que enseña, tiene delante la visita que recibió (§6.6)
    expect(plan.ensureIds).toEqual(['find', 'visit']);
    expect(plan.situation.wishes).toContain('show_find');
    const out = settleOwnerTurn(plan, plan.behavior.action, neutralDims(), {}, NOW, cfg);
    expect(out.fulfilled).toEqual(['show_find']);
    expect(out.happiness).toBe(cfg.wishes.happinessOnFulfil);
    expect(out.episodes[0].key).toBe('wish:show_find');
    // No crea objetos: el resultado no toca el inventario, solo memoria y personalidad
    expect(Object.keys(out.patch).sort()).toEqual(['lastChatAt', 'recent', 'tricks', 'wishes']);
  });

  it('el tema de deseo no sale en turnos consecutivos', () => {
    let stored: StoredPersonality = {};
    const withWish: number[] = [];
    for (let turn = 0; turn < 20; turn++) {
      const plan = planOwnerTurn(input({ dims: explorer, stored, rows: [row({ kind: 'adventure', createdAt: ago(9), lastRecalledAt: ago(8) })] }), cfg);
      if (plan.hints.some((h) => h.includes('Algo que te apetece'))) withWish.push(turn);
      const out = settleOwnerTurn(plan, plan.behavior.action, explorer, stored, NOW, cfg);
      stored = { ...stored, ...out.patch };
    }
    expect(withWish.length).toBeGreaterThan(1);
    for (let i = 1; i < withWish.length; i++) expect(withWish[i] - withWish[i - 1]).toBeGreaterThanOrEqual(cfg.wishes.showEveryTurns);
  });

  it('no saca un deseo cuando el entrenador está triste, regañando o despidiéndose', () => {
    const rows = [row({ kind: 'adventure', createdAt: ago(9), lastRecalledAt: ago(8) })];
    for (const message of ['Hoy he tenido un día bastante malo', 'te has portado mal', 'adiós, hasta mañana']) {
      expect(planOwnerTurn(input({ message, dims: explorer, rows }), cfg).wish).toBeNull();
    }
    expect(planOwnerTurn(input({ dims: explorer, rows }), cfg).wish).toBe('go_explore');
  });

  it('veinte «vamos a aprender un truco» en un día no pasan del tope', () => {
    let stored: StoredPersonality = {};
    let learned = 0;
    for (let i = 0; i < 20; i++) {
      const plan = planOwnerTurn(input({ message: 'vamos a aprender un truco', stored }), cfg);
      expect(plan.interpretation.intent).toBe('teach');
      const out = settleOwnerTurn(plan, plan.behavior.action, neutralDims(), stored, NOW, cfg);
      if (out.learned) learned++;
      stored = { ...stored, ...out.patch };
    }
    const tricks = normalizeTricks(stored.tricks, cfg.tricks);
    expect(tricks.taughtToday).toBe(cfg.tricks.teachDailyCap);
    const first = Object.values(cfg.tricks.catalog)[0];
    expect(learned).toBe(cfg.tricks.teachDailyCap >= first.practices ? 1 : 0);
  });

  it('al aprender un truco lo recuerda y ya puede hacerlo', () => {
    const first = Object.keys(cfg.tricks.catalog)[0];
    const almost: StoredPersonality = { tricks: { known: [], learning: { id: first, done: cfg.tricks.catalog[first].practices - 1 } } };
    const plan = planOwnerTurn(input({ message: 'vamos a practicar el truco', stored: almost }), cfg);
    const out = settleOwnerTurn(plan, plan.behavior.action, neutralDims(), almost, NOW, cfg);
    expect(out.learned).toBe(first);
    expect(out.episodes.some((e) => e.key === `trick:${first}`)).toBe(true);
    const next = planOwnerTurn(input({ message: '¡qué bien lo has hecho!', stored: { ...almost, ...out.patch } }), cfg);
    expect(next.flags.has('knows_trick')).toBe(true);
    expect(next.behavior.action).toBe('perform_trick');
    expect(next.hints.join(' ')).toContain(cfg.tricks.catalog[first].name);
  });

  it('una disculpa repara la relación una sola vez al día', () => {
    const plan = planOwnerTurn(input({ message: 'perdona por lo de antes' }), cfg);
    expect(plan.interpretation.intent).toBe('apology');
    const first = settleOwnerTurn(plan, plan.behavior.action, neutralDims(), {}, NOW, cfg);
    expect(first.ownerDelta).toBeGreaterThan(0);
    const again = settleOwnerTurn(plan, plan.behavior.action, neutralDims(), { ...first.patch }, NOW, cfg);
    expect(again.ownerDelta).toBe(0);
  });

  it('tras enfurruñarse pide perdón, solo si se lleva bien con su entrenador', () => {
    const good = planOwnerTurn(input({ stored: { recent: ['sulk'] }, rows: lived }), cfg);
    expect(good.flags.has('after_scold')).toBe(true);
    expect(good.behavior.action).toBe('apologize');
    const cold = lived.map((r) => (r.id === 'emo-owner' ? { ...r, valence: -0.2 } : r));
    expect(planOwnerTurn(input({ stored: { recent: ['sulk'] }, rows: cold }), cfg).behavior.action).not.toBe('apologize');
  });

  it('pregunta por el día solo en el primer turno de la jornada', () => {
    const curious = { ...neutralDims(), curiosity: 90, affection: 80 };
    const first = planOwnerTurn(input({ message: 'hola', dims: curious, pet: { ...input().pet, lastInteractionAt: ago(1) } }), cfg);
    expect(first.behavior.action).toBe('ask_about_day');
    const later = planOwnerTurn(input({ message: 'hola', dims: curious }), cfg);
    expect(later.behavior.action).not.toBe('ask_about_day');
  });

  it('las reacciones nuevas no cambian lo que pasa sin sus condiciones', () => {
    for (const intent of ['greeting', 'chat'] as const) {
      const before = decideBehavior(intent, neutralDims(), AWAKE, cfg).action;
      expect(['greet', 'cuddle', 'listen', 'ask_back', 'invite_play']).toContain(before);
    }
  });

  it('es determinista: la misma entrada da el mismo plan', () => {
    const a = planOwnerTurn(input({ message: '¿Qué has hecho hoy?', rows: lived }), cfg);
    const b = planOwnerTurn(input({ message: '¿Qué has hecho hoy?', rows: lived }), cfg);
    expect({ ...a, flags: [...a.flags] }).toEqual({ ...b, flags: [...b.flags] });
  });
});

describe('Turn Engine — la mascota llega serializada', () => {
  // `PetsService.getPetById` devuelve las fechas como texto. Con eso el plan del turno lanzaba
  // un error que el chat se tragaba: sin plan no hay reacción, ni deseos, ni `express_behavior`.
  const iso = new Date(NOW.getTime() - 26 * 3_600_000).toISOString();

  it('con la fecha como texto planifica igual que con un Date', () => {
    const asText = planOwnerTurn(input({ pet: { ...input().pet, lastInteractionAt: iso } }), cfg);
    const asObject = planOwnerTurn(input({ pet: { ...input().pet, lastInteractionAt: new Date(iso) } }), cfg);
    expect(asText.behavior).toEqual(asObject.behavior);
    expect(asText.situation.awayMinutes).toBe(26 * 60);
    expect([...asText.flags].sort()).toEqual([...asObject.flags].sort());
    expect(asText.flags.has('first_turn_today')).toBe(true);
  });

  it('una fecha ausente o inválida no rompe el turno', () => {
    for (const bad of [null, undefined, '', 'no es una fecha']) {
      const plan = planOwnerTurn(input({ pet: { ...input().pet, lastInteractionAt: bad as any } }), cfg);
      expect(plan.situation.awayMinutes).toBe(0);
      expect(plan.behavior.action).toBeTruthy();
    }
  });
});
