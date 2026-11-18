import { ClansService } from './clans.service';
import { habitatTier, nextTierXp, pickResidents, HABITAT_TIERS, MAX_RESIDENTS } from './clan-habitat';
import { resolveActivePetIds } from '../pets/active-pet';

/**
 * Hábitat del Nexo: niveles por XP, sorteo de residentes (≤5, uno por Custodio, el espectador
 * siempre), pockai activo por usuario y evento `clan:xp`.
 */

describe('clan-habitat: niveles', () => {
  it('hay 5 niveles ordenados y el primero empieza en 0', () => {
    expect(HABITAT_TIERS).toHaveLength(5);
    expect(HABITAT_TIERS[0].minXp).toBe(0);
    expect(MAX_RESIDENTS).toBe(5);
  });

  it.each([
    [0, 1],
    [499, 1],
    [500, 2],
    [1999, 2],
    [2000, 3],
    [5999, 3],
    [6000, 4],
    [14999, 4],
    [15000, 5],
    [999999, 5],
    [-10, 1],
    [NaN, 1],
  ])('habitatTier(%p) = nivel %p', (xp, level) => {
    expect(habitatTier(xp).level).toBe(level);
  });

  it('nextTierXp devuelve el siguiente umbral o null en el máximo', () => {
    expect(nextTierXp(0)).toBe(500);
    expect(nextTierXp(500)).toBe(2000);
    expect(nextTierXp(14999)).toBe(15000);
    expect(nextTierXp(15000)).toBeNull();
  });
});

