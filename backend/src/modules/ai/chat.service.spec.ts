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

describe('ChatService: orquestador del cerebro (spec 36)', () => {
  const fs = require('fs');
  const path = require('path');
  const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8')).personality;
  const { interpretMessage } = require('../mind/conversation.engine');
  const { viewOf } = require('../mind/behavior.engine');
  const { neutralDims } = require('../mind/personality.engine');

  function setup(rounds: LlmEvent[][]) {
    const { svc, created } = makeService();
    const mind = { config: () => cfg, applyExperience: jest.fn(async () => null) };
    const mindMemory = { remember: jest.fn(async () => 1), feel: jest.fn(async () => undefined) };
    const agent = { handle: jest.fn(async () => ({ kind: 'result', content: '{}' })) };
    Object.assign(svc as any, { mind, mindMemory, agent });
    let calls = 0;
    const provider: LlmProvider = {
      async *chat() {
        const evs = rounds[Math.min(calls, rounds.length - 1)];
        calls++;
        for (const ev of evs) yield ev;
      },
      test: async () => undefined,
    };
    const turn = { interpretation: interpretMessage('Hoy he tenido un día bastante malo'), behavior: viewOf('comfort'), dims: neutralDims() };
    const agentCtx = { userId: 'user-1', petId: 'pet-1', timeZone: 'UTC', now: new Date(), clientTools: [] };
    const pet = { id: 'pet-1', intelligence: 600, energy: 5, sleeping: false, sick: false, happiness: 50 };
    return { svc, created, mind, mindMemory, agent, provider, turn, agentCtx, pet, calls: () => calls };
  }

  async function drive(s: ReturnType<typeof setup>) {
    const out: ChatStreamEvent[] = [];
    const gen = (s.svc as any).run('user-1', s.pet, 'Hoy he tenido un día bastante malo', [{ role: 'user', content: 'x' }], s.provider, 'm', 'byok', undefined, s.agentCtx, undefined, undefined, 0, s.turn) as AsyncGenerator<ChatStreamEvent>;
    for await (const ev of gen) out.push(ev);
    await new Promise((r) => setImmediate(r)); // efectos del turno en segundo plano
    return out;
  }

  it('texto + express_behavior: una sola llamada al proveedor y done con la reacción validada', async () => {
    const s = setup([
      [
        { type: 'delta', text: 'Puedes quedarte conmigo.' },
        { type: 'tool_call', id: 't1', name: 'express_behavior', arguments: '{"action":"invite_play"}' } as any,
        { type: 'done' },
      ],
    ]);
    const out = await drive(s);
    expect(s.calls()).toBe(1);
    const done = out[out.length - 1] as Extract<ChatStreamEvent, { type: 'done' }>;
    expect(done.message.content).toBe('Puedes quedarte conmigo.');
    // energía 5: las reglas sustituyen invite_play por yawn
    expect(done.behavior?.action).toBe('yawn');
    expect(s.agent.handle).not.toHaveBeenCalled();
  });

  it('una acción fuera de catálogo se rechaza y nunca llega al agente', async () => {
    const s = setup([
      [{ type: 'tool_call', id: 't1', name: 'express_behavior', arguments: '{"action":"delete_account"}' } as any, { type: 'done' }],
      [{ type: 'delta', text: 'Estoy aquí.' }, { type: 'done' }],
    ]);
    s.pet.energy = 80;
    const out = await drive(s);
    expect(s.calls()).toBe(2);
    const done = out[out.length - 1] as Extract<ChatStreamEvent, { type: 'done' }>;
    expect(done.behavior?.action).toBe('listen');
    expect(s.agent.handle).not.toHaveBeenCalled();
  });

  it('tras responder registra el episodio, la relación y la deriva de personalidad', async () => {
    const s = setup([[{ type: 'delta', text: 'Ánimo.' }, { type: 'done' }]]);
    s.pet.energy = 80;
    const out = await drive(s);
    const done = out[out.length - 1] as Extract<ChatStreamEvent, { type: 'done' }>;
    expect(done.behavior).toEqual(viewOf('comfort'));
    expect(s.mindMemory.remember).toHaveBeenCalledWith('pet-1', [expect.objectContaining({ layer: 'episodic', subject: 'owner' })]);
    expect(s.mindMemory.feel).toHaveBeenCalledWith('pet-1', 'owner', 'Mi entrenador', expect.any(Number));
    expect(s.mind.applyExperience).toHaveBeenCalledWith('pet-1', ['talk_comfort']);
  });

  it('un mensaje trivial no crea recuerdos ni mueve la relación con el entrenador', async () => {
    const s = setup([[{ type: 'delta', text: '¡Hola!' }, { type: 'done' }]]);
    s.pet.energy = 80;
    s.turn.interpretation = interpretMessage('mensaje 0');
    s.turn.behavior = viewOf('listen');
    await drive(s);
    expect(s.mindMemory.remember).not.toHaveBeenCalled();
    expect(s.mindMemory.feel).not.toHaveBeenCalled();
  });
});

