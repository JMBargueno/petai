import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AssetsModule } from './assets.module';

/**
 * Unit test del módulo origin de assets (feature 009-edge-cdn, T006).
 *
 * Verifica (usando el `AssetsService` real sobre `shared/` del workspace):
 *   - `GET /assets/manifest` → 200 con la forma del contrato + `Cache-Control` correcto.
 *   - `GET /assets/:key`     → 200 para un asset real, 404 para una key inexistente.
 *   - Cabeceras de caché (manifest 1h/SWR; asset immutable).
 */
describe('AssetsController (unit)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AssetsModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => app.close());

  const api = () => request(app.getHttpServer());

  it('GET /v1/assets/manifest devuelve 200 con la forma del contrato y Cache-Control correcto', async () => {
    const res = await api().get('/v1/assets/manifest').expect(200);
    expect(res.body).toMatchObject({
      version: expect.any(String),
      baseUrl: expect.any(String),
      generatedAt: expect.any(String),
      assets: expect.any(Object),
    });
    expect(typeof res.body.version).toBe('string');
    expect(res.body.assets).toBeInstanceOf(Object);
    expect(Object.keys(res.body.assets).length).toBeGreaterThan(0);

    // Cada entrada del manifest debe cumplir el AssetDto.
    const entry = res.body.assets[res.body.assets && Object.keys(res.body.assets)[0]];
    expect(entry).toMatchObject({
      url: expect.any(String),
      hash: expect.stringMatching(/^[0-9a-f]{32}$/),
      type: expect.any(String),
      size: expect.any(Number),
    });
    expect(entry.url).toContain('-');

    expect(res.headers['cache-control']).toBe('public, max-age=3600, stale-while-revalidate=60');
    expect(res.headers['etag']).toBeDefined();
  });

  it('GET /v1/assets/:key sirve un asset real con 200 y Cache-Control immutable', async () => {
    const manifest = (await api().get('/v1/assets/manifest').expect(200)).body;
    const spriteKey = Object.keys(manifest.assets).find((k) => k.startsWith('sprites/'));
    const gameDataKey = Object.keys(manifest.assets).find((k) => k.startsWith('game-data/'));
    expect(spriteKey).toBeTruthy();
    expect(gameDataKey).toBeTruthy();

    const svg = await api().get(`/v1/assets/${spriteKey}`).expect(200);
    expect(svg.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(svg.headers['content-type']).toBe('image/svg+xml');

    const json = await api().get(`/v1/assets/${gameDataKey}`).expect(200);
    expect(json.headers['content-type']).toContain('application/json');
    expect(json.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('GET /v1/assets/:key devuelve 404 para una key inexistente', async () => {
    const res = await api().get('/v1/assets/sprites/ghost_idle').expect(404);
    expect(res.body.statusCode).toBe(404);
  });

  it('GET /v1/assets/:key devuelve 400 para una key con path-traversal', async () => {
    const res = await api().get('/v1/assets/../app.module').expect(400);
    expect(res.body.statusCode).toBe(400);
  });
});