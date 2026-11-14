import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_CARE_PER_RECIPIENT_DAY = 1;
const CARE_COINS = 50;
const CARE_HEALTH = 20;

/**
 * Servicio de Care Packages (feature 033, AC4/AC5). Envía un bundle
 * (comida + medicina + toy + 50 coins + nota) al pet enfermo de otro jugador. Solo si
 * el pet receptor está `sick=true`. Máx 1 care package/día por receptor.
 */
@Injectable()
export class CarePackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async sendCarePackage(
    userId: string,
    input: {
      recipientUserId: string;
      petId: string;
      foodItemId: string;
      medicineItemId: string;
      toyItemId: string;
      note?: string;
    },
  ) {
    if (
      !input?.recipientUserId ||
      !input.petId ||
      !input.foodItemId ||
      !input.medicineItemId ||
      !input.toyItemId
    ) {
      throw new BadRequestException('recipientUserId, petId y los 3 itemIds son obligatorios');
    }
    if (input.recipientUserId === userId) {
      throw new BadRequestException('No puedes enviarte un care package a ti mismo');
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: input.recipientUserId },
    });
    if (!recipient) throw new NotFoundException('Destinatario no encontrado');
    const pet = await this.prisma.pet.findFirst({
      where: { id: input.petId, userId: recipient.id },
    });
    if (!pet) throw new BadRequestException('El pet no pertenece al destinatario');
    if (!pet.sick) {
      throw new BadRequestException('El pet destinatario no está enfermo (care solo si sick)');
    }

    const dayAgo = new Date(Date.now() - DAILY_WINDOW_MS);
    const careToday = await this.prisma.carePackage.count({
      where: { receiverId: recipient.id, createdAt: { gte: dayAgo } },
    });
    if (careToday >= MAX_CARE_PER_RECIPIENT_DAY) {
      throw new BadRequestException('Este pet ya recibió un care package hoy (máx 1/día)');
    }

    // Valida kinds: food / medicine / toy
    const food = await this.prisma.item.findUnique({ where: { id: input.foodItemId } });
    const medicine = await this.prisma.item.findUnique({ where: { id: input.medicineItemId } });
    const toy = await this.prisma.item.findUnique({ where: { id: input.toyItemId } });
    if (!food || !medicine || !toy) throw new NotFoundException('Uno de los items no existe');
    if (food.kind !== 'food') throw new BadRequestException('foodItemId debe ser un item de tipo food');
    if (medicine.kind !== 'medicine') throw new BadRequestException('medicineItemId debe ser medicine');
    if (toy.kind !== 'toy') throw new BadRequestException('toyItemId debe ser un item de tipo toy');

    await this.prisma.$transaction(async (tx) => {
      await this.decrementOne(tx, userId, food.id);
      await this.decrementOne(tx, userId, medicine.id);
      await this.decrementOne(tx, userId, toy.id);

      const carePkg = await tx.carePackage.create({
        data: {
          senderId: userId,
          receiverId: recipient.id,
          petId: pet.id,
          foodItemId: food.id,
          medicineItemId: medicine.id,
          toyItemId: toy.id,
          coins: CARE_COINS,
          note: input.note ? this.clean(input.note) : null,
        },
      });

      // Aplica el efecto al pet y a la cuenta del receptor.
      await tx.pet.update({
        where: { id: pet.id },
        data: {
          health: Math.min(100, pet.health + CARE_HEALTH),
          sick: pet.health + CARE_HEALTH >= 100 ? false : pet.sick,
        },
      });
      await tx.user.update({
        where: { id: recipient.id },
        data: { coins: { increment: CARE_COINS } },
      });
      return carePkg;
    });

    const payload = {
      recipientUserId: recipient.id,
      petId: pet.id,
      coins: CARE_COINS,
      healthBoost: CARE_HEALTH,
      note: input.note ? this.clean(input.note) : null,
    };
    this.realtime.emitToUser(userId, 'care:sent', payload);
    this.realtime.emitToUser(recipient.id, 'care:package-received', payload);
    return payload;
  }

  private async decrementOne(tx: Prisma.TransactionClient, userId: string, itemId: string) {
    const inv = await tx.inventoryItem.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });
    if (!inv || inv.qty <= 0) {
      throw new BadRequestException('No posees el item necesario para el care package');
    }
    const used = await tx.inventoryItem.updateMany({
      where: { id: inv.id, qty: { gt: 0 } },
      data: { qty: { decrement: 1 } },
    });
    if (used.count === 0) throw new BadRequestException('No posees el item necesario');
  }

  private clean(note: string): string {
    return note.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
  }
}
