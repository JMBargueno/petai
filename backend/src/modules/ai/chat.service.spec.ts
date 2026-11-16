import { ChatService, ChatStreamEvent } from './chat.service';
import { LlmEvent, LlmProvider } from './llm-provider';

function fakeProvider(events: LlmEvent[]): LlmProvider {
  return {
    async *chat() {
      for (const ev of events) yield ev;
    },
    test: async () => undefined,
  };
}

function makeService() {
  const created: any[] = [];
  const prisma = {
    chatMessage: {
      create: jest.fn(async ({ data }: any) => {
        created.push(data);
        return { id: `msg-${created.length}`, ...data };
      }),
    },
    pet: { update: jest.fn(async () => ({ id: 'pet-1', intelligence: 1 })) },
  };
  const svc = new ChatService(
    prisma as any,
    {} as any,
    {} as any,
    { emitPetUpdate: jest.fn() } as any,
    { maybeSummarize: jest.fn(async () => undefined) } as any,
    {} as any,
    { record: jest.fn(async () => undefined) } as any,
    { recordInteraction: jest.fn(async () => undefined) } as any,
    { acquire: jest.fn(async () => ({ ok: true, token: 't' })), release: jest.fn(async () => undefined) } as any,
  );
  return { svc, created };
}

async function runChat(events: LlmEvent[]) {
  const { svc, created } = makeService();
  const out: ChatStreamEvent[] = [];
  const gen = (svc as any).run(
    'user-1',
    { id: 'pet-1', intelligence: 0 },
    'hola!',
    [{ role: 'user', content: 'hola!' }],
    fakeProvider(events),
    'qwen3',
    'byok',
  ) as AsyncGenerator<ChatStreamEvent>;
  for await (const ev of gen) out.push(ev);
  return { out, created };
}

describe('ChatService: razonamiento del modelo', () => {
  it('no mezcla el razonamiento con la respuesta y lo devuelve aparte en done', async () => {
    const { out, created } = await runChat([
      { type: 'thinking', text: 'The trainer says "hola!"... Let me consider: ' },
      { type: 'thinking', text: 'Character: philosopher.' },
      { type: 'delta', text: '¡Hola, jmbargueno! Qué gusto saludarte.' },
      { type: 'done' },
    ]);
    const visible = out
      .filter((e): e is Extract<ChatStreamEvent, { type: 'delta' }> => e.type === 'delta')
      .map((e) => e.text)
      .join('');
    expect(visible).toBe('¡Hola, jmbargueno! Qué gusto saludarte.');
    expect(visible).not.toContain('Let me consider');

    const done = out[out.length - 1] as Extract<ChatStreamEvent, { type: 'done' }>;
    expect(done.type).toBe('done');
    expect(done.message.content).toBe('¡Hola, jmbargueno! Qué gusto saludarte.');
    expect(done.message.thinking).toBe('The trainer says "hola!"... Let me consider: Character: philosopher.');

    // Solo la respuesta en personaje queda en el historial
    const saved = created.find((m) => m.role === 'assistant');
    expect(saved.content).toBe('¡Hola, jmbargueno! Qué gusto saludarte.');
  });

  it('sin razonamiento, done no lleva el campo thinking', async () => {
    const { out } = await runChat([{ type: 'delta', text: 'Hola' }, { type: 'done' }]);
    const done = out[out.length - 1] as Extract<ChatStreamEvent, { type: 'done' }>;
    expect(done.message).not.toHaveProperty('thinking');
  });

  it('omite un razonamiento que filtra el prompt de sistema pero conserva la respuesta', async () => {
    const { out } = await runChat([
      { type: 'thinking', text: 'The rules say: Nunca salgas del personaje. OK.' },
      { type: 'delta', text: '¡Hola!' },
      { type: 'done' },
    ]);
    const done = out[out.length - 1] as Extract<ChatStreamEvent, { type: 'done' }>;
    expect(done.type).toBe('done');
    expect(done.message.content).toBe('¡Hola!');
    expect(done.message).not.toHaveProperty('thinking');
  });

  it('si el modelo solo razona y no responde, avisa del error y no guarda nada', async () => {
    const { out, created } = await runChat([{ type: 'thinking', text: 'hmm' }, { type: 'done' }]);
    expect(out[out.length - 1].type).toBe('error');
    expect(created).toHaveLength(0);
  });
});
