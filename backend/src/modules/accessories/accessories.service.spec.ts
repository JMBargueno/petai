import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccessoriesService } from './accessories.service';
import { AccessoryDef, resolveEquip, sanitizeEquipped } from './accessories.engine';
import { equipAccessoriesSchema } from './accessories.schemas';

const read = (file: string) =>
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data', file), 'utf8'));
const defs: AccessoryDef[] = read('accessories.json').accessories;
const achievements = read('achievements.json');
const catalog = new Map(defs.map((d) => [d.id, d]));

const GORRO = 'acc_gorro_lana_azul'; // head, monedas
const FIESTA = 'acc_gorro_fiesta'; // head, gemas
const CAPA = 'acc_capa_gala'; // back, gemas
const CORONA = 'ach_item_care_crown'; // head, logro

/** Prisma en memoria con lo justo que usa AccessoriesService. */
function build(owned: string[] = [], equipped: unknown = {}) {
  const pet = { id: 'p1', userId: 'u1', accessories: equipped };
  const prisma: any = {
    item: {
      // El panel de admin subió el precio del gorro: manda el del Item, no el del JSON.
      findMany: jest.fn(async () => [{ id: GORRO, priceCoins: 275, priceGems: 0 }]),
    },
    inventoryItem: {
      findMany: jest.fn(async ({ where }: any) =>
        owned.filter((id) => where.itemId.in.includes(id)).map((itemId) => ({ itemId })),
      ),
    },
    pet: {
      findFirst: jest.fn(async ({ where }: any) => (where.id === pet.id && where.userId === pet.userId ? pet : null)),
      update: jest.fn(async ({ data }: any) => Object.assign(pet, data)),
    },
  };
  const gameData: any = { getAccessories: () => defs, getAchievements: () => achievements };
  const inventory: any = { buyItem: jest.fn(async () => ({})) };
  return { service: new AccessoriesService(prisma, gameData, inventory), prisma, inventory, pet };
}

describe('accessories.engine', () => {
  it('equipa, sustituye y quita por ranura sin tocar las demás', () => {
    const owned = new Set([GORRO, FIESTA, CAPA]);
    const a = resolveEquip({}, { head: GORRO, back: CAPA }, catalog, owned);
    expect(a).toEqual({ ok: true, next: { head: GORRO, back: CAPA } });
    const b = resolveEquip({ head: GORRO, back: CAPA }, { head: FIESTA }, catalog, owned);
    expect(b).toEqual({ ok: true, next: { head: FIESTA, back: CAPA } });
    const c = resolveEquip({ head: FIESTA, back: CAPA }, { back: null }, catalog, owned);
    expect(c).toEqual({ ok: true, next: { head: FIESTA } });
  });

  it('rechaza una prenda inexistente, de otra ranura o ajena, y no aplica nada', () => {
    const owned = new Set([GORRO]);
    expect(resolveEquip({}, { head: 'no_existe' }, catalog, owned).ok).toBe(false);
    expect(resolveEquip({}, { neck: GORRO }, catalog, owned).ok).toBe(false);
    expect(resolveEquip({}, { head: GORRO, back: CAPA }, catalog, owned).ok).toBe(false);
  });

  it('limpia lo guardado: ranuras desconocidas, ids retirados y prendas en ranura ajena', () => {
    expect(sanitizeEquipped({ head: GORRO, back: 'retirada', neck: CAPA, mano: 'x' }, catalog)).toEqual({ head: GORRO });
    expect(sanitizeEquipped(null, catalog)).toEqual({});
    expect(sanitizeEquipped([GORRO], catalog)).toEqual({});
  });
});

describe('equipAccessoriesSchema', () => {
  it('exige al menos una ranura y no admite ranuras desconocidas', () => {
    expect(equipAccessoriesSchema.safeParse({}).success).toBe(false);
    expect(equipAccessoriesSchema.safeParse({ mano: 'x' }).success).toBe(false);
    expect(equipAccessoriesSchema.safeParse({ head: null }).success).toBe(true);
    expect(equipAccessoriesSchema.safeParse({ head: GORRO, back: CAPA }).success).toBe(true);
  });
});

describe('AccessoriesService', () => {
  it('lista el catálogo con estado, precio vigente y nombre del logro', async () => {
    const { service } = build([CAPA]);
    const res = await service.list('u1');
    expect(res.slots).toEqual(['head', 'face', 'neck', 'back']);
    const by = new Map(res.accessories.map((a) => [a.id, a]));
    expect(by.get(CAPA).state).toBe('owned');
    expect(by.get(GORRO)).toMatchObject({ state: 'available', unlock: { type: 'coins', price: 275 } });
    expect(by.get(FIESTA).unlock).toEqual({ type: 'gems', price: 8 });
    expect(by.get(CORONA)).toMatchObject({
      state: 'locked',
      unlock: { type: 'achievement', achievementId: 'care_level_50', achievementName: 'Guardián legendario' },
    });
  });

  it('compra una prenda de tienda con una sola unidad', async () => {
    const { service, inventory } = build();
    await expect(service.buy('u1', GORRO)).resolves.toEqual({ id: GORRO, slot: 'head', state: 'owned' });
    expect(inventory.buyItem).toHaveBeenCalledWith('u1', GORRO, 1);
  });

  it('no vende prendas de logro ni ids fuera del catálogo', async () => {
    const { service, inventory } = build();
    await expect(service.buy('u1', CORONA)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.buy('u1', 'apple')).rejects.toBeInstanceOf(NotFoundException);
    expect(inventory.buyItem).not.toHaveBeenCalled();
  });

  it('equipa prendas propias y guarda el resultado en la mascota', async () => {
    const { service, pet } = build([GORRO, CAPA]);
    const res = await service.equip('u1', 'p1', { head: GORRO, back: CAPA });
    expect(res).toEqual({ petId: 'p1', accessories: { head: GORRO, back: CAPA } });
    expect(pet.accessories).toEqual({ head: GORRO, back: CAPA });
  });

  it('quita una prenda con null y conserva el resto', async () => {
    const { service } = build([GORRO, CAPA], { head: GORRO, back: CAPA });
    const res = await service.equip('u1', 'p1', { head: null });
    expect(res.accessories).toEqual({ back: CAPA });
  });

  it('no equipa una prenda ajena ni en ranura equivocada, y no escribe', async () => {
    const { service, prisma } = build([GORRO]);
    await expect(service.equip('u1', 'p1', { back: CAPA })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.equip('u1', 'p1', { neck: GORRO })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.pet.update).not.toHaveBeenCalled();
  });

  it('404 si la mascota no es del usuario', async () => {
    const { service } = build([GORRO]);
    await expect(service.equip('otro', 'p1', { head: GORRO })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getEquipped('otro', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('al leer lo equipado descarta prendas que ya no están en el catálogo', async () => {
    const { service } = build([], { head: GORRO, back: 'retirada' });
    await expect(service.getEquipped('u1', 'p1')).resolves.toEqual({ petId: 'p1', accessories: { head: GORRO } });
  });
});
