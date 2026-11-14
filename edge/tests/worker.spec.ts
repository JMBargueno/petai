/**
 * Tests del edge de PetAI (proxy passthrough + métricas protegidas).
 *
 * S-01: el fast-path de refresh se eliminó; todo path pasa por el origin autoritativo.
 * S-20: el endpoint `GET /__metrics` exige `EDGE_METRICS_TOKEN` (404 si no se configuró, 401 si falla).
 *
 * Simula el worker con `fetch` mockeado para el origin (ambiente `node`).
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import worker, { type Env } from '../worker';

const ORIGIN_URL = 'http://origin.test';
const METRICS_TOKEN = 'sekret-metrics';

const env: Env = { ORIGIN_URL, EDGE_METRICS_TOKEN: METRICS_TOKEN };

let originCalls = 0;
let originMode: 'ok' | 'down' = 'ok';

function installFetchMock() {
  originCalls = 0;
  originMode = 'ok';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(typeof input === 'string' ? input : (input as Request).url);
      if (url.startsWith(ORIGIN_URL)) {
        originCalls++;
        if (originMode === 'down') throw new Error('origin down');
        return new Response(JSON.stringify({ ok: true, from: 'origin' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`fetch inesperada: ${url}`);
    }),
  );
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
    expect((await res.json()).message).toContain('Origin no disponible');
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