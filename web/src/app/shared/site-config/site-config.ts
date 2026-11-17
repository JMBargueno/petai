import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { API_BASE_URL } from '../auth/api';

export interface SiteConfig {
  inviteRequired: boolean;
  comingSoon: { enabled: boolean; countdown: { enabled: boolean; launchAt: string | null } };
}

/** Clave de la copia local: el script de index.html la lee para no enseñar la web un instante antes de taparla. */
export const SITE_CONFIG_KEY = 'pockai.siteConfig';

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  inviteRequired: false,
  comingSoon: { enabled: false, countdown: { enabled: false, launchAt: null } },
};

/**
 * Configuración pública de la web (`GET /v1/site/config`): ¿hace falta invitación para registrarse?
 * ¿está la landing «Coming soon» activa? Solo se pide en el navegador; mientras llega se usa la última
 * copia guardada. `loaded` indica que ya hay respuesta del servidor (o que ha fallado).
 */
@Injectable({ providedIn: 'root' })
export class SiteConfigService {
  private readonly base = inject(API_BASE_URL);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _config = signal<SiteConfig>(this.cached() ?? DEFAULT_SITE_CONFIG);
  private readonly _loaded = signal(false);
  private loading: Promise<SiteConfig> | null = null;

  readonly config = this._config.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  /** Había copia local al arrancar: se puede decidir el gate sin esperar a la red. */
  readonly hadCache = this.cached() !== null;

  load(force = false): Promise<SiteConfig> {
    if (!this.browser) return Promise.resolve(this._config());
    if (force) this.loading = null;
    this.loading ??= (async () => {
      try {
        const res = await fetch(`${this.base}/v1/site/config`, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        const config = normalize(await res.json());
        this._config.set(config);
        try {
          localStorage.setItem(SITE_CONFIG_KEY, JSON.stringify(config));
        } catch {
          // Sin almacenamiento: no pasa nada, se pedirá en cada visita.
        }
      } catch {
        // Sin conexión con el backend: se queda la copia local (o la web abierta si no la hay).
      }
      this._loaded.set(true);
      return this._config();
    })();
    return this.loading;
  }

  private cached(): SiteConfig | null {
    if (!this.browser) return null;
    try {
      const raw = localStorage.getItem(SITE_CONFIG_KEY);
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }
}

function normalize(raw: unknown): SiteConfig {
  const r = (raw ?? {}) as Partial<SiteConfig>;
  return {
    inviteRequired: !!r.inviteRequired,
    comingSoon: {
      enabled: !!r.comingSoon?.enabled,
      countdown: {
        enabled: !!r.comingSoon?.countdown?.enabled,
        launchAt: typeof r.comingSoon?.countdown?.launchAt === 'string' ? r.comingSoon.countdown.launchAt : null,
      },
    },
  };
}