describe('clan-habitat: pickResidents', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${i}`);

  it.each([1, 3, 5, 10, 40])('con %p candidatos saca min(n, 5) sin repetir e incluye al espectador', (n) => {
    for (let run = 0; run < 50; run++) {
      const picked = pickResidents(ids(n), 'u0');
      expect(picked).toHaveLength(Math.min(n, 5));
      expect(new Set(picked).size).toBe(picked.length);
      expect(picked[0]).toBe('u0');
    }
  });

  it('si el espectador no tiene pockai, salen 5 de los demás', () => {
    const picked = pickResidents(ids(8), 'ajeno');
    expect(picked).toHaveLength(5);
    expect(picked).not.toContain('ajeno');
  });

  it('candidatos duplicados no cuentan dos veces', () => {
    expect(pickResidents(['a', 'a', 'b', 'b'], 'a')).toEqual(['a', 'b']);
  });

  it('el sorteo varía entre llamadas (todos los miembros pueden salir)', () => {
    const seen = new Set<string>();
    for (let run = 0; run < 200; run++) pickResidents(ids(10), 'u0').forEach((u) => seen.add(u));
    expect(seen.size).toBe(10);
  });
});

describe('resolveActivePetIds', () => {
  const prismaWith = (users: any[], pets: any[]) => ({
    user: { findMany: jest.fn(async () => users) },
    pet: { findMany: jest.fn(async () => pets) },
  });

  it('usa el elegido si es suyo; si no, el más antiguo; sin mascotas no aparece', async () => {
    const prisma = prismaWith(
      [
        { id: 'a', activePetId: 'a2' },
        { id: 'b', activePetId: 'borrado' },
        { id: 'c', activePetId: null },
        { id: 'd', activePetId: 'a1' }, // mascota de otro: no vale
        { id: 'e', activePetId: null },
      ],
      [
        { id: 'a1', userId: 'a' },
        { id: 'a2', userId: 'a' },
        { id: 'b1', userId: 'b' },
        { id: 'c1', userId: 'c' },
        { id: 'd1', userId: 'd' },
      ],
    );
    const map = await resolveActivePetIds(prisma, ['a', 'b', 'c', 'd', 'e']);
    expect(Object.fromEntries(map)).toEqual({ a: 'a2', b: 'b1', c: 'c1', d: 'd1' });
  });

  it('sin usuarios no consulta', async () => {
    const prisma = prismaWith([], []);
    expect((await resolveActivePetIds(prisma, [])).size).toBe(0);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe('ClansService.getHabitat / clan:xp', () => {
  const presence = { hasActiveDevices: jest.fn().mockResolvedValue(true) };
  const events = { emit: jest.fn() };
  const realtime = { emitToUser: jest.fn() };

  /** Clan de `n` miembros; los de `withoutPet` no tienen mascota. */
  function buildPrisma(n: number, withoutPet: string[] = [], xp = 0): any {
    const members = Array.from({ length: n }, (_, i) => `u${i}`);
    const pets = members
      .filter((u) => !withoutPet.includes(u))
      .map((u) => ({
        id: `pet-${u}`,
        userId: u,
        nickname: `Pocki ${u}`,
        speciesId: 'ignisaur',
        species: { id: 'ignisaur', name: 'Ignisaur' },
        patternId: 'plain',
        rarity: 'normal',
        stage: 'baby',
        palette: {},
        visualSeed: 1,
        shiny: false,
        accessories: {},
        level: 3,
        sleeping: false,
        sick: false,
        hunger: 90,
        happiness: 90,
        energy: 90,
        hygiene: 90,
        health: 100,
      }));
    return {
      clan: {
        findUnique: jest.fn(async () => ({ id: 'clan-1', xp })),
        update: jest.fn(async ({ data }: any) => ({ id: 'clan-1', xp: xp + data.xp.increment })),
      },
      clanMembership: {
        findUnique: jest.fn(async ({ where }: any) =>
          members.includes(where.userId) ? { id: 'm', userId: where.userId, clanId: 'clan-1', role: 'member' } : null,
        ),
        findMany: jest.fn(async () => members.map((userId) => ({ userId, role: 'member' }))),
      },
      clanGoal: { findMany: jest.fn(async () => []) },
      user: {
        findMany: jest.fn(async ({ where }: any) =>
          (where.id.in as string[]).map((id) => ({ id, displayName: `n-${id}`, handle: id, activePetId: null })),
        ),
      },
      pet: {
        findMany: jest.fn(async ({ where }: any) =>
          where.userId
            ? pets.filter((p) => where.userId.in.includes(p.userId))
            : pets.filter((p) => where.id.in.includes(p.id)),
        ),
      },
    };
  }

  const build = (prisma: any) =>
    new ClansService(prisma as never, presence as never, events as never, realtime as never);

  beforeEach(() => jest.clearAllMocks());

  it.each([1, 3, 5, 10])('clan de %p miembros: min(n,5) residentes, uno por usuario, yo primero', async (n) => {
    const habitat = await build(buildPrisma(n)).getHabitat('u0', 'clan-1');
    expect(habitat.residents).toHaveLength(Math.min(n, 5));
    const users = habitat.residents.map((r) => r.userId);
    expect(new Set(users).size).toBe(users.length);
    expect(habitat.residents[0]).toMatchObject({ userId: 'u0', isMe: true });
    expect(habitat.residents[0].pet).toMatchObject({ id: 'pet-u0', species: { id: 'ignisaur' }, pattern: { id: 'plain' } });
  });

  it('los miembros sin pockai no ocupan hueco, y si yo no tengo no rompe', async () => {
    const habitat = await build(buildPrisma(4, ['u0', 'u2'])).getHabitat('u0', 'clan-1');
    expect(habitat.residents.map((r) => r.userId).sort()).toEqual(['u1', 'u3']);
    expect(habitat.residents.every((r) => !r.isMe)).toBe(true);
  });

  it('devuelve nivel y siguiente umbral según la XP', async () => {
    const habitat = await build(buildPrisma(2, [], 2500)).getHabitat('u0', 'clan-1');
    expect(habitat).toMatchObject({ xp: 2500, tier: 3, tierId: 'santuario', nextTierXp: 6000 });
  });

  it('403 si no eres de este clan', async () => {
    const prisma = buildPrisma(2);
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', userId: 'u0', clanId: 'otro' });
    await expect(build(prisma).getHabitat('u0', 'clan-1')).rejects.toThrow('No eres miembro');
  });

  it('clan:xp se emite a todos los miembros, con leveledUp al cruzar un umbral', async () => {
    const prisma = buildPrisma(3, [], 495);
    await build(prisma).onClanActivity({ userId: 'u1', xp: 10 });
    expect(realtime.emitToUser).toHaveBeenCalledTimes(3);
    expect(realtime.emitToUser).toHaveBeenCalledWith('u0', 'clan:xp', {
      clanId: 'clan-1',
      xp: 505,
      delta: 10,
      tier: 2,
      leveledUp: true,
      byUserId: 'u1',
    });
  });

  it('clan:xp sin cruzar umbral lleva leveledUp=false', async () => {
    const prisma = buildPrisma(1, [], 100);
    await build(prisma).onClanActivity({ userId: 'u0', xp: 5 });
    expect(realtime.emitToUser).toHaveBeenCalledWith('u0', 'clan:xp', expect.objectContaining({ leveledUp: false, tier: 1 }));
  });
});
