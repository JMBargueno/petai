import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { API_BASE_URL, WEB_CLIENT_HEADERS } from '../auth/api';
import { BackendStatus } from './backend-status';

/** A quién afecta el mantenimiento manual: solo la web, solo las apps o todo. */
export type MaintenanceScope = 'web' | 'apps' | 'all';

export interface MaintenanceConfig {
  enabled: boolean;
  scope: MaintenanceScope;
  /** Mensaje del panel en cada idioma (null = texto por defecto). */
  message: { es: string | null; en: string | null };
}

export interface SiteConfig {
  inviteRequired: boolean;
  comingSoon: { enabled: boolean; countdown: { enabled: boolean; launchAt: string | null } };
  maintenance: MaintenanceConfig;
}

/** Clave de la copia local: el script de index.html la lee para no enseñar la web un instante antes de taparla. */
export const SITE_CONFIG_KEY = 'pockai.siteConfig';

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  inviteRequired: false,
  comingSoon: { enabled: false, countdown: { enabled: false, launchAt: null } },
  maintenance: { enabled: false, scope: 'all', message: { es: null, en: null } },
};

/** Si el backend no contesta en este tiempo se da por caído (un origen muerto tras el CDN puede colgarse mucho más). */
export const CONFIG_TIMEOUT_MS = 6_000;
/** Reintentos mientras el backend está caído: 5 s, 10 s, 20 s… hasta 60 s. */
export const RETRY_MIN_MS = 5_000;
export const RETRY_MAX_MS = 60_000;
/** Con el mantenimiento manual activo se vuelve a mirar cada minuto para levantar la pantalla sola. */
export const MAINTENANCE_POLL_MS = 60_000;

/**
 * Configuración pública de la web (`GET /v1/site/config`): ¿hace falta invitación para registrarse?
 * ¿está la landing «Coming soon» o el mantenimiento activos? Solo se pide en el navegador; mientras
 * llega se usa la última copia guardada. `loaded` indica que ya hay respuesta del servidor (o que ha
 * fallado). `backendDown` se activa si el backend no responde (red, tiempo agotado o 5xx) y se
 * vuelve a comprobar solo, con esperas crecientes, hasta que vuelve.
 */
@Injectable({ providedIn: 'root' })
export class SiteConfigService {
  private readonly base = inject(API_BASE_URL);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _config = signal<SiteConfig>(this.cached() ?? DEFAULT_SITE_CONFIG);
  private readonly _loaded = signal(false);
  private readonly _backendDown = signal(false);
  private loading: Promise<SiteConfig> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;

  readonly config = this._config.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly backendDown = this._backendDown.asReadonly();
  /** Había copia local al arrancar: se puede decidir el gate sin esperar a la red. */
  readonly hadCache = this.cached() !== null;

  constructor() {
    if (!this.browser) return;
    // Una llamada cualquiera a la API que no llega o recibe un 503 de mantenimiento: volver a mirar.
    const stop = inject(BackendStatus).listen(() => {
      if (!this.loading) void this.load(true);
    });
    inject(DestroyRef).onDestroy(() => {
      stop();
      this.clearTimer();
    });
  }

  load(force = false): Promise<SiteConfig> {
    if (!this.browser) return Promise.resolve(this._config());
    if (force && this.loading) return this.loading.then(() => this.load());
    if (force) this.loading = null;
    this.loading ??= this.fetchConfig().finally(() => {
      this.loading = null;
      this._loaded.set(true);
      this.schedule();
    });
    return this.loading;
  }

  private async fetchConfig(): Promise<SiteConfig> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), CONFIG_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.base}/v1/site/config`, {
        headers: { Accept: 'application/json', ...WEB_CLIENT_HEADERS },
        signal: abort.signal,
      });
      // 5xx (502/504 del CDN con el origen caído, 503 sin base de datos…): el backend no está.
      if (res.status >= 500) throw new Error(String(res.status));
      if (!res.ok) {
        // 4xx inesperado: el backend responde, se mantiene la última configuración conocida.
        this.markUp();
        return this._config();
      }
      const config = normalize(await res.json());
      this._config.set(config);
      this.markUp();
      try {
        localStorage.setItem(SITE_CONFIG_KEY, JSON.stringify(config));
      } catch {
        // Sin almacenamiento: no pasa nada, se pedirá en cada visita.
      }
    } catch {
      this.failures++;
      this._backendDown.set(true);
    } finally {
      clearTimeout(timeout);
    }
    return this._config();
  }

  private markUp() {
    this.failures = 0;
    this._backendDown.set(false);
  }

  /** Programa la siguiente comprobación: con el backend caído o en mantenimiento, para salir sola. */
  private schedule() {
    this.clearTimer();
    let delay: number | null = null;
    if (this._backendDown()) delay = Math.min(RETRY_MIN_MS * 2 ** Math.max(0, this.failures - 1), RETRY_MAX_MS);
    else if (this._config().maintenance.enabled) delay = MAINTENANCE_POLL_MS;
    if (delay === null) return;
    this.timer = setTimeout(() => void this.load(true), delay);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
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

const SCOPES: readonly MaintenanceScope[] = ['web', 'apps', 'all'];

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function normalize(raw: unknown): SiteConfig {
  const r = (raw ?? {}) as Partial<SiteConfig>;
  const m = (r.maintenance ?? {}) as Partial<MaintenanceConfig>;
  return {
    inviteRequired: !!r.inviteRequired,
    comingSoon: {
      enabled: !!r.comingSoon?.enabled,
      countdown: {
        enabled: !!r.comingSoon?.countdown?.enabled,
        launchAt: typeof r.comingSoon?.countdown?.launchAt === 'string' ? r.comingSoon.countdown.launchAt : null,
      },
    },
    maintenance: {
      enabled: !!m.enabled,
      scope: SCOPES.includes(m.scope as MaintenanceScope) ? (m.scope as MaintenanceScope) : 'all',
      message: { es: text(m.message?.es), en: text(m.message?.en) },
    },
  };
}
