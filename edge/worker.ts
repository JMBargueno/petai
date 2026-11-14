/**
 * Edge function de PetAI — proxy passthrough al origin autoritativo (feature 009-edge-cdn).
 *
 * S-01: el «fast-path» de refresh (un refresh JWT RS256 de 7 días que el edge verificaba
 * stateless contra el JWKS) se eliminó: anulaba la revocación (logout / cambio de contraseña /
 * reutilización) y llevaba `JWT_ACCESS_SECRET` a Cloudflare. Ahora todo path — incluido
 * `POST /v1/auth/refresh` — se reenvía al origin, que rota el refresh de forma autoritativa y
 * permite revocarlo. El edge solo añade la métrica de latencia `petai_cdn_refresh_ms`, expuesta
 * en `GET /__metrics`.
 */
export interface Env {
  /** Origin autoritativo (p. ej. `https://api.petai.app`). */
  ORIGIN_URL: string;
  /**
   * S-20: token opcional para el endpoint `GET /__metrics`. Si se define, exige
   * `Authorization: Bearer <token>` (o `?token=`); si no se define, el endpoint responde 404
   * (deshabilitado). Secure-by-default: las métricas no se exponen sin configurar este secreto.
   */
  EDGE_METRICS_TOKEN?: string;
}

const BUCKETS = [5, 10, 20, 30, 50, 75, 100, 150, 250, 500, 1000];
const refreshObservations: Array<{ region: string; outcome: string; ms: number }> = [];

/** Región del cliente (Cloudflare expone `cf.country`). */
function regionOf(req: Request): string {
  const cf = (req as unknown as { cf?: { country?: string } }).cf;
  return cf?.country || req.headers.get('x-region') || 'unknown';
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ statusCode: status, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: unknown): Promise<Response> {
    const url = new URL(request.url);

    // Endpoint oculto de métricas del edge (Prometheus text). S-20: protegido con
    // EDGE_METRICS_TOKEN (secure-by-default: 404 si no se configuró; 401 si el bearer no coincide).
    if (url.pathname === '/__metrics') {
      const token = env.EDGE_METRICS_TOKEN;
      if (!token) return jsonError(404, 'Not found');
      const auth = request.headers.get('Authorization');
      const provided = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : url.searchParams.get('token') ?? '';
      if (provided !== token) return jsonError(401, 'No autorizado');
      return new Response(renderMetrics(), { headers: { 'Content-Type': 'text/plain; version=0.0.4' } });
    }

    // S-01: el fast-path de refresh se eliminó (token de 7 días irrevocable). Todo path — incluido
    // POST /auth/refresh — pasa por el origin autoritativo, que rota el refresh de forma segura y
    // permite revocarlo (logout / cambio de contraseña / reutilización).
    return this.fallbackOrigin(request, env);
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