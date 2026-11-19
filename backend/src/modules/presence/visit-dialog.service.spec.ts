import * as fs from 'fs';
import * as path from 'path';
import { ForbiddenException } from '@nestjs/common';
import { Dims, PersonalityConfig } from '../mind/mind.types';
import { neutralDims } from '../mind/personality.engine';
import { VisitorCtx, VisitorOption, emptyVisitorState, episodeOption, menuFor, moodLine, openVisit, stepVisit } from '../mind/visitor.engine';
import { VisitDialogService } from './visit-dialog.service';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const cfg = balance.personality as PersonalityConfig;
const v = cfg.social.visitor!;
const NOW = new Date('2026-11-18T12:00:00Z');

const ctx = (over: Partial<VisitorCtx> = {}, dims: Partial<Dims> = {}): VisitorCtx => ({
  petId: 'host-pet',
  petName: 'Lumo',
  visitorName: 'Ana',
  stage: 'stranger',
  sleeping: false,
  sick: false,
  energy: 70,
  happiness: 60,
  hunger: 60,
  treat: { id: 'apple', name: 'Manzana' },
  story: null,
  canEffect: true,
  ...over,
  dims: { ...neutralDims(), ...dims },
});
const ids = (c: VisitorCtx, state = openVisit(c, cfg).state) => menuFor(state, c, v).map((o) => o.id);

