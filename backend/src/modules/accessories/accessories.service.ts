import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  ACCESSORY_SLOTS,
  AccessoryDef,
  EquipChange,
  accessoryState,
  resolveEquip,
  sanitizeEquipped,
} from './accessories.engine';

/**
 * Accesorios de Pockai (spec 38). El catálogo vive en `accessories.json`; el precio vigente es el
 * del `Item` sembrado (lo puede cambiar el panel de admin). La prenda es del usuario (inventario)
 * y se equipa por mascota (`Pet.accessories`).
 */
@Injectable()
export class AccessoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
  ) {}

  private catalog(): Map<string, AccessoryDef> {
    return new Map((this.gameData.getAccessories() as AccessoryDef[]).map((a) => [a.id, a]));
  }

  /** Ids de prendas que el usuario tiene, entre las indicadas. */
  private async ownedIds(userId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.inventoryItem.findMany({
      where: { userId, itemId: { in: ids }, qty: { gt: 0 } },
      select: { itemId: true },
    });
    return new Set(rows.map((r) => r.itemId));
  }

  /** Catálogo con el estado de cada prenda para el usuario: `locked`, `available` u `owned`. */
  async list(userId: string) {
    const catalog = this.catalog();
    const ids = [...catalog.keys()];
    const [items, owned] = await Promise.all([
      ids.length ? this.prisma.item.findMany({ where: { id: { in: ids } } }) : Promise.resolve([]),
      this.ownedIds(userId, ids),
    ]);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const achievements: any[] = this.gameData.getAchievements()?.achievements ?? [];
    const achievementName = new Map(achievements.map((a) => [a.id, a.name]));

    const accessories = [...catalog.values()].map((def) => {
      const item = itemById.get(def.id);
      const unlock: Record<string, unknown> = { type: def.unlock.type };
      if (def.unlock.type === 'coins') unlock.price = item?.priceCoins ?? def.unlock.price;
      if (def.unlock.type === 'gems') unlock.price = item?.priceGems ?? def.unlock.price;
      if (def.unlock.type === 'achievement') {
        unlock.achievementId = def.unlock.achievementId;
        unlock.achievementName = achievementName.get(def.unlock.achievementId) ?? null;
      }
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        slot: def.slot,
        rarity: def.rarity,
        color: def.color,
        animated: def.animated ?? false,
        fx: def.fx ?? null,
        unlock,
        state: accessoryState(def, owned.has(def.id)),
      };
    });
    return { slots: [...ACCESSORY_SLOTS], accessories };
  }

  /** Compra una prenda con monedas o gemas. Las de logro no se venden. */
  async buy(userId: string, id: string) {
    const def = this.catalog().get(id);
    if (!def) throw new NotFoundException('Prenda no encontrada');
    if (def.unlock.type === 'achievement') {
      throw new BadRequestException('Esta prenda se consigue con un logro');
    }
    // `buyItem` cobra de forma atómica, impide la compra repetida y registra el gasto.
    await this.inventory.buyItem(userId, id, 1);
    return { id: def.id, slot: def.slot, state: 'owned' as const };
  }

  /** Prendas equipadas de una mascota del usuario. */
  async getEquipped(userId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, userId }, select: { id: true, accessories: true } });
    if (!pet) throw new NotFoundException('Pet no encontrado');
    return { petId: pet.id, accessories: sanitizeEquipped(pet.accessories, this.catalog()) };
  }

  /** Equipa o quita prendas por ranura. El cambio es todo o nada. */
  async equip(userId: string, petId: string, change: EquipChange) {
    const catalog = this.catalog();
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, userId }, select: { id: true, accessories: true } });
    if (!pet) throw new NotFoundException('Pet no encontrado');

    const wanted = Object.values(change).filter((v): v is string => typeof v === 'string');
    const owned = await this.ownedIds(userId, wanted);
    const result = resolveEquip(sanitizeEquipped(pet.accessories, catalog), change, catalog, owned);
    if (result.ok === false) throw new BadRequestException(result.error);

    await this.prisma.pet.update({ where: { id: pet.id }, data: { accessories: result.next } });
    return { petId: pet.id, accessories: result.next };
  }
}
