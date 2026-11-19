import * as fs from 'fs';
import * as path from 'path';
import { InteractionEngineService, SCENE_TO_BUDDY, sceneNote } from '../buddies/interaction-engine.service';
import { BuddiesService } from '../buddies/buddies.service';
import { EncounterInput, EncounterService } from './encounter.service';
import { EvolutionListener } from './evolution.listener';
import { MemoryRow } from './memory.engine';
import { Dims, PersonalityConfig } from './mind.types';
import { neutralDims } from './personality.engine';
import { isPrivateEpisode, sinceLastOrder, untoldFor } from './situation.engine';
import { SCENE_TYPES, SceneActor, SceneInput, Shareable, SocialConfig, isShareable, pickRumor, resolveScene, sceneCandidates } from './social.engine';
import { TurnInput, planOwnerTurn, settleOwnerTurn } from './turn.engine';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const cfg = balance.personality as PersonalityConfig;
const social = cfg.social as SocialConfig;
const NOW = new Date('2026-11-18T12:00:00Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

const actor = (petId: string, over: Partial<SceneActor> = {}, dims: Partial<Dims> = {}): SceneActor => ({
  petId,
  name: petId === 'a' ? 'Brasa' : 'Lumo',
  ownerName: petId === 'a' ? 'Ana' : 'Luis',
  energy: 70,
  ...over,
  dims: { ...neutralDims(), ...dims },
});
const scene = (over: Partial<SceneInput> = {}): SceneInput => ({ host: actor('a'), guest: actor('b'), stage: 'friend', slot: 1, ...over });
const types = (i: SceneInput) => sceneCandidates(i, social).map((c) => c.type);
/** Primera ranura en la que sale la escena pedida (el azar es sembrado: siempre la misma). */
const slotWith = (type: string, base: Partial<SceneInput>) => {
  for (let slot = 1; slot < 400; slot++) if (resolveScene(scene({ ...base, slot }), social).type === type) return slot;
  throw new Error(`ninguna ranura da ${type}`);
};

describe('Regalos entre Pockai (spec 37 §6.5, solo narrativos)', () => {
  it('solo entre amigos y solo si alguno encontró algo', () => {
    expect(types(scene())).not.toContain('give_gift');
    expect(types(scene({ guest: actor('b', { hasFind: true }) }))).toContain('give_gift');
    expect(types(scene({ stage: 'acquaintance', guest: actor('b', { hasFind: true }) }))).not.toContain('give_gift');
  });

  it('da el regalo quien lo encontró, y cada uno lo recuerda desde su lado', () => {
    const base = { guest: actor('b', { hasFind: true }) };
    const res = resolveScene(scene({ ...base, slot: slotWith('give_gift', base) }), social);
    expect(res.giver).toBe('guest');
    expect(res.guest.episode).toMatch(/regal|guardaba/i);
    expect(res.guest.episode).toContain('Brasa');
    expect(res.host.episode).toContain('Lumo');
    expect(res.host.episode).not.toBe(res.guest.episode);
    expect(res.host.delta).toBeGreaterThan(0);
  });

  it('sin hallazgos, las escenas salen exactamente igual que antes de existir el regalo', () => {
    const without = { ...social, scenes: { ...social.scenes } } as SocialConfig;
    delete (without.scenes as Record<string, unknown>).give_gift;
    for (let slot = 0; slot < 60; slot++) {
      expect(resolveScene(scene({ slot }), social)).toEqual(resolveScene(scene({ slot }), without));
    }
  });
});

describe('Escenas fuera de la visita en vivo (spec 37 §6.3)', () => {
  it('un encuentro autónomo es una llegada aunque su ranura no sea la 0', () => {
    expect(types(scene({ stage: 'stranger', slot: 480_012 }))).not.toContain('greet');
    expect(types(scene({ stage: 'stranger', slot: 480_012, first: true }))).toContain('greet');
  });

  it('entre compañeros de casa nadie va de visita ni se presenta', () => {
    expect(types(scene({ sameHome: true, slot: 0 }))).not.toContain('greet');
    for (let slot = 0; slot < 80; slot++) {
      const res = resolveScene(scene({ sameHome: true, first: false, slot, host: actor('a', {}, { temper: 90 }), guest: actor('b', {}, { temper: 90 }) }), social);
      for (const side of [res.host, res.guest]) {
        expect(side.episode).not.toMatch(/visit|\{|hábitat de|Ana|Luis/i);
      }
      expect(res.host.episode).toContain('Lumo');
      expect(res.guest.episode).toContain('Brasa');
    }
  });

  it('cada escena tiene su interacción de buddies y su frase', () => {
    const engine = new InteractionEngineService();
    for (const type of SCENE_TYPES) {
      expect(engine.effectsFor(SCENE_TO_BUDDY[type])).toBeDefined();
      expect(sceneNote(type)?.length).toBeGreaterThan(2);
    }
  });
});

describe('Rumores (spec 37 §6.4)', () => {
  const mem = (over: Partial<Shareable>): Shareable => ({ id: over.id ?? 'm', kind: 'find', content: 'Explorando encontré algo: Semilla solar.', createdAt: ago(1), ...over });
  const who = { hostId: 'a', guestId: 'b', hostName: 'Brasa', guestName: 'Lumo', stage: 'friend' as const, type: 'play_tag' as const };
  const rumors = social.rumors!;

  it('lista blanca: lo nacido del chat, lo que nombra a alguien y los rumores no se cuentan', () => {
    expect(isShareable(mem({}), rumors, NOW)).toBe(true);
    expect(isShareable(mem({ kind: 'adventure' }), rumors, NOW)).toBe(true);
    // Episodio de plantilla del chat y recuerdos con clave (deseos, trucos)
    expect(isShareable(mem({ kind: 'event', key: 'ep:sad_day' }), rumors, NOW)).toBe(false);
    expect(isShareable(mem({ kind: 'event', key: 'trick:spin' }), rumors, NOW)).toBe(false);
    // Lo que extrajo el modelo de la charla con su entrenador
    expect(isShareable(mem({ kind: 'event', subject: 'owner' }), rumors, NOW)).toBe(false);
    // Nombra a un tercero
    expect(isShareable(mem({ kind: 'encounter', subject: 'pet:zarpa' }), rumors, NOW)).toBe(false);
    // Un origen que no está en la lista es privado hasta que alguien lo añada
    expect(isShareable(mem({ kind: 'fact' }), rumors, NOW)).toBe(false);
    expect(isShareable(mem({ kind: 'cosa_nueva' }), rumors, NOW)).toBe(false);
    // Un rumor da un solo salto, aunque alguien lo meta en la lista por error
    expect(isShareable(mem({ kind: 'rumor' }), { ...rumors, kinds: [...rumors.kinds, 'rumor'] }, NOW)).toBe(false);
    // Solo lo reciente
    expect(isShareable(mem({ createdAt: ago(rumors.maxAgeDays + 1) }), rumors, NOW)).toBe(false);
    expect(isShareable(mem({}), undefined, NOW)).toBe(false);
  });

  it('en muchas escenas entre amigos nunca sale nada privado, y sí lo que se puede contar', () => {
    const host = [mem({ id: 'ok' }), mem({ id: 'chat', kind: 'event', key: 'ep:love' }), mem({ id: 'owner', kind: 'event', subject: 'owner' }), mem({ id: 'rumor', kind: 'rumor', subject: 'pet:z' })];
    const told = new Set<string>();
    for (let slot = 0; slot < 200; slot++) {
      const r = pickRumor({ ...who, slot }, { host, guest: [] }, social, NOW);
      if (r) {
        told.add(r.source.id);
        expect(r.teller).toBe('host');
        expect(r.content).toBe('Brasa me contó algo suyo: «Explorando encontré algo: Semilla solar.»');
      }
    }
    expect([...told]).toEqual(['ok']);
  });

  it('ni entre quienes apenas se conocen ni en plena discusión', () => {
    const shareable = { host: [mem({})], guest: [mem({ id: 'g' })] };
    for (let slot = 0; slot < 100; slot++) {
      expect(pickRumor({ ...who, stage: 'acquaintance', slot }, shareable, social, NOW)).toBeNull();
      expect(pickRumor({ ...who, type: 'squabble', slot }, shareable, social, NOW)).toBeNull();
    }
  });

  it('misma pareja y misma ranura, mismo rumor, lo mire quien lo mire', () => {
    const shareable = { host: [mem({ id: 'h1' }), mem({ id: 'h2' })], guest: [mem({ id: 'g1' })] };
    for (let slot = 0; slot < 30; slot++) {
      expect(pickRumor({ ...who, slot }, shareable, social, NOW)).toEqual(pickRumor({ ...who, slot }, shareable, social, NOW));
    }
  });

  it('quien recibe un rumor puede contárselo a su entrenador, pero no a otro Pockai', () => {
    const rumor = { id: 'r', kind: 'rumor', layer: 'episodic', key: 'rumor:x', subject: 'pet:brasa', content: 'Brasa me contó algo suyo: «…»', importance: 0.35, valence: 0.2, createdAt: NOW } as MemoryRow;
    expect(isPrivateEpisode(rumor)).toBe(true);
    expect(untoldFor([rumor], 'owner', 'owner').map((u) => u.id)).toEqual(['r']);
    expect(untoldFor([rumor], 'pockai', 'pet:zarpa')).toEqual([]);
  });
});

describe('«Desde la última vez» (spec 37 §6.6)', () => {
  const row = (over: Partial<MemoryRow>): MemoryRow => ({ id: 'x', kind: 'event', layer: 'episodic', content: 'algo', importance: 0.5, valence: 0, createdAt: ago(0.1), ...over }) as MemoryRow;
  const lived = [
    row({ id: 'paseo', content: 'Di un paseo largo.' }),
    row({ id: 'rumor', kind: 'rumor', subject: 'pet:brasa', key: 'rumor:1', content: 'Brasa me contó algo suyo: «…»' }),
    row({ id: 'find', kind: 'find', content: 'Explorando encontré algo: Manzana.' }),
    row({ id: 'fui', kind: 'encounter', subject: 'pet:brasa', content: 'Fui a casa de Brasa.' }),
    row({ id: 'vino', kind: 'visit', subject: 'pet:brasa', content: 'Ana vino a visitarme con Brasa.' }),
  ];
  const turn = (over: Partial<TurnInput> = {}): TurnInput => ({
    message: 'hola',
    pet: { id: 'pet-1', hunger: 70, energy: 70, hygiene: 70, happiness: 60, health: 100, sleeping: false, sick: false, lastInteractionAt: ago(0.5) },
    // Sociable y poco curiosa, para que el saludo no acabe en «te traigo un regalo» y se vea solo §6.6
    dims: neutralDims(),
    stored: {},
    rows: lived,
    now: NOW,
    ...over,
  });

  it('el orden es: quién vino, a quién fue a ver, qué encontró, qué le contaron', () => {
    const untold = lived.map((m) => ({ id: m.id, content: m.content, kind: m.kind, subject: m.subject ?? null }));
    expect(sinceLastOrder(untold).map((u) => u.id)).toEqual(['vino', 'fui', 'find', 'rumor', 'paseo']);
  });

  it('tras una ausencia con una visita recibida, el primer turno la tiene delante aunque el mensaje sea «hola»', () => {
    const plan = planOwnerTurn(turn(), cfg);
    expect(plan.ensureIds).toContain('vino');
    expect(plan.ensureIds.length).toBeLessThanOrEqual(Math.max(2, cfg.memory.sinceLastMax ?? 2));
    expect(plan.hints.join(' ')).toContain('vuelve después de un rato');
  });

  it('el segundo turno no lo repite: ya charlaron hace un momento y lo contado no vuelve', () => {
    const first = planOwnerTurn(turn(), cfg);
    const out = settleOwnerTurn(first, first.behavior.action, neutralDims(), {}, NOW, cfg);
    expect(out.patch.lastChatAt).toBe(NOW.toISOString());
    const later = new Date(NOW.getTime() + 60_000);
    // Lo inyectado queda como contado (lo anota `recallBlock`)
    const rows = lived.map((m) => (first.ensureIds.includes(m.id) ? { ...m, lastRecalledAt: NOW } : m));
    const second = planOwnerTurn(turn({ now: later, stored: { ...out.patch }, rows, message: 'qué tal' }), cfg);
    for (const id of first.ensureIds) expect(second.ensureIds).not.toContain(id);
    expect(second.hints.join(' ')).not.toContain('vuelve después de un rato');
  });

  it('sin ausencia no se fuerza nada', () => {
    const plan = planOwnerTurn(turn({ pet: { ...turn().pet, lastInteractionAt: new Date(NOW.getTime() - 5 * 60_000) }, message: 'pues nada, aquí trabajando' }), cfg);
    expect(plan.ensureIds).not.toContain('vino');
    expect(plan.hints.join(' ')).not.toContain('vuelve después de un rato');
  });

  it('con un mal día del entrenador no es momento de contar batallitas', () => {
    const plan = planOwnerTurn(turn({ message: 'he tenido un día horrible' }), cfg);
    expect(plan.interpretation.intent).toBe('sad_day');
    expect(plan.hints.join(' ')).not.toContain('vuelve después de un rato');
  });
});

// ── Servicios, con una memoria de mentira ───────────────────────────────────

function fakeMemory(init: { stages?: Record<string, string>; shareable?: Record<string, Shareable[]>; mood?: Record<string, number> } = {}) {
  const written: { petId: string; input: any }[] = [];
  const memory: any = {
    written,
    remember: jest.fn(async (petId: string, inputs: any[]) => {
      for (const input of inputs) written.push({ petId, input });
      return inputs.length;
    }),
    feel: jest.fn(async () => ({ valence: 0, stage: null })),
    stageWith: jest.fn(async (petId: string, subject: string) => init.stages?.[`${petId}>${subject}`] ?? 'stranger'),
    shareableEpisodes: jest.fn(async (petId: string) => init.shareable?.[petId] ?? []),
    lastEncounterMood: jest.fn(async (petId: string, subject: string) => init.mood?.[`${petId}>${subject}`] ?? null),
  };
  return memory;
}
const fakeMind = (): any => ({
  config: () => cfg,
  applyExperience: jest.fn(async () => null),
  ensureDims: jest.fn(async () => ({ dims: neutralDims(), stored: {} })),
  fulfilWish: jest.fn(async () => false),
});
const pet = (id: string, name: string, ownerName: string) => ({ id, name, ownerName, dims: neutralDims(), energy: 70 });
const encounter = (over: Partial<EncounterInput> = {}): EncounterInput => ({ host: pet('h', 'Lumo', 'Luis'), guest: pet('v', 'Brasa', 'Ana'), slot: 3, at: NOW, ...over });
const of = (memory: any, petId: string, kind?: string) => memory.written.filter((w: any) => w.petId === petId && (!kind || w.input.kind === kind)).map((w: any) => w.input);

describe('EncounterService: una sola escena para los tres caminos', () => {
  it('misma pareja y misma ranura dan la misma escena, se llegue por donde se llegue', async () => {
    const a = await new EncounterService(fakeMind(), fakeMemory()).resolve(encounter());
    const b = await new EncounterService(fakeMind(), fakeMemory()).resolve(encounter());
    expect(a.scene).toEqual(b.scene);
  });

  it('el anfitrión recuerda una visita recibida y el otro un encuentro, cada uno con su texto', async () => {
    const memory = fakeMemory();
    const res = await new EncounterService(fakeMind(), memory).play(encounter({ first: true }));
    const [host] = of(memory, 'h');
    const [guest] = of(memory, 'v');
    expect(host).toMatchObject({ kind: 'visit', subject: 'pet:v', createdAt: NOW, content: res.scene.host.episode });
    expect(guest).toMatchObject({ kind: 'encounter', subject: 'pet:h', createdAt: NOW, content: res.scene.guest.episode });
    expect(host.content).not.toBe(guest.content);
    expect(memory.feel).toHaveBeenCalledWith('h', 'pet:v', 'Brasa (Pockai de Ana)', res.scene.host.delta);
    expect(memory.feel).toHaveBeenCalledWith('v', 'pet:h', 'Lumo (Pockai de Luis)', res.scene.guest.delta);
  });

  it('si lo último entre ellos fue un pique, hoy pueden hacer las paces', async () => {
    const calm = await new EncounterService(fakeMind(), fakeMemory()).resolve(encounter());
    expect(calm.previous).toBeNull();
    const sore = await new EncounterService(fakeMind(), fakeMemory({ mood: { 'h>pet:v': -0.3 } })).resolve(encounter());
    expect(sore.previous).toBe('squabble');
    // Dentro de una visita manda la escena anterior de esa visita, no la memoria
    const given = await new EncounterService(fakeMind(), fakeMemory({ mood: { 'h>pet:v': -0.3 } })).resolve(encounter({ previous: 'play_tag' }));
    expect(given.previous).toBe('play_tag');
  });

  it('entre amigos, uno le cuenta algo al otro: queda como rumor de quien lo contó y un episodio del chat nunca viaja', async () => {
    const mine: Shareable[] = [
      { id: 'find-1', kind: 'find', content: 'Explorando encontré algo: Semilla solar.', createdAt: ago(1) },
      { id: 'chat-1', kind: 'event', key: 'ep:sad_day', content: 'Mi entrenador tuvo un día malo y le consolé.', createdAt: ago(1) },
      { id: 'sem-1', kind: 'fact', content: 'Mi entrenador trabaja en un banco.', createdAt: ago(1) },
    ];
    let rumors = 0;
    for (let slot = 0; slot < 120; slot++) {
      const memory = fakeMemory({ stages: { 'h>pet:v': 'friend' }, shareable: { h: mine } });
      await new EncounterService(fakeMind(), memory).play(encounter({ slot }));
      for (const w of memory.written) {
        expect(w.input.content).not.toContain('día malo');
        expect(w.input.content).not.toContain('banco');
      }
      const got = of(memory, 'v', 'rumor');
      expect(of(memory, 'h', 'rumor')).toEqual([]);
      if (got.length) {
        rumors++;
        expect(got[0]).toMatchObject({ key: 'rumor:find-1', subject: 'pet:h', importance: social.rumors!.importance });
        expect(got[0].content).toContain('Lumo me contó');
      }
    }
    expect(rumors).toBeGreaterThan(10);
  });

  it('un rumor recibido no se reenvía a un tercero', async () => {
    // `v` solo tiene lo que le contaron: aunque la consulta lo devolviera, no sale
    const heard: Shareable[] = [{ id: 'r1', kind: 'rumor', key: 'rumor:find-1', subject: 'pet:h', content: 'Lumo me contó algo suyo: «…»', createdAt: ago(1) }];
    for (let slot = 0; slot < 80; slot++) {
      const memory = fakeMemory({ stages: { 'z>pet:v': 'best_friend' }, shareable: { v: heard } });
      await new EncounterService(fakeMind(), memory).play(encounter({ host: pet('z', 'Zarpa', 'Eva'), slot }));
      expect(of(memory, 'z', 'rumor')).toEqual([]);
    }
  });

  it('entre compañeros de casa: sin visita, sin rumores y sin consultar qué podrían contarse', async () => {
    const memory = fakeMemory({ stages: { 'h>pet:v': 'best_friend' }, shareable: { h: [{ id: 'f', kind: 'find', content: 'Encontré algo.', createdAt: ago(1) }] } });
    await new EncounterService(fakeMind(), memory).play(encounter({ sameHome: true, first: false }));
    expect(memory.shareableEpisodes).not.toHaveBeenCalled();
    expect(memory.written.map((w: any) => w.input.kind)).toEqual(['encounter', 'encounter']);
    expect(memory.feel).toHaveBeenCalledWith('h', 'pet:v', 'Brasa (mi compañero de casa)', expect.any(Number));
  });
});

describe('EvolutionListener: eventos sociales que faltaban (spec 37 §6.7)', () => {
  const build = () => {
    const pets = [
      { id: 'a', userId: 'u', nickname: 'Brasa', energy: 70 },
      { id: 'b', userId: 'u', nickname: 'Lumo', energy: 70 },
    ];
    const users: Record<string, any> = { friend: { displayName: 'Eva' }, u: { displayName: 'Ana', activePetId: 'a' } };
    const prisma: any = {
      user: { findUnique: jest.fn(async ({ where }: any) => users[where.id] ?? null) },
      pet: {
        findMany: jest.fn(async ({ where }: any) => pets.filter((p) => where.id.in.includes(p.id) && p.userId === where.userId)),
        findFirst: jest.fn(async ({ where }: any) => pets.find((p) => p.userId === where.userId && (!where.id || p.id === where.id)) ?? null),
      },
    };
    const mind = fakeMind();
    const memory = fakeMemory();
    return { listener: new EvolutionListener(prisma, mind, memory), mind, memory };
  };

  it('buddy:interacted → cada uno recuerda al otro, se mueve su relación y hay deriva', async () => {
    const s = build();
    await s.listener.onBuddy({ userId: 'u', petAId: 'a', petBId: 'b', slot: 7, previous: null });
    expect(of(s.memory, 'a')[0]).toMatchObject({ kind: 'encounter', subject: 'pet:b' });
    expect(of(s.memory, 'b')[0]).toMatchObject({ kind: 'encounter', subject: 'pet:a' });
    expect(s.memory.feel).toHaveBeenCalledWith('a', 'pet:b', 'Lumo (mi compañero de casa)', expect.any(Number));
    expect(s.mind.applyExperience).toHaveBeenCalledWith('a', ['buddy_play']);
    expect(s.mind.applyExperience).toHaveBeenCalledWith('b', ['buddy_play']);
  });

  it('buddy:interacted con una mascota que no es suya no escribe nada', async () => {
    const s = build();
    await s.listener.onBuddy({ userId: 'otro', petAId: 'a', petBId: 'b', slot: 7 });
    expect(s.memory.written).toEqual([]);
  });

  it('coop:care_received → recuerda quién vino a cuidarla y le coge cariño', async () => {
    const s = build();
    await s.listener.onCare({ ownerId: 'u', visitorId: 'friend', petId: 'a', action: 'feed' });
    expect(of(s.memory, 'a')[0]).toMatchObject({ kind: 'visit', subject: 'user:friend', content: 'Eva vino a verme y me dio de comer.' });
    expect(s.memory.feel).toHaveBeenCalledWith('a', 'user:friend', 'Eva (otro entrenador)', 0.1);
    expect(s.mind.applyExperience).toHaveBeenCalledWith('a', ['care_received']);
  });

  it('gift:received → lo recuerda la mascota a la que iba el regalo', async () => {
    const s = build();
    await s.listener.onGift({ senderId: 'friend', recipientId: 'u', petId: 'b', itemName: 'Manzana' });
    expect(of(s.memory, 'b')[0]).toMatchObject({ kind: 'event', subject: 'user:friend', content: 'Eva me mandó un regalo: Manzana. ¡Qué ilusión!' });
    expect(s.memory.feel).toHaveBeenCalledWith('b', 'user:friend', 'Eva (otro entrenador)', 0.1);
    expect(s.mind.applyExperience).toHaveBeenCalledWith('b', ['gift_received']);
  });

  it('si la mente falla, el evento no revienta a quien lo emitió', async () => {
    const s = build();
    s.memory.remember.mockRejectedValue(new Error('sin base de datos'));
    await expect(s.listener.onCare({ ownerId: 'u', visitorId: 'friend', petId: 'a', action: 'play' })).resolves.toBeUndefined();
    await expect(s.listener.onGift({ senderId: 'friend', recipientId: 'u', petId: 'a' })).resolves.toBeUndefined();
  });

  it('los eventos nuevos tienen su deriva en balance.json', () => {
    for (const ev of ['buddy_play', 'care_received', 'gift_received']) expect(cfg.evolution.events[ev]).toBeDefined();
  });
});

describe('BuddiesService: decide el cerebro, sin Math.random (spec 37 §6.3)', () => {
  const build = (opts: { recent?: number; bondingToday?: number } = {}) => {
    const pets: Record<string, any> = {
      a: { id: 'a', userId: 'u', nickname: 'Brasa', energy: 70, sleeping: false, sick: false },
      b: { id: 'b', userId: 'u', nickname: 'Lumo', energy: 70, sleeping: false, sick: false },
    };
    const counts = [opts.recent ?? 0, opts.bondingToday ?? 0];
    const prisma: any = {
      buddyPair: { findMany: jest.fn(async () => [{ id: 'pair-1', userId: 'u', petAId: 'a', petBId: 'b' }]) },
      buddyInteraction: {
        count: jest.fn(async () => counts.shift() ?? 0),
        create: jest.fn(async ({ data }: any) => ({ id: 'i1', ...data })),
      },
      pet: { findUnique: jest.fn(async ({ where }: any) => pets[where.id]), update: jest.fn(async ({ where }: any) => pets[where.id]) },
    };
    const petsSvc: any = { getPetById: jest.fn(async (_u: string, id: string) => pets[id]), applyActivityReward: jest.fn(async () => null) };
    const bonding: any = { recordInteraction: jest.fn(async () => null) };
    const realtime: any = { emitToUser: jest.fn(), emitPetAction: jest.fn(), emitPetUpdate: jest.fn() };
    const events: any = { emit: jest.fn() };
    const engine = new InteractionEngineService();
    const mind = fakeMind();
    const encounters = new EncounterService(mind, fakeMemory({ stages: { 'a>pet:b': 'friend' } }));
    const svc = new BuddiesService(prisma, petsSvc, bonding, realtime, engine, mind, encounters, events);
    return { svc, events, engine, bonding, prisma };
  };
  /** Avanza el reloj minuto a minuto hasta que la tirada sembrada da interacción. */
  const untilItHappens = async (make: () => ReturnType<typeof build>) => {
    for (let minute = 0; minute < 40; minute++) {
      jest.setSystemTime(new Date(NOW.getTime() + minute * 60_000));
      const s = make();
      const res = await s.svc.trigger('u');
      if (res) return { s, res, minute };
    }
    throw new Error('ninguna ranura dio interacción');
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('la interacción sale de la escena, avisa a la mente y no tira de Math.random', async () => {
    const random = jest.spyOn(Math, 'random');
    const { s, res, minute } = await untilItHappens(() => build());
    expect(random).not.toHaveBeenCalled();
    expect(Object.values(SCENE_TO_BUDDY)).toContain(res.type);
    expect(SCENE_TYPES.map((t) => sceneNote(t))).toContain((res.effects as any).note);
    expect(s.events.emit).toHaveBeenCalledWith('buddy:interacted', {
      userId: 'u',
      petAId: 'a',
      petBId: 'b',
      // Primer intento de la pareja en ese minuto
      slot: Math.floor((NOW.getTime() + minute * 60_000) / s.engine.SLOT_MS) * 1000,
      previous: null,
    });
  });

  it('el primer intento de un minuto da siempre lo mismo', async () => {
    const first = await untilItHappens(() => build());
    const again = await build().svc.trigger('u');
    expect(again?.type).toBe(first.res.type);
  });

  it('un tic sin suerte no condena al resto del minuto: insistiendo acaba habiendo interacción', async () => {
    jest.setSystemTime(NOW);
    const s = build();
    let got = null;
    for (let i = 0; i < 30 && !got; i++) got = await s.svc.trigger('u');
    expect(got).not.toBeNull();
  });

  it('el enfriamiento sigue mandando: con tres en cinco minutos no hay otra', async () => {
    const s = build({ recent: 3 });
    expect(await s.svc.trigger('u')).toBeNull();
    expect(s.events.emit).not.toHaveBeenCalled();
  });

  it('pasado el tope diario de vínculo no hay ni vínculo ni recuerdo nuevo', async () => {
    const { s } = await untilItHappens(() => build({ bondingToday: 5 }));
    expect(s.bonding.recordInteraction).not.toHaveBeenCalled();
    expect(s.events.emit).not.toHaveBeenCalled();
  });
});
