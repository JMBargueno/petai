import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import site from '../site.json';

/** Origen del backend (sin `/v1`). Se configura en site.json → `apiUrl`. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => site.apiUrl.replace(/\/$/, ''),
});

/** Dónde se guarda la sesión del panel: sessionStorage (se pierde al cerrar la pestaña). Los tests lo sustituyen. */
export const SESSION_STORAGE = new InjectionToken<Storage>('SESSION_STORAGE', {
  providedIn: 'root',
  factory: () => sessionStorage,
});

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  permissions: string[];
}

export interface AdminSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const KEY = 'pockai.admin.session';

/**
 * Cliente HTTP del panel contra el backend (`/v1/*`). Añade el Bearer, renueva el access token
 * una vez ante un 401 y, si no puede, cierra la sesión local.
 */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly base = inject(API_BASE_URL);
  private readonly storage = inject(SESSION_STORAGE);
  private readonly _session = signal<AdminSession | null>(this.read());
  readonly session = this._session.asReadonly();
  private refreshing: Promise<boolean> | null = null;

  setSession(session: AdminSession | null) {
    this._session.set(session);
    if (session) this.storage.setItem(KEY, JSON.stringify(session));
    else this.storage.removeItem(KEY);
  }

  async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const session = this._session();
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
          ...init.headers,
        },
      });
    } catch {
      throw new ApiError(0, 'No se puede conectar con el servidor');
    }

    if (res.status === 401 && session && retry) {
      if (await this.refresh()) return this.request<T>(path, init, false);
      this.setSession(null);
      throw new ApiError(401, 'La sesión ha caducado. Vuelve a entrar.');
    }
    if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  /** Renueva el par de tokens (una sola petición aunque varias llamadas fallen a la vez). */
  private refresh(): Promise<boolean> {
    this.refreshing ??= (async () => {
      const current = this._session();
      if (!current) return false;
      try {
        const tokens = await this.request<{ accessToken: string; refreshToken: string }>(
          '/v1/auth/refresh',
          { method: 'POST', body: JSON.stringify({ refreshToken: current.refreshToken }) },
          false,
        );
        this.setSession({ ...current, ...tokens });
        return true;
      } catch {
        return false;
      }
    })().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private read(): AdminSession | null {
    try {
      const raw = this.storage.getItem(KEY);
      return raw ? (JSON.parse(raw) as AdminSession) : null;
    } catch {
      return null;
    }
  }
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message[0] : body.message;
    if (message) return message;
  } catch {
    // Respuesta sin JSON: se usa el mensaje genérico.
  }
  return `Error del servidor (${res.status})`;
}
