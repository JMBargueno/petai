import { InjectionToken, inject } from '@angular/core';
import { AdminApi } from '../api';

/** A quién afecta el mantenimiento: solo la web, solo las apps (escritorio y móvil) o todo. */
export type MaintenanceScope = 'web' | 'apps' | 'all';

export interface SiteSettings {
  comingSoonEnabled: boolean;
  comingSoonCountdownEnabled: boolean;
  comingSoonLaunchAt: string | null;
  maintenanceEnabled: boolean;
  maintenanceScope: MaintenanceScope;
  maintenanceMessageEs: string | null;
  maintenanceMessageEn: string | null;
}

/** Ajustes de la web pública (`/v1/admin/site-settings`, permiso `site:manage`). */
export class SiteHttp {
  constructor(private readonly api: AdminApi) {}

  get(): Promise<SiteSettings> {
    return this.api.request<SiteSettings>('/v1/admin/site-settings');
  }

  /** Cambio parcial: solo se envían los campos que cambian. */
  update(patch: Partial<SiteSettings>): Promise<SiteSettings> {
    return this.api.request<SiteSettings>('/v1/admin/site-settings', { method: 'PATCH', body: JSON.stringify(patch) });
  }
}

export const SITE = new InjectionToken<SiteHttp>('SITE', {
  providedIn: 'root',
  factory: () => new SiteHttp(inject(AdminApi)),
});
