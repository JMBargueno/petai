/**
 * Cliente REST minimalista para los endpoints dev del backend (`/dev/*`).
 * Usa el `fetch` global de Node (>= 18). El `baseUrl` incluye el prefijo global de la API (`v1`).
 */
export interface HttpClientOptions {
  /** Base URL. Por defecto `http://localhost:3000/v1` (o `PETAI_API_URL`). */
  baseUrl?: string;
}

export interface HttpError extends Error {
  status?: number;
  body?: unknown;
}

export class HttpClient {
  private readonly baseUrl: string;

  constructor(opts: HttpClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.PETAI_API_URL ?? 'http://localhost:3000/v1').replace(/\/+$/, '');
  }

  async get<T = any>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T = any>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const url = this.baseUrl + path;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(`No se pudo conectar con ${url}: ${(err as Error).message}. ¿Está corriendo el backend dev?`);
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const e = new Error(`HTTP ${res.status} en ${method} ${path}: ${JSON.stringify(json)}`) as HttpError;
      e.status = res.status;
      e.body = json;
      throw e;
    }
    return json as T;
  }
}