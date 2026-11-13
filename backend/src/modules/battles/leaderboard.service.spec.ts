import { LeaderboardService } from './leaderboard.service';

const gameData: any = {
  getBalance: () => ({ combats: { weeklyPoints: { win: 3, draw: 1, loss: 0 } } }),
};

function endLog(winner: 0 | 1 | null) {
  return { version: 1, participants: [], events: [{ t: 'end', winner, rounds: 5 }] };
}

describe('LeaderboardService', () => {
  describe('con Redis caído (respaldo en PostgreSQL)', () => {
    const redisDown: any = { key: (n: string) => `k:${n}`, run: jest.fn().mockResolvedValue(null) };
    let prisma: any;
    let svc: LeaderboardService;

    beforeEach(() => {
      prisma = {
        pet: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'p1', elo: 1200 },
            { id: 'p2', elo: 1100 },
            { id: 'p3', elo: 1000 },
          ]),
        },
        battle: {
          findMany: jest.fn().mockResolvedValue([
            { attackerPetId: 'p1', winnerPetId: 'p1', log: endLog(0) }, // victoria: 3
            { attackerPetId: 'p1', winnerPetId: null, log: endLog(null) }, // empate: 1
            { attackerPetId: 'p2', winnerPetId: null, log: endLog(1) }, // derrota: 0
            { attackerPetId: 'p3', winnerPetId: 'p3', log: endLog(0) }, // victoria: 3
            { attackerPetId: 'p3', winnerPetId: 'p3', log: endLog(0) }, // victoria: 3
          ]),
        },
      };
      svc = new LeaderboardService(redisDown, prisma, gameData);
    });

    it('record no lanza aunque Redis falle', async () => {
      await expect(svc.record([{ petId: 'p1', elo: 1000, weeklyPoints: 3 }])).resolves.toBeUndefined();
    });

    it('la clasificación global se calcula por ELO descendente', async () => {
      const rows = await svc.top('global', 10);
      expect(rows).toEqual([
        { petId: 'p1', score: 1200, rank: 1 },
        { petId: 'p2', score: 1100, rank: 2 },
        { petId: 'p3', score: 1000, rank: 3 },
      ]);
    });

    it('la semanal suma 3/1/0 puntos por victoria/empate/derrota y ordena por puntos', async () => {
      const rows = await svc.top('weekly', 10);
      expect(rows).toEqual([
        { petId: 'p3', score: 6, rank: 1 },
        { petId: 'p1', score: 4, rank: 2 },
        { petId: 'p2', score: 0, rank: 3 },
      ]);
    });

    it('limita el tamaño pedido y rankOf usa el respaldo', async () => {
      expect(await svc.top('global', 2)).toHaveLength(2);
      expect(await svc.top('global', 0)).toHaveLength(3); // 0 → tamaño por defecto
      expect(await svc.top('global', -5)).toHaveLength(1); // negativo → mínimo 1
      expect(await svc.rankOf('global', 'p2')).toEqual({ rank: 2, score: 1100 });
      expect(await svc.rankOf('global', 'inexistente')).toBeNull();
    });
  });

  describe('con Redis operativo', () => {
    function fakeRedis(initial: Record<string, [string, number][]> = {}) {
      const sets = new Map<string, Map<string, number>>(Object.entries(initial).map(([k, v]) => [k, new Map(v)]));
      const ops: string[] = [];
      const get = (k: string) => sets.get(k) ?? sets.set(k, new Map()).get(k)!;
      const api: any = {
        zcard: async (k: string) => get(k).size,
        zrevrange: async (k: string, _a: number, b: number) =>
          [...get(k).entries()].sort((x, y) => y[1] - x[1]).slice(0, b + 1).flatMap(([m, s]) => [m, String(s)]),
        zrevrank: async (k: string, m: string) => {
          const sorted = [...get(k).entries()].sort((x, y) => y[1] - x[1]).map((e) => e[0]);
          const i = sorted.indexOf(m);
          return i < 0 ? null : i;
        },
        zscore: async (k: string, m: string) => (get(k).has(m) ? String(get(k).get(m)) : null),
        multi: () => {
          const queue: (() => void)[] = [];
          const pipe: any = {
            zadd: (k: string, s: number, m: string) => (queue.push(() => { get(k).set(m, s); ops.push(`zadd ${k}`); }), pipe),
            zincrby: (k: string, s: number, m: string) => (queue.push(() => { get(k).set(m, (get(k).get(m) ?? 0) + s); ops.push(`zincrby ${k}`); }), pipe),
            expire: (k: string) => (queue.push(() => { ops.push(`expire ${k}`); }), pipe),
            exec: async () => queue.forEach((f) => f()),
          };
          return pipe;
        },
      };
      return { api, sets, ops, service: { key: (n: string) => `k:${n}`, run: async (fn: any) => fn(api) } as any };
    }

    it('record escribe ELO global y puntos semanales (con caducidad) y top los lee ordenados', async () => {
      const f = fakeRedis();
      const svc = new LeaderboardService(f.service, { pet: { findMany: jest.fn().mockResolvedValue([]) }, battle: { findMany: jest.fn().mockResolvedValue([]) } } as any, gameData);
      await svc.record([{ petId: 'a', elo: 1016, weeklyPoints: 3 }, { petId: 'b', elo: 984 }]);
      expect(f.ops.filter((o) => o.startsWith('zadd k:lb:global'))).toHaveLength(2);
      expect(f.ops.filter((o) => o.startsWith('zincrby k:lb:week:'))).toHaveLength(1);
      expect(f.ops.some((o) => o.startsWith('expire k:lb:week:'))).toBe(true);

      expect(await svc.top('global', 10)).toEqual([
        { petId: 'a', score: 1016, rank: 1 },
        { petId: 'b', score: 984, rank: 2 },
      ]);
      expect(await svc.rankOf('global', 'b')).toEqual({ rank: 2, score: 984 });
      expect(await svc.rankOf('global', 'zzz')).toBeNull();
    });

    it('si Redis está vacío se reconstruye una sola vez desde la base de datos', async () => {
      const f = fakeRedis();
      const prisma: any = {
        pet: { findMany: jest.fn().mockResolvedValue([{ id: 'x', elo: 1500 }, { id: 'y', elo: 1400 }]) },
        battle: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const svc = new LeaderboardService(f.service, prisma, gameData);
      expect((await svc.top('global', 10)).map((r) => r.petId)).toEqual(['x', 'y']);
      await svc.top('global', 10);
      expect(prisma.pet.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
