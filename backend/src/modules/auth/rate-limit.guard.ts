import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { AuthThrottleService } from './auth-throttle.service';

const WINDOW_MS = 60_000;
const DEFAULT_PER_MINUTE = 300;

/**
 * Límite global de peticiones por minuto (todas las rutas salvo las sondas de salud).
 *
 * - Con un JWT de acceso válido se cuenta por usuario. La firma se comprueba aquí (un HMAC, sin
 *   consultar la base de datos): si se usara el `sub` sin verificar, cualquiera podría gastar el cupo
 *   de otro usuario o repartir sus peticiones entre identificadores inventados.
 * - Sin token, o con uno inválido, se cuenta por IP.
 *
 * Es una red de seguridad contra automatismos y abuso; los límites finos (login, registro, chat,
 * minijuegos…) siguen en cada servicio. En tests está desactivado salvo RATE_LIMIT_FORCE=true.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly throttle: AuthThrottleService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  private get enabled(): boolean {
    if (this.config.get<string>('RATE_LIMIT_DISABLED') === 'true') return false;
    if (this.config.get<string>('NODE_ENV') === 'test' && this.config.get<string>('RATE_LIMIT_FORCE') !== 'true') return false;
    return true;
  }

  private get perMinute(): number {
    const v = Number(this.config.get('RATE_LIMIT_PER_MINUTE'));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_PER_MINUTE;
  }

  private subject(req: Request): string {
    const header = req.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ') && header.length < 4096) {
      try {
        const payload = this.jwt.verify<{ sub?: unknown }>(header.slice(7), {
          secret: this.config.get<string>('JWT_ACCESS_SECRET'),
          algorithms: ['HS256'],
        });
        if (typeof payload.sub === 'string') return `user:${payload.sub}`;
      } catch {
        // token inválido o caducado: cuenta por IP
      }
    }
    return `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http' || !this.enabled) return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (/\/health(\/|$)/.test(req.path)) return true;

    const retryAfter = await this.throttle.hitFixed(`global:${this.subject(req)}`, this.perMinute, WINDOW_MS);
    if (retryAfter > 0) {
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        { statusCode: 429, message: 'Demasiadas peticiones. Inténtalo de nuevo en unos segundos.', retryAfterSeconds: retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
