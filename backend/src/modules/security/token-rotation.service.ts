import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

interface RotateContext {
  ip?: string;
  userAgent?: string;
  fingerprint?: string;
}

/**
 * TokenRotationService — Feature 026. Rotation de refresh tokens con detección de
 * reutilización (reuse detection): si un refresh ya rotado se reutiliza, se revocan
 * TODOS los refresh del usuario (compromiso total de la sesión).
 */
@Injectable()
export class TokenRotationService {
  private readonly logger = new Logger(TokenRotationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rota un refresh token.
   * @returns el nuevo refresh token opaco.
   * @throws 401 si el token es inválido, expirado o fue reutilizado (reuse detection).
   */
  async rotateToken(userId: string, rawToken: string, ctx?: RotateContext) {
    const hash = this.hash(rawToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { hash } });

    if (!record || record.userId !== userId) {
      await this.audit(userId, 'refresh', ctx, { outcome: 'invalid' });
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Reuse detection: un refresh ya rotado/revocado que vuelve a usarse → revocar todo.
    if (record.revokedAt) {
      this.logger.warn(`Refresh reuse detectado para user ${userId}; revocando sesión completa`);
      await this.revokeAll(userId);
      await this.audit(userId, 'refresh', ctx, { outcome: 'reuse_revoked' });
      throw new UnauthorizedException('Refresh token reutilizado; sesión revocada');
    }

    if (record.expiresAt.getTime() < Date.now()) {
      await this.audit(userId, 'refresh', ctx, { outcome: 'expired' });
      throw new UnauthorizedException('Refresh token expirado');
    }

    // Rotación: revocar el actual y emitir uno nuevo.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const newRaw = `petai_refresh_${randomBytes(24).toString('hex')}`;
    const newRecord = await this.prisma.refreshToken.create({
      data: {
        userId,
        hash: this.hash(newRaw),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    await this.audit(userId, 'rotation', ctx, { outcome: 'ok', newId: newRecord.id });

    return {
      refreshToken: newRaw,
      refreshTokenId: newRecord.id,
      expiresAt: newRecord.expiresAt,
    };
  }

  /** Revoca todos los refresh tokens del usuario (compromiso de sesión). */
  async revokeAll(userId: string): Promise<number> {
    const now = new Date();
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return result.count;
  }

  /**
   * Registra un evento de auditoría (append-only). Sin endpoints de borrado;
   * retention de 1 año se aplica por partición en infraestructura.
   */
  async audit(
    userId: string,
    event: string,
    ctx?: RotateContext,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditLog
      .create({
        data: {
          userId,
          event,
          ip: ctx?.ip ?? null,
          userAgent: ctx?.userAgent ?? null,
          fingerprint: ctx?.fingerprint ?? null,
          metadata: (metadata ?? undefined) as object | undefined,
        },
      })
      .catch((err) => this.logger.warn(`Fallo audit: ${err?.message}`));
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
