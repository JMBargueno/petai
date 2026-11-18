import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as path from 'path';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EntitlementService } from '../src/modules/billing/entitlement.service';
import { DecisionStoryGenerator } from '../src/modules/decision-story/decision-story.generator';
import { STORY_PROMPT_MARKER } from '../src/modules/decision-story/prompt';

/**
 * Aventura diaria (e2e): DecisionStoryGenerator + partidas.
 *
 * La IA del sistema se apunta a un servidor simulado compatible con OpenAI. El generador no se
 * espera al cron: se llama a `generateForDay` directamente. Cada bloque usa días propios (muy
 * lejanos) y borra sus historias al terminar, para no pisar otros e2e.
 */
const SERVER_KEY = 'sk-or-system-key-1';
const seeds = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../shared/game-data/story-seeds.json'), 'utf8')).stories;

function startMockLlm() {
  const seen: any[] = [];
  const state = { failWith: 0, n: 0 };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      if (state.failWith) return res.writeHead(state.failWith).end('nope');
      if (!body.messages?.[0]?.content?.includes(STORY_PROMPT_MARKER)) return res.writeHead(400).end('no es el generador');
      seen.push(body);
      const { id: _id, ...content } = seeds[state.n % seeds.length];
      const story = JSON.stringify({ ...content, title: `Tejida ${++state.n}` });
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: story } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 900, completion_tokens: 700, cost: 0.0012 } })}\n\n`);
      res.end('data: [DONE]\n\n');
    });
  });
  return new Promise<{ url: string; seen: any[]; state: typeof state; close: () => Promise<void> }>((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/v1`, seen, state, close: () => new Promise((r) => server.close(() => r())) });
    }),
  );
}

