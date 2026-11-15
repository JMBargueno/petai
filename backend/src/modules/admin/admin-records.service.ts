import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parseOrBadRequest } from '../auth/dto/auth.schemas';
import { listAuditSchema } from './admin.schemas';

/** Registro de auditoría paginado para el panel (solo lectura). Las mascotas viven en authz/admin-pets. */
@Injectable()
export class AdminRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAudit(rawQuery: unknown) {
    const { page, pageSize, event, userId } = parseOrBadRequest(listAuditSchema, rawQuery);
    const where: Prisma.AuditLogWhereInput = { ...(event ? { event } : {}), ...(userId ? { userId } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        select: { id: true, userId: true, event: true, ip: true, metadata: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    // AuditLog no tiene relación con User (sobrevive al borrado de la cuenta): el correo se resuelve aparte.
    const ids = [...new Set(rows.map((r) => r.userId))];
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }) : [];
    const emails = new Map(users.map((u) => [u.id, u.email]));
    const items = rows.map((r) => ({ ...r, userEmail: emails.get(r.userId) ?? null }));
    return { items, total, page, pageSize };
  }
}
