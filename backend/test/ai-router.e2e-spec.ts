import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ModelRouterService } from '../src/modules/ai-router/model-router.service';
import { FallbackService } from '../src/modules/ai-router/fallback.service';

/**
 * AI Model Router (e2e) — camino feliz.
 *
 * Rutas cubiertas (ai-router.controller.ts — prefijo `ai/models`):
 *   - GET  /v1/ai/models          → lista de modelos/estado de proveedores
 *   - POST /v1/ai/models/config   → actualiza la configuración de enrutado del usuario
 *   - GET  /v1/ai/models/budget   → uso y presupuesto de IA del usuario
 *
 * Parte determinista, sin clave de proveedor en vivo:
 *  - El listado (GET /v1/ai/models) expone el estado del FallbackService (circuit breaker):
 *    cada proveedor registrado (openai y generic) devuelve su nombre, estado inicial closed,
 *    failures 0 y su lista de supportedModels. No requiere llamar a ningún proveedor.
 *  - La selección de routing (ModelRouterService.getRouting) es determinista: sin AiConfig
 *    devuelve el routing por defecto según el tipo (p. ej. chat → openai/gpt-4o-mini); con un
 *    routingOverrides en la AiConfig aplica el override (modelo/proveedor/limite) sobre la base
 *    por defecto. Se prueba a nivel de servicio, como en seasons.e2e-spec.ts, porque el route()
 *    en streaming sí requiere un proveedor en vivo.
 */
describe('AI Model Router (e2e) — camino feliz', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: ModelRouterService;
  let fallback: FallbackService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signup(): Promise<{ token: string; userId: string }> {
    const email = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const me = await api().get('/v1/me').set(auth(token)).expect(200);
    const userId = me.body.id as string;
    createdUsers.push(userId);
    return { token, userId };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
    service = app.get(ModelRouterService);
    fallback = app.get(FallbackService);
  });

  afterAll(async () => {
    for (const id of createdUsers) {
      // La AiConfig/AiUsage se limpian por cascade al borrar el usuario.
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  describe('GET /ai/models', () => {
    it('devuelve 200 con el estado de los proveedores registrados', async () => {
      const { token } = await signup();
      const res = await api().get('/v1/ai/models').set(auth(token)).expect(200);
      const body = res.body;

      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);

      for (const p of body) {
        expect(typeof p.name).toBe('string');
        expect(typeof p.state).toBe('string');
        expect(typeof p.failures).toBe('number');
        expect(Array.isArray(p.models)).toBe(true);
      }

      // Los dos proveedores del módulo están registrados en estado sano inicial.
      const byName = Object.fromEntries(body.map((p) => [p.name, p] as const));
      expect(byName['openai']).toBeDefined();
      expect(byName['generic']).toBeDefined();
      expect(byName['openai'].state).toBe('closed');
      expect(byName['openai'].failures).toBe(0);
      expect(byName['generic'].state).toBe('closed');
      expect(byName['generic'].failures).toBe(0);
      // Los modelos declarados coinciden con lo que expone cada provider.
      expect(byName['openai'].models).toEqual((fallback as any).providers.get('openai')!.supportedModels);
      expect(byName['generic'].models.length).toBeGreaterThan(0);
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/ai/models').expect(401);
    });
  });

  describe('POST /ai/models/config', () => {
    it('crea/actualiza la configuración de enrutado del usuario (200)', async () => {
      const { token, userId } = await signup();
      const overrides = {
        chat: { model: 'local-model', maxTokens: 512, maxCostUsd: 0.005 },
      };
      const res = await api()
        .post('/v1/ai/models/config')
        .set(auth(token))
        .send({
          provider: 'generic',
          routingOverrides: overrides,
          fallbackProviders: ['openai'],
        })
        .expect(200);

      const body = res.body;
      expect(body.userId).toBe(userId);
      expect(body.provider).toBe('generic');
      expect(body.routingOverrides).toEqual(overrides);
      expect(body.fallbackProviders).toEqual(['openai']);

      // Persistencia en BD.
      const stored = await prisma.aiConfig.findUnique({ where: { userId } });
      expect(stored).not.toBeNull();
      expect(stored!.provider).toBe('generic');
      expect(stored!.routingOverrides).toEqual(overrides);
      expect(stored!.fallbackProviders).toEqual(['openai']);

      // Actualización idempotente (upsert) → sigue 200 y refleja el nuevo valor.
      const res2 = await api()
        .post('/v1/ai/models/config')
        .set(auth(token))
        .send({ provider: 'openai' })
        .expect(200);
      expect(res2.body.userId).toBe(userId);
      expect(res2.body.provider).toBe('openai');
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().post('/v1/ai/models/config').send({}).expect(401);
    });
  });

  describe('GET /ai/models/budget', () => {
    it('devuelve 200 con el uso (cero) y los límites por defecto', async () => {
      const { token } = await signup();
      const res = await api().get('/v1/ai/models/budget').set(auth(token)).expect(200);
      const body = res.body;

      const month = new Date().toISOString().slice(0, 7);
      expect(body.month).toBe(month);
      expect(body.tokens).toBe(0);
      expect(body.requests).toBe(0);
      expect(body.costUsd).toBe(0);
      expect(body.cacheHits).toBe(0);
      expect(typeof body.limits.maxTokens).toBe('number');
      expect(typeof body.limits.maxCostUsd).toBe('number');
      expect(body.limits.maxTokens).toBeGreaterThan(0);
      expect(body.limits.maxCostUsd).toBeGreaterThan(0);
    });

    it('refleja el uso ya registrado en BD', async () => {
      const { token, userId } = await signup();
      const month = new Date().toISOString().slice(0, 7);
      await prisma.aiUsage.create({
        data: { userId, month, tokens: 1234, requests: 7, costUsd: 1.25, cacheHits: 3 },
      });

      const res = await api().get('/v1/ai/models/budget').set(auth(token)).expect(200);
      expect(res.body.month).toBe(month);
      expect(res.body.tokens).toBe(1234);
      expect(res.body.requests).toBe(7);
      expect(res.body.costUsd).toBeCloseTo(1.25);
      expect(res.body.cacheHits).toBe(3);
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/ai/models/budget').expect(401);
    });
  });

  describe('selección de routing (determinista, nivel de servicio)', () => {
    it('sin AiConfig devuelve el routing por defecto según el tipo', async () => {
      const chat = await service.getRouting('chat');
      expect(chat).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini', maxTokens: 2048 });
      expect(Array.isArray(chat.fallbacks)).toBe(true);

      const tool = await service.getRouting('tool_use');
      expect(tool).toMatchObject({ provider: 'openai', model: 'gpt-4o', maxTokens: 4096 });

      // Tipo desconocido → cae al default de chat.
      const unknown = await service.getRouting('nope');
      expect(unknown).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini' });
    });

    it('aplica el routingOverrides de la AiConfig sobre la base por defecto', async () => {
      const { userId } = await signup();
      await prisma.aiConfig.create({
        data: {
          userId,
          provider: 'auto',
          routingOverrides: { chat: { model: 'local-model', maxTokens: 512, maxCostUsd: 0.005 } },
        },
      });

      const routing = await service.getRouting('chat', userId);
      expect(routing).toMatchObject({
        provider: 'openai', // sin override de provider → conserva la base
        model: 'local-model',
        maxTokens: 512,
        maxCostUsd: 0.005,
      });
    });
  });
});


