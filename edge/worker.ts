/**
 * Edge function de PetAI — proxy passthrough al origin autoritativo (feature 009-edge-cdn).
 *
 * S-01: el «fast-path» de refresh (un refresh JWT RS256 de 7 días que el edge verificaba
 * stateless contra el JWKS) se eliminó: anulaba la revocación (logout / cambio de contraseña /
 * reutilización) y llevaba `JWT_ACCESS_SECRET` a Cloudflare. Ahora todo path — incluido
 * `POST /v1/auth/refresh` — se reenvía al origin, que rota el refresh de forma autoritativa y
 * permite revocarlo. El edge solo añade la métrica de latencia `petai_cdn_refresh_ms`, expuesta
 * en `GET /__metrics`.
 *
 * F-07: el proxy es passthrough fiel en TODAS las rutas: reenvía al origin el method, las
 * cabeceras relevantes y el stream del cuerpo de la petición, y devuelve la respuesta del origin
 * con su estado real, cabeceras y cuerpo — SIN leerlos (`res.text()`). Así sobreviven el
 * streaming SSE, los binarios (`/assets/*`), los 201/204, los cuerpos de validación y el
 * `Retry-After`.
 *
 * R-07: las observaciones de latencia ya no acumulan en un array sin límite: se agregan al
 * registrar (histogram buckets, `BUCKETS`), por lo que la memoria queda acotada a una entrada
 * por par (región, outcome) y el histogram Prometheus sigue exponiéndose en /__metrics.
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

/** F-07: cabeceras hop-by-hop (RFC 7230 §6.1) + las que el fetch al origin recalcula. */
const NON_FORWARDED_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

/** R-07: histograma acotado — sum/count/buckets acumulados por par (región, outcome). */
interface Histogram {
  sum: number;
  count: number;
  /** Conteos acumulados por bucket: `buckets[i]` = nº de observaciones con ms <= BUCKETS[i]. */
  buckets: number[];
}

const histograms = new Map<string, Histogram>();

/** Solo para tests: comprobar que las métricas se agregan en grupos acotados (R-07). */
export const __testing = {
  reset: (): void => histograms.clear(),
  groups: (): number => histograms.size,
};

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
   * F-07: passthrough fiel de cualquier petición al origin autoritativo.
   * - Reenvía el method, las cabeceras relevantes (salvo hop-by-hop) y el stream del cuerpo.
   * - Devuelve la respuesta del origin tal cual: su estado, cabeceras y cuerpo — el cuerpo se
   *   pasa como stream sin leerlo (SSE, binarios, 201/204, mensajes de validación y
   *   `Retry-After` se conservan).
   * - Mide la latencia (outcome `origin`); fallo de red/origin → 502.
   */
  async fallbackOrigin(request: Request, env: Env, region?: string, startedAt?: number): Promise<Response> {
    const reg = region ?? regionOf(request);
    const start = startedAt ?? performance.now();
    const u = new URL(request.url);
    const target = env.ORIGIN_URL.replace(/\/?$/, '') + u.pathname + u.search;

    const headers = new Headers(request.headers);
    for (const name of NON_FORWARDED_HEADERS) headers.delete(name);

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body !== null;
    const init: RequestInit = { method: request.method, headers };
    if (hasBody) {
      init.body = request.body;
      // `duplex` es necesario para reenviar el stream de la petición en runtimes como Node;
      // en Cloudflare es una opción desconocida que se ignora.
      (init as RequestInit & { duplex?: 'half' }).duplex = 'half';
    }

    try {
      const res = await fetch(target, init);
      recordObservation(reg, 'origin', performance.now() - start);
      return passthrough(res);
    } catch {
      recordObservation(reg, 'origin', performance.now() - start);
      return jsonError(502, 'Origin no disponible');
    }
  },
};

/** F-07: devuelve la respuesta del origin con sus estado/cabeceras/cuerpo intactos (streaming). */
function passthrough(res: Response): Response {
  const headers = new Headers();
  res.headers.forEach((value, key) => {
    if (!NON_FORWARDED_HEADERS.has(key)) headers.set(key, value);
  });
  return new Response(res.body, { status: res.status, headers });
}

/** R-07: agrega la observación directamente al histograma (memoria acotada, sin array por petición). */
function recordObservation(region: string, outcome: string, ms: number): void {
  const key = `${region}|${outcome}`;
  let h = histograms.get(key);
  if (!h) {
    h = { sum: 0, count: 0, buckets: new Array<number>(BUCKETS.length).fill(0) };
    histograms.set(key, h);
  }
  const v = Math.max(0, ms);
  h.sum += v;
  h.count += 1;
  for (let i = 0; i < BUCKETS.length; i++) if (v <= BUCKETS[i]) h.buckets[i] += 1;
}

/**
 * Renderiza `petai_cdn_refresh_ms` en formato Prometheus. El nombre se conserva por compatibilidad
 * con los dashboards existentes (ahora cubre toda petición proxy, incluido el refresh).
 */
function renderMetrics(): string {
  const lines: string[] = [
    '# HELP petai_cdn_refresh_ms Latencia de las peticiones proxy al origin (ms) por región y outcome (incluye el auth refresh).',
    '# TYPE petai_cdn_refresh_ms histogram',
  ];
  for (const [key, h] of histograms) {
    const [region, outcome] = key.split('|');
    for (let i = 0; i < BUCKETS.length; i++) {
      lines.push(
        `petai_cdn_refresh_ms_bucket{region="${region}",outcome="${outcome}",le="${BUCKETS[i]}"} ${h.buckets[i]}`,
      );
    }
    lines.push(`petai_cdn_refresh_ms_bucket{region="${region}",outcome="${outcome}",le="+Inf"} ${h.count}`);
    lines.push(`petai_cdn_refresh_ms_sum{region="${region}",outcome="${outcome}"} ${h.sum}`);
    lines.push(`petai_cdn_refresh_ms_count{region="${region}",outcome="${outcome}"} ${h.count}`);
  }
  return lines.join('\n') + '\n';
}