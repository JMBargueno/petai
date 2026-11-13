import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getInventory(userId: string) {
    return this.prisma.inventoryItem.findMany({
      where: { userId, qty: { gt: 0 } },
      include: { item: true },
    });
  }

  async getShopItems() {
    return this.prisma.item.findMany();
  }

  async buyItem(userId: string, itemId: string, quantity: number = 1) {
    if (quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }

    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException('Objeto de tienda no encontrado');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const totalCoins = item.priceCoins * quantity;
    const totalGems = item.priceGems * quantity;

    if (user.coins < totalCoins || user.gems < totalGems) {
      throw new BadRequestException('Fondos insuficientes (monedas o gemas)');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          coins: { decrement: totalCoins },
          gems: { decrement: totalGems },
        },
      });

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

  async consumeItem(userId: string, itemId: string) {
    const inv = await this.prisma.inventoryItem.findUnique({
      where: { userId_itemId: { userId, itemId } },
      include: { item: true },
    });

    if (!inv || inv.qty <= 0) {
      throw new BadRequestException('No posees este objeto en el inventario');
    }

    await this.prisma.inventoryItem.update({
      where: { id: inv.id },
      data: { qty: { decrement: 1 } },
    });

    return inv.item;
  }
}
