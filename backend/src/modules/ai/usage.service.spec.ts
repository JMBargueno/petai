import { UsageService } from './usage.service';

const cfg = (values: Record<string, unknown> = {}) => ({ get: (k: string) => values[k] }) as any;

describe('UsageService', () => {
  const prismaWith = (tokens?: number) =>
    ({
      aiUsage: {
        findUnique: jest.fn().mockResolvedValue(tokens === undefined ? null : { tokens, requests: 3 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    }) as any;

  it('la clave de mes es YYYY-MM en UTC', () => {
    expect(UsageService.monthKey(new Date('2026-11-30T23:59:59Z'))).toBe('2026-11');
    expect(UsageService.monthKey(new Date('2026-12-01T00:00:00Z'))).toBe('2026-12');
  });

  describe('cuotas', () => {
    it('por defecto BYOK es ilimitado y el modo gestionado tiene 500k', () => {
      const s = new UsageService(prismaWith(), cfg());
      expect(s.quotaFor('byok')).toBe(0);
      expect(s.quotaFor('managed')).toBe(500_000);
    });

    it('respeta la configuración y trata valores inválidos como ilimitado', () => {
      const s = new UsageService(prismaWith(), cfg({ AI_MONTHLY_TOKEN_QUOTA_BYOK: 1000, AI_MONTHLY_TOKEN_QUOTA_MANAGED: -5 }));
      expect(s.quotaFor('byok')).toBe(1000);
      expect(s.quotaFor('managed')).toBe(0);
      expect(new UsageService(prismaWith(), cfg({ AI_MONTHLY_TOKEN_QUOTA_BYOK: 'abc' })).quotaFor('byok')).toBe(0);
    });

    it('permite mientras haya cuota y lanza 429 al agotarla', async () => {
      const under = new UsageService(prismaWith(999), cfg({ AI_MONTHLY_TOKEN_QUOTA_BYOK: 1000 }));
      await expect(under.assertWithinQuota('u', 'byok')).resolves.toBeUndefined();

      const over = new UsageService(prismaWith(1000), cfg({ AI_MONTHLY_TOKEN_QUOTA_BYOK: 1000 }));
      await expect(over.assertWithinQuota('u', 'byok')).rejects.toMatchObject({ status: 429 });
      expect(await over.hasQuota('u', 'byok')).toBe(false);
    });

    it('sin cuota no consulta la base de datos', async () => {
      const prisma = prismaWith(10 ** 9);
      const s = new UsageService(prisma, cfg());
      expect(await s.hasQuota('u', 'byok')).toBe(true);
      expect(prisma.aiUsage.findUnique).not.toHaveBeenCalled();
    });
  });

  it('record incrementa tokens y peticiones del mes (upsert) y no admite negativos', async () => {
    const prisma = prismaWith();
    const s = new UsageService(prisma, cfg());
    await s.record('u1', 120.9);
    const args = prisma.aiUsage.upsert.mock.calls[0][0];
    expect(args.where.userId_month.userId).toBe('u1');
    expect(args.create).toMatchObject({ tokens: 120, requests: 1 });
    expect(args.update).toEqual({ tokens: { increment: 120 }, requests: { increment: 1 } });

    await s.record('u1', -50);
    expect(prisma.aiUsage.upsert.mock.calls[1][0].update.tokens.increment).toBe(0);
  });

  it('summary devuelve uso, cuota y restante (o nulos si es ilimitado)', async () => {
    const limited = await new UsageService(prismaWith(300), cfg({ AI_MONTHLY_TOKEN_QUOTA_BYOK: 1000 })).summary('u', 'byok');
    expect(limited).toMatchObject({ tokens: 300, requests: 3, quota: 1000, remaining: 700, mode: 'byok' });
    const unlimited = await new UsageService(prismaWith(300), cfg()).summary('u', 'byok');
    expect(unlimited).toMatchObject({ quota: null, remaining: null });
  });
});