describe('Visitor Engine — menú del entrenador que visita (spec 37 §6.2)', () => {
  it('ofrece saludar, acariciar, un premio, jugar y preguntar; nunca nada negativo', () => {
    expect(ids(ctx())).toEqual(['greet', 'pet', 'treat', 'play', 'ask', 'bye']);
    expect(Object.values(v.deltas).every((d) => (d as number) >= 0)).toBe(true);
  });

  it('un tímido se esconde de un desconocido y solo deja esperar; con un amigo se acerca', () => {
    const shy = { sociability: 10 };
    const stranger = openVisit(ctx({}, shy), cfg);
    expect(stranger.reply.behavior.action).toBe('hide');
    expect(stranger.reply.options.map((o) => o.id)).toEqual(['wait', 'bye']);
    const friend = openVisit(ctx({ stage: 'friend' }, shy), cfg);
    expect(friend.reply.behavior.action).not.toBe('hide');
    expect(friend.reply.options.map((o) => o.id)).toContain('pet');
    // Tras esperar, sale de su escondite
    const waited = stepVisit(stranger.state, 'wait', ctx({}, shy), cfg)!;
    expect(waited.reply.options.map((o) => o.id)).toContain('greet');
    expect(waited.effect).toBeNull();
  });

  it('acariciar a un distante que no te conoce no funciona; si te conoce, sí', () => {
    const aloof = { affection: 10 };
    const no = stepVisit(openVisit(ctx({}, aloof), cfg).state, 'pet', ctx({}, aloof), cfg)!;
    expect(no.effect).toBeNull();
    expect(no.reply.line).toMatch(/aparta|esquiva/);
    const yes = stepVisit(openVisit(ctx({ stage: 'acquaintance' }, aloof), cfg).state, 'pet', ctx({ stage: 'acquaintance' }, aloof), cfg)!;
    expect(yes.effect).toMatchObject({ option: 'pet', event: 'visitor_pet' });
  });

  it('dos personalidades opuestas dan líneas y reacciones distintas a la misma opción', () => {
    const warm = ctx({}, { sociability: 90, affection: 90, temper: 90 });
    const cold = ctx({}, { sociability: 10, affection: 10, temper: 10 });
    expect(openVisit(warm, cfg).reply.behavior.action).not.toBe(openVisit(cold, cfg).reply.behavior.action);
    for (const option of ['greet', 'pet', 'play'] as VisitorOption[]) {
      const state = { ...emptyVisitorState(), turn: 1, open: true };
      const a = stepVisit(state, option, warm, cfg)!;
      const b = stepVisit(state, option, cold, cfg)!;
      expect(a.reply.line).not.toBe(b.reply.line);
    }
    const state = { ...emptyVisitorState(), turn: 1, open: true };
    expect(stepVisit(state, 'pet', warm, cfg)!.reply.behavior.action).not.toBe(stepVisit(state, 'pet', cold, cfg)!.reply.behavior.action);
  });

  it('todas las reacciones son del catálogo y valen ante un visitante', () => {
    const allowed = Object.entries(cfg.behavior.catalog).filter(([, e]: any) => !e.audiences || e.audiences.includes('visitor')).map(([id]) => id);
    for (const dims of [{}, { sociability: 5, affection: 5 }, { sociability: 95, affection: 95, temper: 95 }]) {
      for (const over of [{}, { energy: 5 }, { sick: true }, { stage: 'friend' as const }]) {
        const c = ctx(over, dims);
        let step = openVisit(c, cfg);
        expect(allowed).toContain(step.reply.behavior.action);
        while (step.reply.options.length) {
          step = stepVisit(step.state, step.reply.options[0].id, c, cfg)!;
          expect(allowed).toContain(step.reply.behavior.action);
        }
        expect(step.reply.ended).toBe(true);
      }
    }
  });

  it('cada opción se usa una vez, y al llegar al tope solo queda despedirse', () => {
    const c = ctx();
    let step = openVisit(c, cfg);
    const used: string[] = [];
    while (step.reply.options[0].id !== 'bye') {
      used.push(step.reply.options[0].id);
      step = stepVisit(step.state, step.reply.options[0].id, c, cfg)!;
    }
    expect(new Set(used).size).toBe(used.length);
    expect(used.length).toBeLessThanOrEqual(v.maxPerVisit);
    expect(stepVisit(step.state, 'greet', c, cfg)).toBeNull();
    expect(stepVisit(step.state, 'bye', c, cfg)!.reply).toMatchObject({ ended: true, options: [] });
  });

  it('sin efectos por hoy no se ofrece el premio (no se gasta un alimento para nada) y nada deja huella', () => {
    const c = ctx({ canEffect: false });
    expect(ids(c)).not.toContain('treat');
    expect(stepVisit(openVisit(c, cfg).state, 'greet', c, cfg)!.effect).toBeNull();
  });

  it('dormido no se le molesta; cansado o enfermo no juega', () => {
    expect(openVisit(ctx({ sleeping: true }), cfg).reply.options.map((o) => o.id)).toEqual(['bye']);
    const open = { ...emptyVisitorState(), turn: 1, open: true };
    expect(stepVisit(open, 'play', ctx({ energy: 5 }), cfg)!.effect).toBeNull();
    expect(stepVisit(open, 'play', ctx({ sick: true }), cfg)!.effect).toBeNull();
  });

  it('«¿qué tal estás?» cuenta su ánimo sin números y, a quien conoce, una vivencia suya', () => {
    const open = { ...emptyVisitorState(), turn: 1, open: true };
    const story = 'Explorando encontré algo: Semilla solar.';
    const toStranger = stepVisit(open, 'ask', ctx({ story, hunger: 10 }), cfg)!.reply.line;
    expect(toStranger).toContain('hambre');
    expect(toStranger).not.toContain(story);
    expect(toStranger).not.toMatch(/\d/);
    expect(stepVisit(open, 'ask', ctx({ story, stage: 'acquaintance' }), cfg)!.reply.line).toContain(story);
    expect(moodLine({ sick: true, hunger: 90, energy: 90, happiness: 90 })).toContain('no se encuentra');
  });

  it('la visita deja un solo recuerdo, y manda lo más señalado: el premio', () => {
    expect(episodeOption(['greet', 'treat', 'play'])).toBe('treat');
    const c = ctx();
    let step = stepVisit(openVisit(c, cfg).state, 'treat', c, cfg)!;
    expect(step.effect).toMatchObject({ consume: { id: 'apple', name: 'Manzana' }, happiness: v.treat.happiness, episode: 'Ana vino a verme y me trajo Manzana.' });
    step = stepVisit(step.state, 'play', c, cfg)!;
    expect(step.effect!.episode).toBe('Ana vino a verme y me trajo Manzana.');
    expect(step.effect!.consume).toBeNull();
  });

  it('es determinista: misma entrada, misma respuesta', () => {
    const c = ctx({}, { sociability: 80 });
    expect(openVisit(c, cfg)).toEqual(openVisit(c, cfg));
    const s = openVisit(c, cfg).state;
    expect(stepVisit(s, 'greet', c, cfg)).toEqual(stepVisit(s, 'greet', c, cfg));
  });
});

// ── Servicio ────────────────────────────────────────────────────────────────

const SECRET = 'Mi entrenador trabaja en un banco';

