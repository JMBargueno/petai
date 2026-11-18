import { EvolutionListener } from './evolution.listener';

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
  const mind: any = { applyExperience: jest.fn(async () => null) };
  const memory: any = { remember: jest.fn(async () => 1), feel: jest.fn(async () => undefined) };
  const listener = new EvolutionListener(prisma as any, mind as any, memory as any);
  return { listener, mind, memory, users };
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
