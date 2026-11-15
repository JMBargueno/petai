import { ArenaSettleService } from './arena-settle.service';
import { League } from '../battles/combat/ranking';

const LEAGUES: League[] = [
  { id: 'bronze', name: 'Bronce', minElo: 0 },
  { id: 'silver', name: 'Plata', minElo: 1100 },
  { id: 'mythic', name: 'Mítica', minElo: 1900 },
];
const SETTLE = {
  bronze: { gems: 0, coins: 100, title: 'Guerrero de Bronce' },
  silver: { gems: 50, coins: 150, title: 'Guerrero de Plata' },
  mythic: { gems: 500, coins: 400, title: 'Campeón Mítico' },
};
const USER_ID = 'u1';

function build(opts: { bestElo?: number | null; alreadySettled?: boolean } = {}) {
  const bestElo = opts.bestElo; // undefined → pet con 1000; null → sin pet
  const alreadySettled = opts.alreadySettled ?? false;
  const user = {
    findMany: jest.fn().mockResolvedValue([{ id: USER_ID }]),
    update: jest.fn().mockResolvedValue({}),
  };
  const pet = {
    findFirst: jest.fn().mockResolvedValue(bestElo === null ? null : { elo: bestElo ?? 1000 }),
  };
  const settlement = {
    findUnique: jest.fn().mockResolvedValue(alreadySettled ? { id: 's', userId: USER_ID, seasonId: 's1' } : null),
    create: jest.fn().mockResolvedValue({}),
  };
  const prisma = {
    user,
    pet,
    seasonLeagueSettlement: settlement,
    $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
  };
  const wallet = { credit: jest.fn().mockResolvedValue(undefined) };
  const gameData = { getBalance: () => ({ combats: { leagues: LEAGUES, leagueSettle: SETTLE } }) };
  const service = new ArenaSettleService(prisma as never, wallet as never, gameData as never);
  return { service, wallet, settlement, pet, user, prisma };
}

describe('ArenaSettleService — fin de temporada por liga/ELO', () => {
  it('liga del mejor pet (mythic): reparte gemas+monedas, fija el título y registra', async () => {
    const { service, wallet, settlement, pet, user, prisma } = build({ bestElo: 1950 });
    const r = await service.settleSeason('s1');
    expect(r).toEqual({ settled: 1 });
    // Busca el mejor pet por ELO descendente.
    expect(pet.findFirst).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { elo: 'desc' } }));
    expect(wallet.credit).toHaveBeenCalledTimes(2);
    expect(wallet.credit).toHaveBeenCalledWith(prisma, USER_ID, 'gems', 500);
    expect(wallet.credit).toHaveBeenCalledWith(prisma, USER_ID, 'coins', 400);
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'Campeón Mítico' }) }),
    );
    expect(settlement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leagueId: 'mythic',
          gemsAwarded: 500,
          coinsAwarded: 400,
          bestElo: 1950,
          userId: USER_ID,
          seasonId: 's1',
        }),
      }),
    );
  });

  it('liga sin gemas (bronze): solo monedas, sin cargo de gemas', async () => {
    const { service, wallet } = build({ bestElo: 1000 });
    await service.settleSeason('s1');
    expect(wallet.credit).toHaveBeenCalledTimes(1);
    expect(wallet.credit).toHaveBeenCalledWith(expect.anything(), USER_ID, 'coins', 100);
    expect(wallet.credit).not.toHaveBeenCalledWith(expect.anything(), USER_ID, 'gems', 0);
  });

  it('sin pet: no reparte ni registra', async () => {
    const { service, wallet, settlement } = build({ bestElo: null });
    const r = await service.settleSeason('s1');
    expect(r).toEqual({ settled: 0 });
    expect(wallet.credit).not.toHaveBeenCalled();
    expect(settlement.create).not.toHaveBeenCalled();
  });

  it('idempotente: si ya hay liquidación no reparte de nuevo', async () => {
    const { service, wallet, settlement } = build({ bestElo: 1950, alreadySettled: true });
    const r = await service.settleSeason('s1');
    expect(r).toEqual({ settled: 0 });
    expect(wallet.credit).not.toHaveBeenCalled();
    expect(settlement.create).not.toHaveBeenCalled();
  });
});
