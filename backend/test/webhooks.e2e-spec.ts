import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { createHash } from 'crypto';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

/**
 * API keys y API pública (e2e) — camino feliz. Feature 025 / S-16.
 *
 * El «módulo public-API / API-key» vive en `src/modules/webhooks` (mismo módulo que los webhooks):
 *   - `WebhooksController`  → CRUD de API keys (autenticado por JWT):
 *       - POST   /v1/apikeys      crear una API key (devuelve el plaintext una sola vez)
 *       - GET    /v1/apikeys      listar mis API keys (sin el hash ni el plaintext)
 *       - DELETE /v1/apikeys/:id  revocar una API key
 *   - `PublicApiController` → endpoints públicos autenticados por API key (`ApiKeyGuard`):
 *       - GET /v1/public/leaderboard  (scope `read:leaderboard`)
 *       - GET /v1/public/events       (scope `read:events`)
 *
 * ────────────────────────────────────────────────────────────────────────────────────
 * S-16 — API keys con rate limit y caducidad (revisión del happy path):
 *
 *  - Solo se persiste el hash SHA-256 (`keyHash`); el plaintext `petai_key_***` se devuelve
 *    una única vez y NO figura en la lista. Ver «la lista no expone el hash del key».
 *  - `enforceRateLimit` (ApiKeyGuard) usa una ventana deslizante por minuto en Redis: INCR +
 *    PEXPIRE atómico. Cada request autenticada incrementa el contador. Ver «el contador de
 *    rate-limit crece con cada request autenticada».
 *  - La caducidad de una key se modela con `revokedAt` (el esquema `ApiKey` no tiene `expiresAt`):
 *    revocar la key la invalida. Ver «revocar la key la invalida».
 * ────────────────────────────────────────────────────────────────────────────────────
 */
