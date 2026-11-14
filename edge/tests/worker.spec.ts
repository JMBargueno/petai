/**
 * Tests del edge de PetAI (proxy passthrough + métricas protegidas + métricas acotadas).
 *
 * S-01: el fast-path de refresh se eliminó; todo path pasa por el origin autoritativo.
 * S-20: el endpoint `GET /__metrics` exige `EDGE_METRICS_TOKEN` (404 si no se configuró, 401 si falla).
 * F-07: el passthrough conserva el estado/cabeceras/cuerpo reales del origin (en streaming, sin leerlos).
 * R-07: las métricas se agregan en un número acotado de grupos (uno por región × outcome).
 *
 * Simula el worker con `fetch` mockeado para el origin (ambiente `node`).
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import worker, { type Env, __testing } from '../worker';

const ORIGIN_URL = 'http://origin.test';
const METRICS_TOKEN = 'sekret-metrics';

const env: Env = { ORIGIN_URL, EDGE_METRICS_TOKEN: METRICS_TOKEN };

let originCalls = 0;
let originMode: 'ok' | 'down' = 'ok';
let lastOriginCall: { url: string; init?: RequestInit } | null = null;

/** Origin por defecto: 200 JSON. */
function defaultOrigin(): Response {
  return new Response(JSON.stringify({ ok: true, from: 'origin' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetchMock(origin: () => Response = defaultOrigin) {
  originCalls = 0;
  originMode = 'ok';
  lastOriginCall = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(typeof input === 'string' ? input : (input as Request).url);
      if (url.startsWith(ORIGIN_URL)) {
        originCalls++;
        lastOriginCall = { url, init };
        if (originMode === 'down') throw new Error('origin down');
        return origin();
      }
      throw new Error(`fetch inesperada: ${url}`);
    }),
  );
}

/** Lee el cuerpo que el worker reenvió al origin (string o stream). */
async function readInitBody(init?: RequestInit): Promise<string> {
  if (!init?.body) return '';
  if (typeof init.body === 'string') return init.body;
  return new Response(init.body as BodyInit).text();
}

afterAll(() => {
  vi.restoreAllMocks();
});

describe('edge proxy (S-01) + métricas (S-20)', () => {
  it('reenvía un path no-métrico al origin y devuelve su respuesta', async () => {
    installFetchMock();
    const res = await worker.fetch(new Request('https://edge.test/v1/foo'), env, {});
    expect(res.status).toBe(200);
    expect(originCalls).toBe(1);
    expect(await res.json()).toEqual({ ok: true, from: 'origin' });
  });

  it('origin caído → 502 con mensaje claro', async () => {
    installFetchMock();
    originMode = 'down';
    const res = await worker.fetch(new Request('https://edge.test/v1/foo'), env, {});
    expect(res.status).toBe(502);
    expect(((await res.json()) as { message: string }).message).toContain('Origin no disponible');
  });

  it('/__metrics sin EDGE_METRICS_TOKEN → 404 (deshabilitado)', async () => {
    const res = await worker.fetch(new Request('https://edge.test/__metrics'), { ORIGIN_URL }, {});
    expect(res.status).toBe(404);
  });

  it('/__metrics sin auth (con token configurado) → 401', async () => {
    const res = await worker.fetch(new Request('https://edge.test/__metrics'), env, {});
    expect(res.status).toBe(401);
  });

  it('/__metrics con bearer incorrecto → 401', async () => {
    const res = await worker.fetch(
      new Request('https://edge.test/__metrics', { headers: { Authorization: 'Bearer no' } }),
      env,
      {},
    );
    expect(res.status).toBe(401);
  });

  it('/__metrics con bearer correcto → 200 con las métricas', async () => {
    const res = await worker.fetch(
      new Request('https://edge.test/__metrics', { headers: { Authorization: `Bearer ${METRICS_TOKEN}` } }),
      env,
      {},
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('petai_cdn_refresh_ms');
  });
});

describe('passthrough (F-07)', () => {
  it('conserva el estado real, cabeceras y cuerpo (201, no forzado a 200 JSON)', async () => {
    installFetchMock(() =>
      new Response(JSON.stringify({ id: 'pet1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json', 'X-Location': '/v1/pets/pet1' },
      }),
    );
    const res = await worker.fetch(
      new Request('https://edge.test/v1/pets', { method: 'POST', body: '{"name":"flamefox"}' }),
      env,
      {},
    );
    expect(res.status).toBe(201);
    expect(res.headers.get('X-Location')).toBe('/v1/pets/pet1');
    expect(await res.json()).toEqual({ id: 'pet1' });
  });

  it('conserva el cuerpo de validación de un 400 (no un mensaje genérico)', async () => {
    const body = {
      statusCode: 400,
      message: 'Datos inválidos',
      issues: [{ field: 'text', message: 'text es obligatorio' }],
    };
    installFetchMock(() =>
      new Response(JSON.stringify(body), { status: 400, headers: { 'Content-Type': 'application/json' } }),
    );
    const res = await worker.fetch(new Request('https://edge.test/v1/voice/speak', { method: 'POST', body: '{}' }), env, {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(body);
  });

  it('conserva la cabecera Retry-After de un 429', async () => {
    installFetchMock(() =>
      new Response(JSON.stringify({ statusCode: 429, message: 'demasiadas peticiones' }), {
        status: 429,
        headers: { 'Retry-After': '12' },
      }),
    );
    const res = await worker.fetch(new Request('https://edge.test/v1/pets'), env, {});
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('12');
    expect(await res.json()).toMatchObject({ message: 'demasiadas peticiones' });
  });

  it('conserva los binarios (/assets/*) byte a byte', async () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x7f, 0x80, 0xff, 0xfe]);
    installFetchMock(() =>
      new Response(bytes as unknown as BodyInit, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    );
    const res = await worker.fetch(new Request('https://edge.test/assets/sprites/ignisaur_idle'), env, {});
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(bytes));
  });

  it('el flujo SSE se devuelve en streaming (el edge no lo lee)', async () => {
    const enc = new TextEncoder();
    installFetchMock(() =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(enc.encode('data: a\n\n'));
            c.enqueue(enc.encode('data: b\n\n'));
            c.close();
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } },
      ),
    );
    const res = await worker.fetch(new Request('https://edge.test/v1/ai/chat?stream=1'), env, {});
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    // el cuerpo sigue siendo un stream (no consumido por un `res.text()` del edge)
    expect(res.body).toBeInstanceOf(ReadableStream);
    expect(await res.text()).toBe('data: a\n\ndata: b\n\n');
  });

  it('reenvía method, cabeceras relevantes y el stream del cuerpo de la petición', async () => {
    installFetchMock();
    const body = 'part1=hello&file=audio-bytes';
    const req = new Request('https://edge.test/v1/voice/transcribe?x=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=abc',
        Authorization: 'Bearer token123',
        'X-Client': 'desktop',
        Connection: 'close',
      },
      body,
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    expect(originCalls).toBe(1);
    expect(lastOriginCall!.url).toBe(`${ORIGIN_URL}/v1/voice/transcribe?x=1`);
    const init = lastOriginCall!.init!;
    expect(init.method).toBe('POST');
    expect(await readInitBody(init)).toBe(body);
    const h = new Headers(init.headers);
    expect(h.get('content-type')).toBe('multipart/form-data; boundary=abc');
    expect(h.get('authorization')).toBe('Bearer token123');
    expect(h.get('x-client')).toBe('desktop');
    expect(h.get('connection')).toBeNull(); // hop-by-hop no reenviado
    expect(h.get('content-length')).toBeNull();
  });

  it('GET sin cuerpo: no lleva body en el reenvío', async () => {
    installFetchMock();
    const res = await worker.fetch(new Request('https://edge.test/v1/pets'), env, {});
    expect(res.status).toBe(200);
    expect(lastOriginCall!.init?.body).toBeUndefined();
  });
});

