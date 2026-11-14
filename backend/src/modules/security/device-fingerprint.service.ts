import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

export interface FingerprintFeatures {
  userAgent: string;
  screenWidth?: number;
  screenHeight?: number;
  timezone?: string;
  fontsCount?: number;
  webglRenderer?: string;
}

export interface FingerprintResult {
  fingerprint: string;
  score: number;
  flagged: boolean;
  accountCount: number;
  ipChanged: boolean;
}

const FLAG_THRESHOLD = 80;
const SCORE_PER_EXTRA_ACCOUNT = 20;
// R-05: caducidad del Set de cuentas por fingerprint (antes vivía para siempre). Se renueva
// en cada verificación, de modo que las huellas inactivas dejan de ocupar Redis.
const FINGERPRINT_TTL_MS = 24 * 3600 * 1000;

/**
 * DeviceFingerprintService — Feature 026. Detecta cuentas bot/farming mediante
 * fingerprint de dispositivo. El score crece por cada cuenta extra con el mismo
 * fingerprint; por encima de umbral se marca `flagged` (revisión, no ban automático,
 * para evitar false positives de usuarios en la misma red/ISP).
 */
@Injectable()
export class DeviceFingerprintService {
  private readonly logger = new Logger(DeviceFingerprintService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Computa el fingerprint SHA-256 a partir de las features del dispositivo. */
  computeFingerprint(features: FingerprintFeatures): string {
    const normalized = [
      features.userAgent ?? '',
      `${features.screenWidth ?? 0}x${features.screenHeight ?? 0}`,
      features.timezone ?? '',
      String(features.fontsCount ?? 0),
      features.webglRenderer ?? '',
    ].join('|');
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Registra la verificación de un fingerprint para un usuario y devuelve el score/flag.
   * Usa Redis (Set por fingerprint) con respaldo en el audit log (conteo por fingerprint).
   */
  async verify(
    userId: string,
    features: FingerprintFeatures,
    ip?: string,
  ): Promise<FingerprintResult> {
    const fingerprint = this.computeFingerprint(features);
    const fpKey = this.redis.key(`fp:${fingerprint}`);

    const accountCount = await this.redis.run(async (r) => {
      await r.sadd(fpKey, userId);
      // R-05: el Set por fingerprint caduca (renovable en cada verificación), no vive para siempre.
      await r.pexpire(fpKey, FINGERPRINT_TTL_MS);
      return r.scard(fpKey);
    });

    let count = accountCount ?? null;
    if (count === null) {
      // R-04.5: sin Redis, no cargar todas las filas de `AuditLog`: un COUNT(DISTINCT userId)
      // filtrado por huella (usa el índice `fingerprint`) + el usuario actual si aún no figura.
      const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(
        Prisma.sql`SELECT COUNT(DISTINCT "userId") AS "count" FROM "AuditLog" WHERE "fingerprint" = ${fingerprint}`,
      );
      const distinctCount = Number(rows[0]?.count ?? 0);
      const already = await this.prisma.auditLog.findFirst({
        where: { fingerprint, userId },
        select: { userId: true },
      });
      count = distinctCount + (already ? 0 : 1);
    }

    const score = Math.min(100, Math.max(0, (count - 1) * SCORE_PER_EXTRA_ACCOUNT));
    const flagged = score >= FLAG_THRESHOLD;

    // Detecta cambio de IP para el mismo user (audit).
    const lastLog = await this.prisma.auditLog.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const ipChanged = !!ip && !!lastLog?.ip && lastLog.ip !== ip;

    await this.prisma.auditLog
      .create({
        data: {
          userId,
          event: 'fingerprint',
          ip: ip ?? null,
          userAgent: features.userAgent ?? null,
          fingerprint,
          metadata: { accountCount: count, score, flagged, ipChanged },
        },
      })
      .catch((err) => this.logger.warn(`Fallo audit fingerprint: ${err?.message}`));

    if (flagged) {
      this.logger.warn(`Fingerprint ${fingerprint} con ${count} cuentas (score ${score}); flagged`);
    }

    return { fingerprint, score, flagged, accountCount: count, ipChanged };
  }

  /** Devuelve el estado de seguridad del dispositivo del usuario. */
  async deviceStatus(userId: string): Promise<{
    score: number;
    flagged: boolean;
    lastFingerprint: string | null;
    lastIp: string | null;
  }> {
    const last = await this.prisma.auditLog.findFirst({
      where: { userId, event: 'fingerprint' },
      orderBy: { createdAt: 'desc' },
    });
    const meta = (last?.metadata ?? {}) as { score?: number; flagged?: boolean };
    return {
      score: meta.score ?? 0,
      flagged: meta.flagged ?? false,
      lastFingerprint: last?.fingerprint ?? null,
      lastIp: last?.ip ?? null,
    };
  }
}