describe('API keys y API pública (e2e) — camino feliz', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];
  const createdKeys: string[] = [];

  const jwt = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signup(): Promise<{ token: string; userId: string }> {
    const email = `apikey_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const me = await api().get('/v1/me').set(jwt(token)).expect(200);
    const userId = me.body.id as string;
    createdUsers.push(userId);
    return { token, userId };
  }

  /** Crea una API key por HTTP y devuelve su plaintext. */
  async function createKey(token: string, scopes: string[], name = 'mi key'): Promise<string> {
    const res = await api()
      .post('/v1/apikeys')
      .set(jwt(token))
      .send({ name, scopes })
      .expect(201);
    const id = res.body.id as string;
    const key = res.body.key as string;
    createdKeys.push(id);
    expect(key).toMatch(/^petai_key_[0-9a-f]{48}$/);
    return key;
  }

  /** Valor (número) del contador de rate-limit de una key en la ventana de minuto actual. */
  async function rlCounter(keyId: string): Promise<number> {
    const windowKey = redis.key(`apikey:rl:${keyId}:${Math.floor(Date.now() / 60000)}`);
    const raw = await redis.run(async (r) => r.get(windowKey));
    return raw === null ? 0 : Number(raw);
  }

  /** Busca el registro de una API key a partir de su plaintext (la BD solo guarda el hash). */
  async function keyRecord(plaintext: string) {
    const keyHash = createHash('sha256').update(plaintext).digest('hex');
    return prisma.apiKey.findUnique({ where: { keyHash } });
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    for (const id of createdKeys) {
      await prisma.apiKey.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdUsers) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  it('crea una API key y devuelve el plaintext una única vez', async () => {
    const { token } = await signup();
    const res = await api()
      .post('/v1/apikeys')
      .set(jwt(token))
      .send({ name: 'clave publica', scopes: ['read:leaderboard', 'read:events'] })
      .expect(201);

    expect(res.body.name).toBe('clave publica');
    expect(res.body.scopes).toEqual(['read:leaderboard', 'read:events']);
    expect(res.body.id).toBeTruthy();
    expect(res.body.key).toMatch(/^petai_key_[0-9a-f]{48}$/);

    // La BD solo guarda el hash, nunca el plaintext.
    const row = await prisma.apiKey.findUnique({ where: { id: res.body.id } });
    expect(row!.keyHash).toBeTruthy();
    expect(row!.keyHash).not.toContain(res.body.key);
  });

  it('la lista no expone el hash del key ni el plaintext', async () => {
    const { token } = await signup();
    const plaintext = await createKey(token, ['read:leaderboard']);

    const list = await api().get('/v1/apikeys').set(jwt(token)).expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.some((k: { name: string }) => k.name === 'mi key')).toBe(true);

    // Ningún ítem expone `keyHash` ni el `key` plaintext.
    for (const k of list.body) {
      expect(k).not.toHaveProperty('keyHash');
      expect(k).not.toHaveProperty('key');
      expect(JSON.stringify(k)).not.toContain(plaintext);
    }
  });

  it('el endpoint público responde autenticado por la API key y su scope', async () => {
    const { token } = await signup();
    const key = await createKey(token, ['read:leaderboard', 'read:events']);

    // Con la key y su scope → 200.
    const board = await api()
      .get('/v1/public/leaderboard')
      .set({ Authorization: `Bearer ${key}` })
      .expect(200);
    expect(Array.isArray(board.body.entries)).toBe(true);
    expect(board.body).toHaveProperty('limit');

    // Los endpoints públicos NO aceptan el JWT del usuario: solo API key.
    const bad = await api().get('/v1/public/leaderboard').set(jwt(token));
    expect(bad.status).toBe(401);
  });

  it('el endpoint público exige el scope: sin él responde 403', async () => {
    const { token } = await signup();
    // Key con otro scope (no `read:leaderboard`) → el leaderboard debe rechazar.
    const key = await createKey(token, ['read:pets'], 'solo pets');
    await api().get('/v1/public/leaderboard').set({ Authorization: `Bearer ${key}` }).expect(403);
  });

  it('el contador de rate-limit crece con cada request autenticada', async () => {
    const { token } = await signup();
    const key = await createKey(token, ['read:leaderboard']);
    const record = await keyRecord(key);
    expect(record).not.toBeNull();

    const before = await rlCounter(record!.id);
    await api().get('/v1/public/leaderboard').set({ Authorization: `Bearer ${key}` }).expect(200);
    const afterFirst = await rlCounter(record!.id);
    await api().get('/v1/public/leaderboard').set({ Authorization: `Bearer ${key}` }).expect(200);
    const afterSecond = await rlCounter(record!.id);

    expect(afterFirst).toBe(before + 1);
    expect(afterSecond).toBe(afterFirst + 1);
  });

  it('revocar la key la invalida (su caducidad) y queda marcado revokedAt', async () => {
    const { token } = await signup();
    const key = await createKey(token, ['read:leaderboard']);
    const record = await keyRecord(key);
    expect(record).not.toBeNull();

    // Aún funciona antes de revocar.
    await api().get('/v1/public/leaderboard').set({ Authorization: `Bearer ${key}` }).expect(200);

    // Revocar (solo su dueño) → 200 y `revokedAt` persistido.
    const del = await api()
      .delete(`/v1/apikeys/${record!.id}`)
      .set(jwt(token))
      .expect(200);
    expect(del.body.message).toBeTruthy();
    const after = await prisma.apiKey.findUnique({ where: { id: record!.id } });
    expect(after!.revokedAt).toBeInstanceOf(Date);

    // Ya revocada: el endpoint público la rechaza con 401.
    await api().get('/v1/public/leaderboard').set({ Authorization: `Bearer ${key}` }).expect(401);

    // Re-revocar es idempotente («Ya revocada»).
    await api().delete(`/v1/apikeys/${record!.id}`).set(jwt(token)).expect(200);
  });
});

