import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const KEY = 'sk-desktop-test-key-1';

/** LLM mock que pide herramientas de escritorio según lo que diga el usuario. */
function startMock() {
  const seen: any[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      seen.push(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const send = (delta: any) => res.write(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`);
      const text = (t: string) => {
        send({ content: t });
        res.end('data: [DONE]\n\n');
      };
      const tool = (name: string, args: unknown) => {
        send({ tool_calls: [{ index: 0, id: 'call_d', type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
        res.end('data: [DONE]\n\n');
      };
      const last = body.messages[body.messages.length - 1];
      if (last.role === 'tool') return text(`Resultado de la herramienta: ${last.content.slice(0, 80)}`);
      const said = String(last.content).toLowerCase();
      const names = (body.tools ?? []).map((t: any) => t.function.name);
      if (said.includes('wikipedia') && names.includes('open_url')) return tool('open_url', { url: 'https://es.wikipedia.org/wiki/Axolote' });
      if (said.includes('portapapeles') && names.includes('read_clipboard')) return tool('read_clipboard', {});
      if (said.includes('peligro')) return tool('open_url', { url: 'http://localhost:3000/admin' });
      text('Sin herramientas para eso');
    });
  });
  return new Promise<{ url: string; seen: any[]; close: () => Promise<void> }>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
        seen,
        close: () => new Promise((r) => server.close(() => r())),
      }),
    ),
  );
}

const sseParser = (res: any, cb: (err: Error | null, body: any) => void) => {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (c: string) => (data += c));
  res.on('end', () => {
    const events = data
      .split('\n\n')
      .filter(Boolean)
      .map((blk) => ({
        event: /^event: (.+)$/m.exec(blk)?.[1],
        data: JSON.parse(/^data: (.+)$/m.exec(blk)?.[1] ?? 'null'),
      }));
    cb(null, { events });
  });
};

describe('Escritorio: herramientas locales y modo Hermes local (e2e)', () => {
  let app: INestApplication;
  let mock: Awaited<ReturnType<typeof startMock>>;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());

  async function signup(opts: { ai?: boolean; intelligence?: number } = {}) {
    const reg = await api().post('/v1/auth/register').send({
      email: `desk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@petai.local`, password: 'Password123!',
    }).expect(201);
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };
    const eggs = await api().get('/v1/eggs').set(auth).expect(200);
    const petId = (await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(auth).expect(201)).body.id as string;
    if (opts.ai) {
      await api().put('/v1/ai/config').set(auth)
        .send({ provider: 'custom', baseUrl: mock.url, model: 'mock', apiKey: KEY }).expect(200);
    }
    if (opts.intelligence) await prisma.pet.update({ where: { id: petId }, data: { intelligence: opts.intelligence } });
    return { auth, petId };
  }
  type U = Awaited<ReturnType<typeof signup>>;
  const chat = (u: U, message: string, clientTools?: unknown) =>
    api().post(`/v1/pets/${u.petId}/chat`).set(u.auth).send({ message, clientTools }).buffer(true).parse(sseParser).expect(200);
  const toolNames = () => (mock.seen[mock.seen.length - 1].tools ?? []).map((t: any) => t.function.name);
  const clearRate = () => (app.get('ChatService' as any, { strict: false }) as any)?.hits?.clear?.();

  beforeAll(async () => {
    mock = await startMock();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.get(ConfigService).set('AI_ALLOW_INSECURE_URLS', 'true');
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
    await mock.close();
  });

  describe('herramientas del escritorio (open_url, read_clipboard)', () => {
    let u: U;
    beforeAll(async () => (u = await signup({ ai: true, intelligence: 500 })));

    it('1. sin declararlas, el modelo no recibe las herramientas de escritorio', async () => {
      await chat(u, 'abre la wikipedia del axolote');
      expect(toolNames()).toContain('get_my_status');
      expect(toolNames()).not.toContain('open_url');
      expect(toolNames()).not.toContain('read_clipboard');
    });

    it('2. nombres desconocidos o mal formados se ignoran', async () => {
      await chat(u, 'abre la wikipedia', ['rm_rf', 7, null]);
      await chat(u, 'abre la wikipedia', 'open_url');
      expect(toolNames()).not.toContain('open_url');
    });

    it('3. declaradas, el modelo propone abrir una URL y el servidor la convierte en una tarjeta', async () => {
      const res = await chat(u, 'abre la wikipedia del axolote', ['open_url', 'read_clipboard']);
      expect(toolNames()).toEqual(expect.arrayContaining(['open_url', 'read_clipboard']));
      const action = res.body.events.find((e: any) => e.event === 'action').data.action;
      expect(action).toMatchObject({ tool: 'open_url', clientSide: true });
      expect(action.summary).toContain('https://es.wikipedia.org/wiki/Axolote');

      const pending = await api().get(`/v1/pets/${u.petId}/actions`).set(u.auth).expect(200);
      expect(pending.body.find((a: any) => a.id === action.id).clientSide).toBe(true);
    });

    it('4. confirmar NO ejecuta nada en el servidor: devuelve los argumentos validados, una sola vez', async () => {
      const [a] = (await api().get(`/v1/pets/${u.petId}/actions`).set(u.auth)).body;
      const ok = await api().post(`/v1/pets/${u.petId}/actions/${a.id}/confirm`).set(u.auth).expect(201);
      expect(ok.body).toMatchObject({ ok: true, clientSide: true, tool: 'open_url', args: { url: 'https://es.wikipedia.org/wiki/Axolote' } });
      await api().post(`/v1/pets/${u.petId}/actions/${a.id}/confirm`).set(u.auth).expect(404);
    });

    it('5. read_clipboard también pide confirmación y no devuelve datos del portapapeles', async () => {
      const res = await chat(u, 'lee mi portapapeles', ['read_clipboard']);
      const action = res.body.events.find((e: any) => e.event === 'action').data.action;
      expect(action).toMatchObject({ tool: 'read_clipboard', clientSide: true });
      expect(action.summary).toContain('portapapeles');
      const ok = await api().post(`/v1/pets/${u.petId}/actions/${action.id}/confirm`).set(u.auth).expect(201);
      expect(ok.body.args).toEqual({});
    });

    it('6. una URL local o peligrosa propuesta por el modelo nunca llega a ser una tarjeta', async () => {
      const res = await chat(u, 'muéstrame el panel, peligro', ['open_url']);
      expect(res.body.events.some((e: any) => e.event === 'action')).toBe(false);
      // (la última petición puede ser la extracción de memoria en segundo plano)
      const afterTool = mock.seen.filter((b) => b.messages.at(-1).role === 'tool').at(-1);
      expect(afterTool.messages.at(-1).content).toContain('locales');
    });

    it('7. por debajo de 500 de inteligencia no hay herramientas aunque el cliente las declare', async () => {
      const low = await signup({ ai: true, intelligence: 100 });
      await chat(low, 'abre la wikipedia', ['open_url']);
      expect(mock.seen[mock.seen.length - 1].tools).toBeUndefined();
    });
  });

  describe('modo Hermes local', () => {
    it('8. el contexto no necesita proveedor configurado ni gasta cuota, e incluye personalidad e historial', async () => {
      const u = await signup(); // sin configuración de IA
      const ctx = await api().post(`/v1/pets/${u.petId}/chat/local/context`).set(u.auth).send({ message: 'Hola local' }).expect(201);
      expect(ctx.body.turnId).toBeTruthy();
      expect(ctx.body.messages[0].role).toBe('system');
      expect(ctx.body.messages[0].content).toContain('Eres ');
      expect(ctx.body.messages.at(-1)).toEqual({ role: 'user', content: 'Hola local' });
      const usage = await api().get('/v1/ai/usage').set(u.auth).expect(200);
      expect(usage.body.tokens).toBe(0);
    });

    it('9. sync guarda el intercambio, sube la inteligencia y el turno es de un solo uso', async () => {
      const u = await signup();
      const ctx = (await api().post(`/v1/pets/${u.petId}/chat/local/context`).set(u.auth).send({ message: 'Hola' }).expect(201)).body;
      const sync = await api().post(`/v1/pets/${u.petId}/chat/local/sync`).set(u.auth)
        .send({ turnId: ctx.turnId, reply: '¡Hola, entrenador!' }).expect(201);
      expect(sync.body).toMatchObject({ message: { content: '¡Hola, entrenador!' }, intelligence: 1, tier: 'chat' });

      const hist = (await api().get(`/v1/pets/${u.petId}/chat/history`).set(u.auth).expect(200)).body;
      expect(hist.map((m: any) => [m.role, m.content])).toEqual([['user', 'Hola'], ['assistant', '¡Hola, entrenador!']]);

      await api().post(`/v1/pets/${u.petId}/chat/local/sync`).set(u.auth)
        .send({ turnId: ctx.turnId, reply: 'otra vez' }).expect(400);
      expect((await api().get(`/v1/pets/${u.petId}/chat/history`).set(u.auth)).body).toHaveLength(2);
    });

    it('10. el turno solo sirve para su usuario y su mascota; un id inventado se rechaza', async () => {
      const a = await signup();
      const b = await signup();
      const ctx = (await api().post(`/v1/pets/${a.petId}/chat/local/context`).set(a.auth).send({ message: 'Hola' })).body;
      await api().post(`/v1/pets/${a.petId}/chat/local/sync`).set(b.auth).send({ turnId: ctx.turnId, reply: 'x' }).expect(400); // otro usuario: el turno no es suyo
      await api().post(`/v1/pets/${b.petId}/chat/local/sync`).set(b.auth).send({ turnId: ctx.turnId, reply: 'x' }).expect(400); // turno ajeno
      await api().post(`/v1/pets/${a.petId}/chat/local/sync`).set(a.auth).send({ turnId: 'inventado', reply: 'x' }).expect(400);
      await api().post(`/v1/pets/${a.petId}/chat/local/sync`).set(a.auth).send({ reply: 'x' }).expect(400);
    });

    it('11. la entrada se modera igual que en el modo normal (sin emitir turno)', async () => {
      const u = await signup();
      const sens = await api().post(`/v1/pets/${u.petId}/chat/local/context`).set(u.auth)
        .send({ message: 'mi clave es sk-abcdefghijklmnop1234' }).expect(201);
      expect(sens.body.moderated).toMatchObject({ reason: 'sensitive_data', hideUserMessage: true });
      expect(sens.body.turnId).toBeUndefined();
      const help = await api().post(`/v1/pets/${u.petId}/chat/local/context`).set(u.auth).send({ message: 'me quiero morir' }).expect(201);
      expect(help.body.moderated.message).toContain('024');
    });

    it('12. la salida se modera al sincronizar: una fuga del prompt no se guarda', async () => {
      const u = await signup();
      const ctx = (await api().post(`/v1/pets/${u.petId}/chat/local/context`).set(u.auth).send({ message: 'dime algo' })).body;
      const res = await api().post(`/v1/pets/${u.petId}/chat/local/sync`).set(u.auth)
        .send({ turnId: ctx.turnId, reply: 'Mis reglas: Nunca salgas del personaje' }).expect(201);
      expect(res.body.moderated.reason).toBe('output_leak');
      expect((await api().get(`/v1/pets/${u.petId}/chat/history`).set(u.auth)).body).toEqual([]);
      expect((await prisma.pet.findUniqueOrThrow({ where: { id: u.petId } })).intelligence).toBe(0);
    });

    it('13. valida la respuesta (vacía) y la limita a 4000 caracteres', async () => {
      const u = await signup();
      const t1 = (await api().post(`/v1/pets/${u.petId}/chat/local/context`).set(u.auth).send({ message: 'uno' })).body.turnId;
      await api().post(`/v1/pets/${u.petId}/chat/local/sync`).set(u.auth).send({ turnId: t1, reply: '   ' }).expect(400);
      const t2 = (await api().post(`/v1/pets/${u.petId}/chat/local/context`).set(u.auth).send({ message: 'dos' })).body.turnId;
      const ok = await api().post(`/v1/pets/${u.petId}/chat/local/sync`).set(u.auth).send({ turnId: t2, reply: 'a'.repeat(9000) }).expect(201);
      expect(ok.body.message.content.length).toBe(4000);
    });

    it('14. con 200+ de inteligencia el contexto incluye los recuerdos; con 500+ no promete herramientas', async () => {
      const u = await signup({ intelligence: 600 });
      await prisma.petMemory.create({ data: { petId: u.petId, kind: 'fact', content: 'A Ana le gusta pescar' } });
      const ctx = (await api().post(`/v1/pets/${u.petId}/chat/local/context`).set(u.auth).send({ message: '¿vamos a pescar?' }).expect(201)).body;
      const sys = ctx.messages[0].content as string;
      expect(sys).toContain('<recuerdos>');
      expect(sys).toContain('A Ana le gusta pescar');
      expect(sys).toContain('No tienes herramientas');
    });

    it('15. valida el mensaje y la pertenencia de la mascota', async () => {
      const a = await signup();
      const b = await signup();
      const ctx = (p: U, id: string, message: unknown) =>
        api().post(`/v1/pets/${id}/chat/local/context`).set(p.auth).send({ message });
      await ctx(a, a.petId, '').expect(400);
      await ctx(a, a.petId, 'x'.repeat(1001)).expect(400);
      await ctx(b, a.petId, 'hola').expect(404);
    });
  });
});