function setup(opts: { dims?: Partial<Dims>; stage?: string; redisDown?: boolean; apples?: number; visit?: boolean } = {}) {
  const store = new Map<string, string>();
  const client = {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, val: string) => (store.set(k, val), 'OK'),
    del: async (k: string) => (store.delete(k) ? 1 : 0),
    incr: async (k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      return n;
    },
    expire: async () => 1,
  };
  const redis: any = { key: (n: string) => `t:${n}`, run: async (fn: any) => (opts.redisDown ? null : fn(client)) };
  const locks: any = { runExclusive: (_s: string, _k: string, fn: () => Promise<unknown>) => fn() };
  const host: any = { id: 'host-pet', userId: 'owner', nickname: 'Lumo', energy: 70, happiness: 60, hunger: 60, sleeping: false, sick: false };
  const inv = { qty: opts.apples ?? 2 };
  let visitId = 'visit-1';
  const prisma: any = {
    habitatVisit: { findFirst: jest.fn(async () => (opts.visit === false ? null : { id: visitId, ownerId: 'owner', visitorId: 'visitor' })) },
    user: { findUnique: jest.fn(async ({ where }: any) => (where.id === 'visitor' ? { displayName: 'Ana' } : { activePetId: 'host-pet' })) },
    pet: {
      findFirst: jest.fn(async () => host),
      update: jest.fn(async ({ data }: any) => Object.assign(host, data)),
    },
    inventoryItem: {
      findFirst: jest.fn(async () => (inv.qty >= 1 ? { qty: inv.qty, item: { id: 'apple', name: 'Manzana' } } : null)),
      updateMany: jest.fn(async () => {
        if (inv.qty < 1) return { count: 0 };
        inv.qty--;
        return { count: 1 };
      }),
    },
  };
  const mind: any = {
    config: () => cfg,
    ensureDims: jest.fn(async () => ({ dims: { ...neutralDims(), ...opts.dims }, stored: {} })),
    applyExperience: jest.fn(async () => null),
  };
  // La memoria del anfitrión tiene un hecho de su entrenador. La consulta de vivencias devuelve,
  // a propósito, filas que no deberían salir: el filtro es de la lista blanca, no de la consulta.
  const memory: any = {
    stageWith: jest.fn(async () => opts.stage ?? 'friend'),
    shareableEpisodes: jest.fn(async () => [
      { id: 's', kind: 'fact', content: SECRET, createdAt: NOW },
      { id: 'c', kind: 'event', key: 'ep:sad_day', content: `${SECRET} y tuvo un día malo`, createdAt: NOW },
      { id: 'o', kind: 'event', subject: 'owner', content: SECRET, createdAt: NOW },
      { id: 'f', kind: 'find', content: 'Explorando encontré algo: Semilla solar.', createdAt: NOW },
    ]),
    feel: jest.fn(async () => ({ valence: 0, stage: null })),
    remember: jest.fn(async () => 1),
    recallBlock: jest.fn(),
    situationRows: jest.fn(),
  };
  const realtime: any = { emitToUser: jest.fn() };
  const svc = new VisitDialogService(prisma, redis, locks, realtime, undefined, mind, memory);
  return { svc, prisma, mind, memory, realtime, inv, host, newVisit: () => (visitId = `visit-${Math.random()}`) };
}

/** Recorre una visita entera eligiendo siempre la primera opción que no sea despedirse. */
async function wholeVisit(s: ReturnType<typeof setup>, now = NOW) {
  const lines: string[] = [];
  let r = await s.svc.interact('visitor', {}, now);
  lines.push(r.line);
  while (!r.ended && r.options.length) {
    const i = r.options.findIndex((o) => o.id !== 'bye');
    r = await s.svc.interact('visitor', { choice: i < 0 ? 0 : i, turn: r.turn }, now);
    lines.push(r.line);
  }
  return lines;
}

