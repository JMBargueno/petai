import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { EMAIL_LOOKUP_REMOVED_MESSAGE, findUserIdByHandle } from '../../common/user-handle';
import { RealtimeGateway } from '../realtime/realtime.gateway';

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
  otherDisplayName: string;
  /** Nickname público del otro jugador (null si su cuenta aún no lo ha elegido). */
  otherHandle: string | null;
  otherPet: { petId: string; nickname: string; speciesName: string } | null;
  updatedAt: Date;
}

/** Entrada del historial de visitas (cuidado o hábitat), vista desde el usuario que lo pide. */
export interface VisitHistoryEntry {
  id: string;
  kind: 'care' | 'habitat';
  /** `in` = visitaron a mis pets; `out` = visité yo a otro. */
  direction: 'in' | 'out';
  otherUserId: string;
  otherName: string;
  otherHandle: string | null;
  visitorId: string;
  ownerId: string;
  petId: string;
  /** feed | play | clean para cuidado; `habitat` para visitas en vivo. */
  action: string;
  xpGained: number;
  createdAt: Date;
  endedAt: Date | null;
}

const MAX_VISITS_PER_DAY = 5;
const MAX_FRIENDS = 10;

const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v * 100) / 100));

@Injectable()
export class CoopCareService {
  private readonly logger = new Logger(CoopCareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    @Optional() private readonly realtime?: RealtimeGateway,
  ) {}

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

  async requestFriendship(
    target: { targetUserId?: string; handle?: string; email?: string },
    requesterId: string,
  ): Promise<FriendshipSummary> {
    let targetUserId = target?.targetUserId;
    if (!targetUserId && target?.handle) {
      // Los jugadores se identifican por su @nickname público (nunca por email: no se filtran correos).
      const byHandle = await findUserIdByHandle(this.prisma, target.handle);
      if (!byHandle) throw new NotFoundException('No hay ningún jugador con ese nickname');
      targetUserId = byHandle;
    }
    if (!targetUserId && target?.email) throw new BadRequestException(EMAIL_LOOKUP_REMOVED_MESSAGE);
    if (!targetUserId) throw new BadRequestException('Indica el @nickname del jugador');
    if (targetUserId === requesterId) {
      throw new BadRequestException('No puedes enviarte una petición a ti mismo');
    }
    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!targetUser) throw new NotFoundException('Usuario no encontrado');

