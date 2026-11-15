import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Co-op Care Service — amistad + visitas entre amigos.
 * Feature 021: Multi-Device Presence + Co-op
 *
 * Cablea la amistad sobre Prisma (`CoopFriendship`) y las visitas sobre `CoopVisit` (ya migradas).
 * La amistad es recíproca: una fila aceptada permite la visita en ambos sentidos
 * (`checkFriendship` comprueba las dos direcciones). Una visita valida amistad y propiedad del
 * pet, aplica un límite diario (5/pet/visitante, medido en BD) y modifica los vitales del pet del
 * dueño de forma acotada (clamp 0-100), registrando la visita atómicamente.
 */
export interface VisitAction {
  action: 'feed' | 'play' | 'clean';
  petId: string;
  itemId?: string; // for feed
}

export interface VisitResult {
  success: boolean;
  message: string;
  xpGained: number;
  petState: { hunger: number; happiness: number; hygiene: number };
}

export interface FriendshipSummary {
  id: string;
  status: 'pending' | 'accepted' | 'revoked';
  direction: 'incoming' | 'outgoing';
  otherUserId: string;
  updatedAt: Date;
}

const MAX_VISITS_PER_DAY = 5;
const MAX_FRIENDS = 10;

const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v * 100) / 100));

@Injectable()
export class CoopCareService {
  private readonly logger = new Logger(CoopCareService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ¿Tiene `a` una amistad ACEPTADA con `b`? Es recíproca: basta que exista una fila aceptada en
   * cualquiera de las dos direcciones.
   */
  async checkFriendship(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    const friendship = await this.prisma.coopFriendship.findFirst({
      where: {
        status: 'accepted',
        OR: [{ ownerId: a, visitorId: b }, { ownerId: b, visitorId: a }],
      },
      select: { id: true },
    });
    return friendship !== null;
  }

  // ── Amistad ──────────────────────────────────────────────────────────────────

  async requestFriendship(targetUserId: string, requesterId: string): Promise<FriendshipSummary> {
    if (targetUserId === requesterId) {
      throw new BadRequestException('No puedes enviarte una petición a ti mismo');
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!target) throw new NotFoundException('Usuario no encontrado');

    const row = await this.prisma.coopFriendship.upsert({
      where: { ownerId_visitorId: { ownerId: targetUserId, visitorId: requesterId } },
      update: { status: 'pending', updatedAt: new Date() },
      create: { ownerId: targetUserId, visitorId: requesterId, status: 'pending' },
    });
    this.logger.debug(`Friendship request: ${requesterId} → ${targetUserId} (${row.id})`);
    return this.toSummary(row, requesterId);
  }

  /**
   * El `ownerId` de la fila (quien recibió la petición) la acepta. Idempotente a doble aceptación:
   * solo prospera la primera (updateMany condicionado a `status=pending`).
   */
  async acceptFriendship(friendshipId: string, actorId: string): Promise<FriendshipSummary> {
    const existing = await this.prisma.coopFriendship.findUnique({ where: { id: friendshipId } });
    if (!existing) throw new NotFoundException('Petición de amistad no encontrada');
    if (existing.ownerId !== actorId) {
      throw new ForbiddenException('Solo quien recibió la petición puede aceptarla');
    }

    const friendsCount = await this.prisma.coopFriendship.count({
      where: { status: 'accepted', OR: [{ ownerId: actorId }, { visitorId: actorId }] },
    });
    if (friendsCount >= MAX_FRIENDS) {
      throw new HttpException(`Límite de amigos alcanzado (${MAX_FRIENDS})`, HttpStatus.BAD_REQUEST);
    }

    const claimed = await this.prisma.coopFriendship.updateMany({
      where: { id: friendshipId, status: 'pending' },
      data: { status: 'accepted' },
    });
    if (claimed.count === 0) throw new BadRequestException('Esta petición ya fue resuelta');

    const updated = await this.prisma.coopFriendship.findUniqueOrThrow({ where: { id: friendshipId } });
    return this.toSummary(updated, actorId);
  }

  /**
   * El `ownerId` de la fila (quien recibió la petición) la rechaza.
   */
  async declineFriendship(friendshipId: string, actorId: string): Promise<FriendshipSummary> {
    const existing = await this.prisma.coopFriendship.findUnique({ where: { id: friendshipId } });
    if (!existing) throw new NotFoundException('Petición de amistad no encontrada');
    if (existing.ownerId !== actorId) {
      throw new ForbiddenException('Solo quien recibió la petición puede rechazarla');
    }
    const claimed = await this.prisma.coopFriendship.updateMany({
      where: { id: friendshipId, status: 'pending' },
      data: { status: 'revoked' },
    });
    if (claimed.count === 0) throw new BadRequestException('Esta petición ya fue resuelta');
    const updated = await this.prisma.coopFriendship.findUniqueOrThrow({ where: { id: friendshipId } });
    return this.toSummary(updated, actorId);
  }

  /**
   * Lista de relaciones de `userId` (amigos aceptados + peticiones entrantes/salientes). Se deduplica
   * por otro usuario (una amistad puede tener hasta dos filas), prefiriendo el estado más favorable.
   */
  async listFriendships(userId: string): Promise<FriendshipSummary[]> {
    const rows = await this.prisma.coopFriendship.findMany({
      where: { OR: [{ ownerId: userId }, { visitorId: userId }] },
      orderBy: { updatedAt: 'desc' },
    });
    const byOther = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const other = row.ownerId === userId ? row.visitorId : row.ownerId;
      const prev = byOther.get(other);
      if (!prev || this.rankStatus(row.status) > this.rankStatus(prev.status)) byOther.set(other, row);
    }
    return [...byOther.values()].map((row) => this.toSummary(row, userId));
  }

