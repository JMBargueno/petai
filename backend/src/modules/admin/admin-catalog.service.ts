import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parseOrBadRequest } from '../auth/dto/auth.schemas';
import { GameDataService } from '../game-data/game-data.service';
import { bulkPriceSchema, updateItemPriceSchema } from './admin.schemas';

type Actor = { id: string };

const ITEM_SELECT = { id: true, kind: true, name: true, description: true, priceCoins: true, priceGems: true, availability: true } as const;

/**
 * Catálogo para el panel: precios de la tienda (tabla `Item`, la que cobra `InventoryService.buyItem`)
 * y especies (snapshot de game-data, que es lo que usa el juego; solo lectura).
 */
@Injectable()
export class AdminCatalogService {
  private readonly logger = new Logger(AdminCatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
  ) {}

  listItems() {
    return this.prisma.item.findMany({ select: ITEM_SELECT, orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
  }

  async updateItemPrice(actor: Actor, id: string, raw: unknown) {
    const patch = parseOrBadRequest(updateItemPriceSchema, raw);
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.item.findUnique({ where: { id }, select: ITEM_SELECT });
      if (!current) throw new NotFoundException('Objeto no encontrado');
      const row = await tx.item.update({ where: { id }, data: patch, select: ITEM_SELECT });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          event: 'item_price_change',
          metadata: { itemId: id, from: { priceCoins: current.priceCoins, priceGems: current.priceGems }, to: patch },
        },
      });
      return row;
    });
    this.logger.log(`Precio de ${id} cambiado por ${actor.id}: ${JSON.stringify(patch)}`);
    return updated;
  }

  /** Ajuste porcentual de una moneda en varios objetos a la vez (redondeo al entero, nunca negativo). */
  async bulkAdjustPrices(actor: Actor, raw: unknown) {
    const { ids, percent, currency } = parseOrBadRequest(bulkPriceSchema, raw);
    return this.prisma.$transaction(async (tx) => {
      const items = await tx.item.findMany({ where: { id: { in: ids } }, select: ITEM_SELECT });
      const changes: { id: string; from: number; to: number }[] = [];
      const result = [];
      for (const item of items) {
        const from = item[currency];
        const to = Math.max(0, Math.round((from * (100 + percent)) / 100));
        if (to === from) {
          result.push(item);
          continue;
        }
        result.push(await tx.item.update({ where: { id: item.id }, data: { [currency]: to }, select: ITEM_SELECT }));
        changes.push({ id: item.id, from, to });
      }
      if (changes.length) {
        await tx.auditLog.create({ data: { userId: actor.id, event: 'item_price_bulk', metadata: { currency, percent, changes } } });
      }
      return { items: result, changed: changes.length };
    });
  }

  listSpecies() {
    return (this.gameData.getSpecies() as any[]).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      element: s.element,
      rarity: s.rarity,
      hp: s.baseStats?.hp ?? 0,
      atk: s.baseStats?.atk ?? 0,
      def: s.baseStats?.def ?? 0,
      vel: s.baseStats?.vel ?? 0,
      esp: s.baseStats?.esp ?? 0,
      favoriteFood: s.favoriteFood,
      spriteKey: s.spriteKey,
    }));
  }
}
