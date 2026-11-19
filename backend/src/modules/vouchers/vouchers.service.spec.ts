import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { INVALID_VOUCHER_MESSAGE, VouchersService, voucherStatus } from './vouchers.service';

function build() {
  const prisma: any = {
    voucher: {
      fields: { maxUses: { name: 'maxUses', modelName: 'Voucher' } },
      findUnique: jest.fn(async () => ({ id: 'v1', rewards: { coins: 50 }, revokedAt: null }) as any),
      findUniqueOrThrow: jest.fn(async () => ({ id: 'v1', code: 'X', revokedAt: new Date(), usedCount: 0, maxUses: 1, expiresAt: null })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      create: jest.fn(async ({ data }: any) => ({ id: `v-${data.code}`, ...data, usedCount: 0, revokedAt: null, createdAt: new Date(), createdBy: null })),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    voucherRedemption: { create: jest.fn(async () => ({ id: 'red-1' })) },
    auditLog: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };
  const granted = { coins: 50, gems: 0, proDays: 0, proUntil: null, chests: [], accessories: [] };
  const rewards: any = {
    assertCanGrant: jest.fn((actor: any, r: any) => {
      if (r.proDays > 0 && actor.role !== 'superadmin') throw new ForbiddenException();
    }),
    assertAccessories: jest.fn(),
    apply: jest.fn(async () => ({ granted, chests: [] })),
    announce: jest.fn(async () => undefined),
  };
  return { service: new VouchersService(prisma, rewards), prisma, rewards, granted };
}

const admin = { id: 'admin-1', role: 'admin' };

describe('voucherStatus', () => {
  it('revocado > agotado > caducado > activo', () => {
    const past = new Date(Date.now() - 1000);
    const base = { revokedAt: null, usedCount: 0, maxUses: 2, expiresAt: null };
    expect(voucherStatus(base)).toBe('active');
    expect(voucherStatus({ ...base, expiresAt: past })).toBe('expired');
    expect(voucherStatus({ ...base, usedCount: 2 })).toBe('used');
    expect(voucherStatus({ ...base, revokedAt: past })).toBe('revoked');
  });
});

describe('VouchersService.create', () => {
  it('crea un lote de códigos aleatorios y lo audita', async () => {
    const { service, prisma } = build();
    const res = await service.create(admin, { count: 3, rewards: { coins: 100 } });
    expect(res.items).toHaveLength(3);
    for (const v of res.items) expect(v.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ event: 'voucher_create' }) });
  });

  it('crea un código personalizado normalizado', async () => {
    const { service, prisma } = build();
    const res = await service.create(admin, { code: ' navidad2026 ', maxUses: 500, rewards: { gems: 5 } });
    expect(res.items[0].code).toBe('NAVIDAD2026');
    expect(prisma.voucher.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: 'NAVIDAD2026', maxUses: 500 }) }));
  });

  it('409 si el código personalizado ya existe', async () => {
    const { service, prisma } = build();
    prisma.voucher.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.create(admin, { code: 'REPE', rewards: { coins: 1 } })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza códigos mal formados y paquetes vacíos', async () => {
    const { service } = build();
    await expect(service.create(admin, { code: 'a!', rewards: { coins: 1 } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(admin, { rewards: {} })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(admin, { code: 'ABCD', count: 2, rewards: { coins: 1 } })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('403 si un admin sin billing:manage mete días Pro', async () => {
    const { service } = build();
    await expect(service.create(admin, { rewards: { proDays: 7 } })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('VouchersService.redeem', () => {
  it('reclama un uso, registra el canje, acredita y avisa', async () => {
    const { service, prisma, rewards, granted } = build();
    const res = await service.redeem('u1', { code: ' abcd-ef23 ' });
    expect(prisma.voucher.findUnique).toHaveBeenCalledWith({ where: { code: 'ABCD-EF23' }, select: { id: true, rewards: true } });
    expect(prisma.voucher.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { usedCount: { increment: 1 } } }));
    expect(prisma.voucherRedemption.create).toHaveBeenCalledWith({ data: { voucherId: 'v1', userId: 'u1' }, select: { id: true } });
    expect(rewards.apply).toHaveBeenCalledWith(prisma, 'u1', expect.objectContaining({ coins: 50 }), 'voucher');
    expect(res).toEqual({ source: 'voucher', redemptionId: 'red-1', code: 'ABCD-EF23', granted });
    expect(rewards.announce).toHaveBeenCalledWith('u1', res, []);
  });

  it('mismo error genérico si no existe o no se puede reclamar (agotado, caducado, revocado)', async () => {
    const { service, prisma, rewards } = build();
    prisma.voucher.findUnique.mockResolvedValueOnce(null);
    await expect(service.redeem('u1', { code: 'NOPE' })).rejects.toThrow(INVALID_VOUCHER_MESSAGE);
    prisma.voucher.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.redeem('u1', { code: 'GASTADO' })).rejects.toThrow(INVALID_VOUCHER_MESSAGE);
    expect(rewards.apply).not.toHaveBeenCalled();
    expect(rewards.announce).not.toHaveBeenCalled();
  });

  it('409 si la cuenta ya lo había canjeado', async () => {
    const { service, prisma, rewards } = build();
    prisma.voucherRedemption.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.redeem('u1', { code: 'ABCD' })).rejects.toBeInstanceOf(ConflictException);
    expect(rewards.announce).not.toHaveBeenCalled();
  });
});

describe('VouchersService.revoke', () => {
  it('revoca y audita una sola vez', async () => {
    const { service, prisma } = build();
    const res = await service.revoke(admin, 'v1');
    expect(prisma.voucher.updateMany).toHaveBeenCalledWith({ where: { id: 'v1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(res.status).toBe('revoked');
  });
});