  private toSummary(row: {
    id: string;
    ownerId: string;
    visitorId: string;
    status: string;
    updatedAt: Date;
  }, me: string): FriendshipSummary {
    return {
      id: row.id,
      status: row.status as FriendshipSummary['status'],
      direction: row.ownerId === me ? 'incoming' : 'outgoing',
      otherUserId: row.ownerId === me ? row.visitorId : row.ownerId,
      updatedAt: row.updatedAt,
    };
  }

  private rankStatus(status: string): number {
    return status === 'accepted' ? 2 : status === 'pending' ? 1 : 0;
  }

  // ── Visitas co-op ───────────────────────────────────────────────────────────

  /**
   * Procesa una visita del `visitorId` al pet `petId` del `ownerId`: valida amistad y propiedad,
   * aplica el límite diario, modifica los vitales del pet (clamp 0-100) y registra la visita.
   */
  async processVisit(ownerId: string, visitorId: string, action: VisitAction): Promise<VisitResult> {
    if (!action || !action.petId) throw new BadRequestException('petId requerido');

    // 1. Amistad aceptada
    const hasFriendship = await this.checkFriendship(ownerId, visitorId);
    if (!hasFriendship) throw new ForbiddenException('No tienes una amistad aceptada con el dueño del pet');

    // 2. El pet existe y pertenece al dueño declarado
    const pet = await this.prisma.pet.findFirst({ where: { id: action.petId, userId: ownerId } });
    if (!pet) throw new NotFoundException('Pet no encontrado');

    // 3. Límite diario (medido en BD, no en memoria)
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const visitCount = await this.prisma.coopVisit.count({
      where: { petId: action.petId, visitorId, createdAt: { gte: startOfDay } },
    });
    if (visitCount >= MAX_VISITS_PER_DAY) {
      throw new HttpException(
        `Límite diario de visitas alcanzado (${MAX_VISITS_PER_DAY} por pet por día)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 4. Efecto acotado sobre el pet + registro (atómico)
    const statDelta = this.applyActionLimited(action.action);
    const xpGained = this.getXpForAction(action.action);
    const petState = {
      hunger: clamp(pet.hunger + statDelta.hunger),
      happiness: clamp(pet.happiness + statDelta.happiness),
      hygiene: clamp(pet.hygiene + statDelta.hygiene),
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.pet.update({ where: { id: pet.id }, data: { ...petState } });
      await tx.coopVisit.create({
        data: { visitorId, ownerId, petId: action.petId, action: action.action, xpGained },
      });
    });

    this.logger.debug(
      `Visit: ${visitorId} → pet ${action.petId} de ${ownerId}, action=${action.action}, xp=${xpGained}`,
    );

    return { success: true, message: `Successfully ${action.action} the pet`, xpGained, petState };
  }

  /**
   * Historial de visitas sobre los pets de `ownerId` (opcionalmente filtrado por `petId`).
   */
  async getVisitHistory(
    ownerId: string,
    petId?: string,
  ): Promise<Array<{ visitorId: string; action: string; petId: string; xpGained: number; createdAt: Date }>> {
    return this.prisma.coopVisit.findMany({
      where: { ownerId, ...(petId ? { petId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Efecto de cada acción, acotado a un máximo por visita (≈10% de un vital).
   */
  private applyActionLimited(action: string): { hunger: number; happiness: number; hygiene: number } {
    const MAX_DELTA = 10; // 10% max stat change per visit
    switch (action) {
      case 'feed':
        return { hunger: MAX_DELTA, happiness: 2, hygiene: 0 };
      case 'play':
        return { hunger: -3, happiness: MAX_DELTA, hygiene: -2 };
      case 'clean':
        return { hunger: 0, happiness: 3, hygiene: MAX_DELTA };
      default:
        return { hunger: 0, happiness: 0, hygiene: 0 };
    }
  }

  /**
   * XP por tipo de acción de visita.
   */
  private getXpForAction(action: string): number {
    switch (action) {
      case 'feed':
        return 5;
      case 'play':
        return 10;
      case 'clean':
        return 8;
      default:
        return 2;
    }
  }
}