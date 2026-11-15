import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { parseOrBadRequest } from '../auth/dto/auth.schemas';
import { adjustBalanceSchema, assignRoleSchema, listUsersSchema } from './authz.schemas';
import { isRole, Role, ROLE_RANK } from './roles';

const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  coins: true,
  gems: true,
  accountXp: true,
  createdAt: true,
} as const;

/** Gestión de usuarios para el panel de administración (listado y asignación de roles). */
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async list(rawQuery: unknown) {
    const { page, pageSize, role, q } = parseOrBadRequest(listUsersSchema, rawQuery);
    const where = {
      ...(role ? { role } : {}),
      ...(q
        ? { OR: [{ email: { contains: q, mode: 'insensitive' as const } }, { displayName: { contains: q, mode: 'insensitive' as const } }] }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: ADMIN_USER_SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /**
   * Cambia el rol de un usuario. Reglas: no se cambia el rol propio, solo se gestiona a quien tenga
   * rango inferior (salvo superadmin, que gestiona a todos), no se concede un rango superior al propio
   * y nunca se deja el sistema sin superadmin. Cierra las sesiones del afectado y lo audita.
   */
  async assignRole(actor: { id: string; role: string }, targetId: string, raw: unknown) {
    const { role: newRole } = parseOrBadRequest(assignRoleSchema, raw);
    if (actor.id === targetId) throw new BadRequestException('No puedes cambiar tu propio rol');
    const actorRole: Role = isRole(actor.role) ? actor.role : 'user';

    const updated = await this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId }, select: { id: true, role: true } });
      if (!target) throw new NotFoundException('Usuario no encontrado');
      const oldRole: Role = isRole(target.role) ? target.role : 'user';

      if (actorRole !== 'superadmin') {
        if (ROLE_RANK[oldRole] >= ROLE_RANK[actorRole]) throw new ForbiddenException('No puedes gestionar a un usuario de rango igual o superior');
        if (ROLE_RANK[newRole] >= ROLE_RANK[actorRole]) throw new ForbiddenException('No puedes conceder un rango igual o superior al tuyo');
      }
      if (oldRole === newRole) return { user: await tx.user.findUniqueOrThrow({ where: { id: targetId }, select: ADMIN_USER_SELECT }), oldRole, changed: false };

      // Defensa en profundidad: hoy es inalcanzable por HTTP (solo un superadmin gestiona a otro y no a sí mismo).
      if (oldRole === 'superadmin') {
        const superadmins = await tx.user.count({ where: { role: 'superadmin' } });
        if (superadmins <= 1) throw new ConflictException('No se puede degradar al último superadmin');
      }

      const user = await tx.user.update({ where: { id: targetId }, data: { role: newRole }, select: ADMIN_USER_SELECT });
      await tx.auditLog.create({
        data: { userId: targetId, event: 'role_change', metadata: { from: oldRole, to: newRole, by: actor.id } },
      });
      return { user, oldRole, changed: true };
    });

    if (updated.changed) {
      // Las sesiones abiertas se cierran para que el cambio (sobre todo una degradación) no conviva con tokens viejos.
      await this.auth.logoutAll(targetId);
      this.logger.log(`Rol cambiado (usuario ${targetId}): ${updated.oldRole} → ${newRole} por ${actor.id}`);
    }
    return updated.user;
  }

  /** Fija el saldo de monedas y/o gemas de un usuario (valor absoluto) y lo audita con el saldo anterior y el nuevo. */
  async adjustBalance(actor: { id: string }, targetId: string, raw: unknown) {
    const { coins, gems } = parseOrBadRequest(adjustBalanceSchema, raw);

    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId }, select: { id: true, coins: true, gems: true } });
      if (!target) throw new NotFoundException('Usuario no encontrado');

      const to = { coins: coins ?? target.coins, gems: gems ?? target.gems };
      const from = { coins: target.coins, gems: target.gems };
      if (to.coins === from.coins && to.gems === from.gems) {
        return tx.user.findUniqueOrThrow({ where: { id: targetId }, select: ADMIN_USER_SELECT });
      }

      const user = await tx.user.update({ where: { id: targetId }, data: to, select: ADMIN_USER_SELECT });
      await tx.auditLog.create({
        data: { userId: targetId, event: 'balance_adjust', metadata: { from, to, by: actor.id } },
      });
      this.logger.log(`Saldo ajustado (usuario ${targetId}): ${JSON.stringify(from)} → ${JSON.stringify(to)} por ${actor.id}`);
      return user;
    });
  }
}
