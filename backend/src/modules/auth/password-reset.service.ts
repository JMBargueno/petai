import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthThrottleService } from './auth-throttle.service';
import { AuthService } from './auth.service';
import { parseOrBadRequest, resetConfirmSchema, resetRequestSchema } from './dto/auth.schemas';
import { EMAIL_SENDER, EmailSender } from '../mail/email.service';

const ARGON_OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3 } as const;
const MINUTE = 60_000;
const CODE_TTL_MS = 15 * MINUTE; // el código caduca a los 15 min

// Límites anti-abuso (ventana de 15 min): request por IP y por email; confirm por IP y por email.
const REQUEST_PER_IP = 10;
const REQUEST_PER_EMAIL = 5;
const CONFIRM_PER_IP = 20;
const CONFIRM_PER_EMAIL = 10;

/**
 * Recuperación de contraseña (Paso 3): un jugador que olvida la contraseña ya no pierde la cuenta.
 *
 *  - `POST /auth/reset/request`: pide un código de 6 dígitos por email. No enumera usuarios: la
 *    respuesta es idéntica exista o no la cuenta (se iguala el tiempo con un hash de relleno).
 *  - `POST /auth/reset/confirm`: con { email, code, newPassword } cambia la contraseña (argon2id),
 *    cierra el resto de sesiones y emite una sesión nueva. El código es de un solo uso y caduca a los
 *    15 min; el canje es atómico (una sola `updateMany` dentro de una transacción).
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly throttle: AuthThrottleService,
    private readonly auth: AuthService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  private getDummyHash(): Promise<string> {
    if (!this.dummyHash) this.dummyHash = argon2.hash(crypto.randomBytes(16).toString('hex'), ARGON_OPTIONS);
    return this.dummyHash;
  }

  async request(raw: unknown, ip: string) {
    const { email } = parseOrBadRequest(resetRequestSchema, raw);
    await this.throttle.consume(`reset-request-ip:${ip}`, REQUEST_PER_IP, 15 * MINUTE);
    await this.throttle.consume(`reset-request-email:${email}`, REQUEST_PER_EMAIL, 15 * MINUTE);

    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      // Sin enumeración: misma respuesta y tiempo que si la cuenta existiera, sin crear ni enviar nada.
      await argon2.verify(await this.getDummyHash(), 'petai-reset-dummy').catch(() => false);
      return { ok: true };
    }

    // Un único código vivo por email: se descartan los anteriores.
    await this.prisma.passwordResetToken.deleteMany({ where: { email } });
    const code = await this.createUniqueCode();
    await this.prisma.passwordResetToken.create({
      data: { code, userId: user.id, email, expiresAt: new Date(Date.now() + CODE_TTL_MS), requestedIp: ip },
    });

    try {
      await this.email.sendPasswordResetCode(email, code, CODE_TTL_MS / MINUTE);
    } catch (err) {
      // Un fallo del transporte no debe cambiar la respuesta (revelaría que la cuenta existe).
      this.logger.error(`No se pudo enviar el código de recuperación a ${email}: ${(err as Error).message}`);
    }
    this.logger.log(`Código de recuperación solicitado para ${email}`);
    return { ok: true };
  }

  async confirm(raw: unknown, ip: string) {
    const { email, code, newPassword } = parseOrBadRequest(resetConfirmSchema, raw);
    await this.throttle.consume(`reset-confirm-ip:${ip}`, CONFIRM_PER_IP, 15 * MINUTE);
    await this.throttle.consume(`reset-confirm-email:${email}`, CONFIRM_PER_EMAIL, 15 * MINUTE);

    const now = new Date();
    const userId = await this.prisma.$transaction(async (tx) => {
      // Canje atómico y de un solo uso: solo prospera una confirmación concurrente (count=1).
      const claimed = await tx.passwordResetToken.updateMany({
        where: { code, email, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (claimed.count === 0) return null;
      const user = await tx.user.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true } });
      if (!user) return null;
      const passwordHash = await argon2.hash(newPassword, ARGON_OPTIONS);
      // El código llegó a este correo: prueba que es suyo, así que la cuenta queda verificada. Además
      // permite al dueño real recuperar una cuenta que otro registró con su correo sin verificarlo.
      await tx.user.update({
        where: { email },
        data: { passwordHash, ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: now }) },
      });
      return user.id;
    });

    if (!userId) {
      // Mismo mensaje para cuenta inexistente / código inválido / caducado / ya usado (sin enumeración).
      throw new BadRequestException('Código inválido o caducado');
    }

    // Cierra las demás sesiones y emite una sesión nueva (igual que changePassword).
    await this.auth.logoutAll(userId);
    this.logger.log(`Contraseña restablecida para ${email}: sesiones cerradas y sesión nueva emitida`);
    return { ok: true, ...(await this.auth.issueSession(userId)) };
  }

  /** Genera un código de 6 dígitos único (reintenta ante colisión de la PK). */
  private async createUniqueCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
      const existing = await this.prisma.passwordResetToken.findUnique({ where: { code }, select: { code: true } });
      if (!existing) return code;
    }
    return crypto.randomBytes(4).toString('hex'); // último recurso: no debería alcanzarse
  }
}
