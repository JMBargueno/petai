import * as fs from 'fs';
import * as path from 'path';
import { EvolutionListener } from './evolution.listener';
import { neutralDims } from './personality.engine';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));

/** Dos entrenadores con dos mascotas cada uno: la antigua y la que tienen elegida como activa. */
function setup() {
  const pets = [
    { id: 'v-old', userId: 'visitor', nickname: 'Vieja', createdAt: 1 },
    { id: 'v-active', userId: 'visitor', nickname: 'Brasa', createdAt: 2 },
    { id: 'h-old', userId: 'host', nickname: 'Antigua', createdAt: 1 },
    { id: 'h-active', userId: 'host', nickname: 'Lumo', createdAt: 2 },
  ];
  const users: Record<string, any> = {
    visitor: { displayName: 'Ana', activePetId: 'v-active' },
    host: { displayName: 'Luis', activePetId: 'h-active' },
  };
  const withUser = (p: any) => (p ? { ...p, user: { displayName: users[p.userId].displayName } } : null);
  const prisma = {
    user: { findUnique: jest.fn(async ({ where }: any) => users[where.id] ?? null) },
    pet: {
      findFirst: jest.fn(async ({ where }: any) => {
        const mine = pets.filter((p) => p.userId === where.userId).sort((a, b) => a.createdAt - b.createdAt);
        return withUser(where.id ? mine.find((p) => p.id === where.id) : mine[0]);
      }),
    },
  };
  const dims: Record<string, any> = {};
  const stages: Record<string, string> = {};
  const mind: any = {
    applyExperience: jest.fn(async () => null),
    config: () => balance.personality,
    ensureDims: jest.fn(async (pet: any) => ({ dims: dims[pet.id] ?? neutralDims(), stored: {} })),
  };
  const memory: any = {
    remember: jest.fn(async () => 1),
    feel: jest.fn(async () => ({ valence: 0, stage: null })),
    stageWith: jest.fn(async (petId: string, subject: string) => stages[`${petId}>${subject}`] ?? 'stranger'),
  };
  const events = { emit: jest.fn() };
  const listener = new EvolutionListener(prisma as any, mind as any, memory as any, events as any);
  return { listener, mind, memory, users, events, dims, stages };
}

const rememberedBy = (memory: any) => memory.remember.mock.calls.map((c: any[]) => c[0]);

describe('EvolutionListener', () => {
  describe('spec 37 §1.7: la visita dice qué mascotas participaron', () => {
    it('con ids explícitos los recuerdos van a esas mascotas aunque no sean las más antiguas', async () => {
      const s = setup();
      await s.listener.onHabitatVisit({ userId: 'visitor', ownerId: 'host', visitorPetId: 'v-active', hostPetId: 'h-active' });
      expect(rememberedBy(s.memory).sort()).toEqual(['h-active', 'v-active']);
      expect(s.mind.applyExperience).toHaveBeenCalledWith('v-active', ['habitat_visit']);
      expect(s.mind.applyExperience).toHaveBeenCalledWith('h-active', ['habitat_visit']);
      const visitorMemory = s.memory.remember.mock.calls.find((c: any[]) => c[0] === 'v-active')[1][0];
      expect(visitorMemory.content).toContain('Lumo');
      expect(visitorMemory.subject).toBe('pet:h-active');
    });

    it('sin ids usa la mascota activa de cada entrenador, no la más antigua', async () => {
      const s = setup();
      await s.listener.onHabitatVisit({ userId: 'visitor', ownerId: 'host' });
      expect(rememberedBy(s.memory).sort()).toEqual(['h-active', 'v-active']);
    });

    it('sin mascota activa elegida cae a la más antigua', async () => {
      const s = setup();
      s.users.visitor.activePetId = null;
      s.users.host.activePetId = 'no-existe';
      await s.listener.onHabitatVisit({ userId: 'visitor', ownerId: 'host' });
      expect(rememberedBy(s.memory).sort()).toEqual(['h-old', 'v-old']);
    });

    it('un id que no es de ese entrenador se ignora', async () => {
      const s = setup();
      await s.listener.onHabitatVisit({ userId: 'visitor', ownerId: 'host', visitorPetId: 'h-active', hostPetId: 'h-active' });
      expect(rememberedBy(s.memory).sort()).toEqual(['h-active', 'v-active']);
    });
  });

  describe('spec 37 §1.1: un turno de chat no escribe dos veces', () => {
    it('si el orquestador ya aplica la deriva del chat, el listener no la repite', async () => {
      const s = setup();
      await s.listener.onChat({ petId: 'p', mindHandled: true });
      expect(s.mind.applyExperience).not.toHaveBeenCalled();
    });

    it('sin orquestador el listener sigue aplicándola', async () => {
      const s = setup();
      await s.listener.onChat({ petId: 'p' });
      expect(s.mind.applyExperience).toHaveBeenCalledWith('p', ['chat']);
    });
  });
});

