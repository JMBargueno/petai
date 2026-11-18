import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { applySecurity } from '../src/common/security';

/**
 * E2E del origin de assets (feature 009-edge-cdn, T007).
 *
 * Con la app completa (AppModule) verifica el "mirror" del CDN:
 *   - `GET /v1/assets/manifest` 200 (shape)
 *   - un asset sprite (svg) y un asset game-data (json) sirven con 200
 *   - 404 para una key inválida
 */
describe('Assets origin (e2e)', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    applySecurity(app, { swagger: false });
    await app.init();
  });

  afterAll(async () => app.close());

  it('GET /v1/assets/manifest devuelve el índice versionado (200)', async () => {
    const res = await api().get('/v1/assets/manifest').expect(200);
    expect(typeof res.body.version).toBe('string');
    expect(typeof res.body.baseUrl).toBe('string');
    expect(res.body.assets).toBeInstanceOf(Object);
    const first = Object.values<any>(res.body.assets)[0];
    expect(first).toHaveProperty('url');
    expect(first).toHaveProperty('hash');
    expect(first).toHaveProperty('type');
    expect(first).toHaveProperty('size');
  });

  it('sirve un asset sprite (svg) y un asset game-data (json) con 200', async () => {
    const manifest = (await api().get('/v1/assets/manifest').expect(200)).body;
    // En sprites/ conviven SVG y PNG (los bebés en pixel art): se elige cada uno por su tipo, no por
    // el orden del manifest.
    const keys = Object.keys(manifest.assets);
    const spriteOfType = (type: string) => keys.find((k) => k.startsWith('sprites/') && manifest.assets[k].type === type);
    const svgKey = spriteOfType('image/svg+xml');
    const pngKey = spriteOfType('image/png');
    const gameDataKey = keys.find((k) => k.startsWith('game-data/'));
    expect(svgKey).toBeTruthy();
    expect(gameDataKey).toBeTruthy();

    const svg = await api().get(`/v1/assets/${svgKey}`).expect(200);
    expect(svg.headers['content-type']).toBe('image/svg+xml');
    expect(svg.headers['cache-control']).toBe('public, max-age=31536000, immutable');

    if (pngKey) {
      const png = await api().get(`/v1/assets/${pngKey}`).expect(200);
      expect(png.headers['content-type']).toBe('image/png');
    }

    const json = await api().get(`/v1/assets/${gameDataKey}`).expect(200);
    expect(json.headers['content-type']).toContain('application/json');
  });

  it('devuelve 404 para una key inválida', async () => {
    const res = await api().get('/v1/assets/sprites/noexiste_idle').expect(404);
    expect(res.body.statusCode).toBe(404);
  });
});