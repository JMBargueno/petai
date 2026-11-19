import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parseOrBadRequest } from '../auth/dto/auth.schemas';
import { generateInviteCode, inviteStatus } from '../invites/invites.service';
import { rewardsSchema, Rewards } from './rewards.schemas';
import { Actor, RewardReceivedEvent, RewardsService } from './rewards.service';
import { createVouchersSchema, listVouchersSchema, normalizeVoucherCode, redeemVoucherSchema, VoucherStatus } from './vouchers.schemas';

const MAX_CODE_RETRIES = 5;

/** Mismo mensaje para inexistente, caducado, agotado y revocado: no da pistas a quien prueba códigos. */
export const INVALID_VOUCHER_MESSAGE = 'Código no válido o caducado';

const VOUCHER_SELECT = {
  id: true,
  code: true,
  rewards: true,
  maxUses: true,
  usedCount: true,
  expiresAt: true,
  revokedAt: true,
  note: true,
  createdAt: true,
  createdBy: { select: { id: true, email: true, displayName: true } },
} as const;

type VoucherRow = Prisma.VoucherGetPayload<{ select: typeof VOUCHER_SELECT }>;

/** Estado derivado de un voucher: revocado > agotado > caducado > activo (igual que las invitaciones). */
export const voucherStatus = inviteStatus as (
  row: { revokedAt: Date | null; usedCount: number; maxUses: number; expiresAt: Date | null },
  now?: Date,
) => VoucherStatus;

/**
 * Vouchers de recompensas: creación (lote aleatorio o código personalizado), listado y revocación
 * desde el panel, y canje atómico por parte de los jugadores (una vez por cuenta).
 */
@Injectable()
export class VouchersService {
  private readonly logger = new Logger(VouchersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rewards: RewardsService,
  ) {}

  async list(rawQuery: unknown) {
    const { page, pageSize, status } = parseOrBadRequest(listVouchersSchema, rawQuery);
    const where = this.statusWhere(status, new Date());
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.voucher.findMany({ where, select: VOUCHER_SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.voucher.count({ where }),
    ]);
    return { items: rows.map((r) => this.toView(r)), total, page, pageSize };
  }

  async create(actor: Actor, raw: unknown) {
    const input = parseOrBadRequest(createVouchersSchema, raw);
    this.rewards.assertCanGrant(actor, input.rewards);
    this.rewards.assertAccessories(input.rewards.accessories);
    this.rewards.assertItems(input.rewards.items);
    const data = {
      rewards: input.rewards as unknown as Prisma.InputJsonValue,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt ?? null,
      note: input.note || null,
      createdById: actor.id,
    };

    const created: VoucherRow[] = [];
    if (input.code) {
      try {
        created.push(await this.prisma.voucher.create({ data: { ...data, code: input.code }, select: VOUCHER_SELECT }));
      } catch (err: any) {
        if (err?.code === 'P2002') throw new ConflictException(`Ya existe un voucher con el código ${input.code}`);
        throw err;
      }
    } else {
      for (let i = 0; i < input.count; i++) created.push(await this.createRandom(data));
    }

    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        event: 'voucher_create',
        metadata: {
          count: created.length,
          custom: Boolean(input.code),
          maxUses: input.maxUses,
          expiresAt: input.expiresAt?.toISOString() ?? null,
          rewards: input.rewards,
          ids: created.map((c) => c.id),
        } as any,
      },
    });
    return { items: created.map((r) => this.toView(r)) };
  }

  /** Revoca un voucher (idempotente). Los canjes ya hechos no se deshacen. */
  async revoke(actor: Actor, id: string) {
    const existing = await this.prisma.voucher.findUnique({ where: { id }, select: { id: true, revokedAt: true } });
    if (!existing) throw new NotFoundException('Voucher no encontrado');
    if (!existing.revokedAt) {
      await this.prisma.$transaction([
        this.prisma.voucher.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } }),
        this.prisma.auditLog.create({ data: { userId: actor.id, event: 'voucher_revoke', metadata: { voucherId: id } } }),
      ]);
    }
    return this.toView(await this.prisma.voucher.findUniqueOrThrow({ where: { id }, select: VOUCHER_SELECT }));
  }

  /**
   * Canje: reclama un uso con la condición en el propio UPDATE (no revocado, no caducado,
   * `usedCount < maxUses`), registra el canje (único por voucher+usuario) y acredita el paquete, todo
   * en una transacción. Si algo falla, no se consume el uso.
   */
  async redeem(userId: string, raw: unknown): Promise<RewardReceivedEvent> {
    const { code } = parseOrBadRequest(redeemVoucherSchema, raw);
    const voucher = await this.prisma.voucher.findUnique({ where: { code }, select: { id: true, rewards: true } });
    if (!voucher) throw new BadRequestException(INVALID_VOUCHER_MESSAGE);
    const parsed = rewardsSchema.safeParse(voucher.rewards);
    if (!parsed.success) {
      this.logger.error(`Voucher ${voucher.id} con recompensas no válidas: ${parsed.error.issues[0]?.message}`);
      throw new BadRequestException(INVALID_VOUCHER_MESSAGE);
    }
    const rewards: Rewards = parsed.data;

    let redemptionId: string;
    let applied: Awaited<ReturnType<RewardsService['apply']>>;
    try {
      ({ redemptionId, applied } = await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const claimed = await tx.voucher.updateMany({
          where: {
            id: voucher.id,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            usedCount: { lt: this.prisma.voucher.fields.maxUses },
          },
          data: { usedCount: { increment: 1 } },
        });
        if (claimed.count === 0) throw new BadRequestException(INVALID_VOUCHER_MESSAGE);
        const redemption = await tx.voucherRedemption.create({ data: { voucherId: voucher.id, userId }, select: { id: true } });
        const result = await this.rewards.apply(tx, userId, rewards, 'voucher');
        await tx.auditLog.create({
          data: { userId, event: 'voucher_redeem', metadata: { voucherId: voucher.id, code, redemptionId: redemption.id } },
        });
        return { redemptionId: redemption.id, applied: result };
      }));
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('Ya has canjeado este código');
      throw err;
    }

    const event: RewardReceivedEvent = { source: 'voucher', redemptionId, code, granted: applied.granted };
    await this.rewards.announce(userId, event, applied.chests);
    return event;
  }

  private async createRandom(data: Omit<Prisma.VoucherUncheckedCreateInput, 'code'>): Promise<VoucherRow> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.voucher.create({ data: { ...data, code: normalizeVoucherCode(generateInviteCode()) }, select: VOUCHER_SELECT });
      } catch (err: any) {
        if (err?.code !== 'P2002' || attempt >= MAX_CODE_RETRIES) throw err;
      }
    }
  }

  private statusWhere(status: VoucherStatus | undefined, now: Date): Prisma.VoucherWhereInput {
    const fields = this.prisma.voucher.fields;
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

  private toView(row: VoucherRow) {
    return { ...row, status: voucherStatus(row) };
  }
}