    const row = await this.prisma.coopFriendship.upsert({
      where: { ownerId_visitorId: { ownerId: targetUserId, visitorId: requesterId } },
      update: { status: 'pending', updatedAt: new Date() },
      create: { ownerId: targetUserId, visitorId: requesterId, status: 'pending' },
    });
    this.logger.debug(`Friendship request: ${requesterId} → ${targetUserId} (${row.id})`);
    return (await this.summarizeMany([row], requesterId))[0];
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
    // Logros de amistad (`friends` es una estadística derivada: se re-evalúa a ambos).
    this.events.emit('coop:friendship_accepted', { userIds: [updated.ownerId, updated.visitorId] });
    return (await this.summarizeMany([updated], actorId))[0];
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
    return (await this.summarizeMany([updated], actorId))[0];
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
    return this.summarizeMany([...byOther.values()], userId);
  }

  /**
   * Enriquece filas de amistad con el nombre del otro usuario y su pet principal (para que la UI
   * muestre quién es y a qué pet se puede visitar). Devuelve los resúmenes desde la perspectiva de `me`.
   */
  private async summarizeMany(
    rows: Array<{ id: string; ownerId: string; visitorId: string; status: string; updatedAt: Date }>,
    me: string,
  ): Promise<FriendshipSummary[]> {
    if (rows.length === 0) return [];
    const others = [...new Set(rows.map((r) => (r.ownerId === me ? r.visitorId : r.ownerId)))];

    const names = new Map<string, string>();
    const handles = new Map<string, string | null>();
    const us = await this.prisma.user.findMany({
      where: { id: { in: others } },
      select: { id: true, displayName: true, handle: true, activePetId: true },
    });
    const chosenPet = new Map<string, string | null>();
    for (const u of us) {
      names.set(u.id, u.displayName);
      handles.set(u.id, u.handle ?? null);
      chosenPet.set(u.id, (u as { activePetId?: string | null }).activePetId ?? null);
    }

    const pets = new Map<string, { petId: string; nickname: string; speciesName: string }>();
    const ps = await this.prisma.pet.findMany({
      where: { userId: { in: others } },
      select: { id: true, userId: true, nickname: true, species: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    // Pockai activo: el elegido por el jugador si sigue siendo suyo; si no, el más antiguo.
    for (const p of ps) {
      const entry = { petId: p.id, nickname: p.nickname, speciesName: p.species.name };
      if (!pets.has(p.userId) || chosenPet.get(p.userId) === p.id) pets.set(p.userId, entry);
    }

    return rows.map((row) => {
      const other = row.ownerId === me ? row.visitorId : row.ownerId;
      return {
        id: row.id,
        status: row.status as FriendshipSummary['status'],
        direction: row.ownerId === me ? 'incoming' : 'outgoing',
        otherUserId: other,
        otherDisplayName: names.get(other) ?? '—',
        otherHandle: handles.get(other) ?? null,
        otherPet: pets.get(other) ?? null,
        updatedAt: row.updatedAt,
      };
    });
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

    if (this.realtime) {
      const visited = await this.prisma.pet.findUnique({ where: { id: pet.id }, include: { species: true, pattern: true } });
      if (visited) this.realtime.emitPetUpdate(ownerId, visited);
      this.realtime.emitPetAction(ownerId, pet.id, 'friend_visit', { action: action.action });
    }

    this.logger.debug(
      `Visit: ${visitorId} → pet ${action.petId} de ${ownerId}, action=${action.action}, xp=${xpGained}`,
    );

    // 5. XP compartida al clan del dueño: se emite `clan:activity` y la suma de XP (y el avance de
    //    las metas del clan) la procesa `ClansService.onClanActivity`. Así la XP no se contabiliza
    //    en dos sitios y la visita nunca depende de un fallo de clan.
    this.events.emit('clan:activity', { userId: ownerId, xp: xpGained, visits: 1 });

    return { success: true, message: `Successfully ${action.action} the pet`, xpGained, petState };
  }

  /**
   * Formato antiguo del historial (apps sin `scope=all`): solo visitas de cuidado recibidas por los
   * pets de `ownerId`. Se mantiene para que Android y escritorios ya publicados no muestren como
   * recibidas las visitas que hizo el propio usuario.
   */
  async getReceivedCareVisits(
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
   * Historial de visitas de `userId` en ambos sentidos (`scope=all`): las que recibieron sus pets y las que hizo él,
   * tanto de cuidado (`CoopVisit`) como en vivo al hábitat (`HabitatVisit`). Antes solo devolvía las
   * de cuidado recibidas, así que quien visitaba (o usaba el hábitat) veía el historial vacío.
   * Incluye el nombre del otro jugador para no depender de que siga siendo amigo.
   */
  async getVisitHistory(userId: string, petId?: string): Promise<VisitHistoryEntry[]> {
    const LIMIT = 100;
    const petFilter = petId ? { petId } : {};
    const [care, habitat] = await Promise.all([
      this.prisma.coopVisit.findMany({
        where: { OR: [{ ownerId: userId }, { visitorId: userId }], ...petFilter },
        orderBy: { createdAt: 'desc' },
        take: LIMIT,
      }),
      this.prisma.habitatVisit.findMany({
        where: { OR: [{ ownerId: userId }, { visitorId: userId }], ...petFilter },
        orderBy: { startedAt: 'desc' },
        take: LIMIT,
      }),
    ]);

    const entries: Array<Omit<VisitHistoryEntry, 'otherName' | 'otherHandle'>> = [
      ...care.map((v) => ({
        id: v.id,
        kind: 'care' as const,
        direction: v.ownerId === userId ? ('in' as const) : ('out' as const),
        otherUserId: v.ownerId === userId ? v.visitorId : v.ownerId,
        visitorId: v.visitorId,
        ownerId: v.ownerId,
        petId: v.petId,
        action: v.action,
        xpGained: v.xpGained,
        createdAt: v.createdAt,
        endedAt: null,
      })),
      ...habitat.map((v) => ({
        id: v.id,
        kind: 'habitat' as const,
        direction: v.ownerId === userId ? ('in' as const) : ('out' as const),
        otherUserId: v.ownerId === userId ? v.visitorId : v.ownerId,
        visitorId: v.visitorId,
        ownerId: v.ownerId,
        petId: v.petId,
        action: 'habitat',
        xpGained: 0,
        createdAt: v.startedAt,
        endedAt: v.endedAt,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, LIMIT);

    const otherIds = [...new Set(entries.map((e) => e.otherUserId))];
    const users = otherIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, displayName: true, handle: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return entries.map((e) => ({
      ...e,
      otherName: byId.get(e.otherUserId)?.displayName ?? '—',
      otherHandle: byId.get(e.otherUserId)?.handle ?? null,
    }));
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