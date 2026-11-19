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
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CoopCareService } from './coop-care.service';
import { PetsService } from '../pets/pets.service';

/**
 * HabitatVisitService — "visita en vivo": el pet del visitante aparece en el habitat del dueño.
 *
 * - Start exige una amistad ACEPTADA (CoopCareService.checkFriendship) y usa el pet activo del
 *   actor (primero por createdAt, como `summarizeMany`).
 * - Se mantiene UNA única `HabitatVisit` activa por par (visitorId, ownerId).
 * - Emite en tiempo real al dueño `habitat:visitor_joined` / `habitat:visitor_left` vía
 *   `RealtimeGateway.emitToUser`.
 * - Cleanup: cada ~60s finaliza las visitas activas con más de 15 min y emite `visitor_left`.
 * - La visita puede llevar un mensaje corto opcional (≤140) que el dueño ve como bocadillo.
 * - Anti-spam: visitar gasta energía del pet, hay cooldown por amigo y límite diario. Repetir el
 *   start con una visita ya activa es idempotente (no re-notifica ni cobra).
 */
export interface PetIdentity {
  petId: string;
  nickname: string;
  speciesName: string;
  speciesId: string;
  spriteRef: string;
  /** Etapa evolutiva (baby, juvenile, adult, final): el anfitrión dibuja la forma correcta. */
  stage: string;
  /** Aspecto con el que el anfitrión lo dibuja en su sala. Solo apariencia: nada de su estado ni su memoria. */
  look?: PetLook;
}

export interface PetLook {
  palette: { primary: string; secondary: string; accent?: string };
  pattern: string | null;
  visualSeed: number;
  shiny: boolean;
  accessories: Record<string, string>;
}

/** Aspecto de una fila `Pet` (tolerante: una paleta o unas prendas mal guardadas no rompen la visita). */
export function lookOf(row: { palette?: unknown; patternId?: string | null; visualSeed?: number | null; shiny?: boolean | null; accessories?: unknown }): PetLook {
  const pal = (row.palette && typeof row.palette === 'object' ? row.palette : {}) as Record<string, unknown>;
  const color = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback);
  const accessories: Record<string, string> = {};
  if (row.accessories && typeof row.accessories === 'object') {
    for (const [slot, id] of Object.entries(row.accessories as Record<string, unknown>)) {
      if (typeof id === 'string' && /^[a-z0-9_-]{1,40}$/.test(id) && /^[a-z]{1,12}$/.test(slot)) accessories[slot] = id;
    }
  }
  return {
    palette: {
      primary: color(pal.primary, '#E25822'),
      secondary: color(pal.secondary, '#F3C544'),
      ...(typeof pal.accent === 'string' ? { accent: color(pal.accent, '#6D1600') } : {}),
    },
    pattern: row.patternId && row.patternId !== 'plain' ? row.patternId : null,
    visualSeed: typeof row.visualSeed === 'number' ? row.visualSeed : 1337,
    shiny: !!row.shiny,
    accessories,
  };
}

export interface ActiveVisitor {
  visitorId: string;
  visitorName: string;
  /** Nickname público del visitante (null si aún no lo ha elegido). */
  visitorHandle: string | null;
  pet: PetIdentity;
  /** Mensaje corto que trae el visitante (null si no dejó ninguno). */
  message: string | null;
  startedAt: Date;
}

