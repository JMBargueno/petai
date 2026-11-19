import { ActivityDropsService } from './activity-drops.service';

/** Prisma en memoria: catálogo, inventario y contador diario de drops. */
function build(opts: { dailyCap?: number; availability?: string; chance?: number } = {}) {
  const inv = new Map<string, number>();
  const daily = new Map<string, number>();
  const prisma: any = {
    item: { findUnique: jest.fn(async ({ where }: any) => (where.id === 'ether_threader' ? { id: 'ether_threader', name: 'Enhebrador' } : null)) },
    inventoryItem: {
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const id = where.userId_itemId.itemId;
        inv.set(id, inv.has(id) ? inv.get(id)! + update.qty.increment : create.qty);
      }),
    },
    dailyItemDrop: {
      upsert: jest.fn(async ({ where }: any) => {
        const k = `${where.userId_itemId_day.itemId}|${where.userId_itemId_day.day}`;
        if (!daily.has(k)) daily.set(k, 0);
      }),
      updateMany: jest.fn(async ({ where }: any) => {
        const k = `${where.itemId}|${where.day}`;
        if ((daily.get(k) ?? 0) >= where.count.lt) return { count: 0 };
        daily.set(k, (daily.get(k) ?? 0) + 1);
        return { count: 1 };
      }),
    },
  };
  const gameData: any = {
    getFoods: () => [{ id: 'ether_threader', availability: opts.availability ?? 'drop' }],
    getBalance: () => ({
      activityDrops: {
        dailyCaps: opts.dailyCap === undefined ? {} : { ether_threader: opts.dailyCap },
        sources: { training: [{ itemId: 'ether_threader', chance: opts.chance ?? 0.03 }] },
      },
    }),
  };
  return { service: new ActivityDropsService(prisma, gameData), inv, prisma };
}

describe('ActivityDropsService', () => {
  it('suelta el objeto cuando la tirada entra en la probabilidad', async () => {
    const { service, inv } = build();
    expect(await service.roll('u1', 'training', () => 0.01)).toEqual({ itemId: 'ether_threader', name: 'Enhebrador', qty: 1 });
    expect(inv.get('ether_threader')).toBe(1);
  });

  it('no suelta nada si la tirada falla o la fuente no existe', async () => {
    const { service, inv } = build();
    expect(await service.roll('u1', 'training', () => 0.5)).toBeNull();
    expect(await service.roll('u1', 'battleWin', () => 0)).toBeNull();
    expect(inv.size).toBe(0);
  });

  it('respeta el tope diario', async () => {
    const { service, inv } = build({ dailyCap: 1 });
    expect(await service.roll('u1', 'training', () => 0)).not.toBeNull();
    expect(await service.roll('u1', 'training', () => 0)).toBeNull();
    expect(inv.get('ether_threader')).toBe(1);
  });

  it('nunca suelta un objeto oculto', async () => {
    const { service, inv } = build({ availability: 'hidden' });
    expect(await service.roll('u1', 'training', () => 0)).toBeNull();
    expect(inv.size).toBe(0);
  });

  it('un fallo de base de datos no tumba la actividad', async () => {
    const { service, prisma } = build();
    prisma.item.findUnique.mockRejectedValueOnce(new Error('db caída'));
    await expect(service.roll('u1', 'training', () => 0)).resolves.toBeNull();
  });
});
