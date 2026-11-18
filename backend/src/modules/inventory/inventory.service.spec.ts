import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

/** Prisma simulado: catálogo, un usuario con saldo e inventario en memoria. */
function build(items: any[], wallet = { coins: 1000, gems: 50 }, inventory: Record<string, number> = {}) {
  const catalog = new Map(items.map((i) => [i.id, i]));
  const inv = new Map(Object.entries(inventory));
  const user = { ...wallet };
  const row = (itemId: string) => (inv.has(itemId) ? { userId: 'u1', itemId, qty: inv.get(itemId), item: catalog.get(itemId) } : null);
  const prismaMock: any = {
    item: {
      findUnique: jest.fn(async ({ where }: any) => catalog.get(where.id) ?? null),
      upsert: jest.fn(async ({ where, create }: any) => {
        if (!catalog.has(where.id)) catalog.set(where.id, create);
        return catalog.get(where.id);
      }),
    },
    user: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (user.coins < where.coins.gte || user.gems < where.gems.gte) return { count: 0 };
        user.coins -= data.coins.decrement;
        user.gems -= data.gems.decrement;
        return { count: 1 };
      }),
    },
    userStat: { upsert: jest.fn(async () => ({})) },
    inventoryItem: {
      findUnique: jest.fn(async ({ where }: any) => row(where.userId_itemId.itemId)),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => row(where.userId_itemId.itemId)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (inv.get(where.itemId) !== where.qty) return { count: 0 };
        inv.set(where.itemId, data.qty);
        return { count: 1 };
      }),
      create: jest.fn(async ({ data }: any) => {
        if (inv.has(data.itemId)) throw new Error('clave única (userId, itemId)');
        inv.set(data.itemId, data.qty);
        return row(data.itemId);
      }),
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const id = where.userId_itemId.itemId;
        inv.set(id, inv.has(id) ? inv.get(id)! + update.qty.increment : create.qty);
        return row(id);
      }),
    },
    $transaction: jest.fn(async (fn: any) => fn(prismaMock)),
  };
  const gameData: any = { getAccessories: () => [{ id: 'ach_item_care_crown', name: 'Corona del guardián', description: 'd', slot: 'head', rarity: 'legendary', color: 'sunburst', unlock: { type: 'achievement' } }] };
  return { service: new InventoryService(prismaMock, gameData), prismaMock, user, inv, catalog };
}

const apple = { id: 'apple', kind: 'food', effects: {}, priceCoins: 10, priceGems: 0 };
const gorro = { id: 'acc_gorro_lana_azul', kind: 'accessory', effects: { slot: 'head', unlock: 'coins' }, priceCoins: 250, priceGems: 0 };
const capa = { id: 'acc_capa_gala', kind: 'accessory', effects: { slot: 'back', unlock: 'gems' }, priceCoins: 0, priceGems: 12 };
const corona = { id: 'ach_item_care_crown', kind: 'accessory', effects: { slot: 'head', unlock: 'achievement' }, priceCoins: 0, priceGems: 0 };
const medalla = { id: 'ach_item_care_medal', kind: 'cosmetic', effects: {}, priceCoins: 0, priceGems: 0 };

describe('InventoryService.buyItem', () => {
  it('la comida se sigue comprando por unidades', async () => {
    const { service, user, inv } = build([apple]);
    await service.buyItem('u1', 'apple', 3);
    expect(user.coins).toBe(970);
    expect(inv.get('apple')).toBe(3);
  });

  it('compra una prenda con monedas y otra con gemas', async () => {
    const { service, user, inv } = build([gorro, capa]);
    await service.buyItem('u1', 'acc_gorro_lana_azul');
    await service.buyItem('u1', 'acc_capa_gala');
    expect(user).toEqual({ coins: 750, gems: 38 });
    expect(inv.get('acc_gorro_lana_azul')).toBe(1);
    expect(inv.get('acc_capa_gala')).toBe(1);
  });

  it('no deja comprar una prenda que ya se tiene, ni cobra', async () => {
    const { service, user } = build([gorro], undefined, { acc_gorro_lana_azul: 1 });
    await expect(service.buyItem('u1', 'acc_gorro_lana_azul')).rejects.toBeInstanceOf(BadRequestException);
    expect(user.coins).toBe(1000);
  });

  it('no deja comprar varias unidades de una prenda', async () => {
    const { service, user } = build([gorro]);
    await expect(service.buyItem('u1', 'acc_gorro_lana_azul', 2)).rejects.toBeInstanceOf(BadRequestException);
    expect(user.coins).toBe(1000);
  });

  it('una prenda regalada (fila a 0) se puede volver a comprar', async () => {
    const { service, inv } = build([gorro], undefined, { acc_gorro_lana_azul: 0 });
    await service.buyItem('u1', 'acc_gorro_lana_azul');
    expect(inv.get('acc_gorro_lana_azul')).toBe(1);
  });

  it('las prendas y cosméticos de logro no se venden, aunque su precio sea 0', async () => {
    const { service, inv } = build([corona, medalla]);
    for (const id of ['ach_item_care_crown', 'ach_item_care_medal']) {
      await expect(service.buyItem('u1', id)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(inv.size).toBe(0);
  });

  it('un objeto sin precio no está a la venta: no se regala', async () => {
    const gratis = { id: 'free_snack', kind: 'food', effects: { hunger: 10 }, priceCoins: 0, priceGems: 0 };
    const { service, inv, user } = build([gratis]);
    await expect(service.buyItem('u1', 'free_snack', 99)).rejects.toBeInstanceOf(BadRequestException);
    expect(inv.size).toBe(0);
    expect(user).toEqual({ coins: 1000, gems: 50 });
  });

  it('sin saldo no hay prenda', async () => {
    const { service, inv } = build([capa], { coins: 0, gems: 5 });
    await expect(service.buyItem('u1', 'acc_capa_gala')).rejects.toBeInstanceOf(BadRequestException);
    expect(inv.size).toBe(0);
  });
});

describe('InventoryService.grantExclusiveItem', () => {
  it('crea el premio como prenda si está en el catálogo de accesorios, y como cosmético si no', async () => {
    const { service, catalog, inv } = build([]);
    await service.grantExclusiveItem('u1', 'ach_item_care_crown');
    await service.grantExclusiveItem('u1', 'ach_item_care_medal');
    expect(catalog.get('ach_item_care_crown')).toMatchObject({ kind: 'accessory', name: 'Corona del guardián', effects: { slot: 'head', unlock: 'achievement' } });
    expect(catalog.get('ach_item_care_medal')).toMatchObject({ kind: 'cosmetic' });
    expect(inv.get('ach_item_care_crown')).toBe(1);
  });
});
