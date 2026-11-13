import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Cliente de base de datos: PrismaService o el cliente de una transacción. */
type DbClient = PrismaService | Prisma.TransactionClient;

/**
 * Gestión del pity de cofres por usuario y por tipo de cofre (tabla `ChestPity`, independiente de
 * `PityCounter`, que gestiona el pity de eclosión de pets).
 *
 * `incrementPity`/`resetPity` aceptan un cliente de transacción opcional para poder ejecutarse dentro
 * de una transacción atómica de apertura (FR-005) en vez de contra `this.prisma`.
 */
@Injectable()
export class ChestPityService {
  constructor(private readonly prisma: PrismaService) {}

  private client(c?: DbClient): PrismaService | Prisma.TransactionClient {
    return c ?? this.prisma;
  }

  /** Devuelve el pity del usuario para un tipo de cofre (find-or-create, count 0 si no existe). */
  async getPity(userId: string, tier: string): Promise<{ id: string; count: number }> {
    const existing = await this.prisma.chestPity.findUnique({
      where: { userId_tier: { userId, tier } },
    });
    if (existing) return existing;
    return this.prisma.chestPity.create({ data: { userId, tier, count: 0 } });
  }

  /** Incrementa el contador de aperturas sin drop suficiente (o crea la fila en 1). */
  async incrementPity(userId: string, tier: string, c?: DbClient): Promise<void> {
    const cl = this.client(c);
    await cl.chestPity.upsert({
      where: { userId_tier: { userId, tier } },
      update: { count: { increment: 1 } },
      create: { userId, tier, count: 1 },
    });
  }

  /** Resetea el contador a 0 cuando cae un drop de tier >= minTier. */
  async resetPity(userId: string, tier: string, c?: DbClient): Promise<void> {
    const cl = this.client(c);
    await cl.chestPity.upsert({
      where: { userId_tier: { userId, tier } },
      update: { count: 0 },
      create: { userId, tier, count: 0 },
    });
  }
}