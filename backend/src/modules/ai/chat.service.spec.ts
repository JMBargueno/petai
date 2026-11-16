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
    { planFor: jest.fn(async () => 'free') } as any,
    { consume: jest.fn(async () => ({ key: 'daily:k' })), refund: jest.fn(async () => undefined) } as any,
    {
      limits: jest.fn(async () => ({ maxInputChars: 240, maxOutputTokens: 120, historyMessages: 6, historyCharBudget: 1500, agentTools: false })),
      byokSettings: jest.fn(() => ({ rateLimitPerMinute: 20 })),
    } as any,
    {
      assertOpen: jest.fn(async () => undefined),
      add: jest.fn(async () => undefined),
      reserve: jest.fn(async () => 1000),
      settle: jest.fn(async () => undefined),
      acquireSlot: jest.fn(async () => 'slot-1'),
      releaseSlot: jest.fn(async () => undefined),
      estimateCostUsd: jest.fn((p: number, c: number) => (p * 0.5 + c * 2) / 1e6),
      recordFailure: jest.fn(async () => undefined),
      recordSuccess: jest.fn(async () => undefined),
    } as any,
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

describe('ChatService (Spec-34 Managed Mode)', () => {
  it('lanza message_too_long en managed si el mensaje supera los caracteres permitidos (AC6)', async () => {
    const { svc } = makeService();
    (svc as any).petsService = { getPetById: jest.fn(async () => ({ id: 'pet-1', intelligence: 10 })) };
    (svc as any).aiConfig = { resolveProvider: jest.fn(async () => ({ provider: fakeProvider([]), model: 'm', mode: 'managed' })) };
    (svc as any).usage = { assertWithinQuota: jest.fn(async () => undefined) };

    const longMessage = 'a'.repeat(250); // Límite por defecto es 240
    await expect(svc.prepare('user-1', 'pet-1', longMessage)).rejects.toThrow(
      expect.objectContaining({
        status: 400,
        response: expect.objectContaining({
          code: 'message_too_long',
          max: 240,
        }),
      }),
    );
  });

  it('ejecuta refund si el proveedor falla antes de emitir ningún delta (AC5)', async () => {
    const { svc } = makeService();
    const failingProvider: LlmProvider = {
      async *chat() {
        throw new Error('Connection failed before delta');
      },
      test: async () => undefined,
    };

    const out: ChatStreamEvent[] = [];
    const gen = (svc as any).run(
      'user-1',
      { id: 'pet-1', intelligence: 0 },
      'hola!',
      [{ role: 'user', content: 'hola!' }],
      failingProvider,
      'model-managed',
      'managed',
      undefined,
      undefined,
      { maxOutputTokens: 120 } as any,
      'daily:user-1:2026-11-16',
    ) as AsyncGenerator<ChatStreamEvent>;

    for await (const ev of gen) out.push(ev);

    expect(out[0]).toEqual({ type: 'error', message: 'Connection failed before delta' });
    expect((svc as any).dailyQuota.refund).toHaveBeenCalledWith('daily:user-1:2026-11-16');
    expect((svc as any).managedBudget.recordFailure).toHaveBeenCalled();
    expect((svc as any).managedBudget.releaseSlot).toHaveBeenCalledWith('slot-1');
  });

  it('ajusta la reserva al coste real que informa OpenRouter y libera la plaza', async () => {
    const { svc } = makeService();
    (svc as any).persistExchange = jest.fn(async () => ({ id: 'm1', intelligence: 0 }));
    (svc as any).memory = { maybeSummarize: jest.fn(async () => undefined) };
    const provider: LlmProvider = {
      async *chat() {
        yield { type: 'delta', text: 'hola' };
        yield { type: 'done', usage: { promptTokens: 100, completionTokens: 10, costUsd: 0.0002 } };
      },
      test: async () => undefined,
    };
    const gen = (svc as any).run('user-1', { id: 'pet-1', intelligence: 0 }, 'hola', [{ role: 'user', content: 'hola' }], provider, 'm', 'managed', undefined, undefined, { maxOutputTokens: 120 } as any, 'daily:k', 5000) as AsyncGenerator<ChatStreamEvent>;
    for await (const _ of gen) void _;

    expect((svc as any).managedBudget.settle).toHaveBeenCalledWith(5000, 0.0002);
    expect((svc as any).managedBudget.releaseSlot).toHaveBeenCalledWith('slot-1');
  });

  it('si ya hay una respuesta en curso devuelve el mensaje del día y la reserva', async () => {
    const { svc } = makeService();
    (svc as any).exclusiveLock = { acquire: jest.fn(async () => ({ ok: false })), release: jest.fn() };
    const gen = (svc as any).run('user-1', { id: 'pet-1', intelligence: 0 }, 'hola', [], fakeProvider([]), 'm', 'managed', undefined, undefined, { maxOutputTokens: 120 } as any, 'daily:k', 5000) as AsyncGenerator<ChatStreamEvent>;
    const out: ChatStreamEvent[] = [];
    for await (const ev of gen) out.push(ev);

    expect(out[0].type).toBe('error');
    expect((svc as any).dailyQuota.refund).toHaveBeenCalledWith('daily:k');
    expect((svc as any).managedBudget.settle).toHaveBeenCalledWith(5000, 0);
    expect((svc as any).managedBudget.acquireSlot).not.toHaveBeenCalled();
  });
});
