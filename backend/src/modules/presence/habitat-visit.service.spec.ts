import { HabitatVisitService } from './habitat-visit.service';

/**
 * HabitatVisitService: visita en vivo (start/end/list) + cleanup. Se decoupla de Prisma y de
 * RealtimeGateway (emitToUser) y de la amistad (CoopCareService.checkFriendship).
 */

function buildPrisma(): any {
  const prisma: any = {
    habitatVisit: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({ id: 'hv-1', ...data })),
      update: jest.fn(async () => ({})),
      count: jest.fn(async () => 0),
    },
    user: {
      findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, displayName: 'Alice' })),
      findMany: jest.fn(async ({ where }: any) =>
        (where?.id?.in ?? []).map((id: string) => ({ id, displayName: `n-${id}` })),
      ),
    },
    pet: {
      findFirst: jest.fn(async () => ({
        id: 'pet-1',
        nickname: 'Rex',
        species: { id: 'sp-1', name: 'Lobo' },
        energy: 80,
        sleeping: false,
        createdAt: new Date(),
      })),
      update: jest.fn(async () => ({})),
      findMany: jest.fn(async ({ where }: any) =>
        (where?.id?.in ?? []).map((id: string) => ({
          id,
          nickname: 'Rex',
          species: { id: 'sp-1', name: 'Lobo' },
          stage: 'juvenile',
        })),
      ),
    },
  };
  return prisma;
}

const build = (prisma: any, realtime?: any, friend = true, moduleRef?: any) =>
  new HabitatVisitService(
    prisma as never,
    { checkFriendship: jest.fn(async () => friend) } as never,
    realtime as never,
    moduleRef as never,
  );

const actor = 'visitor';
const owner = 'owner';

