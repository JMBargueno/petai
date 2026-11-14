import { TournamentService } from './tournament.service';

describe('TournamentService.standings (R-04.3: paginación)', () => {
  function build() {
    const prisma: any = {
      tournament: { findFirst: jest.fn().mockResolvedValue({ id: 't1', status: 'active' }) },
      tournamentEntry: {
        count: jest.fn().mockResolvedValue(120),
        findMany: jest.fn().mockResolvedValue([
          { userId: 'u1', petId: 'p1', elo: 1500, placement: null, pet: { nickname: 'A' } },
          { userId: 'u2', petId: 'p2', elo: 1400, placement: null, pet: { nickname: 'B' } },
        ]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const gameData: any = { getBalance: () => ({ publicApi: { standings: { defaultLimit: 50, maxLimit: 200 } } }) };
    const service = new TournamentService(prisma, gameData, {} as never, {} as never, {} as never, {} as never, {} as never);
    return { service, prisma };
  }

  it('aplica skip/take y devuelve total/limit/offset', async () => {
    const { service, prisma } = build();
    const res = await service.standings('u2', 2, 1);
    const arg = prisma.tournamentEntry.findMany.mock.calls[0][0];
    expect(arg.skip).toBe(1);
    expect(arg.take).toBe(2);
    expect(res.total).toBe(120);
    expect(res.limit).toBe(2);
    expect(res.offset).toBe(1);
    expect(res.entries.map((e: any) => e.rank)).toEqual([2, 3]); // offset+1..offset+n
  });

  it('por defecto usa defaultLimit y offset 0; no supera maxLimit', async () => {
    const { service, prisma } = build();
    await service.standings('u2');
    expect(prisma.tournamentEntry.findMany.mock.calls[0][0]).toMatchObject({ take: 50, skip: 0 });

    prisma.tournamentEntry.findMany.mockClear();
    await service.standings('u2', 99999); // supera maxLimit=200
    expect(prisma.tournamentEntry.findMany.mock.calls[0][0].take).toBe(200);
  });
});
