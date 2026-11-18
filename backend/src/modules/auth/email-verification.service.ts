import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthThrottleService } from './auth-throttle.service';
import { EMAIL_SENDER, EmailSender } from '../mail/email.service';
import { parseOrBadRequest, verifyEmailCodeSchema, verifyEmailLinkSchema } from './dto/auth.schemas';

const MINUTE = 60_000;
/** Intentos con código por token: al agotarlos hay que pedir un correo nuevo. */
export const MAX_CODE_ATTEMPTS = 5;
// Límites anti-abuso de envíos (ventana de 1 h) y de canjes por IP (15 min).
const SEND_PER_USER = 5;
const SEND_PER_IP = 20;
const CONFIRM_PER_IP = 30;

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const sameHash = (a: string, b: string) =>
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

/** Error de verificación: mismo mensaje para código inválido, caducado o ya usado. */
const invalid = () => new BadRequestException('Código o enlace inválido o caducado');

/**
 * Verificación del correo de la cuenta.
 *
 * Al registrarse (y al pedir reenvío) se genera un código de 6 dígitos para escribir en la app y un
 * token largo para el enlace a la web (`/es/verify-email?token=…`). Ambos se guardan como sha256, hay
 * un único token vivo por usuario, caducan (EMAIL_VERIFICATION_TTL_MINUTES) y el código admite
 * {@link MAX_CODE_ATTEMPTS} intentos. Canjear cualquiera de los dos rellena `User.emailVerifiedAt`.
 * Mientras no esté verificada y EMAIL_VERIFICATION_REQUIRED=true, JwtAuthGuard bloquea la API (403).
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly throttle: AuthThrottleService,
    private readonly config: ConfigService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  private get ttlMinutes(): number {
    const v = Number(this.config.get('EMAIL_VERIFICATION_TTL_MINUTES'));
    return Number.isFinite(v) && v > 0 ? v : 1440;
  }

  private get webUrl(): string {
    return (this.config.get<string>('PUBLIC_WEB_URL') || 'https://pockai.world').replace(/\/+$/, '');
  }

  /** ¿Se exige la verificación para usar la API? */
  get required(): boolean {
    return this.config.get<string>('EMAIL_VERIFICATION_REQUIRED') === 'true';
  }

  /**
   * Genera un código y un enlace nuevos (invalida los anteriores) y los envía por correo.
   * `throttled=false` se usa en el registro (ya limitado por IP) y en las acciones del panel.
   */
  async send(userId: string, opts: { ip?: string; throttled?: boolean } = {}) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, emailVerifiedAt: true },
    });
    if (!user) throw new BadRequestException('Usuario no encontrado');
    if (user.emailVerifiedAt) return { ok: true, alreadyVerified: true };

    if (opts.throttled !== false) {
      await this.throttle.consume(`verify-send-user:${user.id}`, SEND_PER_USER, 60 * MINUTE);
      if (opts.ip) await this.throttle.consume(`verify-send-ip:${opts.ip}`, SEND_PER_IP, 60 * MINUTE);
    }

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const linkToken = crypto.randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          email: user.email,
          codeHash: sha256(code),
          linkTokenHash: sha256(linkToken),
          expiresAt: new Date(Date.now() + this.ttlMinutes * MINUTE),
        },
      }),
    ]);

    await this.email.sendVerification(user.email, {
      code,
      link: `${this.webUrl}/es/verify-email?token=${encodeURIComponent(linkToken)}`,
      expiresInMinutes: this.ttlMinutes,
      displayName: user.displayName,
    });
    this.logger.log(`Correo de verificación enviado a ${user.email}`);
    return { ok: true, alreadyVerified: false };
  }

  /** Envío tras el registro: nunca hace fallar el alta (el usuario puede pedir reenvío). */
  sendAfterRegister(userId: string): void {
    this.send(userId, { throttled: false }).catch((err) =>
      this.logger.error(`No se pudo enviar el correo de verificación (${userId}): ${(err as Error).message}`),
    );
  }

  /** Canje del código de 6 dígitos desde la app (sesión iniciada). */
  async confirmCode(userId: string, raw: unknown, ip: string) {
    const { code } = parseOrBadRequest(verifyEmailCodeSchema, raw);
    await this.throttle.consume(`verify-confirm-ip:${ip}`, CONFIRM_PER_IP, 15 * MINUTE);

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
    if (user?.emailVerifiedAt) return { ok: true, emailVerified: true };

    const now = new Date();
    const token = await this.prisma.emailVerificationToken.findFirst({
      where: { userId, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!token) throw invalid();

    // Se cuenta el intento antes de comparar (atómico): con los intentos agotados ya no se compara.
    const counted = await this.prisma.emailVerificationToken.updateMany({
      where: { id: token.id, consumedAt: null, attempts: { lt: MAX_CODE_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) {
      throw new BadRequestException('Demasiados intentos: pide un código nuevo');
    }
    if (!sameHash(sha256(code), token.codeHash)) throw invalid();

    await this.consume(token.id, userId, token.email, 'code');
    return { ok: true, emailVerified: true };
  }

  /** Canje del enlace desde la web (sin sesión). */
  async confirmLink(raw: unknown, ip: string) {
    const { token } = parseOrBadRequest(verifyEmailLinkSchema, raw);
    await this.throttle.consume(`verify-confirm-ip:${ip}`, CONFIRM_PER_IP, 15 * MINUTE);

    const row = await this.prisma.emailVerificationToken.findUnique({ where: { linkTokenHash: sha256(token) } });
    if (!row) throw invalid();
    if (row.consumedAt) {
      // Enlace ya usado: si la cuenta está verificada, se informa como éxito (doble clic, escáneres…).
      const user = await this.prisma.user.findUnique({ where: { id: row.userId }, select: { emailVerifiedAt: true } });
      if (user?.emailVerifiedAt) return { ok: true, emailVerified: true };
      throw invalid();
    }
    if (row.expiresAt <= new Date()) throw invalid();

    await this.consume(row.id, row.userId, row.email, 'link');
    return { ok: true, emailVerified: true };
  }

  /** Marca la cuenta como verificada (canje atómico del token + auditoría). */
  private async consume(tokenId: string, userId: string, email: string, via: 'code' | 'link') {
    const now = new Date();
    const ok = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: tokenId, consumedAt: null },
        data: { consumedAt: now },
      });
      if (claimed.count === 0) return false;
      // Solo si el correo sigue siendo el mismo al que se envió el token.
      const updated = await tx.user.updateMany({
        where: { id: userId, email, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      if (updated.count > 0) {
        await tx.auditLog.create({ data: { userId, event: 'email_verified', metadata: { via } } });
      }
      return true;
    });
    if (!ok) throw invalid();
    this.logger.log(`Correo verificado (${via}) para el usuario ${userId}`);
  }

  /** Verificación manual desde el panel (soporte). */
  async markVerified(userId: string, actorId: string) {
    const now = new Date();
    const res = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
      if (updated.count > 0) {
        await tx.emailVerificationToken.deleteMany({ where: { userId } });
        await tx.auditLog.create({ data: { userId: actorId, event: 'email_verified_manual', metadata: { targetUserId: userId } } });
      }
      return updated.count;
    });
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
    if (!user) throw new BadRequestException('Usuario no encontrado');
    return { ok: true, changed: res > 0, emailVerifiedAt: user.emailVerifiedAt };
  }
}
