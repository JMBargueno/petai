import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { parseOrBadRequest } from '../auth/dto/auth.schemas';
import { createInvitesSchema, InviteStatus, listInvitesSchema, registrationSettingsSchema } from './invites.schemas';

/** Alfabeto sin caracteres ambiguos (sin 0/O, 1/I/L) para que el código se pueda dictar. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_GROUP = 4;
const SETTINGS_ID = 1;
const MAX_CODE_RETRIES = 5;

type Actor = { id: string };
type Tx = Prisma.TransactionClient;

const INVITE_SELECT = {
  id: true,
  code: true,
  maxUses: true,
  usedCount: true,
  expiresAt: true,
  revokedAt: true,
  note: true,
  createdAt: true,
  createdBy: { select: { id: true, email: true, displayName: true } },
} as const;

type InviteRow = Prisma.InviteCodeGetPayload<{ select: typeof INVITE_SELECT }>;

/** Normaliza lo que teclea el usuario: sin espacios y en mayúsculas. */
export function normalizeInviteCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

/** Genera un código `XXXX-XXXX` con aleatoriedad criptográfica (crypto.randomInt). */
export function generateInviteCode(): string {
  const group = () => Array.from({ length: CODE_GROUP }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
  return `${group()}-${group()}`;
}

/** Estado derivado de un código: revocado > agotado > caducado > activo. */
export function inviteStatus(row: { revokedAt: Date | null; usedCount: number; maxUses: number; expiresAt: Date | null }, now = new Date()): InviteStatus {
  if (row.revokedAt) return 'revoked';
  if (row.usedCount >= row.maxUses) return 'used';
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

/**
 * Invitaciones de registro: ajuste global "solo con invitación", generación/revocación de códigos
 * desde el panel admin y canje atómico durante el registro.
 */
@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** ¿El registro exige invitación? Sin fila de ajustes se considera abierto. */
  async isInviteOnly(): Promise<boolean> {
    const settings = await this.prisma.appSettings.findUnique({ where: { id: SETTINGS_ID }, select: { registrationInviteOnly: true } });
    return settings?.registrationInviteOnly ?? false;
  }

  async getRegistrationSettings() {
    return { inviteOnly: await this.isInviteOnly() };
  }

  async setRegistrationSettings(actor: Actor, raw: unknown) {
    const { inviteOnly } = parseOrBadRequest(registrationSettingsSchema, raw);
    await this.prisma.$transaction(async (tx) => {
      await tx.appSettings.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, registrationInviteOnly: inviteOnly },
        update: { registrationInviteOnly: inviteOnly },
      });
      await tx.auditLog.create({ data: { userId: actor.id, event: 'registration_settings_change', metadata: { inviteOnly } } });
    });
    this.logger.log(`Registro solo con invitación: ${inviteOnly ? 'activado' : 'desactivado'} por ${actor.id}`);
    return { inviteOnly };
  }

  async list(rawQuery: unknown) {
    const { page, pageSize, status } = parseOrBadRequest(listInvitesSchema, rawQuery);
    const where = this.statusWhere(status, new Date());
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inviteCode.findMany({ where, select: INVITE_SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.inviteCode.count({ where }),
    ]);
    return { items: rows.map((r) => this.toView(r)), total, page, pageSize };
  }

  /** Genera `count` códigos con los mismos parámetros. Reintenta si un código aleatorio ya existe. */
  async create(actor: Actor, raw: unknown) {
    const { maxUses, expiresAt, note, count } = parseOrBadRequest(createInvitesSchema, raw);
    const created: InviteRow[] = [];
    for (let i = 0; i < count; i++) {
      created.push(await this.createOne(actor, { maxUses, expiresAt: expiresAt ?? null, note: note || null }));
    }
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        event: 'invite_create',
        metadata: { count, maxUses, expiresAt: expiresAt?.toISOString() ?? null, ids: created.map((c) => c.id) },
      },
    });
    return { items: created.map((r) => this.toView(r)) };
  }

  /** Revoca un código (idempotente: si ya estaba revocado se devuelve tal cual). */
  async revoke(actor: Actor, id: string) {
    const existing = await this.prisma.inviteCode.findUnique({ where: { id }, select: { id: true, revokedAt: true } });
    if (!existing) throw new NotFoundException('Código de invitación no encontrado');
    if (!existing.revokedAt) {
      await this.prisma.$transaction([
        this.prisma.inviteCode.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } }),
        this.prisma.auditLog.create({ data: { userId: actor.id, event: 'invite_revoke', metadata: { inviteId: id } } }),
      ]);
    }
    const row = await this.prisma.inviteCode.findUniqueOrThrow({ where: { id }, select: INVITE_SELECT });
    return this.toView(row);
  }

  /**
   * Canje atómico dentro de la transacción del registro: incrementa `usedCount` solo si el código
   * no está revocado, ni caducado, ni agotado (condición en el propio UPDATE, así dos registros
   * simultáneos no pueden exceder `maxUses`). Si no se puede canjear, lanza 403 y la transacción
   * del registro se deshace.
   */
  async redeem(tx: Tx, rawCode: string, userId: string): Promise<void> {
    const code = normalizeInviteCode(rawCode);
    const now = new Date();
    const claimed = await tx.inviteCode.updateMany({
      where: {
        code,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        usedCount: { lt: this.prisma.inviteCode.fields.maxUses },
      },
      data: { usedCount: { increment: 1 } },
    });
    if (claimed.count === 0) throw new ForbiddenException('Código de invitación no válido o caducado');
    const invite = await tx.inviteCode.findUniqueOrThrow({ where: { code }, select: { id: true } });
    await tx.inviteRedemption.create({ data: { inviteCodeId: invite.id, userId } });
  }

  private async createOne(actor: Actor, data: { maxUses: number; expiresAt: Date | null; note: string | null }): Promise<InviteRow> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.inviteCode.create({
          data: { ...data, code: generateInviteCode(), createdById: actor.id },
          select: INVITE_SELECT,
        });
      } catch (err: any) {
        if (err?.code !== 'P2002' || attempt >= MAX_CODE_RETRIES) throw err;
      }
    }
  }

  private statusWhere(status: InviteStatus | undefined, now: Date): Prisma.InviteCodeWhereInput {
    const fields = this.prisma.inviteCode.fields;
    switch (status) {
      case 'revoked':
        return { revokedAt: { not: null } };
      case 'used':
        return { revokedAt: null, usedCount: { gte: fields.maxUses } };
      case 'expired':
        return { revokedAt: null, usedCount: { lt: fields.maxUses }, expiresAt: { lte: now } };
      case 'active':
        return { revokedAt: null, usedCount: { lt: fields.maxUses }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
      default:
        return {};
    }
  }

  private toView(row: InviteRow) {
    return { ...row, status: inviteStatus(row) };
  }
}
