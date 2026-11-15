import { AdminOverviewService } from './admin-overview.service';

function build() {
  const prismaMock: any = {
    tournament: {
      findMany: jest.fn(async () => [
        { id: 't1', status: 'entry', entryFee: 50, totalPrizePool: 3000, createdAt: new Date('2026-11-14T10:00:00Z'), startedAt: null, endsAt: new Date('2026-11-20T00:00:00Z'), endedAt: null },
        { id: 't2', status: 'finished', entryFee: 50, totalPrizePool: 3000, createdAt: new Date('2026-11-14T10:00:00Z'), startedAt: new Date('2026-11-14T11:00:00Z'), endsAt: new Date('2026-11-20T00:00:00Z'), endedAt: new Date('2026-11-15T09:00:00Z') },
      ]),
    },
    raid: { findMany: jest.fn(async () => []) },
    user: { groupBy: jest.fn(async () => [{ role: 'user', _count: { _all: 3 } }, { role: 'admin', _count: { _all: 1 } }]) },
    pet: { groupBy: jest.fn(async () => [{ rarity: 'normal', _count: { _all: 5 } }]) },
    item: { count: jest.fn(async () => 7) },
  };
  const gameData: any = {
    getFestivals: () => [
      { id: 'halloween', name: 'Halloween', monthStart: 10, dayStart: 31 },
      { id: 'navidad', name: 'Navidad', monthStart: 12, dayStart: 24, monthEnd: 1, dayEnd: 6 },
      { id: 'roto', name: 'Sin fecha' },
    ],
    readFileFromDisk: () => ({
      currentSeason: { id: 's1', name: 'T1', startTime: '2026-11-01T00:00:00Z', endTime: '2026-11-30T23:59:59Z', passPrice: 300, passCurrency: 'gems', maxTier: 50 },
      upcomingSeason: null,
    }),
  };
  return new AdminOverviewService(prismaMock, gameData);
}

const now = new Date('2026-11-15T12:00:00Z');

describe('AdminOverviewService', () => {
  it('junta festividades, temporadas y torneos con fechas YYYY-MM-DD', async () => {
    const events = await build().listEvents(now);
    const byId = Object.fromEntries(events.map((e) => [e.id, e]));
    expect(byId['festival:halloween']).toMatchObject({ source: 'festival', startDate: '2026-10-31', endDate: '2026-10-31' });
    // Cruza el fin de año.
    expect(byId['festival:navidad']).toMatchObject({ startDate: '2026-12-24', endDate: '2027-01-06' });
    expect(byId['season:s1']).toMatchObject({ source: 'season', startDate: '2026-11-01', endDate: '2026-11-30' });
    expect(byId['tournament:t1']).toMatchObject({ source: 'tournament', startDate: '2026-11-14', enabled: true, finished: false });
    // Terminado por estado aunque sus fechas sigan "en curso".
    expect(byId['tournament:t2']).toMatchObject({ finished: true, endDate: '2026-11-15' });
    expect(events.some((e) => e.name === 'Sin fecha')).toBe(false);
  });

  it('stats cuenta en BD y lista lo que está en curso o empieza en 30 días', async () => {
    const stats = await build().stats(now);
    expect(stats.users).toEqual({ total: 4, byRole: { user: 3, admin: 1 } });
    expect(stats.pets).toEqual({ total: 5, byRarity: { normal: 5 } });
    expect(stats.items).toBe(7);
    // Navidad (24/12) queda fuera de los 30 días; Halloween ya pasó.
    expect(stats.upcomingEvents.map((e) => e.id)).toEqual(['season:s1', 'tournament:t1']);
  });
});
