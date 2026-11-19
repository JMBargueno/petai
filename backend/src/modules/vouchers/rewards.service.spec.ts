import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { rewardsSchema } from './rewards.schemas';
import { dominantReward, RewardsService } from './rewards.service';

function build() {
  const proEnd = new Date('2026-12-26T00:00:00.000Z');
  const tx: any = {
    chest: { create: jest.fn(async () => ({ id: `chest-${tx.chest.create.mock.calls.length}` })) },
    inventoryItem: { findMany: jest.fn(async () => [] as any[]) },
    auditLog: { create: jest.fn(async () => ({})) },
    $queryRaw: jest.fn(async () => [{ currentPeriodEnd: proEnd }]),
  };
  const prisma: any = {
    user: { findUnique: jest.fn(async () => ({ id: 'u1' })) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const wallet = { credit: jest.fn(async () => undefined) };
  const inventory = { grantExclusiveItem: jest.fn(async () => ({})) };
  const gameData = { getAccessories: jest.fn(() => [{ id: 'gorro_nieve', name: 'Gorro de nieve' }, { id: 'capa', name: 'Capa' }]) };
  const entitlement = { invalidate: jest.fn(async () => undefined) };
  const realtime = { emitToUser: jest.fn(), emitPetAction: jest.fn() };
  const service = new RewardsService(prisma, wallet as any, inventory as any, gameData as any, entitlement as any, realtime as any);
  return { service, prisma, tx, wallet, inventory, entitlement, realtime, proEnd };
}

const superadmin = { id: 'admin-1', role: 'superadmin' };
const admin = { id: 'admin-2', role: 'admin' };

describe('rewardsSchema', () => {
  it('exige al menos una recompensa', () => {
    expect(rewardsSchema.safeParse({}).success).toBe(false);
    expect(rewardsSchema.safeParse({ coins: 0, chests: [] }).success).toBe(false);
    expect(rewardsSchema.safeParse({ coins: 1 }).success).toBe(true);
  });

  it('aplica topes y une cofres repetidos', () => {
    expect(rewardsSchema.safeParse({ proDays: 366 }).success).toBe(false);
    expect(rewardsSchema.safeParse({ coins: -1 }).success).toBe(false);
    const r = rewardsSchema.parse({ chests: [{ type: 'gold', qty: 2 }, { type: 'bronze', qty: 1 }, { type: 'gold', qty: 3 }], accessories: ['a', 'a'] });
    expect(r.chests).toEqual([{ type: 'bronze', qty: 1 }, { type: 'gold', qty: 5 }]);
    expect(r.accessories).toEqual(['a']);
  });
});

describe('RewardsService', () => {
  it('apply acredita monedas, gemas, Pro, cofres y prendas en la transacción', async () => {
    const { service, tx, wallet, inventory, proEnd } = build();
    tx.inventoryItem.findMany.mockResolvedValue([{ itemId: 'capa' }]);
    const rewards = rewardsSchema.parse({ coins: 500, gems: 10, proDays: 7, chests: [{ type: 'gold', qty: 2 }], accessories: ['gorro_nieve', 'capa'] });

    const res = await service.apply(tx, 'u1', rewards, 'voucher');

    expect(wallet.credit).toHaveBeenCalledWith(tx, 'u1', 'coins', 500);
    expect(wallet.credit).toHaveBeenCalledWith(tx, 'u1', 'gems', 10);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.chest.create).toHaveBeenCalledTimes(2);
    expect(tx.chest.create).toHaveBeenCalledWith({ data: { userId: 'u1', type: 'gold', source: 'voucher' }, select: { id: true } });
    expect(inventory.grantExclusiveItem).toHaveBeenCalledTimes(1);
    expect(inventory.grantExclusiveItem).toHaveBeenCalledWith('u1', 'gorro_nieve', tx);
    expect(res.granted).toEqual({
      coins: 500,
      gems: 10,
      proDays: 7,
      proUntil: proEnd.toISOString(),
      chests: [{ type: 'gold', qty: 2 }],
      accessories: [
        { id: 'gorro_nieve', name: 'Gorro de nieve', alreadyOwned: false },
        { id: 'capa', name: 'Capa', alreadyOwned: true },
      ],
      items: [],
    });
    expect(res.chests).toHaveLength(2);
  });

  it('apply no toca lo que no viene en el paquete', async () => {
    const { service, tx, wallet } = build();
    await service.apply(tx, 'u1', rewardsSchema.parse({ gems: 3 }), 'admin_grant');
    expect(wallet.credit).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.chest.create).not.toHaveBeenCalled();
  });

  it('assertCanGrant: los días Pro exigen billing:manage', () => {
    const { service } = build();
    const pro = rewardsSchema.parse({ proDays: 7 });
    expect(() => service.assertCanGrant(admin, pro)).toThrow(ForbiddenException);
    expect(() => service.assertCanGrant(superadmin, pro)).not.toThrow();
    expect(() => service.assertCanGrant(admin, rewardsSchema.parse({ coins: 5 }))).not.toThrow();
  });

  it('assertAccessories rechaza prendas desconocidas', () => {
    const { service } = build();
    expect(() => service.assertAccessories(['capa'])).not.toThrow();
    expect(() => service.assertAccessories(['inventada'])).toThrow(BadRequestException);
  });

  it('announce emite cofres, plan, reward:received y la reacción de la mascota', async () => {
    const { service, realtime, entitlement } = build();
    const event = { source: 'voucher' as const, redemptionId: 'r1', granted: { coins: 0, gems: 0, proDays: 3, proUntil: 'x', chests: [], accessories: [] } };
    await service.announce('u1', event, [{ id: 'c1', type: 'gold' }]);
    expect(realtime.emitToUser).toHaveBeenCalledWith('u1', 'chest:unlocked', { chestId: 'c1', type: 'gold', source: 'voucher' });
    expect(entitlement.invalidate).toHaveBeenCalledWith('u1');
    expect(realtime.emitToUser).toHaveBeenCalledWith('u1', 'entitlement:updated', { plan: 'pro' });
    expect(realtime.emitToUser).toHaveBeenCalledWith('u1', 'reward:received', event);
    expect(realtime.emitPetAction).toHaveBeenCalledWith('u1', null, 'gift_received', { source: 'voucher', reward: 'pro' });
  });

  it('announce pasa a la mascota el cofre de mejor tipo para colorear el sello del Éter', async () => {
    const { service, realtime } = build();
    const granted = { coins: 50, gems: 5, proDays: 0, proUntil: null, chests: [{ type: 'silver' as const, qty: 2 }, { type: 'diamond' as const, qty: 1 }, { type: 'gold' as const, qty: 1 }], accessories: [] };
    await service.announce('u1', { source: 'admin_grant', redemptionId: 'r2', granted }, []);
    expect(realtime.emitPetAction).toHaveBeenCalledWith('u1', null, 'gift_received', { source: 'admin_grant', reward: 'chest', tier: 'diamond' });
  });
  it('grantToUser acredita, audita y avisa al usuario', async () => {
    const { service, tx, realtime } = build();
    const res = await service.grantToUser(admin, 'u1', { rewards: { coins: 100 }, note: 'Perdón por la caída' });
    expect(res).toMatchObject({ source: 'admin_grant', note: 'Perdón por la caída', granted: { coins: 100 } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'admin-2', event: 'user_grant', metadata: expect.objectContaining({ targetUserId: 'u1' }) }),
    });
    expect(realtime.emitToUser).toHaveBeenCalledWith('u1', 'reward:received', res);
  });

  it('grantToUser: 404 si el usuario no existe y 403 con Pro sin permiso', async () => {
    const { service, prisma } = build();
    await expect(service.grantToUser(admin, 'u1', { rewards: { proDays: 1 } })).rejects.toBeInstanceOf(ForbiddenException);
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.grantToUser(admin, 'nadie', { rewards: { coins: 1 } })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('dominantReward', () => {
  const base = { coins: 0, gems: 0, proDays: 0, proUntil: null, chests: [], accessories: [] };
  const hat = (alreadyOwned: boolean) => [{ id: 'gorro', name: 'Gorro', alreadyOwned }];

  it('elige Pro > cofre > prenda nueva > gemas > monedas', () => {
    expect(dominantReward({ ...base, coins: 9, gems: 9, proDays: 3, chests: [{ type: 'mythic', qty: 1 }], accessories: hat(false) })).toEqual({ reward: 'pro' });
    expect(dominantReward({ ...base, coins: 9, gems: 9, chests: [{ type: 'bronze', qty: 1 }], accessories: hat(false) })).toEqual({ reward: 'chest', tier: 'bronze' });
    expect(dominantReward({ ...base, coins: 9, gems: 9, accessories: hat(false) })).toEqual({ reward: 'accessory' });
    expect(dominantReward({ ...base, coins: 9, gems: 9 })).toEqual({ reward: 'gems' });
    expect(dominantReward({ ...base, coins: 9 })).toEqual({ reward: 'coins' });
  });

  it('una prenda que ya tenía solo manda si no llega nada más', () => {
    expect(dominantReward({ ...base, coins: 9, accessories: hat(true) })).toEqual({ reward: 'coins' });
    expect(dominantReward({ ...base, accessories: hat(true) })).toEqual({ reward: 'accessory' });
  });
});

describe('Consumibles en recompensas (spec 41)', () => {
  it('el esquema acepta objetos, une líneas repetidas y aplica topes', () => {
    const r = rewardsSchema.parse({ items: [{ id: 'ether_threader', qty: 2 }, { id: 'ether_threader', qty: 3 }] });
    expect(r.items).toEqual([{ id: 'ether_threader', qty: 5 }]);
    expect(rewardsSchema.safeParse({ items: [{ id: 'apple', qty: 100 }] }).success).toBe(false);
    expect(rewardsSchema.safeParse({ items: [{ id: 'apple', qty: 0 }] }).success).toBe(false);
  });

  it('apply suma los objetos al inventario, también los ocultos', async () => {
    const { service, tx } = build();
    tx.item = { findMany: jest.fn(async () => [{ id: 'origin_nectar', name: 'Néctar del Origen' }]) };
    tx.inventoryItem.upsert = jest.fn(async () => ({}));
    const res = await service.apply(tx, 'u1', rewardsSchema.parse({ items: [{ id: 'origin_nectar', qty: 2 }] }), 'admin_grant');
    expect(tx.inventoryItem.upsert).toHaveBeenCalledWith({
      where: { userId_itemId: { userId: 'u1', itemId: 'origin_nectar' } },
      update: { qty: { increment: 2 } },
      create: { userId: 'u1', itemId: 'origin_nectar', qty: 2 },
    });
    expect(res.granted.items).toEqual([{ id: 'origin_nectar', name: 'Néctar del Origen', qty: 2 }]);
    expect(dominantReward(res.granted).reward).toBe('accessory');
  });

  it('apply rechaza un objeto que no está cargado en la base de datos', async () => {
    const { service, tx } = build();
    tx.item = { findMany: jest.fn(async () => []) };
    await expect(service.apply(tx, 'u1', rewardsSchema.parse({ items: [{ id: 'nope', qty: 1 }] }), 'admin_grant')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('assertItems valida contra foods.json sin mirar la disponibilidad', () => {
    const { service } = build();
    (service as any).gameData.getFoods = () => [{ id: 'origin_nectar', availability: 'hidden' }, { id: 'apple' }];
    expect(() => service.assertItems([{ id: 'origin_nectar' }, { id: 'apple' }])).not.toThrow();
    expect(() => service.assertItems([{ id: 'zzz' }])).toThrow(BadRequestException);
  });
});