describe('HabitatVisitService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('startVisit exige amistad aceptada (403 si no)', async () => {
    const prisma = buildPrisma();
    await expect(build(prisma, undefined, false).startVisit(actor, owner)).rejects.toMatchObject({ status: 403 });
    expect(prisma.habitatVisit.create).not.toHaveBeenCalled();
  });

  it('startVisit da 404 si el actor no tiene pet activo', async () => {
    const prisma = buildPrisma();
    prisma.pet.findFirst.mockResolvedValueOnce(null);
    await expect(build(prisma).startVisit(actor, owner)).rejects.toMatchObject({ status: 404 });
  });

  it('startVisit crea la visita y emite habitat:visitor_joined al dueño', async () => {
    const prisma = buildPrisma();
    const realtime = { emitToUser: jest.fn() };
    const res = await build(prisma, realtime).startVisit(actor, owner);
    expect(prisma.habitatVisit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visitorId: actor, ownerId: owner, petId: 'pet-1', status: 'active' }),
      }),
    );
    expect(res.visit.pet.spriteRef).toBe('sp-1');
    expect(res.visit.pet.speciesName).toBe('Lobo');
    expect(res.visit.visitorName).toBe('Alice');
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      owner,
      'habitat:visitor_joined',
      expect.objectContaining({ visitorId: actor, pet: expect.objectContaining({ petId: 'pet-1' }) }),
    );
  });

  it('startVisit con visita activa es idempotente: no crea, no cobra, no re-emite', async () => {
    const prisma = buildPrisma();
    const realtime = { emitToUser: jest.fn() };
    const started = new Date();
    prisma.habitatVisit.findFirst.mockResolvedValueOnce({ id: 'hv-1', startedAt: started, message: 'hola' });
    const res = await build(prisma, realtime).startVisit(actor, owner, 'otro mensaje');
    expect(prisma.habitatVisit.create).not.toHaveBeenCalled();
    expect(prisma.pet.update).not.toHaveBeenCalled();
    expect(realtime.emitToUser).not.toHaveBeenCalled();
    expect(res.visit.startedAt).toBe(started);
    expect(res.visit.message).toBe('hola');
  });

  describe('mensaje', () => {
    it('se guarda recortado y viaja en el evento', async () => {
      const prisma = buildPrisma();
      const realtime = { emitToUser: jest.fn() };
      const res = await build(prisma, realtime).startVisit(actor, owner, '  ¡Hola amigo!  ');
      expect(prisma.habitatVisit.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ message: '¡Hola amigo!' }) }),
      );
      expect(res.visit.message).toBe('¡Hola amigo!');
      expect(realtime.emitToUser).toHaveBeenCalledWith(
        owner,
        'habitat:visitor_joined',
        expect.objectContaining({ message: '¡Hola amigo!' }),
      );
    });

    it('solo espacios → null', async () => {
      const prisma = buildPrisma();
      const res = await build(prisma).startVisit(actor, owner, '   ');
      expect(res.visit.message).toBeNull();
    });

    it('más de 140 caracteres → 400 sin crear ni cobrar', async () => {
      const prisma = buildPrisma();
      await expect(build(prisma).startVisit(actor, owner, 'x'.repeat(141))).rejects.toMatchObject({ status: 400 });
      expect(prisma.habitatVisit.create).not.toHaveBeenCalled();
      expect(prisma.pet.update).not.toHaveBeenCalled();
    });
  });

  describe('anti-spam', () => {
    it('descuenta 10 de energía al visitar y devuelve la energía restante', async () => {
      const prisma = buildPrisma();
      const res = await build(prisma).startVisit(actor, owner);
      expect(prisma.pet.update).toHaveBeenCalledWith({ where: { id: 'pet-1' }, data: { energy: 70 } });
      expect(res.energy).toBe(70);
    });

    it('usa la energía tras el tick de PetsService si está disponible', async () => {
      const prisma = buildPrisma();
      const pets = { getPetById: jest.fn(async () => ({ energy: 15, sleeping: false })) };
      const moduleRef = { get: jest.fn(() => pets) };
      const res = await build(prisma, undefined, true, moduleRef).startVisit(actor, owner);
      expect(pets.getPetById).toHaveBeenCalledWith(actor, 'pet-1');
      expect(res.energy).toBe(5);
    });

    it('400 si el pet duerme', async () => {
      const prisma = buildPrisma();
      prisma.pet.findFirst.mockResolvedValueOnce({
        id: 'pet-1', nickname: 'Rex', species: { id: 'sp-1', name: 'Lobo' }, energy: 80, sleeping: true,
      });
      await expect(build(prisma).startVisit(actor, owner)).rejects.toMatchObject({ status: 400 });
      expect(prisma.habitatVisit.create).not.toHaveBeenCalled();
    });

    it('400 si no tiene energía suficiente', async () => {
      const prisma = buildPrisma();
      prisma.pet.findFirst.mockResolvedValueOnce({
        id: 'pet-1', nickname: 'Rex', species: { id: 'sp-1', name: 'Lobo' }, energy: 9, sleeping: false,
      });
      await expect(build(prisma).startVisit(actor, owner)).rejects.toThrow(/cansado/);
      expect(prisma.pet.update).not.toHaveBeenCalled();
    });

    it('400 al alcanzar el límite diario', async () => {
      const prisma = buildPrisma();
      prisma.habitatVisit.count.mockResolvedValueOnce(10);
      await expect(build(prisma).startVisit(actor, owner)).rejects.toThrow(/Límite diario/);
      expect(prisma.habitatVisit.create).not.toHaveBeenCalled();
    });

    it('400 por cooldown si visitó a ese amigo hace menos de 10 min', async () => {
      const prisma = buildPrisma();
      prisma.habitatVisit.findFirst
        .mockResolvedValueOnce(null) // sin visita activa
        .mockResolvedValueOnce({ id: 'hv-0', startedAt: new Date(Date.now() - 5 * 60 * 1000) });
      await expect(build(prisma).startVisit(actor, owner)).rejects.toThrow(/en 5 min/);
      expect(prisma.pet.update).not.toHaveBeenCalled();
      expect(prisma.habitatVisit.create).not.toHaveBeenCalled();
    });

    it('sin cooldown si la última visita a ese amigo fue hace más de 10 min', async () => {
      const prisma = buildPrisma();
      prisma.habitatVisit.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'hv-0', startedAt: new Date(Date.now() - 11 * 60 * 1000) });
      await expect(build(prisma).startVisit(actor, owner)).resolves.toMatchObject({ success: true });
      expect(prisma.habitatVisit.create).toHaveBeenCalled();
    });
  });

  it('endVisit finaliza las visitas activas y emite habitat:visitor_left', async () => {
    const prisma = buildPrisma();
    const realtime = { emitToUser: jest.fn() };
    prisma.habitatVisit.findMany.mockResolvedValueOnce([{ id: 'hv-1', ownerId: owner }]);
    const res = await build(prisma, realtime).endVisit(actor);
    expect(res).toEqual({ success: true, ended: 1 });
    expect(prisma.habitatVisit.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'hv-1' }, data: expect.objectContaining({ status: 'ended' }) }),
    );
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      owner,
      'habitat:visitor_left',
      expect.objectContaining({ visitorId: actor, visitorName: 'Alice' }),
    );
  });

  it('endVisit da 404 si no hay visita activa', async () => {
    const prisma = buildPrisma();
    await expect(build(prisma).endVisit(actor)).rejects.toMatchObject({ status: 404 });
  });

  it('listVisitors devuelve los visitantes activos con PetIdentity (siendo el actor el dueño)', async () => {
    const prisma = buildPrisma();
    const started = new Date();
    prisma.habitatVisit.findMany.mockResolvedValueOnce([
      { visitorId: actor, petId: 'pet-1', startedAt: started, message: '¡Hola!' },
    ]);
    const res = await build(prisma).listVisitors(owner);
    expect(res.visitors).toHaveLength(1);
    expect(res.visitors[0]).toEqual({
      visitorId: actor,
      visitorName: 'n-visitor',
      visitorHandle: null,
      pet: {
        petId: 'pet-1',
        nickname: 'Rex',
        speciesName: 'Lobo',
        speciesId: 'sp-1',
        spriteRef: 'sp-1',
        stage: 'juvenile',
        // Aspecto para dibujarlo en la sala del anfitrión (con valores por defecto si la fila no los trae)
        look: expect.objectContaining({ palette: expect.any(Object), shiny: false, accessories: {} }),
      },
      message: '¡Hola!',
      startedAt: started,
    });
  });

  it('listVisitors devuelve vacío si no hay visitas activas', async () => {
    const prisma = buildPrisma();
    await expect(build(prisma).listVisitors(owner)).resolves.toEqual({ visitors: [] });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('cleanupStaleVisits finaliza las visitas > 15 min y emite left', async () => {
    const prisma = buildPrisma();
    const realtime = { emitToUser: jest.fn() };
    prisma.habitatVisit.findMany.mockResolvedValueOnce([{ id: 'hv-old', visitorId: actor, ownerId: owner }]);
    await build(prisma, realtime).cleanupStaleVisits();
    expect(prisma.habitatVisit.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'hv-old' }, data: expect.objectContaining({ status: 'ended' }) }),
    );
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      owner,
      'habitat:visitor_left',
      expect.objectContaining({ visitorId: actor, visitorName: 'n-visitor' }),
    );
  });

  it('cleanupStaleVisits no hace nada si no hay visitas caducadas', async () => {
    const prisma = buildPrisma();
    const realtime = { emitToUser: jest.fn() };
    await build(prisma, realtime).cleanupStaleVisits();
    expect(prisma.habitatVisit.update).not.toHaveBeenCalled();
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });
});