describe('VisitDialogService (spec 37 §6.2)', () => {
  it('sin visita activa → 403', async () => {
    await expect(setup({ visit: false }).svc.interact('visitor', {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('empieza sin elección, avanza con ella y avisa al dueño', async () => {
    const s = setup();
    const first = await s.svc.interact('visitor', {}, NOW);
    expect(first).toMatchObject({ turn: 1, stage: 'friend', petName: 'Lumo', ended: false });
    expect(s.realtime.emitToUser).not.toHaveBeenCalled();
    const second = await s.svc.interact('visitor', { choice: 0, turn: first.turn }, NOW);
    expect(second.turn).toBe(2);
    expect(s.realtime.emitToUser).toHaveBeenCalledWith('owner', 'habitat:visitor_interaction', {
      visitorId: 'visitor',
      petId: 'host-pet',
      option: first.options[0].id,
      line: second.line,
      behavior: second.behavior,
    });
    // Volver a entrar sin elección retoma la conversación, no la reinicia
    expect(await s.svc.interact('visitor', {}, NOW)).toEqual(second);
  });

  it('una opción que no está en el menú → 400', async () => {
    const s = setup();
    const first = await s.svc.interact('visitor', {}, NOW);
    await expect(s.svc.interact('visitor', { choice: 99, turn: first.turn }, NOW)).rejects.toThrow('no está en el menú');
    await expect(s.svc.interact('visitor', { choice: -1 }, NOW)).rejects.toThrow('índice');
  });

  it('el premio se descuenta una vez aunque la petición se repita', async () => {
    const s = setup();
    const first = await s.svc.interact('visitor', {}, NOW);
    const treat = first.options.findIndex((o) => o.id === 'treat');
    const a = await s.svc.interact('visitor', { choice: treat, turn: first.turn }, NOW);
    const b = await s.svc.interact('visitor', { choice: treat, turn: first.turn }, NOW);
    const c = await s.svc.interact('visitor', { choice: treat, turn: first.turn }, NOW);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(s.inv.qty).toBe(1);
    expect(s.prisma.inventoryItem.updateMany).toHaveBeenCalledTimes(1);
    expect(s.host.happiness).toBe(60 + v.treat.happiness);
    // Y en la misma visita no se ofrece otro
    expect(a.options.map((o) => o.id)).not.toContain('treat');
  });

  it('si ya no le queda el alimento, no hay premio ni efecto', async () => {
    const s = setup({ apples: 1 });
    const first = await s.svc.interact('visitor', {}, NOW);
    // Lo gastó por otro lado entre que vio el menú y eligió
    s.prisma.inventoryItem.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(s.svc.interact('visitor', { choice: first.options.findIndex((o) => o.id === 'treat'), turn: first.turn }, NOW)).rejects.toThrow('Ya no te queda');
    expect(s.memory.feel).not.toHaveBeenCalled();
  });

  it('veinte interacciones de un visitante en un día no superan los topes de efecto ni de deriva', async () => {
    const s = setup({ apples: 50 });
    let interactions = 0;
    while (interactions < 20) {
      s.newVisit();
      interactions += (await wholeVisit(s)).length - 1;
    }
    expect(interactions).toBeGreaterThanOrEqual(20);
    expect(s.memory.feel.mock.calls.length).toBe(v.dailyEffects);
    expect(s.mind.applyExperience.mock.calls.length).toBe(v.dailyEffects);
    // Como mucho un premio por visita con efecto, y ninguno cuando ya no deja huella
    expect(50 - s.inv.qty).toBeLessThanOrEqual(v.dailyEffects);
    // Al día siguiente vuelve a contar
    s.newVisit();
    await wholeVisit(s, new Date(NOW.getTime() + 86_400_000));
    expect(s.memory.feel.mock.calls.length).toBeGreaterThan(v.dailyEffects);
  });

  it('ninguna respuesta contiene nada del entrenador del anfitrión', async () => {
    for (const dims of [{}, { sociability: 5, affection: 5 }, { sociability: 95, affection: 95, temper: 95 }]) {
      for (const stage of ['stranger', 'acquaintance', 'best_friend']) {
        const s = setup({ dims, stage });
        const lines = await wholeVisit(s);
        for (const line of lines) expect(line).not.toContain('banco');
        for (const call of s.memory.remember.mock.calls) expect(JSON.stringify(call)).not.toContain('banco');
        for (const call of s.realtime.emitToUser.mock.calls) expect(JSON.stringify(call)).not.toContain('banco');
        // No lee la memoria por ningún otro camino
        expect(s.memory.recallBlock).not.toHaveBeenCalled();
        expect(s.memory.situationRows).not.toHaveBeenCalled();
      }
    }
    // Lo que sí puede contar a quien conoce: una vivencia propia de la lista blanca
    const lines = await wholeVisit(setup({ stage: 'friend' }));
    expect(lines.join(' ')).toContain('Semilla solar');
  });

  it('el anfitrión lo recuerda una vez por visita, con el visitante como sujeto', async () => {
    const s = setup();
    await wholeVisit(s);
    const keys = new Set(s.memory.remember.mock.calls.map((c: any[]) => c[1][0].key));
    expect([...keys]).toEqual(['visitor:visit-1']);
    expect(s.memory.remember.mock.calls[0][1][0]).toMatchObject({ kind: 'visit', subject: 'user:visitor', layer: 'episodic' });
    expect(s.memory.feel).toHaveBeenCalledWith('host-pet', 'user:visitor', 'Ana (otro entrenador)', expect.any(Number));
  });

  it('sin Redis sigue funcionando, con los mismos topes', async () => {
    const s = setup({ redisDown: true, apples: 50 });
    for (let i = 0; i < 4; i++) {
      s.newVisit();
      await wholeVisit(s);
    }
    expect(s.memory.feel.mock.calls.length).toBe(v.dailyEffects);
  });

  it('si la mente falla al guardar, el visitante recibe su respuesta igualmente', async () => {
    const s = setup();
    s.memory.feel.mockRejectedValue(new Error('sin base de datos'));
    const first = await s.svc.interact('visitor', {}, NOW);
    await expect(s.svc.interact('visitor', { choice: 0, turn: first.turn }, NOW)).resolves.toMatchObject({ turn: 2 });
  });

  it('al acabar la visita se borra la conversación', async () => {
    const s = setup();
    const first = await s.svc.interact('visitor', {}, NOW);
    await s.svc.interact('visitor', { choice: 0, turn: first.turn }, NOW);
    s.svc.onVisitEnded({ visitId: 'visit-1' });
    await new Promise((r) => setImmediate(r));
    expect((await s.svc.interact('visitor', {}, NOW)).turn).toBe(1);
  });
});
