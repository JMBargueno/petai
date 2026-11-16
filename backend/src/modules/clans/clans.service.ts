import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { PresenceService } from '../presence/presence.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/**
 * ClansService — gestión de clanes con XP compartida y presencia en línea.
 *
 * Cada usuario pertenece a UN solo clan activo (garantizado por `ClanMembership.userId` único).
 * Los userIds son strings planos (patrón `CoopFriendship`), sin relación a `User` en Prisma: se
 * resuelven los nombres con `user.findMany` por separado. La presencia por miembro se consulta a
 * `PresenceService.hasActiveDevices`.
 */
export interface ClanMember {
  userId: string;
  displayName: string;
  role: string; // leader | member
  isOnline: boolean;
  joinedAt: Date;
}

export interface ClanLeader {
  userId: string;
  displayName: string;
}

export interface ClanSummary {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  leaderId: string;
  xp: number;
  memberCount: number;
  leader: ClanLeader;
  members: ClanMember[];
}

/** Forma mínima de la fila `Clan` que necesita el resumen. */
type ClanRow = {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  leaderId: string;
  xp: number;
};

/** Forma mínima de la fila `ClanMembership` que necesita el resumen. */
type MembershipRow = {
  userId: string;
  role: string;
  joinedAt: Date;
};

export interface ClanChatMessage {
  id: string;
  clanId: string;
  userId: string;
  senderName: string;
  body: string;
  createdAt: Date;
}

export interface ClanGoalDto {
  id: string;
  clanId: string;
  title: string;
  description: string | null;
  metric: string;
  target: number;
  progress: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

@Injectable()
export class ClansService {
  private readonly logger = new Logger(ClansService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
    private readonly events: EventEmitter2,
    @Optional() private readonly realtime?: RealtimeGateway,
  ) {}

  /**
   * Crea un clan cuyo líder es el actor. 400 si el actor ya pertenece a un clan o si la etiqueta
   * ya está en uso.
   */
  async createClan(actorId: string, input: { name?: string; tag?: string; description?: string }): Promise<ClanSummary> {
    const name = input?.name?.trim();
    const tag = input?.tag?.trim();
    if (!name || !tag) throw new BadRequestException('El nombre y la etiqueta del clan son obligatorios');

    await this.assertNoActiveClan(actorId);

    const existingTag = await this.prisma.clan.findUnique({ where: { tag } });
    if (existingTag) throw new BadRequestException('Esta etiqueta ya está en uso por otro clan');

    const [clan, membership] = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clan.create({
        data: {
          name,
          tag,
          description: input.description?.trim() || null,
          leaderId: actorId,
        },
      });
      const member = await tx.clanMembership.create({
        data: { clanId: created.id, userId: actorId, role: 'leader' },
      });
      return [created, member];
    });

