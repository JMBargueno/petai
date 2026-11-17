import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuthThrottleService } from './auth-throttle.service';
import { InvitesService } from '../invites/invites.service';
import { EmailVerificationService } from './email-verification.service';
import { DEFAULT_DISPLAY_NAME, handleInvalidReason, isUniqueViolationOn, normalizeHandle } from '../../common/user-handle';
import { changePasswordSchema, loginSchema, parseOrBadRequest, refreshSchema, registerSchema } from './dto/auth.schemas';

const ARGON_OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3 } as const;
/** Un refresh token ya revocado que se presenta pasado este margen indica robo/reutilización. */
const REUSE_GRACE_MS = 10_000;
/** Los refresh tokens caducados se conservan este tiempo (para detectar reutilización) y luego se borran. */
const EXPIRED_TOKEN_RETENTION_MS = 30 * 24 * 3600 * 1000;
const MINUTE = 60_000;
/** Único algoritmo de firma aceptado (los tokens se firman con un secreto compartido). */
export const JWT_ALGORITHM = 'HS256' as const;

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/** Datos del usuario que se devuelven al iniciar sesión (registro, login, vinculación, recuperación). */
const publicUser = (u: {
  id: string;
  email: string;
  role: string;
  displayName: string | null;
  handle: string | null;
  coins: number;
  gems: number;
  emailVerifiedAt: Date | null;
}) => ({
  id: u.id,
  email: u.email,
  role: u.role,
  displayName: u.displayName,
  // Nickname público e inmutable; null = la cuenta aún debe elegirlo (pantalla "elige tu nickname").
  handle: u.handle,
  coins: u.coins,
  gems: u.gems,
  emailVerified: u.emailVerifiedAt != null,
});

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly throttle: AuthThrottleService,
    private readonly realtime: RealtimeGateway,
    private readonly invites: InvitesService,
    @Optional() private readonly verification?: EmailVerificationService,
  ) {}

  /** Hash de relleno: se verifica cuando el correo no existe para que el tiempo de respuesta no lo delate. */
  private getDummyHash(): Promise<string> {
    if (!this.dummyHash) this.dummyHash = argon2.hash(crypto.randomBytes(16).toString('hex'), ARGON_OPTIONS);
    return this.dummyHash;
  }

  async register(raw: unknown, ip: string) {
    const l = this.throttle.limits;
    await this.throttle.consume(`register:${ip}`, l.registerPerIp, l.registerWindowMs);
    const dto = parseOrBadRequest(registerSchema, raw);

    // Modo "solo con invitación": sin código no se registra. Con el modo desactivado el código se ignora.
    const inviteOnly = await this.invites.isInviteOnly();
    if (inviteOnly && !dto.inviteCode) {
      throw new ForbiddenException('El registro requiere un código de invitación');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }
    if (dto.handle && (await this.prisma.user.findUnique({ where: { handle: dto.handle }, select: { id: true } }))) {
      throw new ConflictException('Ese nickname ya está en uso');
    }

    const passwordHash = await argon2.hash(dto.password, ARGON_OPTIONS);

    // Usuario, huevo inicial y canje de la invitación van en la misma transacción: si el código no
    // es válido (o se agota en una carrera), no queda ningún usuario a medias.
    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            // Nunca derivar el nombre del correo: el nombre es público (amigos, clanes) y el correo, privado.
            displayName: dto.displayName || dto.handle || DEFAULT_DISPLAY_NAME,
            // Opcional en la API (apps antiguas): sin él, la cuenta elige nickname al entrar.
            handle: dto.handle ?? null,
            coins: 100,
            gems: 10,
            pityCounter: { create: { sinceSuperRare: 0, sinceLegendary: 0 } },
          },
          select: { id: true, email: true, role: true, displayName: true, handle: true, coins: true, gems: true, emailVerifiedAt: true },
        });

        if (inviteOnly && dto.inviteCode) {
          await this.invites.redeem(tx, dto.inviteCode, created.id);
        }

        // Otorgar un huevo inicial de bienvenida al usuario recién registrado
        const now = new Date();
        await tx.egg.create({
          data: { userId: created.id, eggType: 'starter', startedAt: now, hatchesAt: now },
        });
        return created;
      });
    } catch (err: any) {
      // Dos registros simultáneos con el mismo correo o nickname: el índice único evita el duplicado
      if (isUniqueViolationOn(err, 'handle')) throw new ConflictException('Ese nickname ya está en uso');
      if (err?.code === 'P2002') throw new ConflictException('El correo electrónico ya está registrado');
      throw err;
    }

    const tokens = await this.generateTokens(user.id, user.email, user.displayName);
    // Correo de verificación (en segundo plano: un fallo del SMTP no rompe el registro).
    this.verification?.sendAfterRegister(user.id);
    return { ...tokens, user: publicUser(user) };
  }

  /** ¿Está libre este nickname? Público (formulario de registro), con límite por IP. */
  async handleAvailability(raw: unknown, ip: string): Promise<{ handle: string; available: boolean; reason?: string }> {
    const l = this.throttle.limits;
    await this.throttle.consume(`handle-check:${ip}`, l.handleCheckPerIp, l.handleCheckWindowMs);
    const handle = normalizeHandle(raw);
    const reason = handleInvalidReason(handle);
    if (reason) return { handle, available: false, reason };
    const taken = await this.prisma.user.findUnique({ where: { handle }, select: { id: true } });
    return taken ? { handle, available: false, reason: 'Ese nickname ya está en uso' } : { handle, available: true };
  }

  async login(raw: unknown, ip: string) {
    const dto = parseOrBadRequest(loginSchema, raw);
    const l = this.throttle.limits;
    const accountKey = `login:${ip}:${dto.email}`;
    const ipKey = `login-ip:${ip}`;
    // Fallos sobre la cuenta desde CUALQUIER IP: frena un ataque repartido entre muchas direcciones.
    // El tope es más alto que el de cuenta+IP para que bloquear a un tercero exija bastante más esfuerzo.
    const accountGlobalKey = `login-acct:${dto.email}`;
    // Bloqueo previo: aunque la contraseña sea correcta, una cuenta/IP bloqueada no entra
    await this.throttle.assertBelow(accountKey, l.loginFailsPerAccount, l.loginWindowMs);
    await this.throttle.assertBelow(ipKey, l.loginFailsPerIp, l.loginWindowMs);
    await this.throttle.assertBelow(accountGlobalKey, l.loginFailsPerAccountGlobal, l.loginWindowMs);

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Siempre se ejecuta una verificación argon2 (real o de relleno): mismo coste exista o no la cuenta
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const ok = await argon2.verify(hash, dto.password).catch(() => false);

    if (!user || !ok) {
      await this.throttle.add(accountKey, l.loginWindowMs);
      await this.throttle.add(ipKey, l.loginWindowMs);
      await this.throttle.add(accountGlobalKey, l.loginWindowMs);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Solo se reinicia el contador de esta IP: el global de la cuenta no, o quien ataca desde otras
    // direcciones recuperaría sus intentos cada vez que el dueño inicia sesión.
    await this.throttle.clear(accountKey);
    const tokens = await this.generateTokens(user.id, user.email, user.displayName);
    return {
      ...tokens,
      user: publicUser(user),
    };
  }

  async refresh(raw: unknown, ip: string) {
    const l = this.throttle.limits;
    await this.throttle.consume(`refresh:${ip}`, l.refreshPerIp, l.refreshWindowMs);
    const dto = parseOrBadRequest(refreshSchema, raw);

    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        algorithms: [JWT_ALGORITHM],
      });
    } catch {
      throw new UnauthorizedException('Token de refresco expirado o corrupto');
    }

    const hash = sha256(dto.refreshToken);
    const now = new Date();

    // Revocación atómica: solo una petición puede canjear el token (rotación sin carreras)
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { userId: payload.sub, hash, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });

    if (claimed.count === 0) {
      // ¿Token ya usado hace tiempo? Reutilización: se cierran todas las sesiones de la cuenta
      const used = await this.prisma.refreshToken.findFirst({
        where: { userId: payload.sub, hash, revokedAt: { lt: new Date(now.getTime() - REUSE_GRACE_MS) } },
      });
      if (used) {
        this.logger.warn(`Reutilización de un refresh token revocado (usuario ${payload.sub}): se revocan todas las sesiones`);
        await this.revokeAllSessions(payload.sub);
      }
      throw new UnauthorizedException('Token de refresco inválido o revocado');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');

    // Limpieza de paso: los tokens del usuario caducados hace tiempo ya no sirven ni para detectar robos
    void this.prisma.refreshToken
      .deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date(now.getTime() - EXPIRED_TOKEN_RETENTION_MS) } } })
      .catch((e) => this.logger.warn(`No se pudieron purgar refresh tokens antiguos: ${e?.message}`));

    return this.generateTokens(user.id, user.email, user.displayName);
  }

  /** Cierra la sesión: revoca el refresh token indicado (idempotente). */
  async logout(raw: unknown, ip: string) {
    // Sin autenticación (basta el propio token), así que se limita por IP
    await this.throttle.consume(`logout:${ip}`, 30, MINUTE);
    const dto = parseOrBadRequest(refreshSchema, raw);
    await this.prisma.refreshToken.updateMany({ where: { hash: sha256(dto.refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  /** Revoca todos los refresh tokens del usuario y corta sus conexiones en tiempo real. */
  private async revokeAllSessions(userId: string): Promise<number> {
    const res = await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    this.realtime.disconnectUser(userId);
    return res.count;
  }

  /**
   * Cierra todas las sesiones del usuario en todos sus dispositivos. Los access tokens ya emitidos
   * siguen valiendo hasta que caducan (JWT_ACCESS_EXPIRES_IN, 15 min por defecto), pero no se pueden renovar.
   */
  async logoutAll(userId: string) {
    return { ok: true, revoked: await this.revokeAllSessions(userId) };
  }

  /**
   * Cambia la contraseña (exige la actual), cierra el resto de sesiones y devuelve una sesión nueva
   * para el dispositivo que hizo el cambio.
   */
  async changePassword(userId: string, raw: unknown) {
    await this.throttle.consume(`password:${userId}`, 5, 15 * MINUTE);
    const dto = parseOrBadRequest(changePasswordSchema, raw);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    if (!(await argon2.verify(user.passwordHash, dto.currentPassword).catch(() => false))) {
      // 403 y no 401: la sesión es válida; lo incorrecto es la contraseña que se ha escrito
      throw new ForbiddenException('La contraseña actual no es correcta');
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('La contraseña nueva debe ser distinta de la actual');
    }

    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(dto.newPassword, ARGON_OPTIONS) } });
    await this.revokeAllSessions(userId);
    this.logger.log(`Contraseña cambiada (usuario ${userId}): se cierran las demás sesiones`);
    return { ok: true, ...(await this.generateTokens(user.id, user.email)) };
  }

  /** Abre una sesión nueva para un usuario ya verificado (vinculación de dispositivos). */
  async issueSession(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    return {
      ...(await this.generateTokens(user.id, user.email, user.displayName)),
      user: publicUser(user),
    };
  }

  private async generateTokens(userId: string, email: string, _displayName?: string) {
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      algorithm: JWT_ALGORITHM,
      expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m') as any,
    });

    const refreshToken = this.jwtService.sign({ ...payload, jti: crypto.randomUUID() }, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      algorithm: JWT_ALGORITHM,
      expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d') as any,
    });

    // La caducidad guardada sale del propio token, así coincide siempre con JWT_REFRESH_EXPIRES_IN
    const exp = (this.jwtService.decode(refreshToken) as { exp: number }).exp;
    await this.prisma.refreshToken.create({
      data: {
        userId,
        hash: sha256(refreshToken),
        expiresAt: new Date(exp * 1000),
      },
    });

    return { accessToken, refreshToken };
  }
}
