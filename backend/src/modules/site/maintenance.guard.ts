import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { isMaintenanceAllowed, MAINTENANCE_RETRY_AFTER_S, routePath } from './maintenance';
import { MaintenanceService } from './maintenance.service';

/**
 * Modo mantenimiento manual (panel → Sitio). Responde 503 `MAINTENANCE` a todo lo que no esté en la
 * lista de rutas abiertas, según el alcance elegido (web, apps o todo). Los admins pasan.
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (req.method === 'OPTIONS') return true;
    if (isMaintenanceAllowed(routePath(req.path, this.config.get<string>('API_PREFIX') || 'v1'))) return true;

    const blocked = await this.maintenance.check({
      client: req.headers['x-client'],
      origin: req.headers.origin,
      authorization: req.headers.authorization,
    });
    if (!blocked) return true;
    context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(MAINTENANCE_RETRY_AFTER_S));
    throw new HttpException(blocked, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
