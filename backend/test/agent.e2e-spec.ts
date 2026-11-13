import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const KEY = 'sk-agent-test-key-1';

/**
 * LLM mock con function calling. Según el último mensaje decide si pide una
 * herramienta o responde con texto (tras recibir el resultado de la herramienta).
 */
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
      const callTool = (name: string, args: unknown) => {
        const json = JSON.stringify(args);
        // fragmentado, como hace un proveedor real
        send({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name, arguments: json.slice(0, 8) } }] });
        send({ tool_calls: [{ index: 0, function: { arguments: json.slice(8) } }] });
        res.end('data: [DONE]\n\n');
      };

      const last = body.messages[body.messages.length - 1];
      if (!body.tools) return text('Respuesta sin herramientas');
      if (last.role === 'tool') return text(`Listo. Resultado: ${last.content.slice(0, 60)}`);
      const said = String(last.content).toLowerCase();
      if (said.includes('pasado')) return callTool('create_reminder', { text: 'Ayer', due_at: '2020-01-01T10:00:00Z' });
      if (said.includes('recuérdame')) {
        return callTool('create_reminder', { text: 'Sacar la basura', due_at: new Date(Date.now() + 3600_000).toISOString() });
      }
      if (said.includes('estado')) return callTool('get_my_status', {});
      if (said.includes('borrar')) return callTool('borrar_todo', {});
      text('Hola');
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

