import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuthThrottleService } from './auth-throttle.service';
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

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }

    const passwordHash = await argon2.hash(dto.password, ARGON_OPTIONS);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          displayName: dto.displayName || dto.email.split('@')[0].slice(0, 50),
          coins: 100,
          gems: 10,
          pityCounter: { create: { sinceSuperRare: 0, sinceLegendary: 0 } },
        },
        select: { id: true, email: true, displayName: true, coins: true, gems: true },
      });
    } catch (err: any) {
      // Dos registros simultáneos con el mismo correo: el índice único evita el duplicado
      if (err?.code === 'P2002') throw new ConflictException('El correo electrónico ya está registrado');
      throw err;
    }

    // Otorgar un huevo inicial de bienvenida al usuario recién registrado
    const now = new Date();
    await this.prisma.egg.create({
      data: { userId: user.id, eggType: 'starter', startedAt: now, hatchesAt: now },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.displayName);
    return { ...tokens, user };
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
      user: { id: user.id, email: user.email, displayName: user.displayName, coins: user.coins, gems: user.gems },
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
      user: { id: user.id, email: user.email, displayName: user.displayName, coins: user.coins, gems: user.gems },
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
