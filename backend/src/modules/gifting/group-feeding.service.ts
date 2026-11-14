import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const ROOM_TTL_MS = 10 * 60 * 1000; // 10 min
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 5;
const GAMES = ['catch_food', 'memory_match', 'reflex'];
const COIN_POOL = 100;
const HOST_SHARE = 0.3;
const BONDING_BONUS = 3;

interface Participant {
  userId: string;
  gameType: string;
  completed: boolean;
  score: number;
}

@Injectable()
export class GroupFeedingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Punto de entrada: crea room (sin code) o se une (con code). */
  async join(userId: string, input: { code?: string; maxPlayers?: number }) {
    if (input.code) {
      return this.joinRoom(userId, input.code);
    }
    return this.createRoom(userId, input.maxPlayers ?? 4);
  }

  async createRoom(hostId: string, maxPlayers: number) {
    const capped = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, maxPlayers || 4));
    const code = this.genCode();
    const participants: Participant[] = [
      { userId: hostId, gameType: GAMES[0], completed: false, score: 0 },
    ];
    const room = await this.prisma.groupSession.create({
      data: {
        code,
        hostId,
        maxPlayers: capped,
        participants: this.asJson(participants),
        expiresAt: new Date(Date.now() + ROOM_TTL_MS),
      },
    });
    this.realtime.emitToUser(hostId, 'group:feeding-join', {
      roomId: room.id,
      code,
      position: 1,
      assignedGame: GAMES[0],
    });
    return this.serialize(room, 1);
  }

  async joinRoom(playerId: string, code: string) {
    const room = await this.prisma.groupSession.findUnique({ where: { code } });
    if (!room) throw new NotFoundException('Room no encontrada');
    if (room.status !== 'active') throw new BadRequestException('La room ya no está activa');
    if (new Date(room.expiresAt).getTime() < Date.now()) {
      await this.prisma.groupSession.update({ where: { id: room.id }, data: { status: 'expired' } });
      throw new BadRequestException('La room ha expirado');
    }

    const participants = (room.participants as unknown) as Participant[];
    const existing = participants.findIndex((p) => p.userId === playerId);
    if (existing >= 0) return this.serialize(room, existing + 1);
    if (participants.length >= room.maxPlayers) {
      throw new BadRequestException('La room está llena');
    }

    const usedGames = new Set(participants.map((p) => p.gameType));
    const available = GAMES.filter((g) => !usedGames.has(g));
    const gameType = (available.length > 0 ? available : GAMES)[0];
    participants.push({ userId: playerId, gameType, completed: false, score: 0 });
    const position = participants.length;

    const updated = await this.prisma.groupSession.update({
      where: { id: room.id },
      data: { participants: this.asJson(participants) },
    });
    this.realtime.emitToUser(playerId, 'group:feeding-join', {
      roomId: room.id,
      code,
      position,
      assignedGame: gameType,
    });
    return this.serialize(updated, position);
  }

  async completeMinigame(roomId: string, playerId: string, gameType: string, score: number) {
    const room = await this.prisma.groupSession.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room no encontrada');
    if (room.status !== 'active') throw new BadRequestException('La room ya terminó');

    const participants = (room.participants as unknown) as Participant[];
    const p = participants.find((x) => x.userId === playerId);
    if (!p) throw new BadRequestException('No eres participante de esta room');
    if (p.completed) throw new BadRequestException('Ya completaste tu minijuego');

    p.completed = true;
    p.score = Math.max(0, Math.floor(score || 0));
    const progress = participants.filter((x) => x.completed).length / participants.length;

    await this.prisma.groupSession.update({ where: { id: room.id }, data: { participants: this.asJson(participants) } });
    this.notifyParticipants(participants, 'group:feeding-complete', {
      roomId,
      playerId,
      progress,
      complete: progress >= 1,
    });

    if (progress >= 1) {
      const reward = await this.finalizeRoom(room.id);
      return { progress: 1, complete: true, reward };
    }
    return { progress, complete: false };
  }

  async finalizeRoom(roomId: string) {
    const room = await this.prisma.groupSession.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room no encontrada');
    if (room.rewardsDistributed) {
      return { generatedItemId: room.generatedItemId, distributed: true, complete: true };
    }

    const participants = (room.participants as unknown) as Participant[];
    const itemId = this.genItemId();
    const hostId = room.hostId;
    const completed = participants.filter((p) => p.completed);
    const nonHost = completed.filter((p) => p.userId !== hostId);

    await this.prisma.$transaction(async (tx) => {
      const hostCoins = Math.floor(COIN_POOL * HOST_SHARE);
      const restCoins = COIN_POOL - hostCoins;
      const perNonHost = nonHost.length > 0 ? Math.floor(restCoins / nonHost.length) : 0;

      for (const p of completed) {
        const coins = p.userId === hostId ? hostCoins : perNonHost;
        await tx.inventoryItem.upsert({
          where: { userId_itemId: { userId: p.userId, itemId } },
          update: { qty: { increment: 1 } },
          create: { userId: p.userId, itemId, qty: 1 },
        });
        await tx.user.update({
          where: { id: p.userId },
          data: { coins: { increment: coins } },
        });
        await tx.pet.updateMany({
          where: { userId: p.userId },
          data: { bonding: { increment: BONDING_BONUS } },
        });
      }
      return tx.groupSession.update({
        where: { id: room.id },
        data: {
          status: 'complete',
          generatedItemId: itemId,
          rewardsDistributed: true,
          completedAt: new Date(),
        },
      });
    });

    this.notifyParticipants(participants, 'group:feeding-complete', {
      roomId,
      complete: true,
      generatedItemId: itemId,
    });
    return { generatedItemId: itemId, playerCount: completed.length, complete: true };
  }

  private serialize(room: any, position: number) {
    const participants = (room.participants as unknown) as Participant[];
    return {
      roomId: room.id,
      code: room.code,
      maxPlayers: room.maxPlayers,
      status: room.status,
      position,
      participants: participants.map((p, i) => ({
        position: i + 1,
        gameType: p.gameType,
        completed: p.completed,
      })),
      expiresAt: room.expiresAt,
      progress: participants.filter((p) => p.completed).length / Math.max(1, participants.length),
    };
  }

  private notifyParticipants(participants: Participant[], event: string, payload: unknown) {
    for (const p of participants) {
      this.realtime.emitToUser(p.userId, event, payload);
    }
  }

  private asJson(participants: Participant[]): Prisma.InputJsonValue {
    return participants as unknown as Prisma.InputJsonValue;
  }

  private genCode(): string {
    return randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
  }

  private genItemId(): string {
    return `royal_feast_${randomBytes(4).toString('hex')}`;
  }
}
