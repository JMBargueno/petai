import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_SENT_PER_DAY = 3;
const MAX_RECEIVED_PER_DAY = 5;

@Injectable()
export class GiftingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async send(
    userId: string,
    input: { recipientUserId: string; petId: string; itemId: string; qty?: number; note?: string },
  ) {
    if (!input || !input.recipientUserId || !input.petId || !input.itemId) {
      throw new BadRequestException('recipientUserId, petId e itemId son obligatorios');
    }
    if (input.recipientUserId === userId) {
      throw new BadRequestException('No puedes enviarte un regalo a ti mismo');
    }
    const qty = Math.min(99, Math.max(1, input.qty ?? 1));

    const recipient = await this.prisma.user.findUnique({ where: { id: input.recipientUserId } });
    if (!recipient) throw new NotFoundException('Destinatario no encontrado');
    const pet = await this.prisma.pet.findFirst({ where: { id: input.petId, userId: recipient.id } });
    if (!pet) throw new BadRequestException('El pet no pertenece al destinatario');

    await this.checkRateLimits(userId, recipient.id);
    const item = await this.prisma.item.findUnique({ where: { id: input.itemId } });
    if (!item) throw new NotFoundException('Item no encontrado');

    const gift = await this.prisma.$transaction(async (tx) => {
      await this.decrementInventory(tx, userId, item.id, qty);
      return tx.gift.create({
        data: {
          senderId: userId,
          receiverId: recipient.id,
          petId: pet.id,
          itemId: item.id,
          qty,
          note: this.cleanNote(input.note),
          status: 'pending',
          expiresAt: new Date(Date.now() + DAILY_WINDOW_MS),
        },
      });
    });

    const payload = {
      id: gift.id,
      status: gift.status,
      itemId: item.id,
      item: item.name,
      qty,
      petId: pet.id,
      recipientUserId: recipient.id,
      expiresAt: gift.expiresAt,
    };
    this.realtime.emitToUser(userId, 'gift:sent', payload);
    this.realtime.emitToUser(recipient.id, 'gift:received', payload);
    return payload;
  }

  /** Acepta un gift: el item pasa al inventario del receptor. */
  async accept(userId: string, giftId: string) {
    const gift = await this.prisma.gift.findFirst({ where: { id: giftId, receiverId: userId } });
    if (!gift) throw new NotFoundException('Gift no encontrado');
    if (gift.status !== 'pending') throw new BadRequestException('Este gift ya fue resuelto');

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.grantInventory(tx, userId, gift.itemId, gift.qty);
      return tx.gift.update({
        where: { id: gift.id },
        data: { status: 'accepted', resolvedAt: new Date() },
      });
    });
    this.realtime.emitToUser(gift.senderId, 'gift:accepted', { giftId, receiverId: userId });
    return { id: updated.id, status: updated.status };
  }

  /** Rechaza un gift: el item vuelve al inventario del sender. */
  async reject(userId: string, giftId: string, thankYouNote?: string) {
    const gift = await this.prisma.gift.findFirst({ where: { id: giftId, receiverId: userId } });
    if (!gift) throw new NotFoundException('Gift no encontrado');
    if (gift.status !== 'pending') throw new BadRequestException('Este gift ya fue resuelto');

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.grantInventory(tx, gift.senderId, gift.itemId, gift.qty);
      return tx.gift.update({
        where: { id: gift.id },
        data: {
          status: 'rejected',
          resolvedAt: new Date(),
          thankYouNote: thankYouNote ? this.cleanNote(thankYouNote) : null,
        },
      });
    });
    this.realtime.emitToUser(gift.senderId, 'gift:rejected', { giftId });
    return { id: updated.id, status: updated.status };
  }

  async history(userId: string, direction: 'sent' | 'received' = 'received', limit = 50) {
    const who = direction === 'sent' ? { senderId: userId } : { receiverId: userId };
    const rows = await this.prisma.gift.findMany({
      where: who,
      orderBy: { sentAt: 'desc' },
      take: Math.min(limit, 100),
    });
    const itemIds = [...new Set(rows.map((r) => r.itemId))];
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds } } });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    return rows.map((r) => ({
      id: r.id,
      itemId: r.itemId,
      item: itemMap.get(r.itemId)?.name ?? r.itemId,
      qty: r.qty,
      note: r.note,
      thankYouNote: r.thankYouNote,
      status: r.status,
      sentAt: r.sentAt,
      expiresAt: r.expiresAt,
      counterpartId: direction === 'sent' ? r.receiverId : r.senderId,
    }));
  }

  private async checkRateLimits(senderId: string, receiverId: string) {
    const dayAgo = new Date(Date.now() - DAILY_WINDOW_MS);
    const sent = await this.prisma.gift.count({ where: { senderId, sentAt: { gte: dayAgo } } });
    if (sent >= MAX_SENT_PER_DAY) {
      throw new BadRequestException('Has alcanzado el límite diario de regalos enviados (3)');
    }
    const received = await this.prisma.gift.count({
      where: { receiverId, sentAt: { gte: dayAgo } },
    });
    if (received >= MAX_RECEIVED_PER_DAY) {
      throw new BadRequestException('El destinatario alcanzó su límite diario de regalos recibidos (5)');
    }
  }

  private async decrementInventory(
    tx: Prisma.TransactionClient,
    userId: string,
    itemId: string,
    qty: number,
  ) {
    const inv = await tx.inventoryItem.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });
    if (!inv || inv.qty < qty) {
      throw new BadRequestException('No posees suficientes de este item para enviar');
    }
    const used = await tx.inventoryItem.updateMany({
      where: { id: inv.id, qty: { gte: qty } },
      data: { qty: { decrement: qty } },
    });
    if (used.count === 0) throw new BadRequestException('No posees este item');
  }

  private async grantInventory(
    tx: Prisma.TransactionClient,
    userId: string,
    itemId: string,
    qty: number,
  ) {
    await tx.inventoryItem.upsert({
      where: { userId_itemId: { userId, itemId } },
      update: { qty: { increment: qty } },
      create: { userId, itemId, qty },
    });
  }

  private cleanNote(note?: string): string | null {
    if (!note) return null;
    const clean = note.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return clean.length > 0 ? clean.slice(0, 200) : null;
  }
}
