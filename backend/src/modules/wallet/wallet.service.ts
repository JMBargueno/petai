import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * C-01 / SDD §3.3 — Primitiva económica compartida (cobro y abono atómicos de `coins`/`gems`).
 *
 * El débito es race-safe por diseño: la comprobación de saldo y el decremento son una única
 * sentencia `UPDATE ... WHERE saldo >= importe`; si no hay saldo, `count` = 0 y el llamante debe
 * REVERTIR la transacción (no retener el cargo). Todo cobro/abono económico del backend debe pasar
 * por aquí dentro de una transacción que el llamante abre y propaga.
 */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Débito atómico y race-safe de una sola moneda.
   * `tx` es un `Prisma.TransactionClient` (el llamante abre/propaga la transacción).
   */
  async debit(
    tx: Prisma.TransactionClient,
    userId: string,
    currency: 'coins' | 'gems',
    amount: number,
  ): Promise<{ ok: boolean }> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Importe de débito inválido');
    }
    const res =
      currency === 'coins'
        ? await tx.user.updateMany({
            where: { id: userId, coins: { gte: amount } },
            data: { coins: { decrement: amount } },
          })
        : await tx.user.updateMany({
            where: { id: userId, gems: { gte: amount } },
            data: { gems: { decrement: amount } },
          });
    return { ok: res.count === 1 };
  }

  /** Abono atómico (increment). Mismo criterio de validación que `debit` (entero > 0). */
  async credit(
    tx: Prisma.TransactionClient,
    userId: string,
    currency: 'coins' | 'gems',
    amount: number,
  ): Promise<void> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Importe de abono inválido');
    }
    if (currency === 'coins') {
      await tx.user.update({ where: { id: userId }, data: { coins: { increment: amount } } });
    } else {
      await tx.user.update({ where: { id: userId }, data: { gems: { increment: amount } } });
    }
  }
}