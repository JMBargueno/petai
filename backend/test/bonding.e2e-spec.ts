import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RealtimeGateway } from '../src/modules/realtime/realtime.gateway';

/**
 * Bonding Meter (feature 006) — flujo completo e2e:
 * interacción → vínculo sube + WS `bonding:tier_up` → `GET /pets/:id` lo incluye →
 * `GET /pets/:id/bonding` (historial/decayInfo/unlocks) → abandono 72h decae +
 * `BondingEvent(reason="decay")` → chat con `ally` inyecta memoria → `legend` expone
 * `patternUnlocked`/`sleepNearCursor`.
 */
const VALID_KEY = 'sk-test-key-123456';

/** Servidor mock compatible con OpenAI Chat Completions (streaming SSE). */
function startMockLlm() {
  const seen: { body?: any }[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      seen.push({ body });
      if (req.url !== '/v1/chat/completions') return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const chunk = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
      res.write(chunk('¡Hola, entrenador!'));
      res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 3 } })}\n\n`);
      res.end('data: [DONE]\n\n');
    });
  });
  return new Promise<{ url: string; seen: typeof seen; close: () => Promise<void> }>((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/v1`, seen, close: () => new Promise((r) => server.close(() => r())) });
    }),
  );
}

async function createApp() {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  app.get(ConfigService).set('AI_ALLOW_INSECURE_URLS', 'true');
  app.setGlobalPrefix('v1');
  await app.init();
  return app;
}