describe('métricas acotadas (R-07)', () => {
  it('N peticiones → 1 grupo agregado (no N entradas) y histograma correcto en /__metrics', async () => {
    __testing.reset();
    installFetchMock();
    for (let i = 0; i < 250; i++) await worker.fetch(new Request('https://edge.test/v1/health'), env, {});
    expect(__testing.groups()).toBe(1);
    const res = await worker.fetch(
      new Request('https://edge.test/__metrics', { headers: { Authorization: `Bearer ${METRICS_TOKEN}` } }),
      env,
      {},
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('petai_cdn_refresh_ms_count{region="unknown",outcome="origin"} 250');
    const buckets = [
      ...text.matchAll(/petai_cdn_refresh_ms_bucket\{region="unknown",outcome="origin",le="([^"]+)"\} (\d+)/g),
    ];
    // buckets acumulados: cada uno >= el anterior y le="+Inf" == count total
    const counts = buckets.map((m) => Number(m[2]));
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(buckets[buckets.length - 1][1]).toBe('+Inf');
    expect(counts[counts.length - 1]).toBe(250);
  });

  it('series separadas por región, sin crecer por petición', async () => {
    __testing.reset();
    installFetchMock();
    for (let i = 0; i < 10; i++)
      await worker.fetch(new Request('https://edge.test/v1/a', { headers: { 'x-region': 'ES' } }), env, {});
    for (let i = 0; i < 5; i++)
      await worker.fetch(new Request('https://edge.test/v1/b', { headers: { 'x-region': 'US' } }), env, {});
    expect(__testing.groups()).toBe(2);
    const res = await worker.fetch(
      new Request('https://edge.test/__metrics', { headers: { Authorization: `Bearer ${METRICS_TOKEN}` } }),
      env,
      {},
    );
    const text = await res.text();
    expect(text).toContain('petai_cdn_refresh_ms_count{region="ES",outcome="origin"} 10');
    expect(text).toContain('petai_cdn_refresh_ms_count{region="US",outcome="origin"} 5');
  });
});