describe('EvolutionListener: la aventura deja su recuerdo a través de la mente', () => {
  it('escribe un episodio con el tema y el desenlace, y mueve la personalidad', async () => {
    const mind: any = { applyExperience: jest.fn(async () => null) };
    const memory: any = { remember: jest.fn(async () => 1), feel: jest.fn() };
    const listener = new EvolutionListener({} as any, mind, memory);
    await listener.onAdventure({ petId: 'p', theme: 'La cueva de los ecos', outcome: 'win' });
    expect(mind.applyExperience).toHaveBeenCalledWith('p', ['adventure']);
    const [petId, [episode]] = memory.remember.mock.calls[0];
    expect(petId).toBe('p');
    expect(episode).toMatchObject({ layer: 'episodic', kind: 'adventure', valence: 0.6 });
    expect(episode.content).toContain('La cueva de los ecos');
    // Sin la fecha metida en el texto: la edad del recuerdo ya la da su `createdAt`
    expect(episode.content).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it('una derrota no deja buen sabor', async () => {
    const memory: any = { remember: jest.fn(async () => 1), feel: jest.fn() };
    const listener = new EvolutionListener({} as any, { applyExperience: jest.fn(async () => null) } as any, memory);
    await listener.onAdventure({ petId: 'p', theme: 'El pantano', outcome: 'lose' });
    expect(memory.remember.mock.calls[0][1][0].valence).toBe(0);
  });
});

describe('EvolutionListener: escenas de visita (spec 37 §6.3)', () => {
  const setupVisit = () => {
    const pets = [
      { id: 'v', userId: 'visitor', nickname: 'Brasa', energy: 70 },
      { id: 'h', userId: 'host', nickname: 'Lumo', energy: 70 },
    ];
    const users: Record<string, any> = { visitor: { displayName: 'Ana', activePetId: 'v' }, host: { displayName: 'Luis', activePetId: 'h' } };
    const prisma = {
      user: { findUnique: jest.fn(async ({ where }: any) => users[where.id]) },
      pet: {
        findFirst: jest.fn(async ({ where }: any) => {
          const p = pets.find((x) => x.userId === where.userId && (!where.id || x.id === where.id));
          return p ? { ...p, user: { displayName: users[p.userId].displayName } } : null;
        }),
      },
    };
    const stages: Record<string, string> = {};
    const mind: any = {
      applyExperience: jest.fn(async () => null),
      config: () => balance.personality,
      ensureDims: jest.fn(async () => ({ dims: neutralDims(), stored: {} })),
    };
    const memory: any = {
      remember: jest.fn(async () => 1),
      feel: jest.fn(async () => ({ valence: 0, stage: null })),
      stageWith: jest.fn(async (petId: string, subject: string) => stages[`${petId}>${subject}`] ?? 'stranger'),
    };
    const events = { emit: jest.fn() };
    const listener = new EvolutionListener(prisma as any, mind, memory, events as any);
    return { listener, mind, memory, events, stages };
  };
  const visit = { userId: 'visitor', ownerId: 'host', visitorPetId: 'v', hostPetId: 'h' };
  const episodeOf = (memory: any, petId: string, call = 0) => memory.remember.mock.calls.filter((c: any[]) => c[0] === petId)[call][1][0];

  it('al llegar se presentan: cada uno lo recuerda a su manera y el anfitrión recibe la escena', async () => {
    const s = setupVisit();
    await s.listener.onHabitatVisit(visit);
    const host = episodeOf(s.memory, 'h');
    const guest = episodeOf(s.memory, 'v');
    expect(host.content).not.toBe(guest.content);
    expect(host).toMatchObject({ layer: 'episodic', kind: 'encounter', subject: 'pet:v' });
    expect(guest).toMatchObject({ layer: 'episodic', kind: 'encounter', subject: 'pet:h' });
    expect(s.mind.applyExperience).toHaveBeenCalledWith('v', ['habitat_visit']);
    expect(s.events.emit).toHaveBeenCalledWith(
      'habitat:scene_resolved',
      expect.objectContaining({ ownerId: 'host', visitorId: 'visitor', scene: expect.objectContaining({ slot: 0, type: 'greet', stage: 'stranger', guestPetId: 'v' }) }),
    );
  });

  it('del visitante solo viaja el carácter en palabras, nunca los números ni recuerdos', async () => {
    const s = setupVisit();
    await s.listener.onHabitatVisit(visit);
    const payload = s.events.emit.mock.calls.find((c: any[]) => c[0] === 'habitat:scene_resolved')[1];
    expect(Object.keys(payload.scene.guestTraits).sort()).toEqual(['affection', 'bravery', 'curiosity', 'sociability', 'temper']);
    for (const v of Object.values(payload.scene.guestTraits)) expect(typeof v).toBe('string');
    expect(JSON.stringify(payload)).not.toMatch(/"dims"|"content"|"valence"/);
  });

  it('la relación de cada uno hacia el otro se mueve con la escena', async () => {
    const s = setupVisit();
    await s.listener.onHabitatVisit(visit);
    const delta = balance.personality.social.scenes.greet.delta;
    expect(s.memory.feel).toHaveBeenCalledWith('h', 'pet:v', expect.stringContaining('Brasa'), delta);
    expect(s.memory.feel).toHaveBeenCalledWith('v', 'pet:h', expect.stringContaining('Lumo'), delta);
    expect(s.memory.feel).toHaveBeenCalledWith('h', 'user:visitor', expect.any(String), 0.15);
  });

  it('entre amigos el recuerdo de la llegada es otro', async () => {
    const strangers = setupVisit();
    await strangers.listener.onHabitatVisit(visit);
    const friends = setupVisit();
    friends.stages['h>pet:v'] = 'friend';
    await friends.listener.onHabitatVisit(visit);
    expect(episodeOf(friends.memory, 'h').content).not.toBe(episodeOf(strangers.memory, 'h').content);
  });

  it('quedarse más rato no infla la relación: solo las primeras escenas dejan huella', async () => {
    const s = setupVisit();
    const max = balance.personality.social.scene.maxEffectScenesPerVisit;
    await s.listener.onHabitatVisit(visit);
    for (let slot = 1; slot < max + 3; slot++) await s.listener.onVisitTick({ ...visit, slot });
    expect(s.memory.remember.mock.calls.filter((c: any[]) => c[0] === 'h')).toHaveLength(max);
    // La personalidad solo se mueve al llegar
    expect(s.mind.applyExperience.mock.calls.filter((c: any[]) => c[0] === 'h')).toHaveLength(1);
    // …pero el anfitrión sigue viendo escenas
    expect(s.events.emit.mock.calls.filter((c: any[]) => c[0] === 'habitat:scene_resolved')).toHaveLength(max + 3);
  });

  it('sin una de las dos mascotas no pasa nada', async () => {
    const s = setupVisit();
    await s.listener.onHabitatVisit({ userId: 'nadie', ownerId: 'host' });
    expect(s.memory.remember).not.toHaveBeenCalled();
    expect(s.events.emit).not.toHaveBeenCalled();
  });
});
