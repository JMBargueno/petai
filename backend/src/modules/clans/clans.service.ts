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
import {
  ASSIGNABLE_CLAN_ROLES,
  CLAN_ROLE_LABEL,
  ClanRole,
  hasClanRank,
  normalizeClanRole,
  outranks,
} from './clan-roles';

/**
 * ClansService — gestión de clanes con XP compartida y presencia en línea.
 *
 * Cada usuario pertenece a UN solo clan activo (garantizado por `ClanMembership.userId` único).
 * Los userIds son strings planos (patrón `CoopFriendship`), sin relación a `User` en Prisma: se
 * resuelven los nombres con `user.findMany` por separado. La presencia por miembro se consulta a
 * `PresenceService.hasActiveDevices`.
 *
 * Rangos (lore: Nexo de Resonancia, ver `clan-roles.ts`): creator (Forjador) > admin (Guardián) >
 * moderator (Vigía) > member (Hermano). Regla general: solo se actúa sobre alguien de rango
 * estrictamente inferior, y solo se asignan rangos por debajo del propio.
 */
export interface ClanMember {
  userId: string;
  displayName: string;
  role: ClanRole;
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
        data: { clanId: created.id, userId: actorId, role: 'creator' },
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
   * Lista de miembros del clan `clanId` (resumen completo con presencia). 404/403 si el actor no
   * es miembro de ese clan.
   */
  async getMembers(actorId: string, clanId: string): Promise<ClanSummary> {
    await this.requireMembership(actorId, clanId);
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
   * El actor abandona su clan. El Forjador no puede salir si quedan otros miembros (400): antes
   * debe ceder la Forja. Si es el último miembro, el clan se disuelve (se borra).
   */
  async leaveClan(actorId: string): Promise<{ success: boolean; message: string }> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { userId: actorId } });
    if (!membership) throw new NotFoundException('No perteneces a ningún clan');

    const clan = await this.prisma.clan.findUnique({ where: { id: membership.clanId } });
    if (!clan) throw new NotFoundException('Clan no encontrado');

    const memberCount = await this.prisma.clanMembership.count({ where: { clanId: clan.id } });

    const isCreator = clan.leaderId === actorId || normalizeClanRole(membership.role) === 'creator';
    if (isCreator && memberCount > 1) {
      throw new BadRequestException(
        'El Forjador no puede abandonar el clan mientras haya otros miembros: cede antes la Forja',
      );
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
   * Un Vigía o superior invita a un usuario a unirse directamente al clan. 403 si no tiene rango;
   * 400 si el destinatario ya pertenece a un clan.
   */
  async inviteMember(
    actorId: string,
    clanId: string,
    input: { userId?: string; email?: string },
  ): Promise<ClanSummary> {
    await this.requireRank(actorId, clanId, 'moderator', 'invitar miembros');
    const clan = await this.prisma.clan.findUnique({ where: { id: clanId } });
    if (!clan) throw new NotFoundException('Clan no encontrado');

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
    this.logger.debug(`${actorId} invitó a ${targetUserId} al clan ${clan.tag}`);
    return this.summaryForClan(clan.id);
  }

  // ── Gestión del Nexo (rangos) ───────────────────────────────────────────────

  /**
   * Expulsa a `targetUserId` del clan. Vigía o superior, y solo sobre rangos estrictamente
   * inferiores (un Vigía expulsa Hermanos; un Guardián, Vigías y Hermanos). Emite
   * `clan:member_kicked` a los miembros restantes y al expulsado.
   */
  async kickMember(actorId: string, clanId: string, targetUserId: string): Promise<ClanSummary> {
    const actor = await this.requireRank(actorId, clanId, 'moderator', 'expulsar miembros');
    if (targetUserId === actorId) throw new BadRequestException('No puedes expulsarte a ti mismo: usa abandonar');
    const target = await this.requireTarget(clanId, targetUserId);
    if (!outranks(actor.role, target.role)) {
      throw new ForbiddenException(`No puedes expulsar a un ${CLAN_ROLE_LABEL[normalizeClanRole(target.role)]}`);
    }

    await this.prisma.clanMembership.delete({ where: { id: target.id } });
    const payload = { clanId, userId: targetUserId, by: actorId };
    this.emitToMembers([...(await this.memberIds(clanId)), targetUserId], 'clan:member_kicked', payload);
    this.logger.debug(`${actorId} expulsó a ${targetUserId} del clan ${clanId}`);
    return this.summaryForClan(clanId);
  }

  /**
   * Cambia el rango de `targetUserId` a `role` (admin | moderator | member). Guardián o superior;
   * el actor debe superar tanto el rango actual del objetivo como el nuevo (un Guardián nombra o
   * retira Vigías; solo el Forjador nombra Guardianes). El rango de Forjador solo se cede con
   * `transferCreator`. Emite `clan:role_changed` a los miembros.
   */
  async setMemberRole(
    actorId: string,
    clanId: string,
    targetUserId: string,
    role: string | undefined,
  ): Promise<ClanSummary> {
    if (!role || !(ASSIGNABLE_CLAN_ROLES as readonly string[]).includes(role)) {
      throw new BadRequestException(`Rango no válido: usa ${ASSIGNABLE_CLAN_ROLES.join(' | ')}`);
    }
    const newRole = role as ClanRole;
    const actor = await this.requireRank(actorId, clanId, 'admin', 'cambiar rangos');
    if (targetUserId === actorId) throw new BadRequestException('No puedes cambiar tu propio rango');
    const target = await this.requireTarget(clanId, targetUserId);
    if (!outranks(actor.role, target.role) || !outranks(actor.role, newRole)) {
      throw new ForbiddenException(`No puedes otorgar ni retirar el rango de ${CLAN_ROLE_LABEL[newRole]}`);
    }
    if (normalizeClanRole(target.role) === newRole) return this.summaryForClan(clanId);

    await this.prisma.clanMembership.update({ where: { id: target.id }, data: { role: newRole } });
    this.emitToMembers(await this.memberIds(clanId), 'clan:role_changed', {
      clanId,
      userId: targetUserId,
      role: newRole,
      by: actorId,
    });
    this.logger.debug(`${actorId} cambió el rango de ${targetUserId} a ${newRole} en el clan ${clanId}`);
    return this.summaryForClan(clanId);
  }

  /**
   * El Forjador cede la Forja a otro miembro: el objetivo pasa a `creator` (y a `Clan.leaderId`) y
   * el antiguo Forjador queda como Guardián. Emite `clan:role_changed` por ambos.
   */
  async transferCreator(actorId: string, clanId: string, targetUserId: string | undefined): Promise<ClanSummary> {
    if (!targetUserId) throw new BadRequestException('Indica el userId del nuevo Forjador');
    const actor = await this.requireRank(actorId, clanId, 'creator', 'ceder la Forja');
    if (targetUserId === actorId) throw new BadRequestException('Ya eres el Forjador de este clan');
    const target = await this.requireTarget(clanId, targetUserId);

    await this.prisma.$transaction(async (tx) => {
      await tx.clanMembership.update({ where: { id: target.id }, data: { role: 'creator' } });
      await tx.clanMembership.update({ where: { id: actor.id }, data: { role: 'admin' } });
      await tx.clan.update({ where: { id: clanId }, data: { leaderId: targetUserId } });
    });

    const members = await this.memberIds(clanId);
    this.emitToMembers(members, 'clan:role_changed', { clanId, userId: targetUserId, role: 'creator', by: actorId });
    this.emitToMembers(members, 'clan:role_changed', { clanId, userId: actorId, role: 'admin', by: actorId });
    this.logger.debug(`${actorId} cedió la Forja del clan ${clanId} a ${targetUserId}`);
    return this.summaryForClan(clanId);
  }

  /** Edita nombre y/o descripción del clan (Guardián o superior). La etiqueta no se puede cambiar. */
  async updateClan(
    actorId: string,
    clanId: string,
    input: { name?: string; description?: string | null },
  ): Promise<ClanSummary> {
    await this.requireRank(actorId, clanId, 'admin', 'editar el clan');
    const data: { name?: string; description?: string | null } = {};
    if (input?.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new BadRequestException('El nombre del clan no puede estar vacío');
      if (name.length > 40) throw new BadRequestException('El nombre del clan no puede superar los 40 caracteres');
      data.name = name;
    }
    if (input?.description !== undefined) {
      const description = input.description?.trim() || null;
      if (description && description.length > 300) {
        throw new BadRequestException('La descripción no puede superar los 300 caracteres');
      }
      data.description = description;
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('Indica name o description');

    await this.prisma.clan.update({ where: { id: clanId }, data });
    this.logger.debug(`${actorId} editó el clan ${clanId}`);
    return this.summaryForClan(clanId);
  }

  /**
   * El Forjador deshace el Nexo: borra el clan (membresías, chat y metas caen en cascada). Emite
   * `clan:disbanded` a todos los que eran miembros.
   */
  async disbandClan(actorId: string, clanId: string): Promise<{ success: boolean; message: string }> {
    await this.requireRank(actorId, clanId, 'creator', 'disolver el clan');
    const members = await this.memberIds(clanId);
    await this.prisma.clan.delete({ where: { id: clanId } });
    this.emitToMembers(members, 'clan:disbanded', { clanId, by: actorId });
    this.logger.debug(`${actorId} disolvió el clan ${clanId}`);
    return { success: true, message: 'El Nexo se ha deshecho y ha vuelto al Éter' };
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

  /**
   * Borra un mensaje del chat. Lo puede borrar su autor o un Vigía o superior. 404 si no existe en
   * este clan. Emite `clan:message_deleted` a los miembros.
   */
  async deleteMessage(actorId: string, clanId: string, messageId: string): Promise<{ success: boolean }> {
    const actor = await this.requireMembership(actorId, clanId);
    const message = await this.prisma.clanMessage.findFirst({ where: { id: messageId, clanId } });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    if (message.userId !== actorId && !hasClanRank(actor.role, 'moderator')) {
      throw new ForbiddenException('Solo un Vigía o superior puede borrar mensajes de otros');
    }

    await this.prisma.clanMessage.delete({ where: { id: message.id } });
    this.emitToMembers(await this.memberIds(clanId), 'clan:message_deleted', { clanId, id: message.id, by: actorId });
    this.logger.debug(`Mensaje ${messageId} borrado del clan ${clanId} por ${actorId}`);
    return { success: true };
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

  /** Elimina una meta (Vigía o superior). 403 si no tiene rango; 404 si no existe. */
  async deleteGoal(actorId: string, clanId: string, goalId: string): Promise<{ success: boolean }> {
    await this.requireRank(actorId, clanId, 'moderator', 'eliminar metas');

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
    await this.requireMembership(actorId, clanId);
  }

  /** Como `assertMembership`, pero devuelve la membresía del actor (con su rango). */
  private async requireMembership(actorId: string, clanId: string): Promise<{ id: string; role: string }> {
    const membership = await this.prisma.clanMembership.findUnique({ where: { userId: actorId } });
    if (!membership) throw new NotFoundException('No perteneces a ningún clan');
    if (membership.clanId !== clanId) throw new ForbiddenException('No eres miembro de este clan');
    return membership;
  }

  /** Membresía del actor en `clanId` con al menos el rango `min`; 403 si no lo alcanza. */
  private async requireRank(
    actorId: string,
    clanId: string,
    min: ClanRole,
    action: string,
  ): Promise<{ id: string; role: string }> {
    const membership = await this.requireMembership(actorId, clanId);
    if (!hasClanRank(membership.role, min)) {
      const who = min === 'creator' ? 'el Forjador' : `un ${CLAN_ROLE_LABEL[min]} o superior`;
      throw new ForbiddenException(`Solo ${who} puede ${action}`);
    }
    return membership;
  }

  /** Membresía de `targetUserId` en `clanId`; 404 si no pertenece a ese clan. */
  private async requireTarget(clanId: string, targetUserId: string): Promise<{ id: string; role: string }> {
    const target = await this.prisma.clanMembership.findUnique({ where: { userId: targetUserId } });
    if (!target || target.clanId !== clanId) throw new NotFoundException('Ese usuario no es miembro de este clan');
    return target;
  }

  private emitToMembers(userIds: string[], event: string, payload: unknown): void {
    if (!this.realtime) return;
    for (const userId of new Set(userIds)) this.realtime.emitToUser(userId, event, payload);
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
          role: normalizeClanRole(m.role),
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
