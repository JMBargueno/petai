/**
 * Edge function de PetAI para el auth refresh (feature 009-edge-cdn, US3/T020).
 *
 * `POST /v1/auth/refresh` se resuelve primero AQUÍ (fast-path stateless): se verifica el
 * "refresh JWT fast-path" (RS256) contra el JWKS público y, si es válido, se emite un access
 * JWT HS256 sin tocar la base de datos. p95 < 50ms (AC3/SC-002).
 *
 * Fallback transparente: si el token NO es un fast-path válido (legacy/revocado/expirado) o el
 * edge falla, se reenvía al origin `POST /v1/auth/refresh` (autoritativo). Métrica
 * `petai_cdn_refresh_ms` por región y outcome (edge/origin) — expuesta en `GET /__metrics`.
 *
 * El edge NO loguea tokens en claro (Constitución V/VIII) y solo mantiene la clave pública (JWKS).
 */
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';

export interface Env {
  /** Origin autoritativo (p. ej. `https://api.petai.app`). */
  ORIGIN_URL: string;
  /** URL del JWKS público del fast-path (p. ej. `https://api.petai.app/v1/auth/jwks`). */
  JWT_PUBLIC_KEY_JWKS_URL: string;
  /** Secreto para firmar el access JWT (HS256, mismo que origin). */
  JWT_ACCESS_SECRET: string;
  /** TTL del access JWT (p. ej. `15m`). Por defecto 15 min. */
  JWT_ACCESS_EXPIRES_IN?: string;
}

const BUCKETS = [5, 10, 20, 30, 50, 75, 100, 150, 250, 500, 1000];
const refreshObservations: Array<{ region: string; outcome: string; ms: number }> = [];

/** Región del cliente (Cloudflare expone `cf.country`). */
function regionOf(req: Request): string {
  const cf = (req as unknown as { cf?: { country?: string } }).cf;
  return cf?.country || req.headers.get('x-region') || 'unknown';
}

/** Convierte un TTL tipo `15m`/`1h`/`7d` a segundos. */
function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!m) return 15 * 60;
  const n = Number(m[1]);
  const per = m[2] === 's' ? 1 : m[2] === 'm' ? 60 : m[2] === 'h' ? 3600 : 86400;
  return n * per;
}

function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function jsonError(status: number, message: string): Response {
  return jsonOk({ statusCode: status, message }, status);
}

/** Firma un access JWT HS256 (mismo criterio que origin). */
async function signAccessToken(env: Env, payload: { sub: string; email?: string }): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + ttlToSeconds(env.JWT_ACCESS_EXPIRES_IN || '15m');
  return new SignJWT({ email: payload.email ?? null, typ: 'access' })
    .setSubject(payload.sub)
    .setIssuedAt(nowSec)
    .setExpirationTime(expSec)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
}

