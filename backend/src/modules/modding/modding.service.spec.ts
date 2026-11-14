import { ConflictException } from '@nestjs/common';
import { ModdingService } from './modding.service';

function build() {
  const prismaMock = {
    mod: { findUnique: jest.fn(), update: jest.fn() },
    modReport: { findFirst: jest.fn(), create: jest.fn() },
  };
  const service = new ModdingService(prismaMock as never, {} as never, {} as never);
  return { service, prismaMock };
}

describe('ModdingService.report (S-17)', () => {
  it('rechaza el segundo reporte del mismo usuario y no crea nada', async () => {
    const { service, prismaMock } = build();
    prismaMock.mod.findUnique.mockResolvedValue({ id: 'mod-1', status: 'published' });
    prismaMock.modReport.findFirst.mockResolvedValue({ id: 'r1' }); // ya lo reportó
    await expect(service.report('u1', 'mod-1', 'inapropiado')).rejects.toThrow(ConflictException);
    expect(prismaMock.modReport.create).not.toHaveBeenCalled();
    expect(prismaMock.mod.update).not.toHaveBeenCalled();
  });

  it('acepta el primer reporte (findFirst → null)', async () => {
    const { service, prismaMock } = build();
    prismaMock.mod.findUnique.mockResolvedValue({ id: 'mod-1', status: 'published' });
    prismaMock.modReport.findFirst.mockResolvedValue(null);
    prismaMock.modReport.create.mockResolvedValue({ id: 'r1' });
    prismaMock.mod.update.mockResolvedValue({ id: 'mod-1', reportCount: 1, status: 'published' });
    const res = await service.report('u1', 'mod-1', 'inapropiado');
    expect(res.reportId).toBe('r1');
    expect(prismaMock.modReport.create).toHaveBeenCalledTimes(1);
  });
});

describe('ModdingService.enforceRateLimit (R-05: TTL en el contador de publicación)', () => {
  function build(initialRedis: Record<string, string> = {}) {
    const store = new Map(Object.entries(initialRedis));
    let exTtl: number | null = null;
    let setCalls = 0;
    const redis: any = {
      key: (k: string) => k,
      run: jest.fn((fn: any) =>
        fn({
          get: async (k: string) => (store.has(k) ? store.get(k) : null),
          set: async (k: string, v: string, _opt: string, t: number) => {
            store.set(k, v);
            exTtl = t;
            setCalls += 1;
            return 'OK';
          },
          incr: async (k: string) => {
            const n = Number(store.get(k) ?? 0) + 1;
            store.set(k, String(n));
            return n;
          },
        }),
      ),
    };
    const prisma: any = { mod: { count: jest.fn().mockResolvedValue(0) } };
    const service = new ModdingService(prisma, redis, {} as never);
    return { service, prisma, redis, getExTtl: () => exTtl, getSetCalls: () => setCalls };
  }

  it('siembra el contador desde la BD y fija un TTL (EX) para que caduque', async () => {
    const { service, prisma, getExTtl } = build();
    prisma.mod.count.mockResolvedValue(2); // ya publicó 2 hoy
    await (service as any).enforceRateLimit('u1');
    expect(prisma.mod.count).toHaveBeenCalled();
    expect(getExTtl()).toBeGreaterThan(0); // el contador ahora lleva TTL (R-05)
  });

  it('reutiliza el contador existente sin re-fijar el TTL', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const key = `modding:publish:u1:${today}`;
    const { service, getExTtl, getSetCalls } = build({ [key]: '3' });
    await (service as any).enforceRateLimit('u1');
    expect(getExTtl()).toBeNull(); // no se re-escribe: el contador ya llevaba TTL desde el sembrado
    expect(getSetCalls()).toBe(0);
  });
});