const VISIT_MAX_AGE_MS = 15 * 60 * 1000; // 15 min
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60s
export const VISIT_MESSAGE_MAX = 140;
export const VISIT_ENERGY_COST = 10;
export const VISIT_COOLDOWN_MS = 10 * 60 * 1000; // 10 min por amigo
export const VISITS_DAILY_LIMIT = 10; // visitas iniciadas en 24 h (a cualquier amigo)
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class HabitatVisitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HabitatVisitService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;
  private cleaning = false;
  /** Última ranura de escena avisada de cada visita activa (id de visita → ranura). */
  private readonly sceneSlot = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly coopCare: CoopCareService,
    @Optional() private readonly realtime?: RealtimeGateway,
    /** Resuelve PetsService en runtime: importar PetsModule crearía un ciclo (Pets→Bonding→Realtime→Presence). */
    @Optional() private readonly moduleRef?: ModuleRef,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.logger.log('HabitatVisitService iniciado (cleanup de visitas en vivo activo)');
    this.cleanupTimer = setInterval(() => {
      void this.cleanupStaleVisits().then(() => this.tickScenes());
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  /**
   * Inicia la visita en vivo del actor al habitat de `ownerId`. Requiere amistad aceptada y un pet
   * activo del actor. Si ya hay una visita activa con ese dueño la devuelve tal cual (sin cobrar
   * ni re-emitir). Si no: valida sueño/energía, límite diario y cooldown por amigo, descuenta la
   * energía, crea la visita (con el mensaje opcional) y emite `habitat:visitor_joined`.
   */
  async startVisit(
    actorId: string,
    ownerId: string,
    rawMessage?: string | null,
  ): Promise<{ success: boolean; visit: ActiveVisitor; energy: number }> {
    if (!ownerId) throw new BadRequestException('Indica el ownerId del amigo');
    if (ownerId === actorId) throw new BadRequestException('No puedes visitar tu propio habitat');
    const message = this.normalizeMessage(rawMessage);

    const isFriend = await this.coopCare.checkFriendship(actorId, ownerId);
    if (!isFriend) throw new ForbiddenException('No tienes una amistad aceptada con el dueño del pet');

    const active = await this.resolveActivePet(actorId);
    if (!active) throw new NotFoundException('No tienes un pet activo para la visita');
    const { pet } = active;

    const { name: visitorName, handle: visitorHandle } = await this.resolveIdentity(actorId);

    // UNA sola visita activa por (visitorId, ownerId): si ya existe, la llamada es idempotente.
    const existing = await this.prisma.habitatVisit.findFirst({
      where: { visitorId: actorId, ownerId, status: 'active' },
    });
    if (existing) {
      return {
        success: true,
        visit: {
          visitorId: actorId,
          visitorName,
          visitorHandle,
          pet,
          message: existing.message ?? null,
          startedAt: existing.startedAt,
        },
        energy: active.energy,
      };
    }

    if (active.sleeping) throw new BadRequestException('Tu pockai está durmiendo');
    if (active.energy < VISIT_ENERGY_COST) {
      throw new BadRequestException('Tu pockai está demasiado cansado para ir de visita');
    }

    const now = Date.now();
    const visitsToday = await this.prisma.habitatVisit.count({
      where: { visitorId: actorId, startedAt: { gte: new Date(now - DAY_MS) } },
    });
    if (visitsToday >= VISITS_DAILY_LIMIT) {
      throw new BadRequestException('Límite diario de visitas alcanzado');
    }

    const last = await this.prisma.habitatVisit.findFirst({
      where: { visitorId: actorId, ownerId },
      orderBy: { startedAt: 'desc' },
    });
    if (last && now - last.startedAt.getTime() < VISIT_COOLDOWN_MS) {
      const mins = Math.max(1, Math.ceil((VISIT_COOLDOWN_MS - (now - last.startedAt.getTime())) / 60000));
      throw new BadRequestException(`Podrás volver a visitar a este amigo en ${mins} min`);
    }

    const energy = Math.max(0, active.energy - VISIT_ENERGY_COST);
    await this.prisma.pet.update({ where: { id: pet.petId }, data: { energy } });

    const startedAt = new Date(now);
    const created = await this.prisma.habitatVisit.create({
      data: { visitorId: actorId, ownerId, petId: pet.petId, status: 'active', startedAt, message },
    });
    if (created?.id) this.sceneSlot.set(created.id, 0);

    const visit: ActiveVisitor = { visitorId: actorId, visitorName, visitorHandle, pet, message, startedAt };
    if (this.realtime) this.realtime.emitToUser(ownerId, 'habitat:visitor_joined', visit);
    // Estadística de visitas (logros "Visitante"/"Trotamundos").
    // La mente necesita saber qué mascotas se han visto: sin los ids, cada lado lo adivinaría por su cuenta
    const hostPetId = (await this.resolveActivePet(ownerId).catch(() => null))?.pet.petId;
    this.events?.emit('habitat:visited', { userId: actorId, ownerId, visitorPetId: pet.petId, hostPetId });

    this.logger.debug(`Visita en vivo: ${actorId} → habitat de ${ownerId}`);
    return { success: true, visit, energy };
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
      const { name: visitorName } = await this.resolveIdentity(actorId);
      for (const v of visits) {
        this.realtime.emitToUser(v.ownerId, 'habitat:visitor_left', {
          visitorId: actorId,
          visitorName,
        });
      }
    }
    for (const v of visits) this.visitEnded(v);

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
      select: { id: true, displayName: true, handle: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.displayName] as const));
    const handleById = new Map(users.map((u) => [u.id, u.handle ?? null] as const));

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
            stage: petRow.stage ?? 'baby',
            look: lookOf(petRow),
          }
        : { petId: v.petId, nickname: '—', speciesName: '—', speciesId: 'default', spriteRef: 'default', stage: 'baby' };
      return {
        visitorId: v.visitorId,
        visitorName: nameById.get(v.visitorId) ?? '—',
        visitorHandle: handleById.get(v.visitorId) ?? null,
        pet,
        message: v.message ?? null,
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
      for (const v of stale) this.visitEnded(v);

      this.logger.debug(`Cleanup: ${stale.length} visitas en vivo marcadas como finalizadas`);
    } catch (err) {
      this.logger.warn(`Error en el cleanup de visitas en vivo: ${(err as Error)?.message}`);
    } finally {
      this.cleaning = false;
    }
  }

  /**
   * Escenas de las visitas en curso. Cada `sceneSlotMs` de visita, avisa a la mente
   * (`habitat:visit_tick`) para que resuelva la siguiente escena de la pareja. La mente contesta
   * con `habitat:scene_resolved` y aquí se reenvía al anfitrión.
   */
  async tickScenes(now = Date.now()): Promise<void> {
    try {
      const active = await this.prisma.habitatVisit.findMany({ where: { status: 'active' } });
      const alive = new Set(active.map((v) => v.id));
      for (const id of [...this.sceneSlot.keys()]) if (!alive.has(id)) this.sceneSlot.delete(id);
      for (const v of active) {
        const slot = Math.floor((now - v.startedAt.getTime()) / this.sceneSlotMs);
        // Tras un reinicio no se sabe qué se avisó: se parte de la ranura actual, sin repetir escenas
        const last = this.sceneSlot.get(v.id);
        if (last === undefined) {
          this.sceneSlot.set(v.id, slot);
          continue;
        }
        if (slot <= last) continue;
        this.sceneSlot.set(v.id, slot);
        this.events?.emit('habitat:visit_tick', { userId: v.visitorId, ownerId: v.ownerId, visitorPetId: v.petId, slot });
      }
    } catch (err) {
      this.logger.warn(`Error avisando de las escenas de visita: ${(err as Error)?.message}`);
    }
  }

  /** Duración de una ranura de escena (la fija la mente con su configuración; por defecto, 4 min). */
  sceneSlotMs = 4 * 60 * 1000;

  /** La mente ha resuelto la escena de una pareja: el anfitrión la ve en su sala. */
  @OnEvent('habitat:scene_resolved')
  onSceneResolved(p: { ownerId: string; visitorId: string; scene: Record<string, unknown>; slotMs?: number }) {
    if (typeof p.slotMs === 'number' && p.slotMs >= 30_000) this.sceneSlotMs = p.slotMs;
    this.realtime?.emitToUser(p.ownerId, 'habitat:scene', { visitorId: p.visitorId, ...p.scene });
  }

  private visitEnded(v: { id: string; visitorId: string; ownerId: string; petId: string; startedAt: Date }) {
    this.sceneSlot.delete(v.id);
    this.events?.emit('habitat:visit_ended', {
      visitId: v.id,
      userId: v.visitorId,
      ownerId: v.ownerId,
      visitorPetId: v.petId,
      durationMs: Date.now() - v.startedAt.getTime(),
    });
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  /** Mensaje opcional: recortado, vacío → null, máx. VISIT_MESSAGE_MAX caracteres. */
  private normalizeMessage(raw?: string | null): string | null {
    if (raw === undefined || raw === null) return null;
    if (typeof raw !== 'string') throw new BadRequestException('El mensaje debe ser texto');
    const text = raw.trim();
    if (!text) return null;
    if (text.length > VISIT_MESSAGE_MAX) {
      throw new BadRequestException(`El mensaje no puede superar los ${VISIT_MESSAGE_MAX} caracteres`);
    }
    return text;
  }

  /**
   * Pet activo del usuario: el elegido (`User.activePetId`) o, si no hay, el más antiguo. La energía
   * y el sueño se leen tras el tick perezoso de PetsService cuando está disponible.
   */
  private async resolveActivePet(
    userId: string,
  ): Promise<{ pet: PetIdentity; energy: number; sleeping: boolean } | null> {
    // El que eligió el jugador (`User.activePetId`) si sigue siendo suyo; si no, el más antiguo.
    const include = { species: { select: { id: true, name: true } } };
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { activePetId: true } });
    const chosen = user?.activePetId
      ? await this.prisma.pet.findFirst({ where: { id: user.activePetId, userId }, include })
      : null;
    const row =
      chosen ??
      (await this.prisma.pet.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        include,
      }));
    if (!row) return null;
    let energy = row.energy ?? 0;
    let sleeping = !!row.sleeping;
    const pets = this.petsService();
    if (pets) {
      try {
        const ticked = await pets.getPetById(userId, row.id);
        energy = ticked.energy;
        sleeping = ticked.sleeping;
      } catch (err) {
        this.logger.warn(`Visita: sin tick del pet ${row.id}: ${(err as Error)?.message}`);
      }
    }
    return {
      pet: {
        petId: row.id,
        nickname: row.nickname,
        speciesName: row.species.name,
        speciesId: row.species.id,
        spriteRef: row.species.id || 'default',
        stage: row.stage ?? 'baby',
        look: lookOf(row),
      },
      energy,
      sleeping,
    };
  }

  private petsService(): PetsService | null {
    try {
      return this.moduleRef?.get(PetsService, { strict: false }) ?? null;
    } catch {
      return null;
    }
  }

  private async resolveIdentity(userId: string): Promise<{ name: string; handle: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, handle: true },
    });
    return { name: user?.displayName ?? '—', handle: user?.handle ?? null };
  }
}
