import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminCatalogService } from './admin-catalog.service';

function build(items: any[] = []) {
  const rows = new Map(items.map((i) => [i.id, { ...i }]));
  const prismaMock: any = {
    item: {
      findMany: jest.fn(async (q: any) => (q?.where?.id?.in ? q.where.id.in.map((id: string) => rows.get(id)).filter(Boolean) : [...rows.values()])),
      findUnique: jest.fn(async ({ where }: any) => rows.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        const next = { ...rows.get(where.id), ...data };
        rows.set(where.id, next);
        return next;
      }),
    },
    auditLog: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (fn: any) => fn(prismaMock)),
  };
  const gameData: any = {
    getSpecies: () => [{ id: 'ignisaur', name: 'Ignisaurio', description: 'd', element: 'fire', rarity: 'normal', baseStats: { hp: 50, atk: 55, def: 45, vel: 48, esp: 52 }, favoriteFood: 'spicy_berry', spriteKey: 'ignisaur' }],
  };
  return { service: new AdminCatalogService(prismaMock, gameData), prismaMock, rows };
}

const actor = { id: 'admin-1' };
const apple = { id: 'apple', kind: 'food', name: 'Manzana', description: '', priceCoins: 10, priceGems: 0 };
const potion = { id: 'potion', kind: 'medicine', name: 'Poción', description: '', priceCoins: 25, priceGems: 1 };

describe('AdminCatalogService', () => {
  it('cambia el precio y lo audita con el valor anterior', async () => {
    const { service, prismaMock } = build([apple]);
    const updated = await service.updateItemPrice(actor, 'apple', { priceCoins: 15 });
    expect(updated.priceCoins).toBe(15);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'admin-1',
        event: 'item_price_change',
        metadata: { itemId: 'apple', from: { priceCoins: 10, priceGems: 0 }, to: { priceCoins: 15 } },
      }),
    });
  });

  it('rechaza precios negativos, decimales, campos extra o un cuerpo vacío', async () => {
    const { service } = build([apple]);
    for (const body of [{ priceCoins: -1 }, { priceCoins: 1.5 }, { name: 'x' }, {}]) {
      await expect(service.updateItemPrice(actor, 'apple', body)).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('404 si el objeto no existe', async () => {
    const { service } = build([]);
    await expect(service.updateItemPrice(actor, 'nope', { priceCoins: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ajuste en bloque: redondea, no baja de 0 y solo audita lo que cambia', async () => {
    const { service, prismaMock, rows } = build([apple, potion]);
    const res = await service.bulkAdjustPrices(actor, { ids: ['apple', 'potion'], percent: 10, currency: 'priceCoins' });
    expect(rows.get('apple').priceCoins).toBe(11);
    expect(rows.get('potion').priceCoins).toBe(28); // 27.5 → 28
    expect(res.changed).toBe(2);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);

    prismaMock.auditLog.create.mockClear();
    const none = await service.bulkAdjustPrices(actor, { ids: ['apple'], percent: 1, currency: 'priceGems' });
    expect(none.changed).toBe(0);
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('las especies salen del game-data con las estadísticas aplanadas', () => {
    const { service } = build();
    expect(service.listSpecies()[0]).toMatchObject({ id: 'ignisaur', hp: 50, atk: 55, esp: 52 });
  });
});
