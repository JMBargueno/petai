import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const VALID_KEY = 'sk-test-key-123456';

/** Servidor mock compatible con OpenAI Chat Completions (streaming SSE). */
function startMockLlm() {
  const seen: { auth?: string; body?: any }[] = [];
  const state = { failWith: 0 };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      seen.push({ auth: req.headers.authorization, body });
      if (req.url !== '/v1/chat/completions') return res.writeHead(404).end();
      if (state.failWith) return res.writeHead(state.failWith).end('nope');
      if (req.headers.authorization !== `Bearer ${VALID_KEY}`) return res.writeHead(401).end('bad key');
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const chunk = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
      res.write(chunk('Hola, '));
      res.write(chunk('entrenador'));
      res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 3 } })}\n\n`);
      res.end('data: [DONE]\n\n');
    });
  });
  return new Promise<{ url: string; seen: typeof seen; state: typeof state; close: () => Promise<void> }>((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/v1`,
        seen,
        state,
        close: () => new Promise((r) => server.close(() => r())),
      });
    }),
  );
}

async function createApp(allowInsecure: 'true' | 'false') {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  // ConfigModule valida el entorno al importar AppModule, así que el flag se fija en runtime
  app.get(ConfigService).set('AI_ALLOW_INSECURE_URLS', allowInsecure);
  app.setGlobalPrefix('v1');
  await app.init();
  return app;
}