describe('ChatService: turnos locales (Hermes local y CLI)', () => {
  function localService() {
    const { svc, created } = makeService();
    const maybeSummarize = jest.fn(async () => undefined);
    (svc as any).memory = { maybeSummarize, recall: jest.fn(async () => '') };
    (svc as any).petsService = { getPetById: jest.fn(async () => ({ id: 'pet-1', intelligence: 250 })) };
    (svc as any).localTurns.set('t1', { userId: 'user-1', petId: 'pet-1', message: 'hola', expiresAt: Date.now() + 60_000 });
    return { svc, created, maybeSummarize };
  }
  const flush = () => new Promise((r) => setImmediate(r));

  it('al sincronizar genera recuerdos resumidos con el proveedor del usuario y la cadencia del plan', async () => {
    const { svc, created, maybeSummarize } = localService();
    const provider = fakeProvider([]);
    (svc as any).aiConfig = { resolveProvider: jest.fn(async () => ({ provider, model: 'm', mode: 'managed' })) };
    (svc as any).billingConfig.limits = jest.fn(async () => ({ memoryExtractEvery: 12 }));

    const out: any = await svc.syncLocal('user-1', 'pet-1', 't1', 'respuesta del CLI');
    await flush();

    expect(out.message.content).toBe('respuesta del CLI');
    expect(created.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(maybeSummarize).toHaveBeenCalledWith('pet-1', 251, provider, 'm', 'user-1', 'managed', 12);
  });

  it('con key propia usa la cadencia por defecto', async () => {
    const { svc, maybeSummarize } = localService();
    const provider = fakeProvider([]);
    (svc as any).aiConfig = { resolveProvider: jest.fn(async () => ({ provider, model: 'gpt', mode: 'byok' })) };
    await svc.syncLocal('user-1', 'pet-1', 't1', 'respuesta');
    await flush();
    expect(maybeSummarize).toHaveBeenCalledWith('pet-1', 251, provider, 'gpt', 'user-1', 'byok', undefined);
  });

  it('sin proveedor disponible la sincronización sigue funcionando', async () => {
    const { svc, maybeSummarize } = localService();
    (svc as any).aiConfig = { resolveProvider: jest.fn(async () => { throw new Error('Configura primero tu proveedor de IA'); }) };
    const out: any = await svc.syncLocal('user-1', 'pet-1', 't1', 'respuesta');
    await flush();
    expect(out.message.content).toBe('respuesta');
    expect(maybeSummarize).not.toHaveBeenCalled();
  });
});

describe('ChatService: lore en el prompt', () => {
  const lore = {
    topics: [{ id: 'origen', title: 'El origen de los huevos', keywords: ['huevos'], text: 'Se pescan en el Éter.' }],
  };
  function loreService() {
    const { svc } = makeService();
    (svc as any).prisma.user = { findUnique: jest.fn(async () => ({ displayName: 'Ana', timezone: 'Europe/Madrid' })) };
    (svc as any).prisma.chatMessage.findMany = jest.fn(async () => []);
    (svc as any).memory = { recall: jest.fn(async () => '') };
    (svc as any).gameData = { getLore: () => lore };
    return svc;
  }
  const pet = (intelligence: number) => ({
    id: 'pet-1', intelligence, nickname: 'Chispa', species: { name: 'Ignisaurio', element: 'fire' },
    rarity: 'common', level: 1, stage: 'baby', hunger: 80, happiness: 80, energy: 80, hygiene: 80, health: 100,
  });
  const system = async (svc: ChatService, p: any, message: string, maxTier: string) =>
    (await (svc as any).buildContext('user-1', p, message, maxTier)).messages[0].content as string;

  it('sin herramientas, una pregunta sobre el mundo lleva el tema al prompt', async () => {
    const prompt = await system(loreService(), pet(10), '¿De dónde vienen los huevos?', 'agent');
    expect(prompt).toContain('Lo que sabes de tu mundo');
    expect(prompt).toContain('Se pescan en el Éter.');
  });

  it('un turno local (CLI) también lo recibe aunque la mascota sea agente', async () => {
    expect(await system(loreService(), pet(600), '¿De dónde vienen los huevos?', 'memory')).toContain('Se pescan en el Éter.');
  });

  it('con herramientas no se inyecta (usa get_lore), ni en una charla normal', async () => {
    expect(await system(loreService(), pet(600), '¿De dónde vienen los huevos?', 'agent')).not.toContain('Lo que sabes de tu mundo');
    expect(await system(loreService(), pet(10), 'hola, ¿qué tal?', 'agent')).not.toContain('Lo que sabes de tu mundo');
  });
});
