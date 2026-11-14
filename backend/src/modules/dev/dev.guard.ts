import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * DevKit (S-08): protege `/dev/*` aun cuando el módulo esté registrado. Exige, por petición,
 * o bien un origen loopback (se usa `req.ip`, que respeta `TRUST_PROXY`; nunca `X-Forwarded-For`
 * en bruto) o bien el token `DEVKIT_TOKEN` (comparación en tiempo constante). Sin ninguna de las
 * dos, devuelve 403. En producción, además, `productionProblems` impide arrancar con
 * `DEVKIT_ENABLED=true`.
 */
@Injectable()
export class DevKitGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (this.isLoopback(req.ip ?? req.socket?.remoteAddress)) return true;
    const token = this.config.get<string>('DEVKIT_TOKEN');
    const provided = req.headers['x-devkit-token'];
    if (typeof provided === 'string' && token && this.constantTimeEquals(token, provided)) {
      return true;
    }
    throw new ForbiddenException('DevKit requiere un origen loopback o el token x-devkit-token');
  }

  private isLoopback(ip?: string): boolean {
    if (!ip) return false;
    const v6 = ip.replace(/^::ffff:/, '');
    return v6 === '::1' || v6 === '127.0.0.1' || v6.startsWith('127.');
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }
}