async function signup(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const reg = await http()
    .post('/v1/auth/register')
    .send({ email: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@petai.local`, password: 'Password123!', displayName: 'Ana' })
    .expect(201);
  const auth = { Authorization: `Bearer ${reg.body.accessToken}` };
  const eggs = await http().get('/v1/eggs').set(auth).expect(200);
  const pet = await http().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(auth).expect(201);
  return { auth, petId: pet.body.id as string, nickname: pet.body.nickname as string };
}

/** Parsea la respuesta SSE completa en una lista de eventos. */
const sseParser = (res: any, cb: (err: Error | null, body: any) => void) => {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (c: string) => (data += c));
  res.on('end', () => {
    const events = data
      .split('\n\n')
      .filter(Boolean)
      .map((blk) => {
        const ev = /^event: (.+)$/m.exec(blk)?.[1];
        const json = /^data: (.+)$/m.exec(blk)?.[1];
        return { event: ev, data: json ? JSON.parse(json) : null };
      });
    cb(null, { raw: data, events });
  });
};

describe('IA: configuración BYOK y chat (e2e, LLM mock)', () => {
  describe('protección SSRF (AI_ALLOW_INSECURE_URLS=false)', () => {
    let app: INestApplication;
    beforeAll(async () => (app = await createApp('false')));
    afterAll(async () => app.close());

    it('rechaza http, loopback y metadatos cloud', async () => {
      const { auth } = await signup(app);
      for (const baseUrl of ['http://api.example.com/v1', 'https://127.0.0.1/v1', 'https://169.254.169.254/v1', 'https://[::1]/v1']) {
        await request(app.getHttpServer())
          .put('/v1/ai/config')
          .set(auth)
          .send({ provider: 'custom', baseUrl, model: 'm', apiKey: VALID_KEY })
          .expect(400);
      }
    });
  });

  describe('flujo completo', () => {
    let app: INestApplication;
    let mock: Awaited<ReturnType<typeof startMockLlm>>;
    let user: Awaited<ReturnType<typeof signup>>;
    const api = () => request(app.getHttpServer());

    beforeAll(async () => {
      mock = await startMockLlm();
      app = await createApp('true');
      user = await signup(app);
    });
    afterAll(async () => {
      await app.close();
      await mock.close();
    });

    it('1. sin configuración: GET indica configured=false y el chat devuelve 404', async () => {
      const cfg = await api().get('/v1/ai/config').set(user.auth).expect(200);
      expect(cfg.body).toEqual({ configured: false });
      await api().post(`/v1/pets/${user.petId}/chat`).set(user.auth).send({ message: 'hola' }).expect(404);
    });

    it('2. valida el proveedor y exige apiKey la primera vez', async () => {
      await api().put('/v1/ai/config').set(user.auth).send({ provider: 'nope', apiKey: VALID_KEY }).expect(400);
      await api().put('/v1/ai/config').set(user.auth).send({ provider: 'custom', baseUrl: mock.url, model: 'm' }).expect(400);
      await api().put('/v1/ai/config').set(user.auth).send({ provider: 'custom', model: 'm', apiKey: VALID_KEY }).expect(400); // sin baseUrl
      await api().put('/v1/ai/config').set(user.auth).send({ provider: 'custom', baseUrl: mock.url, model: 'm', apiKey: 'a b' }).expect(400);
    });

    it('3. guarda la key cifrada y nunca la devuelve', async () => {
      const res = await api()
        .put('/v1/ai/config')
        .set(user.auth)
        .send({ provider: 'custom', baseUrl: mock.url, model: 'mock-1', apiKey: VALID_KEY })
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain(VALID_KEY);
      expect(res.body).toMatchObject({ configured: true, hasKey: true, provider: 'custom', model: 'mock-1' });
      expect(res.body.keyMask).toBe('sk-…3456');

      const get = await api().get('/v1/ai/config').set(user.auth).expect(200);
      expect(JSON.stringify(get.body)).not.toContain(VALID_KEY);

      const row = await app.get(PrismaService).aiConfig.findFirst({ where: { model: 'mock-1' } });
      expect(row?.encryptedKey).toBeTruthy();
      expect(JSON.stringify(row)).not.toContain(VALID_KEY);
    });

    it('4. POST /ai/config/test comprueba la conectividad', async () => {
      const ok = await api().post('/v1/ai/config/test').set(user.auth).expect(201);
      expect(ok.body).toEqual({ ok: true });
      const cfg = await api().get('/v1/ai/config').set(user.auth).expect(200);
      expect(cfg.body.lastTestedAt).toBeTruthy();
    });

    it('5. chat en streaming SSE con personalidad e historial', async () => {
      const res = await api()
        .post(`/v1/pets/${user.petId}/chat`)
        .set(user.auth)
        .send({ message: '  ¡Hola!  ' })
        .buffer(true)
        .parse(sseParser)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/event-stream');
      const evs = res.body.events;
      expect(evs.filter((e: any) => e.event === 'delta').map((e: any) => e.data.text).join('')).toBe('Hola, entrenador');
      const done = evs[evs.length - 1];
      expect(done.event).toBe('done');
      expect(done.data.message.content).toBe('Hola, entrenador');
      expect(done.data.intelligence).toBe(1);

      // El proveedor recibió la key del usuario, el prompt de personalidad y el mensaje saneado
      const call = mock.seen[mock.seen.length - 1];
      expect(call.auth).toBe(`Bearer ${VALID_KEY}`);
      expect(call.body.stream).toBe(true);
      expect(call.body.messages[0].role).toBe('system');
      expect(call.body.messages[0].content).toContain(user.nickname);
      expect(call.body.messages[call.body.messages.length - 1]).toEqual({ role: 'user', content: '¡Hola!' });

      const hist = await api().get(`/v1/pets/${user.petId}/chat/history`).set(user.auth).expect(200);
      expect(hist.body.map((m: any) => [m.role, m.content])).toEqual([
        ['user', '¡Hola!'],
        ['assistant', 'Hola, entrenador'],
      ]);

      const pets = await api().get('/v1/pets').set(user.auth).expect(200);
      expect(pets.body[0].intelligence).toBe(1);
      expect(pets.body[0].awakened).toBe(true);
    });

    it('6. segundo mensaje: el historial viaja como contexto', async () => {
      await api().post(`/v1/pets/${user.petId}/chat`).set(user.auth).send({ message: 'otra vez' })
        .buffer(true).parse(sseParser).expect(200);
      const msgs = mock.seen[mock.seen.length - 1].body.messages;
      expect(msgs.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    });

    it('7. valida el mensaje', async () => {
      const chat = (body: any) => api().post(`/v1/pets/${user.petId}/chat`).set(user.auth).send(body);
      await chat({}).expect(400);
      await chat({ message: '   ' }).expect(400);
      await chat({ message: 'x'.repeat(1001) }).expect(400);
      await chat({ message: 42 }).expect(400);
    });

    it('8. no se puede conversar con la mascota de otro usuario', async () => {
      const other = await signup(app);
      await api().post(`/v1/pets/${user.petId}/chat`).set(other.auth).send({ message: 'hola' }).expect(404);
      await api().get(`/v1/pets/${user.petId}/chat/history`).set(other.auth).expect(404);
    });

    it('9. un fallo del proveedor llega como evento error y no se guarda nada', async () => {
      const before = (await api().get(`/v1/pets/${user.petId}/chat/history`).set(user.auth)).body.length;
      mock.state.failWith = 429;
      const res = await api().post(`/v1/pets/${user.petId}/chat`).set(user.auth).send({ message: 'hola' })
        .buffer(true).parse(sseParser).expect(200);
      mock.state.failWith = 0;
      expect(res.body.events[0].event).toBe('error');
      expect(res.body.events[0].data.message).toContain('Límite');
      const after = (await api().get(`/v1/pets/${user.petId}/chat/history`).set(user.auth)).body.length;
      expect(after).toBe(before);
    });

    it('10. límite de mensajes por minuto (429)', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 22; i++) {
        const r = await api().post(`/v1/pets/${user.petId}/chat`).set(user.auth).send({ message: `m${i}` })
          .buffer(true).parse(sseParser);
        statuses.push(r.status);
      }
      expect(statuses).toContain(429);
    });

    it('11. eliminar la configuración borra la key y desactiva el chat', async () => {
      await api().delete('/v1/ai/config').set(user.auth).expect(200);
      const cfg = await api().get('/v1/ai/config').set(user.auth).expect(200);
      expect(cfg.body).toEqual({ configured: false });
      await api().post(`/v1/pets/${user.petId}/chat`).set(user.auth).send({ message: 'hola' }).expect(404);
    });
  });
});
