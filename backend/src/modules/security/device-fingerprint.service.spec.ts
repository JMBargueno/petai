import { DeviceFingerprintService } from './device-fingerprint.service';

describe('DeviceFingerprintService (R-04.5 / R-05)', () => {
  function build(redis: any) {
    const prisma: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ count: 4 }]),
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new DeviceFingerprintService(prisma, redis);
    return { service, prisma };
  }

  it('sin Redis usa COUNT DISTINCT (no findMany) para contar cuentas', async () => {
    const { service, prisma } = build({ key: (k: string) => k, run: jest.fn().mockResolvedValue(null) });
    prisma.auditLog.findFirst.mockResolvedValue(null); // el usuario actual aún no figura
    const res = await service.verify('u1', { userAgent: 'ua' }, '1.2.3.4');
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled(); // no carga todas las filas
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(res.accountCount).toBe(5); // 4 distinct + 1 usuario actual
    expect(res.score).toBe(80); // (5-1)*20
    expect(res.flagged).toBe(true);
  });

  it('incluye al usuario actual solo si aún no figura en el COUNT DISTINCT', async () => {
    const { service, prisma } = build({ key: (k: string) => k, run: jest.fn().mockResolvedValue(null) });
    prisma.auditLog.findFirst.mockResolvedValue({ userId: 'u1' }); // ya figura
    const res = await service.verify('u1', { userAgent: 'ua' });
    expect(res.accountCount).toBe(4); // 4 distinct, u1 ya contado (sin doble conteo)
  });

  it('R-05: fija un TTL (PEXPIRE) al Set de cuentas por fingerprint en Redis', async () => {
    const pexpire = jest.fn().mockResolvedValue(1);
    const sadd = jest.fn().mockResolvedValue(1);
    const scard = jest.fn().mockResolvedValue(3);
    const redis = { key: (k: string) => k, run: jest.fn((fn: any) => fn({ pexpire, sadd, scard })) };
    const { service, prisma } = build(redis);
    const res = await service.verify('u1', { userAgent: 'ua' });
    expect(pexpire).toHaveBeenCalledTimes(1);
    expect(res.accountCount).toBe(3); // desde Redis (scard), sin fallback a la BD
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
