import { Injectable, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { recordSpend } from '../../stats/spend';
import { GameDataService } from '../game-data/game-data.service';

const MAX_PURCHASE_QTY = 99;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly gameData?: GameDataService,
  ) {}

  async getInventory(userId: string) {
    return this.prisma.inventoryItem.findMany({
      where: { userId, qty: { gt: 0 } },
      include: { item: true },
    });
  }

  async getShopItems(kind?: string) {
    return this.prisma.item.findMany({
      where: kind ? { kind } : undefined,
      orderBy: [{ kind: 'asc' }, { priceCoins: 'asc' }],
    });
  }

  async buyItem(userId: string, itemId: string, quantity: number = 1) {
    if (!itemId || typeof itemId !== 'string') {
      throw new BadRequestException('itemId es obligatorio');
    }
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_PURCHASE_QTY) {
      throw new BadRequestException(`La cantidad debe ser un entero entre 1 y ${MAX_PURCHASE_QTY}`);
    }

    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException('Objeto de tienda no encontrado');
    }

    // Los objetos de logro no se venden: se entregan con `grantExclusiveItem`. Sin este filtro se
    // podrían comprar a precio 0 (cosméticos genéricos y prendas de logro de accessories.json).
    const isAccessory = item.kind === 'accessory';
    const unlock = (item.effects as { unlock?: string } | null)?.unlock;
    if (item.kind === 'cosmetic' || (isAccessory && unlock === 'achievement')) {
      throw new BadRequestException('Este objeto no se puede comprar: se consigue con un logro');
    }
    // Una prenda se tiene o no se tiene: no hay segundas unidades (spec 38 §4).
    if (isAccessory && quantity !== 1) {
      throw new BadRequestException('Las prendas se compran de una en una');
    }

    const totalCoins = item.priceCoins * quantity;
    const totalGems = item.priceGems * quantity;

    return this.prisma.$transaction(async (tx) => {
      if (isAccessory) {
        const owned = await tx.inventoryItem.findUnique({ where: { userId_itemId: { userId, itemId } } });
        if (owned && owned.qty > 0) {
          throw new BadRequestException('Ya tienes esta prenda');
        }
      }
      // Cobro atómico: la condición de fondos y el descuento van en una sola
      // sentencia, así dos compras simultáneas no pueden dejar el saldo negativo.
      const charged = await tx.user.updateMany({
        where: { id: userId, coins: { gte: totalCoins }, gems: { gte: totalGems } },
        data: {
          coins: { decrement: totalCoins },
          gems: { decrement: totalGems },
        },
      });
      if (charged.count === 0) {
        throw new BadRequestException('Fondos insuficientes (monedas o gemas)');
      }
      // Estadísticas de gasto (logros de gasto) en la misma transacción del cobro.
      await recordSpend(tx, userId, 'coins', totalCoins);
      await recordSpend(tx, userId, 'gems', totalGems);

      if (isAccessory) {
        // Reactiva una fila a 0 (prenda regalada) o crea la fila. Si dos compras simultáneas pasan
        // la comprobación de arriba, la segunda no encuentra fila a 0 y choca con la clave única
        // (userId, itemId): la transacción se deshace y no se cobra dos veces.
        const reactivated = await tx.inventoryItem.updateMany({
          where: { userId, itemId, qty: 0 },
          data: { qty: 1 },
        });
        if (reactivated.count === 0) {
          await tx.inventoryItem.create({ data: { userId, itemId, qty: 1 } });
        }
        return tx.inventoryItem.findUniqueOrThrow({
          where: { userId_itemId: { userId, itemId } },
          include: { item: true },
        });
      }

      return tx.inventoryItem.upsert({
        where: {
          userId_itemId: { userId, itemId },
        },
        update: {
          qty: { increment: quantity },
        },
        create: {
          userId,
          itemId,
          qty: quantity,
        },
        include: { item: true },
      });
    });
  }

  /** Consume 1 unidad. Si se indica `kind`, el objeto debe ser de ese tipo (se valida antes de gastarlo). */
  async consumeItem(userId: string, itemId: string, kind?: string) {
    if (typeof itemId !== 'string' || itemId.length === 0 || itemId.length > 64) {
      throw new BadRequestException('itemId no es válido');
    }
    const inv = await this.prisma.inventoryItem.findUnique({
      where: { userId_itemId: { userId, itemId } },
      include: { item: true },
    });

    if (!inv || inv.qty <= 0) {
      throw new BadRequestException('No posees este objeto en el inventario');
    }

    if (kind && inv.item.kind !== kind) {
      throw new BadRequestException('Este objeto no se puede usar de esta forma');
    }

    // Decremento condicional: evita consumir dos veces la última unidad
    const used = await this.prisma.inventoryItem.updateMany({
      where: { id: inv.id, qty: { gt: 0 } },
      data: { qty: { decrement: 1 } },
    });
    if (used.count === 0) {
      throw new BadRequestException('No posees este objeto en el inventario');
    }

    return inv.item;
  }

  /**
   * Otorga un item exclusivo de logro (cosmético, feature 008 / SC-004). Es idempotente: si el item
   * ya no existe en el catálogo se crea como cosmético (sin precio/poder), y la fila de inventario se
   * upsertea por la única `(userId, itemId)`, así re-disparar el desbloqueo NO duplica el item.
   *
   * Acepta un cliente de transacción `tx` opcional para participar de la transacción atómica del
   * desbloqueo (por defecto usa el `PrismaService` normal).
   */
  async grantExclusiveItem(
    userId: string,
    itemId: string,
    tx?: Prisma.TransactionClient,
  ) {
    if (typeof itemId !== 'string' || itemId.length === 0 || itemId.length > 64) {
      throw new BadRequestException('itemId no es válido');
    }
    const client = tx ?? this.prisma;

    // Asegura que el item exista en el catálogo, sin coste. Si el premio es una prenda de
    // accessories.json (spec 38) se crea como tal, con su nombre y su ranura; si no, como cosmético
    // genérico. Así el premio es correcto aunque el seed aún no haya sembrado la prenda.
    const accessory = this.gameData?.getAccessories().find((a) => a.id === itemId);
    await client.item.upsert({
      where: { id: itemId },
      update: {},
      create: accessory
        ? {
            id: itemId,
            kind: 'accessory',
            name: accessory.name,
            description: accessory.description,
            effects: { slot: accessory.slot, rarity: accessory.rarity, color: accessory.color, unlock: accessory.unlock.type },
            priceCoins: 0,
            priceGems: 0,
          }
        : {
            id: itemId,
            kind: 'cosmetic',
            name: `Item exclusivo: ${itemId}`,
            description: 'Item cosmético otorgado por un logro',
            effects: {},
            priceCoins: 0,
            priceGems: 0,
          },
    });

    return client.inventoryItem.upsert({
      where: { userId_itemId: { userId, itemId } },
      update: { qty: { increment: 0 } },
      create: { userId, itemId, qty: 1 },
    });
  }
}