    this.logger.debug(`Clan ${tag} creado por ${actorId} (${clan.id})`);
    return this.buildSummary(clan as ClanRow, [membership as unknown as MembershipRow]);
  }

  /** El clan del actor, o 404 si no pertenece a ninguno. */
  async getMyClan(actorId: string): Promise<ClanSummary> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { userId: actorId } });
    if (!membership) throw new NotFoundException('No perteneces a ningún clan');
    return this.summaryForClan(membership.clanId);
  }

  /**
   * Lista de miembros del clan `clanId` (resumen completo con presencia). 404 si no existe.
   */
  async getMembers(clanId: string): Promise<ClanSummary> {
    return this.summaryForClan(clanId);
  }

  /**
   * Se une al actor a un clan existente por su etiqueta. 404 si no existe; 400 si ya está en un clan.
   */
  async joinClan(actorId: string, input: { tag?: string }): Promise<ClanSummary> {
    const tag = input?.tag?.trim();
    if (!tag) throw new BadRequestException('Indica la etiqueta (tag) del clan');

    await this.assertNoActiveClan(actorId);

    const clan = await this.prisma.clan.findUnique({ where: { tag } });
    if (!clan) throw new NotFoundException('Clan no encontrado');

    await this.prisma.clanMembership.create({
      data: { clanId: clan.id, userId: actorId, role: 'member' },
    });
    this.logger.debug(`Usuario ${actorId} unido al clan ${tag} (${clan.id})`);
    return this.summaryForClan(clan.id);
  }

  /**
   * El actor abandona su clan. El líder no puede salir si quedan otros miembros (400). Si es el
   * último miembro, el clan se disuelve (se borra).
   */
  async leaveClan(actorId: string): Promise<{ success: boolean; message: string }> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { userId: actorId } });
    if (!membership) throw new NotFoundException('No perteneces a ningún clan');

    const clan = await this.prisma.clan.findUnique({ where: { id: membership.clanId } });
    if (!clan) throw new NotFoundException('Clan no encontrado');

    const memberCount = await this.prisma.clanMembership.count({ where: { clanId: clan.id } });

    if (clan.leaderId === actorId && memberCount > 1) {
      throw new BadRequestException('El líder no puede abandonar el clan mientras haya otros miembros');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.clanMembership.delete({ where: { id: membership.id } });
      if (memberCount <= 1) await tx.clan.delete({ where: { id: clan.id } });
    });

    const message =
      memberCount <= 1 ? 'Has abandonado el clan y este se ha disuelto' : 'Has abandonado el clan';
    this.logger.debug(`Usuario ${actorId} salió del clan ${clan.tag}`);
    return { success: true, message };
  }

  /**
   * El líder invita a un usuario a unirse directamente al clan. 403 si no es líder; 400 si el
   * destinatario ya pertenece a un clan.
   */
  async inviteMember(
    actorId: string,
    clanId: string,
    input: { userId?: string; email?: string },
  ): Promise<ClanSummary> {
    const clan = await this.prisma.clan.findUnique({ where: { id: clanId } });
    if (!clan) throw new NotFoundException('Clan no encontrado');
    if (clan.leaderId !== actorId) throw new ForbiddenException('Solo el líder del clan puede invitar miembros');

    let targetUserId = input?.userId;
    if (!targetUserId && input?.email) {
      const byEmail = await this.prisma.user.findUnique({
        where: { email: input.email.trim().toLowerCase() },
        select: { id: true },
      });
      if (!byEmail) throw new NotFoundException('Usuario no encontrado');
      targetUserId = byEmail.id;
    }
    if (!targetUserId) throw new BadRequestException('Indica userId o email');

    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!target) throw new NotFoundException('Usuario no encontrado');

    const alreadyInClan = await this.prisma.clanMembership.findUnique({ where: { userId: targetUserId } });
    if (alreadyInClan) throw new BadRequestException('Ese usuario ya pertenece a un clan');

    await this.prisma.clanMembership.create({
      data: { clanId: clan.id, userId: targetUserId, role: 'member' },
    });
    this.logger.debug(`Líder ${actorId} invitó a ${targetUserId} al clan ${clan.tag}`);
    return this.summaryForClan(clan.id);
  }


  // ── Chat ────────────────────────────────────────────────────────────────────

  /**
   * El actor envía un mensaje al chat de su clan. 404/403 si no es miembro; 400 si el cuerpo está
   * vacío o supera 500 caracteres. Emite `clan:message` a cada miembro por socket.
   */
  async sendMessage(actorId: string, clanId: string, body: string): Promise<ClanChatMessage> {
    await this.assertMembership(actorId, clanId);
    const text = body?.trim();
    if (!text) throw new BadRequestException('El mensaje no puede estar vacío');
    if (text.length > 500) throw new BadRequestException('El mensaje no puede superar los 500 caracteres');

    const created = await this.prisma.clanMessage.create({
      data: { clanId, userId: actorId, body: text },
    });

    const [sender] = await this.prisma.user.findMany({
      where: { id: actorId },
      select: { id: true, displayName: true },
    });
    const senderName = sender?.displayName ?? '—';

    const message: ClanChatMessage = {
      id: created.id,
      clanId,
      userId: actorId,
      senderName,
      body: text,
      createdAt: created.createdAt,
    };

    const members = await this.memberIds(clanId);
    if (this.realtime) {
      for (const userId of members) {
        this.realtime.emitToUser(userId, 'clan:message', message);
      }
    }

    this.logger.debug(`Mensaje enviado por ${actorId} al clan ${clanId}`);
    return message;
  }

  /**
   * Historial reciente del chat del clan, más reciente primero. `limit` (≤50) y cursor `before`
   * (ISO datetime) para paginación. 404/403 si el actor no es miembro.
   */
  async getMessages(
    actorId: string,
    clanId: string,
    opts?: { limit?: number; before?: string },
  ): Promise<ClanChatMessage[]> {
    await this.assertMembership(actorId, clanId);
    const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);

    const rows = await this.prisma.clanMessage.findMany({
      where: {
        clanId,
        ...(opts?.before ? { createdAt: { lt: new Date(opts.before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.displayName] as const));

    return rows.map((r) => ({
      id: r.id,
      clanId,
      userId: r.userId,
      senderName: nameById.get(r.userId) ?? '—',
      body: r.body,
      createdAt: r.createdAt,
    }));
  }

  // ── Metas / objetivos ───────────────────────────────────────────────────────

  /** Crea una meta compartida en el clan. 404/403 si no es miembro; 400 si falta título o target. */
  async createGoal(
    actorId: string,
    clanId: string,
    input: { title?: string; description?: string; metric?: string; target?: number },
  ): Promise<ClanGoalDto> {
    await this.assertMembership(actorId, clanId);
    const title = input?.title?.trim();
    const target = input?.target;
    if (!title) throw new BadRequestException('El título de la meta es obligatorio');
    if (!target || target <= 0) throw new BadRequestException('La meta debe tener un objetivo mayor que cero');

    const created = await this.prisma.clanGoal.create({
      data: {
        clanId,
        title,
        description: input?.description?.trim() || null,
        metric: input?.metric?.trim() || 'generic',
        target,
      },
    });
    this.logger.debug(`Meta "${title}" creada en el clan ${clanId} por ${actorId}`);
    return this.toGoalDto(created, clanId);
  }

  /** Lista de metas del clan: activas primero, luego por progreso descendente. */
  async getGoals(actorId: string, clanId: string): Promise<ClanGoalDto[]> {
    await this.assertMembership(actorId, clanId);
    const rows = await this.prisma.clanGoal.findMany({
      where: { clanId },
      orderBy: [{ status: 'asc' }, { progress: 'desc' }],
    });
    return rows.map((r) => this.toGoalDto(r, clanId));
  }

  /**
   * Añade `amount` al progreso de una meta activa. Al alcanzar el objetivo, la marca `completed`
   * + `completedAt`. Emite `clan:goal_progress` (siempre) y `clan:goal_completed` (al completarse)
   * a cada miembro.
   */
  async addGoalProgress(
    actorId: string,
    clanId: string,
    goalId: string,
    amount: number,
  ): Promise<ClanGoalDto> {
    await this.assertMembership(actorId, clanId);
    const goal = await this.prisma.clanGoal.findFirst({ where: { id: goalId, clanId } });
    if (!goal) throw new NotFoundException('Meta no encontrada');
    if (goal.status !== 'active') throw new BadRequestException('La meta ya está completada');

    const increment = Math.max(0, Math.round(amount ?? 0));
    const newProgress = Math.max(0, goal.progress + increment);
    const completed = newProgress >= goal.target;

    const updated = await this.prisma.clanGoal.update({
      where: { id: goal.id },
      data: completed
        ? { progress: newProgress, status: 'completed', completedAt: new Date() }
        : { progress: newProgress },
    });
    const dto = this.toGoalDto(updated, clanId);

    const members = await this.memberIds(clanId);
    if (this.realtime) {
      for (const userId of members) {
        this.realtime.emitToUser(userId, 'clan:goal_progress', dto);
        if (completed) this.realtime.emitToUser(userId, 'clan:goal_completed', dto);
      }
    }
    this.logger.debug(
      `Progreso de la meta ${goal.id} del clan ${clanId}: ${goal.progress} → ${newProgress}${completed ? ' (completada)' : ''}`,
    );
    return dto;
  }

  /** Elimina una meta (solo el líder). 403 si no lo es; 404 si no existe. */
  async deleteGoal(actorId: string, clanId: string, goalId: string): Promise<{ success: boolean }> {
    await this.assertMembership(actorId, clanId);
    const clan = await this.prisma.clan.findUnique({ where: { id: clanId } });
    if (!clan) throw new NotFoundException('Clan no encontrado');
    if (clan.leaderId !== actorId) throw new ForbiddenException('Solo el líder del clan puede eliminar metas');

    const goal = await this.prisma.clanGoal.findFirst({ where: { id: goalId, clanId } });
    if (!goal) throw new NotFoundException('Meta no encontrada');

    await this.prisma.clanGoal.delete({ where: { id: goal.id } });
    this.logger.debug(`Meta ${goalId} eliminada del clan ${clanId} por ${actorId}`);
    return { success: true };
  }




  // ── Actividad automática por evento ────────────────────────────────────────

  /**
   * Escucha `clan:activity` (emitida p. ej. por `CoopCareService.processVisit`). Suma la XP al
   * clan y avanza las metas activas cuya métrica corresponda (xp | visits); al alcanzar el
   * objetivo las marca `completed` y emite `clan:goal_completed` a los miembros.
   *
   * Mejor esfuerzo: cualquier error se traga para NUNCA devolverlo al emisor (no debe romper la
   * acción que disparó el evento).
   */
  @OnEvent('clan:activity')
  async onClanActivity(evt: { userId: string; xp?: number; visits?: number }): Promise<void> {
    try {
      const membership = await this.prisma.clanMembership.findUnique({ where: { userId: evt.userId } });
      if (!membership) return;

      const xp = Math.max(0, evt.xp ?? 0);
      const visits = Math.max(0, evt.visits ?? 0);

      if (xp > 0) {
        await this.prisma.clan.update({
          where: { id: membership.clanId },
          data: { xp: { increment: xp } },
        });
      }

      const goals = await this.prisma.clanGoal.findMany({
        where: { clanId: membership.clanId, status: 'active' },
      });
      const completed: ClanGoalDto[] = [];
      for (const goal of goals) {
        let delta = 0;
        if (goal.metric === 'xp') delta += xp;
        else if (goal.metric === 'visits') delta += visits;
        if (delta <= 0) continue;

        const newProgress = Math.max(0, goal.progress + delta);
        if (newProgress < goal.target) {
          await this.prisma.clanGoal.update({ where: { id: goal.id }, data: { progress: newProgress } });
        } else {
          const updated = await this.prisma.clanGoal.update({
            where: { id: goal.id },
            data: { progress: newProgress, status: 'completed', completedAt: new Date() },
          });
          completed.push(this.toGoalDto(updated, membership.clanId));
        }
      }

      if (completed.length > 0) {
        const members = await this.memberIds(membership.clanId);
        if (this.realtime) {
          for (const userId of members) {
            for (const goal of completed) {
              this.realtime.emitToUser(userId, 'clan:goal_completed', goal);
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo procesar la actividad del clan del usuario ${evt?.userId}: ${(err as Error)?.message}`,
      );
    }
  }


  // ── Internos ──────────────────────────────────────────────────────────────

  private async assertNoActiveClan(userId: string): Promise<void> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { userId } });
    if (membership) throw new BadRequestException('Ya perteneces a un clan');
  }

  /**
   * Verifica que el actor es miembro del clan `clanId`. 404 si no pertenece a ningún clan; 403 si
   * pertenece a otro clan distinto al indicado.
   */
  private async assertMembership(actorId: string, clanId: string): Promise<void> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { userId: actorId } });
    if (!membership) throw new NotFoundException('No perteneces a ningún clan');
    if (membership.clanId !== clanId) throw new ForbiddenException('No eres miembro de este clan');
  }

  /** Lista de userIds de los miembros del clan `clanId` (para emitir por socket). */
  private async memberIds(clanId: string): Promise<string[]> {
    const memberships = await this.prisma.clanMembership.findMany({
      where: { clanId },
      select: { userId: true },
    });
    return memberships.map((m) => m.userId);
  }

  /** Convierte una fila `ClanGoal` al DTO público. */
  private toGoalDto(row: any, clanId: string): ClanGoalDto {
    return {
      id: row.id,
      clanId: row.clanId ?? clanId,
      title: row.title,
      description: row.description ?? null,
      metric: row.metric,
      target: row.target,
      progress: row.progress,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt ?? null,
    };
  }

  private async summaryForClan(clanId: string): Promise<ClanSummary> {
    const clan = await this.prisma.clan.findUnique({ where: { id: clanId } });
    if (!clan) throw new NotFoundException('Clan no encontrado');
    const memberships = await this.prisma.clanMembership.findMany({ where: { clanId } });
    return this.buildSummary(clan as ClanRow, memberships as unknown as MembershipRow[]);
  }

  private async buildSummary(clan: ClanRow, memberships: MembershipRow[]): Promise<ClanSummary> {
    const userIds = memberships.map((m) => m.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.displayName] as const));

    const members: ClanMember[] = await Promise.all(
      memberships
        .slice()
        .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
        .map(async (m) => ({
          userId: m.userId,
          displayName: nameById.get(m.userId) ?? '—',
          role: m.role,
          isOnline: await this.presenceService.hasActiveDevices(m.userId),
          joinedAt: m.joinedAt,
        })),
    );

    return {
      id: clan.id,
      name: clan.name,
      tag: clan.tag,
      description: clan.description,
      leaderId: clan.leaderId,
      xp: clan.xp,
      memberCount: memberships.length,
      leader: { userId: clan.leaderId, displayName: nameById.get(clan.leaderId) ?? '—' },
      members,
    };
  }
}
