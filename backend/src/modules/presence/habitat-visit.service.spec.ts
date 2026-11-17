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
        createdAt: new Date(),
      })),
      findMany: jest.fn(async ({ where }: any) =>
        (where?.id?.in ?? []).map((id: string) => ({
          id,
          nickname: 'Rex',
          species: { id: 'sp-1', name: 'Lobo' },
        })),
      ),
    },
  };
  return prisma;
}

const build = (prisma: any, realtime?: any, friend = true) =>
  new HabitatVisitService(
    prisma as never,
    { checkFriendship: jest.fn(async () => friend) } as never,
    realtime as never,
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

  it('startVisit reutiliza la visita activa existente (una por par)', async () => {
    const prisma = buildPrisma();
    const started = new Date();
    prisma.habitatVisit.findFirst.mockResolvedValueOnce({ id: 'hv-1', startedAt: started });
    const res = await build(prisma).startVisit(actor, owner);
    expect(prisma.habitatVisit.create).not.toHaveBeenCalled();
    expect(res.visit.startedAt).toBe(started);
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
    prisma.habitatVisit.findMany.mockResolvedValueOnce([{ visitorId: actor, petId: 'pet-1', startedAt: started }]);
    const res = await build(prisma).listVisitors(owner);
    expect(res.visitors).toHaveLength(1);
    expect(res.visitors[0]).toEqual({
      visitorId: actor,
      visitorName: 'n-visitor',
      visitorHandle: null,
      pet: { petId: 'pet-1', nickname: 'Rex', speciesName: 'Lobo', speciesId: 'sp-1', spriteRef: 'sp-1' },
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

