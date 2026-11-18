import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { hasPermission } from '../authz/permissions';
import { classifyClient, DEFAULT_MAINTENANCE_MESSAGE, MAINTENANCE_CODE, scopeIncludes } from './maintenance';
import { SiteSettingsService } from './site-settings.service';

/** Cuánto se recuerda si un usuario puede saltarse el mantenimiento (evita una consulta por petición). */
const ADMIN_CACHE_TTL_MS = 30_000;
const ADMIN_CACHE_MAX = 1000;

export interface MaintenanceRequest {
  /** Cabecera `X-Client`. */
  client?: unknown;
  /** Cabecera `Origin`. */
  origin?: unknown;
  /** Cabecera `Authorization` (Bearer) o token suelto (handshake del socket). */
  authorization?: unknown;
}

export interface MaintenanceBody {
  statusCode: 503;
  code: typeof MAINTENANCE_CODE;
  message: string;
  messages: { es: string; en: string };
}

/**
 * Decide si una petición queda bloqueada por el mantenimiento manual. La comparten el guard HTTP y
 * el gateway de tiempo real. Los usuarios con acceso al panel (`admin:access`) siempre pasan: el
 * token se comprueba aquí porque el guard global corre antes que `JwtAuthGuard`.
 */
@Injectable()
export class MaintenanceService {
  private readonly admins = new Map<string, { ok: boolean; at: number }>();

  constructor(
    private readonly settings: SiteSettingsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Devuelve el cuerpo del 503 si hay que bloquear, o null si la petición puede seguir. */
  async check(req: MaintenanceRequest): Promise<MaintenanceBody | null> {
    const m = await this.settings.getMaintenance();
    if (!m.enabled) return null;
    if (!scopeIncludes(m.scope, classifyClient(req.client, req.origin))) return null;
    if (await this.isAdmin(req.authorization)) return null;
    const messages = {
      es: m.message.es || DEFAULT_MAINTENANCE_MESSAGE.es,
      en: m.message.en || DEFAULT_MAINTENANCE_MESSAGE.en,
    };
    return { statusCode: 503, code: MAINTENANCE_CODE, message: messages.es, messages };
  }

  private async isAdmin(authorization: unknown): Promise<boolean> {
    if (typeof authorization !== 'string' || !authorization || authorization.length > 4096) return false;
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization;
    let sub: unknown;
    try {
      sub = this.jwt.verify<{ sub?: unknown }>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        algorithms: ['HS256'],
      }).sub;
    } catch {
      return false; // sin sesión válida: se trata como un visitante más (nunca 401 aquí)
    }
    if (typeof sub !== 'string') return false;

    const cached = this.admins.get(sub);
    if (cached && Date.now() - cached.at < ADMIN_CACHE_TTL_MS) return cached.ok;
    const user = await this.prisma.user.findUnique({ where: { id: sub }, select: { role: true } });
    const ok = !!user && hasPermission(user.role, 'admin:access');
    if (this.admins.size >= ADMIN_CACHE_MAX) this.admins.clear();
    this.admins.set(sub, { ok, at: Date.now() });
    return ok;
  }
}
