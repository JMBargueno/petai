/**
 * Cliente de auth refresh del desktop (feature 009-edge-cdn, T021).
 *
 * Renueva la sesión con el refresh JWT fast-path intentando PRIMERO el edge (`POST /v1/auth/refresh`
 * resuelto en Cloudflare, p95 < 50ms) y, si no puede, un **reintento único** al origin
 * autoritativo. El cliente no percibe el cambio (FR-012).
 *
 * - Edge: `VITE_EDGE_URL` (p. ej. `https://edge.petai.app`). Si no se define, se salta el edge.
 * - Origin: `VITE_API_URL`/`API_BASE_URL` (`/v1/auth/refresh`).
 *
 * `400`/`401` (sesión inválida/revocada) ⇒ no se reintentan (devuelve `null`); los fallos de red o
 * `5xx` ⇒ prueban la siguiente fuente.
 */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface RefreshUser {
  id: string;
  email: string | null;
  displayName: string | null;
}

export interface RefreshResult {
  accessToken: string;
  /** Refresh fast-path devuelto por el edge (mismo que el enviado; la rotación la hace origin). */
  refreshToken: string;
  /** Refresh token autoritativo de origin (si lo devuelve). */
  refreshFastPath?: string;
  user: RefreshUser;
}

export interface AuthClientOptions {
  /** Base del edge (sin trailing slash). Opcional. */
  edgeBaseUrl?: string;
  /** Base del origin (sin trailing slash). Opcional. */
  originBaseUrl?: string;
  /** `fetch` a usar (default `globalThis.fetch`). */
  fetch?: Fetcher;
}

export class AuthClient {
  constructor(private readonly opts: AuthClientOptions) {}

  private get fetch(): Fetcher {
    return this.opts.fetch ?? ((...args) => fetch(...args));
  }

  /**
   * Refresh vía edge primero y, si no, origin (1 reintento). Devuelve el resultado o `null` si la
   * sesión es inválida/revocada (400/401) o ambas fuentes fallan.
   */
  async refresh(refreshToken: string): Promise<RefreshResult | null> {
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) return null;

    // 1) Edge (fast-path stateless).
    if (this.opts.edgeBaseUrl) {
      const viaEdge = await this.call(
        `${this.opts.edgeBaseUrl.replace(/\/?$/, '')}/v1/auth/refresh`,
        refreshToken,
      );
      if (viaEdge) return viaEdge;
      // `null` del edge puede ser 4xx (sesión inválida) o 5xx/red: en cualquier caso, probamos origin.
    }

    // 2) Origin autoritativo (1 reintento).
    if (this.opts.originBaseUrl) {
      return this.call(`${this.opts.originBaseUrl.replace(/\/?$/, '')}/auth/refresh`, refreshToken);
    }

    return null;
  }

  private async call(url: string, refreshToken: string): Promise<RefreshResult | null> {
    let res: Response;
    try {
      res = await this.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      return null; // red: prueba la siguiente fuente
    }
    // Sesión inválida/revocada: no se reintenta.
    if (res.status === 400 || res.status === 401) return null;
    if (!res.ok) return null; // 5xx/502: prueba la siguiente fuente
    const data = (await res.json().catch(() => null)) as RefreshResult | null;
    if (!data?.accessToken) return null;
    return data;
  }
}

/** Construye el `AuthClient` del desktop a partir de las variables de entorno de Vite. */
export function createAuthClient(): AuthClient {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const edge = (env.VITE_EDGE_URL as string | undefined)?.trim().replace(/\/+$/, '');
  const api = (env.VITE_API_URL as string | undefined)?.trim().replace(/\/+$/, '');
  return new AuthClient({
    edgeBaseUrl: edge || undefined,
    originBaseUrl: api ? `${api}/v1` : undefined,
  });
}