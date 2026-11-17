import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import site from '../../site.json';

/** Origen del backend (sin `/v1`). Se configura en site.json → `apiUrl`. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => site.apiUrl.replace(/\/$/, ''),
});

/**
 * Dónde se guarda la sesión de la web (y del panel): localStorage, para que siga abierta entre visitas.
 * En el prerender (sin navegador) o con el almacenamiento bloqueado se usa memoria. Los tests lo sustituyen.
 */
export const SESSION_STORAGE = new InjectionToken<Storage>('SESSION_STORAGE', {
  providedIn: 'root',
  factory: () => browserStorage(),
});

export function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

/** localStorage si existe y deja escribir; si no (SSR, modo privado estricto), memoria. */
export function browserStorage(): Storage {
  try {
    if (typeof localStorage === 'undefined') return memoryStorage();
    const probe = '__pockai_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return memoryStorage();
  }
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  permissions: string[];
  /** Nickname público (null en cuentas antiguas que aún no lo han elegido). */
  handle?: string | null;
  /** Correo verificado: hace falta para pasar la landing «Coming soon» y para descargar. */
  emailVerified?: boolean;
}

export interface UserSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Código de error del backend (p. ej. `EMAIL_NOT_VERIFIED`). */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const SESSION_KEY = 'pockai.session';

/**
 * Cliente HTTP de la web y del panel contra el backend (`/v1/*`). Añade el Bearer, renueva el
 * access token una vez ante un 401 y, si no puede, cierra la sesión local.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly base = inject(API_BASE_URL);
  private readonly storage = inject(SESSION_STORAGE);
  private readonly _session = signal<UserSession | null>(this.read());
  readonly session = this._session.asReadonly();
  private refreshing: Promise<boolean> | null = null;

  setSession(session: UserSession | null) {
    this._session.set(session);
    try {
      if (session) this.storage.setItem(SESSION_KEY, JSON.stringify(session));
      else this.storage.removeItem(SESSION_KEY);
    } catch {
      // Almacenamiento lleno o bloqueado: la sesión sigue en memoria.
    }
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
      throw new ApiError(0, $localize`:@@api.offline:No se puede conectar con el servidor`);
    }

    if (res.status === 401 && session && retry) {
      if (await this.refresh()) return this.request<T>(path, init, false);
      this.setSession(null);
      throw new ApiError(401, $localize`:@@api.expired:La sesión ha caducado. Vuelve a entrar.`);
    }
    if (!res.ok) {
      const { message, code } = await errorBody(res);
      throw new ApiError(res.status, message, code);
    }
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

  private read(): UserSession | null {
    try {
      const raw = this.storage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as UserSession) : null;
    } catch {
      return null;
    }
  }
}

async function errorBody(res: Response): Promise<{ message: string; code?: string }> {
  const fallback = $localize`:@@api.serverError:Error del servidor (${res.status}:status:)`;
  try {
    const body = (await res.json()) as { message?: string | string[]; code?: string };
    const message = Array.isArray(body.message) ? body.message[0] : body.message;
    return { message: message || fallback, code: body.code };
  } catch {
    // Respuesta sin JSON: se usa el mensaje genérico.
    return { message: fallback };
  }
}
