import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CoopCareService } from './coop-care.service';

/**
 * HabitatVisitService — "visita en vivo": el pet del visitante aparece en el habitat del dueño.
 *
 * - Start exige una amistad ACEPTADA (CoopCareService.checkFriendship) y usa el pet activo del
 *   actor (primero por createdAt, como `summarizeMany`).
 * - Se mantiene UNA única `HabitatVisit` activa por par (visitorId, ownerId).
 * - Emite en tiempo real al dueño `habitat:visitor_joined` / `habitat:visitor_left` vía
 *   `RealtimeGateway.emitToUser`.
 * - Cleanup: cada ~60s finaliza las visitas activas con más de 15 min y emite `visitor_left`.
 */
export interface PetIdentity {
  petId: string;
  nickname: string;
  speciesName: string;
  speciesId: string;
  spriteRef: string;
}

export interface ActiveVisitor {
  visitorId: string;
  visitorName: string;
  pet: PetIdentity;
  startedAt: Date;
}

const VISIT_MAX_AGE_MS = 15 * 60 * 1000; // 15 min
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60s

@Injectable()
export class HabitatVisitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HabitatVisitService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;
  private cleaning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly coopCare: CoopCareService,
    @Optional() private readonly realtime?: RealtimeGateway,
  ) {}

  onModuleInit(): void {
    this.logger.log('HabitatVisitService iniciado (cleanup de visitas en vivo activo)');
    this.cleanupTimer = setInterval(() => void this.cleanupStaleVisits(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  /**
   * Inicia la visita en vivo del actor al habitat de `ownerId`. Requiere amistad aceptada y un pet
   * activo del actor. Upsert de UNA visita activa por par y emisión de `habitat:visitor_joined`.
   */
  async startVisit(
    actorId: string,
    ownerId: string,
  ): Promise<{ success: boolean; visit: ActiveVisitor }> {
    if (!ownerId) throw new BadRequestException('Indica el ownerId del amigo');
    if (ownerId === actorId) throw new BadRequestException('No puedes visitar tu propio habitat');

    const isFriend = await this.coopCare.checkFriendship(actorId, ownerId);
    if (!isFriend) throw new ForbiddenException('No tienes una amistad aceptada con el dueño del pet');

    const pet = await this.resolvePetIdentity(actorId);
    if (!pet) throw new NotFoundException('No tienes un pet activo para la visita');

    // UNA sola visita activa por (visitorId, ownerId): reutiliza la existente si hay.
    const existing = await this.prisma.habitatVisit.findFirst({
      where: { visitorId: actorId, ownerId, status: 'active' },
    });
    const startedAt = existing?.startedAt ?? new Date();
    if (!existing) {
      await this.prisma.habitatVisit.create({
        data: { visitorId: actorId, ownerId, petId: pet.petId, status: 'active', startedAt },
      });
    }

    const visitorName = await this.resolveName(actorId);
    if (this.realtime) {
      this.realtime.emitToUser(ownerId, 'habitat:visitor_joined', {
        visitorId: actorId,
        visitorName,
        pet,
        startedAt,
      });
    }

    this.logger.debug(`Visita en vivo: ${actorId} → habitat de ${ownerId}`);
    return { success: true, visit: { visitorId: actorId, visitorName, pet, startedAt } };
  }

  /**
   * Finaliza las visitas activas del actor (opcionalmente solo la de un `ownerId`): status=ended,
   * endedAt=now, y emite `habitat:visitor_left` a cada dueño.
   */
  async endVisit(actorId: string, ownerId?: string): Promise<{ success: boolean; ended: number }> {
    const visits = await this.prisma.habitatVisit.findMany({
      where: { visitorId: actorId, status: 'active', ...(ownerId ? { ownerId } : {}) },
    });
    if (visits.length === 0) throw new NotFoundException('No tienes ninguna visita activa');

    const endedAt = new Date();
    await Promise.all(
      visits.map((v) =>
        this.prisma.habitatVisit.update({ where: { id: v.id }, data: { status: 'ended', endedAt } }),
      ),
    );

    if (this.realtime) {
      const visitorName = await this.resolveName(actorId);
      for (const v of visits) {
        this.realtime.emitToUser(v.ownerId, 'habitat:visitor_left', {
          visitorId: actorId,
          visitorName,
        });
      }
    }

    this.logger.debug(`Visita finalizada: ${actorId} → ${visits.map((v) => v.ownerId).join(', ')}`);
    return { success: true, ended: visits.length };
  }

  /**
   * Visitas activas donde el actor es el DUEÑO del habitat. Devuelve `{ visitors: ActiveVisitor[] }`.
   */
  async listVisitors(actorId: string): Promise<{ visitors: ActiveVisitor[] }> {
    const visits = await this.prisma.habitatVisit.findMany({
      where: { ownerId: actorId, status: 'active' },
      orderBy: { startedAt: 'asc' },
    });
    if (visits.length === 0) return { visitors: [] };

    const visitorIds = [...new Set(visits.map((v) => v.visitorId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: visitorIds } },
      select: { id: true, displayName: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.displayName] as const));

    const petRows = await this.prisma.pet.findMany({
      where: { id: { in: visits.map((v) => v.petId) } },
      include: { species: { select: { id: true, name: true } } },
    });
    const petById = new Map(petRows.map((p) => [p.id, p] as const));

    const visitors: ActiveVisitor[] = visits.map((v) => {
      const petRow = petById.get(v.petId);
      const pet: PetIdentity = petRow
        ? {
            petId: petRow.id,
            nickname: petRow.nickname,
            speciesName: petRow.species.name,
            speciesId: petRow.species.id,
            spriteRef: petRow.species.id || 'default',
          }
        : { petId: v.petId, nickname: '—', speciesName: '—', speciesId: 'default', spriteRef: 'default' };
      return {
        visitorId: v.visitorId,
        visitorName: nameById.get(v.visitorId) ?? '—',
        pet,
        startedAt: v.startedAt,
      };
    });

    return { visitors };
  }


  /**
   * Cleanup periódico: finaliza las visitas activas con más de 15 min y emite `habitat:visitor_left`
   * para cada una. Protegido contra solapamientos y relleno de errores (no debe tumbar el servicio).
   */
  async cleanupStaleVisits(): Promise<void> {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      const cutoff = new Date(Date.now() - VISIT_MAX_AGE_MS);
      const stale = await this.prisma.habitatVisit.findMany({
        where: { status: 'active', startedAt: { lt: cutoff } },
      });
      if (stale.length === 0) return;

      const endedAt = new Date();
      await Promise.all(
        stale.map((v) =>
          this.prisma.habitatVisit.update({ where: { id: v.id }, data: { status: 'ended', endedAt } }),
        ),
      );

      if (this.realtime) {
        const ids = [...new Set(stale.map((v) => v.visitorId))];
        const users = await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, displayName: true },
        });
        const nameById = new Map(users.map((u) => [u.id, u.displayName] as const));
        for (const v of stale) {
          this.realtime.emitToUser(v.ownerId, 'habitat:visitor_left', {
            visitorId: v.visitorId,
            visitorName: nameById.get(v.visitorId) ?? '—',
          });
        }
      }

      this.logger.debug(`Cleanup: ${stale.length} visitas en vivo marcadas como finalizadas`);
    } catch (err) {
      this.logger.warn(`Error en el cleanup de visitas en vivo: ${(err as Error)?.message}`);
    } finally {
      this.cleaning = false;
    }
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  /** Pet activo del usuario: el más antiguo (primero por createdAt), como `summarizeMany`. */
  private async resolvePetIdentity(userId: string): Promise<PetIdentity | null> {
    const pet = await this.prisma.pet.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { species: { select: { id: true, name: true } } },
    });
    if (!pet) return null;
    return {
      petId: pet.id,
      nickname: pet.nickname,
      speciesName: pet.species.name,
      speciesId: pet.species.id,
      spriteRef: pet.species.id || 'default',
    };
  }

  private async resolveName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    return user?.displayName ?? '—';
  }
}
