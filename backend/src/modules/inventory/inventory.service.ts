import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_PURCHASE_QTY = 99;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

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

    const totalCoins = item.priceCoins * quantity;
    const totalGems = item.priceGems * quantity;

    return this.prisma.$transaction(async (tx) => {
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
}