describe('Bonding Meter E2E (feature 006)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let userId: string;
  let petId: string;
  let gateway: RealtimeGateway;

  const api = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    gateway = app.get(RealtimeGateway);
    jest.spyOn(gateway, 'emitToUser');
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // Limpieza de los datos de la prueba (cascadas por FK)
    if (!petId) return;
    await prisma.bondingEvent.deleteMany({ where: { petId } });
    await prisma.petMemory.deleteMany({ where: { petId } });
    await prisma.chatMessage.deleteMany({ where: { petId } });
    await prisma.pet.deleteMany({ where: { id: petId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  /** Registro + eclosión del pet de bienvenida. */
  async function signup(): Promise<void> {
    const email = `bonding_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!', displayName: 'Ana' })
      .expect(201);
    token = reg.body.accessToken as string;
    userId = reg.body.user.id as string;
    const eggs = await api().get('/v1/eggs').set(auth()).expect(200);
    const pet = await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(auth()).expect(201);
    petId = pet.body.id as string;
  }

  it('1. sin token → 401; con token → GET /pets/:id expone bonding, bondingTier, bondingTierName y lastInteractionAt', async () => {
    await signup();
    await api().get(`/v1/pets/${petId}/bonding`).expect(401);

    const pet = await api().get(`/v1/pets/${petId}`).set(auth()).expect(200);
    expect(pet.body.bonding).toBe(0);
    expect(pet.body.bondingTier).toBe('acquainted');
    expect(pet.body.bondingTierName).toBe('Acostumbrado');
    expect(typeof pet.body.lastInteractionAt).toBe('string');
  });

  it('2. dormir sube el vínculo (+0.5), persiste BondingEvent y no emite tier_up', async () => {
    await signup();
    await api().post(`/v1/pets/${petId}/sleep`).set(auth()).expect(201);

    const events = await prisma.bondingEvent.findMany({ where: { petId } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ delta: 0.5, reason: 'sleep', value: 0.5 });
    // El sleep también emite una notificación `interaction` (pet:slept → dispatcher), pero nunca un
    // bonding:tier_up: 0.5 de vínculo sigue en el tier inicial, sin cruce de umbral.
    const tierUps = (gateway.emitToUser as jest.Mock).mock.calls.filter(([, ev]) => ev === 'bonding:tier_up');
    expect(tierUps).toHaveLength(0);

    const pet = await api().get(`/v1/pets/${petId}`).set(auth()).expect(200);
    expect(pet.body.bonding).toBe(0.5);
    expect(pet.body.bondingTier).toBe('acquainted');
  });

  it('3. cruce 29 → 30 emite bonding:tier_up una sola vez y GET /pets/:id refleja companion', async () => {
    await signup();
    // 29 de vínculo previo + baño exitoso (+1) = 30 → cruce de umbral
    await prisma.pet.update({ where: { id: petId }, data: { bonding: 29, bondingTier: 'acquainted', hygiene: 50 } });
    jest.clearAllMocks();

    await api().post(`/v1/pets/${petId}/clean`).set(auth()).expect(201);

    const ups = (gateway.emitToUser as jest.Mock).mock.calls.filter(([, ev]) => ev === 'bonding:tier_up');
    expect(ups).toHaveLength(1);
    expect(ups[0][0]).toBe(userId);
    expect(ups[0][2]).toEqual({ petId, oldTier: 'acquainted', newTier: 'companion', bonding: 30 });

    const pet = await api().get(`/v1/pets/${petId}`).set(auth()).expect(200);
    expect(pet.body.bonding).toBe(30);
    expect(pet.body.bondingTier).toBe('companion');
    expect(pet.body.bondingTierName).toBe('Compañero');
  });

  it('4. GET /pets/:id/bonding: historial, decayInfo y unlocks; limit/cursor validados', async () => {
    await signup();
    await api().post(`/v1/pets/${petId}/sleep`).set(auth()).expect(201); // +0.5

    const detail = await api().get(`/v1/pets/${petId}/bonding`).set(auth()).expect(200);
    expect(detail.body.value).toBe(0.5);
    expect(detail.body.tier).toBe('acquainted');
    expect(detail.body.tierName).toBe('Acostumbrado');
    expect(detail.body.history.items).toHaveLength(1);
    expect(detail.body.history.items[0]).toMatchObject({ delta: 0.5, reason: 'sleep', value: 0.5 });
    expect(detail.body.history.nextCursor).toBeNull();
    expect(detail.body.decayInfo).toMatchObject({
      decayRatePerDay: 0.5,
      isDecaying: false,
      graceWindowHours: 24,
      decayStartHours: 48,
    });
    expect(detail.body.unlocks).toEqual({
      greeting: false,
      memoryRecall: false,
      emotionalReactions: false,
      patternUnlocked: false,
      sleepNearCursor: false,
    });

    await api().get(`/v1/pets/${petId}/bonding?limit=0`).set(auth()).expect(400);
    await api().get(`/v1/pets/${petId}/bonding?limit=101`).set(auth()).expect(400);
    await api().get(`/v1/pets/${petId}/bonding?limit=abc`).set(auth()).expect(400);
  });

  it('5. abandono de 72h: el lazy tick decae el vínculo y audita BondingEvent(reason="decay")', async () => {
    await signup();
    // 40 de vínculo con la última interacción a 72h → decae 0.5 × (72 − 48)/24 = 0.5 → 39.5
    // (lastTickAt también atrasado: el lazy tick debe ejecutarse, no cortarse por "tick reciente")
    await prisma.pet.update({
      where: { id: petId },
      data: {
        bonding: 40,
        bondingTier: 'companion',
        lastInteractionAt: new Date(Date.now() - 72 * 3600 * 1000),
        lastTickAt: new Date(Date.now() - 72 * 3600 * 1000),
      },
    });

    const pet = await api().get(`/v1/pets/${petId}`).set(auth()).expect(200);
    expect(pet.body.bonding).toBe(39.5);

    const decays = await prisma.bondingEvent.findMany({ where: { petId, reason: 'decay' } });
    expect(decays).toHaveLength(1);
    expect(decays[0]).toMatchObject({ delta: -0.5, value: 39.5 });

    const detail = await api().get(`/v1/pets/${petId}/bonding`).set(auth()).expect(200);
    expect(detail.body.value).toBe(39.5);
    expect(detail.body.decayInfo.isDecaying).toBe(false); // la base quedó re-fijada (idempotencia)
    expect(detail.body.history.items[0].reason).toBe('decay');
  });

  it('6. legend (100): patternUnlocked y sleepNearCursor true', async () => {
    await signup();
    await prisma.pet.update({ where: { id: petId }, data: { bonding: 100, bondingTier: 'legend' } });

    const detail = await api().get(`/v1/pets/${petId}/bonding`).set(auth()).expect(200);
    expect(detail.body.unlocks).toEqual({
      greeting: true,
      memoryRecall: true,
      emotionalReactions: true,
      patternUnlocked: true,
      sleepNearCursor: true,
    });
  });

  it('7. multi-pet: el vínculo de otro pet del mismo usuario no se ve afectado (SC-007)', async () => {
    await signup();
    const first = await prisma.pet.findUnique({ where: { id: petId } });
    const second = await prisma.pet.create({
      data: {
        userId,
        speciesId: first!.speciesId,
        patternId: first!.patternId,
        rarity: first!.rarity,
        palette: { primary: '#ff0000', secondary: '#00ff00', accent: '#0000ff' },
        visualSeed: 42,
        nickname: 'Segundo',
        combatStats: { hp: 10, atk: 10, def: 10, vel: 10, esp: 10 },
        skills: [],
      },
    });
    const secondPetId = second.id;

    await api().post(`/v1/pets/${petId}/sleep`).set(auth()).expect(201);

    const other = await prisma.pet.findUnique({ where: { id: secondPetId } });
    expect(other!.bonding).toBe(0);
    expect(await prisma.bondingEvent.findMany({ where: { petId: secondPetId } })).toHaveLength(0);
    await prisma.pet.deleteMany({ where: { id: secondPetId } });
  });

  it('8. pet inexistente → 404 en GET /pets/:id y GET /pets/:id/bonding', async () => {
    await signup();
    await api().get('/v1/pets/no-existe/bonding').set(auth()).expect(404);
    await api().get('/v1/pets/no-existe').set(auth()).expect(404);
  });
});

describe('Bonding Meter E2E: integración con la IA (feature 006, LLM mock)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mock: Awaited<ReturnType<typeof startMockLlm>>;
  let token: string;
  let userId: string;
  let petId: string;

  const api = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    mock = await startMockLlm();
    app = await createApp();
    prisma = app.get(PrismaService);
    const email = `bonding_ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!', displayName: 'Ana' })
      .expect(201);
    token = reg.body.accessToken as string;
    userId = reg.body.user.id as string;
    const eggs = await api().get('/v1/eggs').set(auth()).expect(200);
    petId = (await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(auth()).expect(201)).body.id as string;

    // BYOK apuntando al mock
    await api()
      .put('/v1/ai/config')
      .set(auth())
      .send({ provider: 'custom', baseUrl: mock.url, model: 'mock-model', apiKey: VALID_KEY })
      .expect(200);

    // Vínculo ally (60+) + recuerdo guardado
    await prisma.pet.update({ where: { id: petId }, data: { bonding: 65, bondingTier: 'ally' } });
    await prisma.petMemory.create({ data: { petId, kind: 'fact', content: 'A Ana le gusta pescar' } });
  });

  afterAll(async () => {
    // Limpieza antes de cerrar la app (el PrismaService se desconecta en el shutdown)
    await prisma.bondingEvent.deleteMany({ where: { petId } });
    await prisma.petMemory.deleteMany({ where: { petId } });
    await prisma.chatMessage.deleteMany({ where: { petId } });
    await prisma.pet.deleteMany({ where: { id: petId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
    await mock.close();
  });

  it('con bondingTier=ally el chat inyecta memoria y el prompt lleva el contexto de vínculo (SC-006)', async () => {
    await api().post(`/v1/pets/${petId}/chat`).set(auth()).send({ message: '¿vamos a pescar?' }).expect(200);

    const systemPrompt = mock.seen.at(-1)!.body.messages[0].content as string;
    // Contexto de solo-lectura inyectado por umbral (FR-010)
    expect(systemPrompt).toContain('Vínculo con tu entrenador: Aliado');
    // Memoria OR: bondingTier ally inyecta el bloque de recuerdos (SC-006)
    expect(systemPrompt).toContain('A Ana le gusta pescar');
  });

  it('el turno de chat completado sube el vínculo (+1) y audita BondingEvent(reason="chat")', async () => {
    await api().post(`/v1/pets/${petId}/chat`).set(auth()).send({ message: 'hola de nuevo' }).expect(200);

    const chatEvents = await prisma.bondingEvent.findMany({ where: { petId, reason: 'chat' } });
    expect(chatEvents.length).toBeGreaterThanOrEqual(1);
    const last = chatEvents[chatEvents.length - 1];
    expect(last.delta).toBe(1);
    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    expect(pet!.bonding).toBeCloseTo(last.value, 2);
  });
});
