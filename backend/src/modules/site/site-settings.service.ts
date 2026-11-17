import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parseOrBadRequest } from '../auth/dto/auth.schemas';
import { siteSettingsSchema } from './site.schemas';

const SETTINGS_ID = 1;

type Actor = { id: string };

export interface SiteSettingsView {
  comingSoonEnabled: boolean;
  comingSoonCountdownEnabled: boolean;
  comingSoonLaunchAt: string | null;
}

export interface SiteConfigView {
  inviteRequired: boolean;
  comingSoon: { enabled: boolean; countdown: { enabled: boolean; launchAt: string | null } };
}

const SELECT = {
  registrationInviteOnly: true,
  comingSoonEnabled: true,
  comingSoonCountdownEnabled: true,
  comingSoonLaunchAt: true,
} as const;

/**
 * Ajustes de la web pública guardados en la fila única de `AppSettings`: landing «Coming soon» y su
 * cuenta atrás. Sin fila de ajustes todo queda desactivado (web abierta, registro abierto).
 */
@Injectable()
export class SiteSettingsService {
  private readonly logger = new Logger(SiteSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async row() {
    return this.prisma.appSettings.findUnique({ where: { id: SETTINGS_ID }, select: SELECT });
  }

  async getSettings(): Promise<SiteSettingsView> {
    const s = await this.row();
    return {
      comingSoonEnabled: s?.comingSoonEnabled ?? false,
      comingSoonCountdownEnabled: s?.comingSoonCountdownEnabled ?? false,
      comingSoonLaunchAt: s?.comingSoonLaunchAt?.toISOString() ?? null,
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
    this.logger.log(`Ajustes del sitio cambiados por ${actor.id}: ${Object.keys(data).join(', ') || '(nada)'}`);
    return this.getSettings();
  }
}
