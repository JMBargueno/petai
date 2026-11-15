import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parseOrBadRequest } from '../auth/dto/auth.schemas';
import { listAuditSchema, listPetsSchema } from './admin.schemas';

/** Consultas paginadas de solo lectura para el panel: mascotas de jugadores y registro de auditoría. */
@Injectable()
export class AdminRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPets(rawQuery: unknown) {
    const { page, pageSize, q, speciesId, rarity } = parseOrBadRequest(listPetsSchema, rawQuery);
    const where: Prisma.PetWhereInput = {
      ...(speciesId ? { speciesId } : {}),
      ...(rarity ? { rarity } : {}),
      ...(q ? { OR: [{ nickname: { contains: q, mode: 'insensitive' } }, { user: { email: { contains: q, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.pet.findMany({
        where,
        select: {
          id: true,
          nickname: true,
          speciesId: true,
          rarity: true,
          level: true,
          stage: true,
          shiny: true,
          sick: true,
          createdAt: true,
          user: { select: { email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.pet.count({ where }),
    ]);
    const items = rows.map(({ user, ...pet }) => ({ ...pet, owner: user.email }));
    return { items, total, page, pageSize };
  }

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
