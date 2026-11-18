import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parseOrBadRequest } from '../auth/dto/auth.schemas';
import { MAINTENANCE_SCOPES, MaintenanceScope, siteSettingsSchema } from './site.schemas';

const SETTINGS_ID = 1;

/**
 * Cuánto se reutiliza la fila leída. El guard de mantenimiento la consulta en cada petición; con
 * varias réplicas, este TTL es lo que tarda como mucho un cambio del panel en llegar a todas.
 */
export const SETTINGS_CACHE_TTL_MS = 5_000;

type Actor = { id: string };

export interface MaintenanceView {
  enabled: boolean;
  scope: MaintenanceScope;
  message: { es: string | null; en: string | null };
}

export interface SiteSettingsView {
  comingSoonEnabled: boolean;
  comingSoonCountdownEnabled: boolean;
  comingSoonLaunchAt: string | null;
  maintenanceEnabled: boolean;
  maintenanceScope: MaintenanceScope;
  maintenanceMessageEs: string | null;
  maintenanceMessageEn: string | null;
}

export interface SiteConfigView {
  inviteRequired: boolean;
  comingSoon: { enabled: boolean; countdown: { enabled: boolean; launchAt: string | null } };
  maintenance: MaintenanceView;
}

const SELECT = {
  registrationInviteOnly: true,
  comingSoonEnabled: true,
  comingSoonCountdownEnabled: true,
  comingSoonLaunchAt: true,
  maintenanceEnabled: true,
  maintenanceScope: true,
  maintenanceMessageEs: true,
  maintenanceMessageEn: true,
} as const;

type Row = {
  registrationInviteOnly?: boolean;
  comingSoonEnabled?: boolean;
  comingSoonCountdownEnabled?: boolean;
  comingSoonLaunchAt?: Date | null;
  maintenanceEnabled?: boolean;
  maintenanceScope?: string;
  maintenanceMessageEs?: string | null;
  maintenanceMessageEn?: string | null;
} | null;

function toScope(value: string | undefined): MaintenanceScope {
  return (MAINTENANCE_SCOPES as readonly string[]).includes(value ?? '') ? (value as MaintenanceScope) : 'all';
}

/**
 * Ajustes de la web pública guardados en la fila única de `AppSettings`: landing «Coming soon», su
 * cuenta atrás y el modo mantenimiento. Sin fila de ajustes todo queda desactivado (web abierta).
 */
@Injectable()
export class SiteSettingsService {
  private readonly logger = new Logger(SiteSettingsService.name);
  private cache: { row: Row; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Lee la fila; con `cached` reutiliza la última lectura reciente (solo el guard, que va en cada petición). */
  private async row(cached = false): Promise<Row> {
    if (cached && this.cache && Date.now() - this.cache.at < SETTINGS_CACHE_TTL_MS) return this.cache.row;
    const row = (await this.prisma.appSettings.findUnique({ where: { id: SETTINGS_ID }, select: SELECT })) as Row;
    this.cache = { row, at: Date.now() };
    return row;
  }

  /** Olvida la copia en memoria (tras un cambio, o en tests que tocan la tabla directamente). */
  invalidate() {
    this.cache = null;
  }

  async getSettings(): Promise<SiteSettingsView> {
    const s = await this.row();
    return {
      comingSoonEnabled: s?.comingSoonEnabled ?? false,
      comingSoonCountdownEnabled: s?.comingSoonCountdownEnabled ?? false,
      comingSoonLaunchAt: s?.comingSoonLaunchAt?.toISOString() ?? null,
      maintenanceEnabled: s?.maintenanceEnabled ?? false,
      maintenanceScope: toScope(s?.maintenanceScope),
      maintenanceMessageEs: s?.maintenanceMessageEs ?? null,
      maintenanceMessageEn: s?.maintenanceMessageEn ?? null,
    };
  }

  /** Estado del mantenimiento manual (lo usa el guard global en cada petición; va cacheado). */
  async getMaintenance(): Promise<MaintenanceView> {
    const s = await this.row(true);
    return {
      enabled: s?.maintenanceEnabled ?? false,
      scope: toScope(s?.maintenanceScope),
      message: { es: s?.maintenanceMessageEs ?? null, en: s?.maintenanceMessageEn ?? null },
    };
  }

  /** Configuración pública que la web lee sin sesión. */
  async getPublicConfig(): Promise<SiteConfigView> {
    const s = await this.row();
    return {
      inviteRequired: s?.registrationInviteOnly ?? false,
      comingSoon: {
        enabled: s?.comingSoonEnabled ?? false,
        countdown: {
          enabled: s?.comingSoonCountdownEnabled ?? false,
          launchAt: s?.comingSoonLaunchAt?.toISOString() ?? null,
        },
      },
      maintenance: {
        enabled: s?.maintenanceEnabled ?? false,
        scope: toScope(s?.maintenanceScope),
        message: { es: s?.maintenanceMessageEs ?? null, en: s?.maintenanceMessageEn ?? null },
      },
    };
  }

  async setSettings(actor: Actor, raw: unknown): Promise<SiteSettingsView> {
    const input = parseOrBadRequest(siteSettingsSchema, raw);
    const data = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    await this.prisma.$transaction(async (tx) => {
      await tx.appSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...data }, update: data });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          event: 'site_settings_change',
          metadata: { ...data, comingSoonLaunchAt: input.comingSoonLaunchAt?.toISOString() ?? input.comingSoonLaunchAt },
        },
      });
    });
    this.invalidate();
    this.logger.log(`Ajustes del sitio cambiados por ${actor.id}: ${Object.keys(data).join(', ') || '(nada)'}`);
    return this.getSettings();
  }
}
