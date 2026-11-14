import { PublicApiController } from './public-api.controller';

describe('PublicApiController (R-04)', () => {
  function build() {
    const prisma: any = {
      pet: { findMany: jest.fn() },
      season: { findFirst: jest.fn().mockResolvedValue({ id: 's1', name: 'Temporada', theme: 'T' }) },
      raid: { findMany: jest.fn().mockResolvedValue([{ id: 'r1', startedAt: new Date() }]) },
      tournament: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const leaderboardService: any = { publicTop: jest.fn().mockResolvedValue([]) };
    const gameData: any = {
      getBalance: () => ({ publicApi: { leaderboardMax: 100, eventsLimit: 10, standings: { defaultLimit: 50, maxLimit: 200 } } }),
    };
    const controller = new PublicApiController(prisma, leaderboardService, gameData);
    return { controller, prisma, leaderboardService };
  }

  it('leaderboard reutiliza el ZSET del núcleo y no consulta Pet directamente (R-04.1)', async () => {
    const { controller, prisma, leaderboardService } = build();
    const res = await controller.leaderboard('fire', '10');
    expect(leaderboardService.publicTop).toHaveBeenCalledWith(10, 'fire');
    expect(prisma.pet.findMany).not.toHaveBeenCalled(); // ya no hay pet.findMany orderBy elo
    expect(res).toMatchObject({ element: 'fire', limit: 10, entries: [] });
  });

  it('events filtra raids a estado activo y aplica el límite por defecto de game-data (R-04.2)', async () => {
    const { controller, prisma } = build();
    await controller.events();
    const arg = prisma.raid.findMany.mock.calls[0][0];
    expect(arg.where.status).toBe('active');
    expect(arg.where.endsAt).toEqual({ gte: expect.any(Date) });
    expect(arg.take).toBe(10); // balance.publicApi.eventsLimit
    expect(prisma.raid.findMany).toHaveBeenCalledTimes(1);
  });
});