describe('Aventura diaria: DecisionStoryGenerator (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let generator: DecisionStoryGenerator;
  let mock: Awaited<ReturnType<typeof startMockLlm>>;
  const api = () => request(app.getHttpServer());
  const users: string[] = [];
  // Días del bucket de esta suite: posteriores a cualquier dato real para ser «el bucket en curso»
  const DAY1 = '2999-01-01';
  const DAY2 = '2999-01-02';
  const DAY3 = '2999-01-03';

  async function signup() {
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email: `story_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`, password: 'Password123!', displayName: 'Ana' })
      .expect(201);
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };
    const eggs = await api().get('/v1/eggs').set(auth).expect(200);
    const pet = await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(auth).expect(201);
    users.push(reg.body.user.id);
    return { auth, userId: reg.body.user.id as string, petId: pet.body.id as string };
  }

  /** Juega una historia entera eligiendo siempre la opción indicada por `pick`. */
  async function playThrough(u: { auth: any; petId: string }, storyId: string, pick: (scene: any) => number) {
    let state = (await api().post(`/v1/stories/${storyId}/start`).set(u.auth).send({ petId: u.petId }).expect(201)).body;
    let scene = state.scene;
    let last: any;
    while (scene) {
      last = (await api().post(`/v1/stories/${storyId}/answer`).set(u.auth).send({ sceneIndex: scene.index, optionIndex: pick(scene) }).expect(201)).body;
      scene = last.next;
    }
    return last;
  }

  beforeAll(async () => {
    mock = await startMockLlm();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.get(ConfigService).set('OPENROUTER_BASE_URL', mock.url);
    app.get(ConfigService).set('OPENROUTER_API_KEY', SERVER_KEY);
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
    generator = app.get(DecisionStoryGenerator);
    await prisma.decisionStory.deleteMany({ where: { day: { gte: DAY1 } } });
  });

  afterAll(async () => {
    await prisma.decisionStory.deleteMany({ where: { day: { gte: DAY1 } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
    await mock.close();
  });

  it('a. la IA del sistema teje el bucket del día: una Crónica y el resto autoconclusivas', async () => {
    const report = await generator.generateForDay(DAY1, { allowFallback: false });
    expect(report.created.length).toBeGreaterThanOrEqual(3);
    expect(report.created.every((c) => c.source === 'ai')).toBe(true);
    expect(report.costUsd).toBeGreaterThan(0);

    const rows = await prisma.decisionStory.findMany({ where: { day: DAY1 }, orderBy: { slot: 'asc' } });
    expect(rows[0]).toMatchObject({ slot: 0, source: 'ai', arcChapter: 1 });
    expect(rows[0].arcKey).toBe(`arc-${DAY1}`);
    expect(rows.slice(1).every((r) => r.arcKey === null)).toBe(true);
    expect(rows[0].costUsd).toBeCloseTo(0.0012);
    // Llamada con la clave del servidor, salida en JSON y sin datos de ningún usuario
    expect(mock.seen[0].response_format).toEqual({ type: 'json_object' });
    expect(mock.seen[0].messages).toHaveLength(2);

    // Idempotente: una segunda pasada no crea ni llama
    const calls = mock.seen.length;
    expect((await generator.generateForDay(DAY1, { allowFallback: false })).created).toEqual([]);
    expect(mock.seen.length).toBe(calls);
  });

  it('b. GET /stories/today devuelve el bucket sin destripar las opciones, con el cupo del plan', async () => {
    const u = await signup();
    await api().get('/v1/stories/today').expect(401);
    const res = await api().get('/v1/stories/today').set(u.auth).expect(200);
    expect(res.body).toMatchObject({ day: DAY1, plan: 'free', limit: 1, used: 0 });
    expect(res.body.stories.length).toBeGreaterThanOrEqual(3);
    expect(res.body.stories[0]).toMatchObject({ slot: 0, chronicle: { chapter: 1, closes: false }, previously: null, play: null, sceneCount: 3 });
    expect(JSON.stringify(res.body)).not.toMatch(/score|consequence|canonLine/);
  });

  it('c. flujo completo: empezar, responder las 3 escenas, recompensa, recuerdo e historial', async () => {
    const u = await signup();
    await prisma.pet.update({ where: { id: u.petId }, data: { happiness: 50 } });
    const before = await prisma.user.findUnique({ where: { id: u.userId }, select: { coins: true } });
    const story = await prisma.decisionStory.findFirst({ where: { day: DAY1, slot: 1 } });
    const scenes = (story.scenes as any).scenes;
    const best = (scene: any) => scenes[scene.index].choices.findIndex((c: any) => c.score === 2);

    const start = await api().post(`/v1/stories/${story.id}/start`).set(u.auth).send({ petId: u.petId }).expect(201);
    expect(start.body).toMatchObject({ storyId: story.id, status: 'active', sceneIndex: 0, sceneCount: 3 });
    expect(JSON.stringify(start.body)).not.toMatch(/"score":\d|canonLine/);

    // Una escena que no toca se rechaza y no altera la partida
    await api().post(`/v1/stories/${story.id}/answer`).set(u.auth).send({ sceneIndex: 1, optionIndex: 0 }).expect(409);

    const first = await api().post(`/v1/stories/${story.id}/answer`).set(u.auth).send({ sceneIndex: 0, optionIndex: best({ index: 0 }) }).expect(201);
    expect(first.body.consequence).toBe(scenes[0].choices[best({ index: 0 })].consequence);
    expect(first.body.community.total).toBe(1);
    expect(first.body.next.index).toBe(1);
    // Responder dos veces la misma escena no cuenta dos votos
    await api().post(`/v1/stories/${story.id}/answer`).set(u.auth).send({ sceneIndex: 0, optionIndex: 0 }).expect(409);

    // Retomar devuelve el punto exacto
    const resume = await api().post(`/v1/stories/${story.id}/start`).set(u.auth).send({ petId: u.petId }).expect(201);
    expect(resume.body.sceneIndex).toBe(1);
    expect(resume.body.answered).toHaveLength(1);

    await api().post(`/v1/stories/${story.id}/answer`).set(u.auth).send({ sceneIndex: 1, optionIndex: best({ index: 1 }) }).expect(201);
    const end = await api().post(`/v1/stories/${story.id}/answer`).set(u.auth).send({ sceneIndex: 2, optionIndex: best({ index: 2 }) }).expect(201);
    expect(end.body.next).toBeNull();
    expect(end.body.completed).toMatchObject({ outcome: 'win', score: 1, rewards: { xp: 30, coins: 20, happiness: 8 } });

    const after = await prisma.user.findUnique({ where: { id: u.userId }, select: { coins: true } });
    expect(after.coins - before.coins).toBe(20);
    expect((await prisma.pet.findUnique({ where: { id: u.petId } })).happiness).toBe(58);
    const tallies = await prisma.decisionStoryTally.findMany({ where: { storyId: story.id } });
    expect(tallies.reduce((a, t) => a + t.count, 0)).toBe(3);

    const hist = await api().get('/v1/stories/history').set(u.auth).expect(200);
    expect(hist.body[0]).toMatchObject({ storyId: story.id, status: 'completed', outcome: 'win' });
    expect(hist.body[0].answers).toHaveLength(3);
    const today = await api().get('/v1/stories/today').set(u.auth).expect(200);
    expect(today.body.used).toBe(1);
    expect(today.body.stories.find((s: any) => s.id === story.id).play).toMatchObject({ status: 'completed', outcome: 'win' });

    // `adventure:finished` es asíncrono: la mente guarda el recuerdo poco después
    let memory = null;
    for (let i = 0; i < 20 && !memory; i++) {
      memory = await prisma.petMemory.findFirst({ where: { petId: u.petId, kind: 'adventure' } });
      if (!memory) await new Promise((r) => setTimeout(r, 100));
    }
    expect(memory?.content).toContain(story.title);
  });

  it('d. Free solo puede vivir 1 historia al día; con suscripción Pro, 3', async () => {
    const u = await signup();
    const stories = await prisma.decisionStory.findMany({ where: { day: DAY1 }, orderBy: { slot: 'asc' } });
    await playThrough(u, stories[0].id, () => 0);

    const denied = await api().post(`/v1/stories/${stories[1].id}/start`).set(u.auth).send({ petId: u.petId }).expect(403);
    expect(denied.body).toMatchObject({ code: 'daily_stories_exceeded', plan: 'free', limit: 1 });

    await prisma.subscription.create({
      data: { userId: u.userId, source: 'stripe', externalId: `sub_story_${u.userId}`, productId: 'price_test', plan: 'pro', status: 'active', currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) },
    });
    await app.get(EntitlementService).invalidate(u.userId);

    const today = await api().get('/v1/stories/today').set(u.auth).expect(200);
    expect(today.body).toMatchObject({ plan: 'pro', limit: 3, used: 1 });
    await playThrough(u, stories[1].id, () => 0);
    await playThrough(u, stories[2].id, () => 0);
    if (stories[3]) await api().post(`/v1/stories/${stories[3].id}/start`).set(u.auth).send({ petId: u.petId }).expect(403);
  });

  it('e. al tejer el día siguiente se cierra el anterior: la opción más votada es canon y la Crónica continúa desde ahí', async () => {
    const chronicle = await prisma.decisionStory.findFirst({ where: { day: DAY1, slot: 0 } });
    const scenes = (chronicle.scenes as any).scenes;
    // La comunidad vota en masa la última opción de la primera escena
    const voted = scenes[0].choices.length - 1;
    await prisma.decisionStoryTally.upsert({
      where: { storyId_sceneIndex_optionIndex: { storyId: chronicle.id, sceneIndex: 0, optionIndex: voted } },
      create: { storyId: chronicle.id, sceneIndex: 0, optionIndex: voted, count: 50 },
      update: { count: 50 },
    });
    mock.seen.length = 0;

    await generator.generateForDay(DAY2, { allowFallback: false });

    const closed = await prisma.decisionStory.findUnique({ where: { id: chronicle.id } });
    expect(closed.closedAt).not.toBeNull();
    expect((closed.canon as any).options[0]).toBe(voted);
    expect(closed.canonSummary).toContain(scenes[0].choices[voted].canonLine);

    const next = await prisma.decisionStory.findFirst({ where: { day: DAY2, slot: 0 } });
    expect(next).toMatchObject({ arcKey: chronicle.arcKey, arcChapter: 2, parentStoryId: chronicle.id });
    // El prompt del capítulo 2 lleva lo que decidió la mayoría
    expect(mock.seen[0].messages[1].content).toContain(scenes[0].choices[voted].canonLine);

    const u = await signup();
    const today = await api().get('/v1/stories/today').set(u.auth).expect(200);
    expect(today.body.day).toBe(DAY2);
    expect(today.body.stories[0].previously.decided).toContain(scenes[0].choices[voted].canonLine);
    // Las historias de ayer ya no se pueden empezar
    await api().post(`/v1/stories/${chronicle.id}/start`).set(u.auth).send({ petId: u.petId }).expect(400);
  });

  it('f. si la IA cae, el bucket se rellena con historias de respaldo y nunca queda vacío', async () => {
    mock.state.failWith = 500;
    const waiting = await generator.generateForDay(DAY3, { allowFallback: false });
    expect(waiting.created).toEqual([]);
    expect(waiting.pending.length).toBeGreaterThanOrEqual(3);

    const report = await generator.generateForDay(DAY3, { allowFallback: true });
    mock.state.failWith = 0;
    expect(report.pending).toEqual([]);
    expect(report.created.every((c) => c.source === 'seed' || c.source === 'rerun')).toBe(true);
    const rows = await prisma.decisionStory.findMany({ where: { day: DAY3 } });
    expect(rows.every((r) => r.arcKey === null)).toBe(true);
  });

  it('g. el panel de administración exige permisos', async () => {
    const u = await signup();
    await api().get('/v1/admin/stories').set(u.auth).expect(403);
    await api().post('/v1/admin/stories/regenerate').set(u.auth).send({}).expect(403);
    await prisma.user.update({ where: { id: u.userId }, data: { role: 'superadmin' } });
    const list = await api().get(`/v1/admin/stories?day=${DAY1}`).set(u.auth).expect(200);
    expect(list.body.stories[0].scenes[0].choices[0]).toHaveProperty('votes');
  });
});