describe('HabitatVisitService — aspecto del visitante y escenas (fase 4)', () => {
  const { HabitatVisitService: Service, lookOf } = require('./habitat-visit.service');

  describe('lookOf', () => {
    it('lleva paleta, patrón, semilla, shiny y prendas', () => {
      expect(
        lookOf({ palette: { primary: '#112233', secondary: '#445566', accent: '#778899' }, patternId: 'stripes', visualSeed: 42, shiny: true, accessories: { head: 'crown_gold' } }),
      ).toEqual({
        palette: { primary: '#112233', secondary: '#445566', accent: '#778899' },
        pattern: 'stripes',
        visualSeed: 42,
        shiny: true,
        accessories: { head: 'crown_gold' },
      });
    });

    it('el patrón liso viaja como nulo', () => {
      expect(lookOf({ patternId: 'plain' }).pattern).toBeNull();
    });

    it('descarta colores y prendas que no tienen forma válida', () => {
      const look = lookOf({
        palette: { primary: 'javascript:alert(1)', secondary: 7 },
        accessories: { head: '<script>', 'slot raro': 'x', neck: 'scarf_red', back: 12 },
      });
      expect(look.palette).toEqual({ primary: '#E25822', secondary: '#F3C544' });
      expect(look.accessories).toEqual({ neck: 'scarf_red' });
    });

    it('una fila sin datos de aspecto no rompe', () => {
      expect(lookOf({})).toEqual({ palette: { primary: '#E25822', secondary: '#F3C544' }, pattern: null, visualSeed: 1337, shiny: false, accessories: {} });
    });

    it('no lleva nada del estado ni de la memoria de la mascota', () => {
      const look = lookOf({ palette: {}, hunger: 3, personality: { dims: {} }, intelligence: 900 } as any);
      expect(Object.keys(look).sort()).toEqual(['accessories', 'palette', 'pattern', 'shiny', 'visualSeed']);
    });
  });

  describe('escenas durante la visita', () => {
    const T0 = 1_700_000_000_000;
    function setup(visits: any[]) {
      const prisma: any = { habitatVisit: { findMany: jest.fn(async () => visits) } };
      const realtime = { emitToUser: jest.fn() };
      const events = { emit: jest.fn() };
      const svc = new Service(prisma, {} as any, realtime as any, undefined, events as any);
      return { svc, realtime, events };
    }
    const visit = { id: 'visit-1', visitorId: 'visitor', ownerId: 'host', petId: 'pet-v', startedAt: new Date(T0) };
    const ticks = (events: any) => events.emit.mock.calls.filter((c: any[]) => c[0] === 'habitat:visit_tick').map((c: any[]) => c[1]);

    it('avisa a la mente una vez por ranura de tiempo', async () => {
      const s = setup([visit]);
      const slot = s.svc.sceneSlotMs;
      // Primera pasada: toma nota de la ranura en curso, sin repetir la escena de llegada
      await s.svc.tickScenes(T0 + 1000);
      expect(ticks(s.events)).toEqual([]);
      await s.svc.tickScenes(T0 + slot - 1000);
      expect(ticks(s.events)).toEqual([]);
      await s.svc.tickScenes(T0 + slot + 1000);
      await s.svc.tickScenes(T0 + slot + 30_000);
      expect(ticks(s.events)).toEqual([{ userId: 'visitor', ownerId: 'host', visitorPetId: 'pet-v', slot: 1 }]);
      await s.svc.tickScenes(T0 + slot * 2 + 1000);
      expect(ticks(s.events).map((t: any) => t.slot)).toEqual([1, 2]);
    });

    it('sin visitas activas no avisa de nada', async () => {
      const s = setup([]);
      await s.svc.tickScenes(T0);
      expect(s.events.emit).not.toHaveBeenCalled();
    });

    it('reenvía al anfitrión la escena que resuelve la mente y adopta su duración de ranura', () => {
      const s = setup([]);
      s.svc.onSceneResolved({ ownerId: 'host', visitorId: 'visitor', slotMs: 120_000, scene: { slot: 1, type: 'play_tag', stage: 'friend' } });
      expect(s.realtime.emitToUser).toHaveBeenCalledWith('host', 'habitat:scene', { visitorId: 'visitor', slot: 1, type: 'play_tag', stage: 'friend' });
      expect(s.svc.sceneSlotMs).toBe(120_000);
    });

    it('un fallo de la base de datos no tumba el temporizador', async () => {
      const s = setup([]);
      (s.svc as any).prisma.habitatVisit.findMany = jest.fn(async () => {
        throw new Error('sin conexión');
      });
      await expect(s.svc.tickScenes(T0)).resolves.toBeUndefined();
    });
  });
});