describe('Agente: herramientas y confirmación (e2e, LLM mock)', () => {
  let app: INestApplication;
  let mock: Awaited<ReturnType<typeof startMock>>;
  let prisma: PrismaService;
  let auth: { Authorization: string };
  let petId: string;
  let userId: string;
  const api = () => request(app.getHttpServer());
  const chat = (message: string) =>
    api().post(`/v1/pets/${petId}/chat`).set(auth).send({ message }).buffer(true).parse(sseParser).expect(200);
  const kinds = (res: any) => res.body.events.map((e: any) => e.event);

  async function signup() {
    const reg = await api().post('/v1/auth/register').send({
      email: `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@petai.local`, password: 'Password123!', displayName: 'Ana',
    }).expect(201);
    const headers = { Authorization: `Bearer ${reg.body.accessToken}` };
    const eggs = await api().get('/v1/eggs').set(headers).expect(200);
    const pet = await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(headers).expect(201);
    const me = await api().get('/v1/me').set(headers).expect(200);
    return { headers, petId: pet.body.id as string, userId: me.body.id as string };
  }

  beforeAll(async () => {
    mock = await startMock();
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.get(ConfigService).set('AI_ALLOW_INSECURE_URLS', 'true');
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);

    const u = await signup();
    auth = u.headers;
    petId = u.petId;
    userId = u.userId;
    await api().put('/v1/ai/config').set(auth)
      .send({ provider: 'custom', baseUrl: mock.url, model: 'mock', apiKey: KEY }).expect(200);
  });
  afterAll(async () => {
    await app.close();
    await mock.close();
  });

  it('1. por debajo de 500 de inteligencia no se ofrecen herramientas', async () => {
    await prisma.pet.update({ where: { id: petId }, data: { intelligence: 100 } });
    const res = await chat('dime mi estado');
    expect(kinds(res)).not.toContain('tool');
    expect(mock.seen[mock.seen.length - 1].tools).toBeUndefined();
    expect(mock.seen[mock.seen.length - 1].messages[0].content).toContain('No tienes herramientas');
  });

  it('2. con 500+ el agente recibe las herramientas y la hora actual', async () => {
    await prisma.pet.update({ where: { id: petId }, data: { intelligence: 500 } });
    await chat('hola');
    const req = mock.seen[mock.seen.length - 1];
    expect(req.tools.map((t: any) => t.function.name).sort()).toEqual([
      'create_reminder', 'get_my_status', 'list_reminders', 'request_food', 'search_memory', 'suggest_minigame',
    ]);
    expect(req.messages[0].content).toContain('La hora actual es');
    expect(req.messages[0].content).toContain('NO se ejecutan hasta que el entrenador las confirma');
  });

  it('3. una herramienta de lectura se ejecuta y el modelo responde con su resultado', async () => {
    const res = await chat('¿cuál es mi estado?');
    expect(kinds(res)).toEqual(expect.arrayContaining(['tool', 'delta', 'done']));
    expect(kinds(res)).not.toContain('action');
    const text = res.body.events.filter((e: any) => e.event === 'delta').map((e: any) => e.data.text).join('');
    expect(text).toContain('Listo. Resultado:');

    const toolMsg = mock.seen[mock.seen.length - 1].messages.at(-1);
    expect(toolMsg.content).toContain('hambre'); // datos reales de la mascota
    expect(toolMsg.role).toBe('tool');
    expect(toolMsg.tool_call_id).toBe('call_1');
  });

  it('4. create_reminder NO se ejecuta: llega una tarjeta de confirmación y no hay recordatorio', async () => {
    const res = await chat('recuérdame sacar la basura');
    const action = res.body.events.find((e: any) => e.event === 'action');
    expect(action.data.action.tool).toBe('create_reminder');
    expect(action.data.action.summary).toContain('«Sacar la basura»');
    expect(await prisma.reminder.count({ where: { userId } })).toBe(0);

    const pending = await api().get(`/v1/pets/${petId}/actions`).set(auth).expect(200);
    expect(pending.body).toHaveLength(1);
    expect(pending.body[0].id).toBe(action.data.action.id);
  });

  it('5. confirmar ejecuta la acción una única vez y crea el recordatorio', async () => {
    const [{ id }] = (await api().get(`/v1/pets/${petId}/actions`).set(auth)).body;
    const ok = await api().post(`/v1/pets/${petId}/actions/${id}/confirm`).set(auth).expect(201);
    expect(ok.body).toMatchObject({ ok: true, tool: 'create_reminder' });
    expect(await prisma.reminder.count({ where: { userId } })).toBe(1);

    await api().post(`/v1/pets/${petId}/actions/${id}/confirm`).set(auth).expect(404); // doble confirmación
    expect(await prisma.reminder.count({ where: { userId } })).toBe(1);

    const list = await api().get('/v1/reminders').set(auth).expect(200);
    expect(list.body[0].text).toBe('Sacar la basura');
  });

  it('6. rechazar una acción no crea nada', async () => {
    const res = await chat('recuérdame otra cosa');
    const id = res.body.events.find((e: any) => e.event === 'action').data.action.id;
    await api().post(`/v1/pets/${petId}/actions/${id}/reject`).set(auth).expect(201);
    await api().post(`/v1/pets/${petId}/actions/${id}/confirm`).set(auth).expect(404);
    expect(await prisma.reminder.count({ where: { userId } })).toBe(1);
  });

  it('7. otro usuario no puede confirmar ni rechazar acciones ajenas', async () => {
    const res = await chat('recuérdame algo ajeno');
    const id = res.body.events.find((e: any) => e.event === 'action').data.action.id;
    const other = await signup();
    await api().post(`/v1/pets/${petId}/actions/${id}/confirm`).set(other.headers).expect(404);
    await api().post(`/v1/pets/${other.petId}/actions/${id}/confirm`).set(other.headers).expect(404);
    await api().post(`/v1/pets/${petId}/actions/${id}/reject`).set(other.headers).expect(404);
    expect(await prisma.pendingAction.findUnique({ where: { id } }).then((a) => a?.status)).toBe('pending');
    await api().post(`/v1/pets/${petId}/actions/${id}/reject`).set(auth).expect(201);
  });

  it('8. una acción caducada no se puede confirmar', async () => {
    const res = await chat('recuérdame algo que caduca');
    const id = res.body.events.find((e: any) => e.event === 'action').data.action.id;
    await prisma.pendingAction.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await api().post(`/v1/pets/${petId}/actions/${id}/confirm`).set(auth).expect(404);
    expect((await api().get(`/v1/pets/${petId}/actions`).set(auth)).body.find((a: any) => a.id === id)).toBeUndefined();
  });

  it('9. argumentos inválidos o herramientas inexistentes no crean acciones; el modelo recibe el error', async () => {
    const before = await prisma.pendingAction.count({ where: { userId } });
    const res = await chat('recuérdame algo del pasado');
    expect(kinds(res)).not.toContain('action');
    expect(mock.seen[mock.seen.length - 1].messages.at(-1).content).toContain('futuro');
    const res2 = await chat('quiero borrar todo');
    expect(kinds(res2)).not.toContain('action');
    expect(mock.seen[mock.seen.length - 1].messages.at(-1).content).toContain('desconocida');
    expect(await prisma.pendingAction.count({ where: { userId } })).toBe(before);
  });

  it('10. recordatorios: vencidos, entrega y borrado, siempre acotados al usuario', async () => {
    const r = await prisma.reminder.findFirstOrThrow({ where: { userId } });
    expect((await api().get('/v1/reminders/due').set(auth).expect(200)).body).toEqual([]); // aún no vence

    await prisma.reminder.update({ where: { id: r.id }, data: { dueAt: new Date(Date.now() - 1000) } });
    const due = await api().get('/v1/reminders/due').set(auth).expect(200);
    expect(due.body.map((x: any) => x.id)).toEqual([r.id]);

    const other = await signup();
    expect((await api().get('/v1/reminders/due').set(other.headers).expect(200)).body).toEqual([]);
    await api().post(`/v1/reminders/${r.id}/delivered`).set(other.headers).expect(404);
    await api().delete(`/v1/reminders/${r.id}`).set(other.headers).expect(404);

    await api().post(`/v1/reminders/${r.id}/delivered`).set(auth).expect(201);
    expect((await api().get('/v1/reminders/due').set(auth).expect(200)).body).toEqual([]);
  });
});