export default {
  async fetch(request: Request, env: Env, _ctx: unknown): Promise<Response> {
    const url = new URL(request.url);

    // Endpoint oculto de métricas del edge (Prometheus text).
    if (url.pathname === '/__metrics') {
      return new Response(renderMetrics(), { headers: { 'Content-Type': 'text/plain; version=0.0.4' } });
    }

    const isRefresh = request.method === 'POST' && url.pathname.endsWith('/auth/refresh');
    if (!isRefresh) {
      // Cualquier otro path se reenvía al origin (passthrough).
      return this.fallbackOrigin(request, env);
    }

    const startedAt = performance.now();
    const region = regionOf(request);

    let body: { refreshToken?: unknown } | null = null;
    try {
      body = await request.clone().json();
    } catch {
      return jsonError(400, 'refreshToken requerido');
    }
    const refreshToken = body?.refreshToken;
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      return jsonError(400, 'refreshToken requerido');
    }

    // Fast-path: verificar el refresh JWT fast-path (RS256) contra el JWKS (stateless, sin DB).
    try {
      const jwks = createRemoteJWKSet(new URL(env.JWT_PUBLIC_KEY_JWKS_URL));
      const { payload } = await jwtVerify(refreshToken, jwks, { algorithms: ['RS256'] });
      if (payload.typ !== 'refresh') throw new Error('typ inválido');
      if (!payload.sub || !payload.jti) throw new Error('claims faltantes');

      const p = payload as { sub: string; email?: string; displayName?: string };
      const accessToken = await signAccessToken(env, { sub: p.sub, email: p.email });
      const user = { id: p.sub, email: p.email ?? null, displayName: p.displayName ?? null };

      recordRefresh(region, 'edge', performance.now() - startedAt);
      // Se devuelve el mismo refresh fast-path (la rotación la hace origin; el edge no tiene la clave privada).
      return jsonOk({ accessToken, refreshToken, user });
    } catch {
      // Legacy / revocado / expirado / error → fallback transparente al origin.
      return await this.fallbackOrigin(request, env, region, startedAt);
    }
  },

  /**
   * Reenvía la petición al origin autoritativo. Mide la latencia (outcome `origin`) y traduce los
   * errores: 401 → sesión inválida; fallo de red/origin → 502.
   */
  async fallbackOrigin(request: Request, env: Env, region?: string, startedAt?: number): Promise<Response> {
    const reg = region ?? regionOf(request);
    const start = startedAt ?? performance.now();
    const u = new URL(request.url);
    const target = env.ORIGIN_URL.replace(/\/?$/, '') + u.pathname + u.search;

    const headers = new Headers();
    const ct = request.headers.get('Content-Type');
    if (ct) headers.set('Content-Type', ct);
    const auth = request.headers.get('Authorization');
    if (auth) headers.set('Authorization', auth);

    try {
      const res = await fetch(target, {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text(),
      });
      recordRefresh(reg, 'origin', performance.now() - start);
      const text = await res.text();

      if (res.status === 401) return jsonError(401, 'Sesión inválida');
      if (!res.ok) return jsonError(res.status >= 500 ? 502 : res.status, mapOriginMessage(res.status));
      return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch {
      recordRefresh(reg, 'origin', performance.now() - start);
      return jsonError(502, 'Origin no disponible');
    }
  },
};

function recordRefresh(region: string, outcome: string, ms: number): void {
  refreshObservations.push({ region, outcome, ms: Math.max(0, ms) });
}

/** Renderiza `petai_cdn_refresh_ms` en formato Prometheus. */
function renderMetrics(): string {
  const lines: string[] = [
    '# HELP petai_cdn_refresh_ms Latencia del auth refresh (ms) por región y outcome.',
    '# TYPE petai_cdn_refresh_ms histogram',
  ];
  const by = new Map<string, number[]>();
  for (const o of refreshObservations) {
    const key = `${o.region}|${o.outcome}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key)!.push(o.ms);
  }
  for (const [key, values] of by) {
    const [region, outcome] = key.split('|');
    let sum = 0;
    let count = 0;
    const bucketCounts = BUCKETS.map(() => 0);
    for (const v of values) {
      sum += v;
      count++;
      for (let i = 0; i < BUCKETS.length; i++) if (v <= BUCKETS[i]) bucketCounts[i]++;
    }
    for (let i = 0; i < BUCKETS.length; i++) {
      lines.push(
        `petai_cdn_refresh_ms_bucket{region="${region}",outcome="${outcome}",le="${BUCKETS[i]}"} ${bucketCounts[i]}`,
      );
    }
    lines.push(`petai_cdn_refresh_ms_bucket{region="${region}",outcome="${outcome}",le="+Inf"} ${count}`);
    lines.push(`petai_cdn_refresh_ms_sum{region="${region}",outcome="${outcome}"} ${sum}`);
    lines.push(`petai_cdn_refresh_ms_count{region="${region}",outcome="${outcome}"} ${count}`);
  }
  return lines.join('\n') + '\n';
}

function mapOriginMessage(status: number): string {
  if (status === 401) return 'Sesión inválida';
  if (status >= 500) return 'Origin no disponible';
  return 'Error del origin';
}