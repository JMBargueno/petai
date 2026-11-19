import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../../observability/metrics.service';
import { ChatService } from '../ai/chat.service';
import { searchByKeywords, stem, tokens } from '../ai/memory';
import { MemoryService } from '../ai/memory.service';
import { buildSystemPrompt } from '../ai/personality';
import { MemoryRow, namedSubjects, selectForPrompt } from './memory.engine';
import { MindMemoryService } from './mind-memory.service';
import { PersonalityConfig } from './mind.types';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const cfg = balance.personality as PersonalityConfig;
const NOW = new Date('2026-11-18T12:00:00Z');

interface CaseRow {
  id: string;
  kind: string;
  layer: string;
  content: string;
  importance: number;
  valence?: number;
  key?: string;
  subject?: string;
  ageDays: number;
  recalledMinutesAgo?: number;
}
interface RecallCase {
  name: string;
  message: string;
  rows: CaseRow[];
  include?: string[];
  matched?: string[];
  exclude?: string[];
}

/**
 * Evaluación de `selectForPrompt` (spec 37 §3.2 y §3.3) contra una tabla de casos. La tabla vive
 * en `__fixtures__/recall-cases.json` para poder ampliarla sin tocar este test.
 */
const { cases } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '__fixtures__/recall-cases.json'), 'utf8')) as { cases: RecallCase[] };

const toRow = (r: CaseRow): MemoryRow => {
  const at = new Date(NOW.getTime() - r.ageDays * 86_400_000);
  return {
    id: r.id,
    kind: r.kind,
    layer: r.layer,
    content: r.content,
    importance: r.importance,
    valence: r.valence ?? 0,
    key: r.key ?? null,
    subject: r.subject ?? null,
    createdAt: at,
    updatedAt: at,
    lastRecalledAt: r.recalledMinutesAgo === undefined ? null : new Date(NOW.getTime() - r.recalledMinutesAgo * 60_000),
  } as MemoryRow;
};

describe('selectForPrompt — tabla de casos', () => {
  it('la tabla tiene casos y sus ids existen', () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
    for (const c of cases) {
      const ids = c.rows.map((r) => r.id);
      for (const id of [...(c.include ?? []), ...(c.matched ?? []), ...(c.exclude ?? [])]) expect(ids).toContain(id);
    }
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const sel = selectForPrompt(c.rows.map(toRow), c.message, NOW, cfg, 1400);
    const chosen = [...sel.episodic, ...sel.semantic, ...sel.emotional].map((m) => m.id);
    for (const id of c.include ?? []) expect(chosen).toContain(id);
    for (const id of c.exclude ?? []) expect(chosen).not.toContain(id);
    if (c.matched) expect([...sel.matched].sort()).toEqual([...c.matched].sort());
  });
});

describe('Lematización ligera (spec 37 §3.3)', () => {
  it('las formas de un verbo y el plural se comparan como la misma palabra', () => {
    expect(new Set(['jugar', 'jugamos', 'jugando', 'jugaron'].map(stem)).size).toBe(1);
    expect(stem('gatos')).toBe(stem('gato'));
    expect(stem('playing')).toBe('play');
  });

  it('no recorta palabras cortas ni deja menos de tres letras', () => {
    expect(stem('sol')).toBe('sol');
    expect(stem('mar')).toBe('mar');
    expect(stem('casa')).toBe(stem('casas'));
    for (const w of ['jugar', 'comer', 'salir', 'gatos', 'andar', 'todos']) expect(stem(w).length).toBeGreaterThanOrEqual(3);
  });

  it('la búsqueda del agente usa la misma comparación que el prompt', () => {
    const items = [{ content: 'Ayer jugamos a la pelota' }, { content: 'Le gusta el color verde' }];
    expect(searchByKeywords(items, 'jugar', 5)).toEqual([items[0]]);
    expect([...tokens('¿Jugamos?')]).toEqual([...tokens('jugar')]);
  });

  it('namedSubjects reconoce a quien se nombra y no al entrenador', () => {
    const rows = [
      toRow({ id: 'e1', kind: 'relation', layer: 'emotional', key: 'emo:pet:b', subject: 'pet:b', content: 'Brasa (Pockai de Ana)', importance: 0.5, ageDays: 1 }),
      toRow({ id: 'e2', kind: 'relation', layer: 'emotional', key: 'emo:owner', subject: 'owner', content: 'Mi entrenador', importance: 0.5, ageDays: 1 }),
    ];
    expect([...namedSubjects(rows, '¿Has visto a Brasa?')]).toEqual(['pet:b']);
    expect([...namedSubjects(rows, 'hola, entrenador')]).toEqual([]);
    expect([...namedSubjects(rows, '')]).toEqual([]);
  });
});

describe('Métricas del cerebro (spec 37 §3.1)', () => {
  let metrics: MetricsService;
  beforeEach(() => {
    metrics = new MetricsService(new ConfigService({ METRICS_PORT: 0, NODE_ENV: 'test' }));
  });
  afterEach(async () => {
    await metrics.onModuleDestroy();
  });
  const value = async (name: string, labels: Record<string, string>) => {
    const metric = (await (metrics as any).register.getMetricsAsJSON()).find((m: any) => m.name === name);
    const hit = (metric?.values ?? []).find((v: any) => Object.entries(labels).every(([k, x]) => v.labels[k] === x));
    return hit?.value ?? 0;
  };

  it('cuenta recuerdos inyectados por capa y con o sin coincidencia', async () => {
    const rows = [
      toRow({ id: 'a', kind: 'fact', layer: 'semantic', content: 'Le gusta jugar a la pelota', importance: 0.5, ageDays: 1 }),
      toRow({ id: 'b', kind: 'fact', layer: 'semantic', content: 'Su color favorito es el verde', importance: 0.5, ageDays: 1 }),
      toRow({ id: 'c', kind: 'event', layer: 'episodic', content: 'Hoy me bañaron', importance: 0.6, ageDays: 0 }),
    ];
    const prisma: any = { petMemory: { findMany: jest.fn(async () => rows), updateMany: jest.fn(async () => ({ count: 0 })) }, $executeRaw: jest.fn(async () => 0) };
    const svc = new MindMemoryService(prisma, { config: () => cfg } as any, undefined, metrics);
    await svc.recallBlock('pet-1', '¿jugamos?', 'free', NOW);
    expect(await value('petai_mind_memories_injected_total', { layer: 'semantic', matched: 'yes' })).toBe(1);
    expect(await value('petai_mind_memories_injected_total', { layer: 'semantic', matched: 'no' })).toBe(1);
    expect(await value('petai_mind_memories_injected_total', { layer: 'episodic', matched: 'no' })).toBe(1);
  });

  it('cuenta reacciones, rachas, intenciones y extracciones', async () => {
    metrics.recordMindBehavior('comfort', 'engine', 'accepted');
    metrics.recordMindBehavior('listen', 'model', 'rejected');
    metrics.recordMindBehaviorStreak('comfort', 1);
    metrics.recordMindBehaviorStreak('comfort', 2);
    metrics.recordMindBehaviorStreak('comfort', 7);
    metrics.recordMindIntent('sad_day');
    metrics.recordMindExtraction('invalid');
    expect(await value('petai_mind_behavior_total', { action: 'listen', source: 'model', outcome: 'rejected' })).toBe(1);
    expect(await value('petai_mind_behavior_streak_total', { action: 'comfort', streak: '3+' })).toBe(1);
    expect(await value('petai_mind_behavior_streak_total', { action: 'comfort', streak: '2' })).toBe(1);
    expect(await value('petai_mind_intent_total', { intent: 'sad_day' })).toBe(1);
    expect(await value('petai_mind_extraction_total', { outcome: 'invalid' })).toBe(1);
  });

  it('una extracción sin formato válido queda contada', async () => {
    const provider: any = {
      async *chat() {
        yield { type: 'delta', text: 'esto no es JSON' };
        yield { type: 'done' };
      },
      test: jest.fn(),
    };
    const msgs = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', content: `mensaje ${i}`, createdAt: new Date(NOW.getTime() + i) }));
    const prisma: any = {
      petMemory: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
      chatMessage: { findMany: jest.fn(async () => msgs), count: jest.fn(async () => msgs.length) },
    };
    const usage: any = { hasQuota: jest.fn(async () => true), record: jest.fn(async () => undefined) };
    const svc = new MemoryService(prisma, usage, undefined, undefined, metrics);
    await svc.maybeSummarize('pet-1', 900, provider, 'modelo', 'user-1', 'byok');
    expect(await value('petai_mind_extraction_total', { outcome: 'invalid' })).toBe(1);
  });
});

describe('Tope diario de inteligencia por chat (spec 37 §3.4)', () => {
  const build = (repliesToday: number, withMind = true) => {
    const prisma: any = {
      chatMessage: { create: jest.fn(async ({ data }: any) => ({ id: 'm', ...data })), count: jest.fn(async () => repliesToday) },
      pet: { update: jest.fn(async ({ data }: any) => ({ id: 'pet-1', ...data })) },
    };
    const args: any[] = [prisma, {}, {}, { emitPetUpdate: jest.fn() }, {}, {}, {}, { recordInteraction: jest.fn(async () => undefined) }, {}, {}, {}, {}, {}];
    const svc = new (ChatService as any)(...args, undefined, undefined, undefined, withMind ? ({ config: () => cfg } as any) : undefined);
    return { svc: svc as any, prisma };
  };
  const cap = cfg.intelligence!.dailyChatCap;

  it('el tope decidido es de 50 al día', () => expect(cap).toBe(50));

  it('por debajo del tope cada intercambio suma un punto', async () => {
    const s = build(cap);
    expect((await s.svc.persistExchange('u', { id: 'pet-1', intelligence: 120 }, 'hola', 'hola')).intelligence).toBe(121);
  });

  it('pasado el tope, charlar más ese día no sube la inteligencia, pero el mensaje se guarda', async () => {
    const s = build(cap + 1);
    expect((await s.svc.persistExchange('u', { id: 'pet-1', intelligence: 120 }, 'hola', 'hola')).intelligence).toBe(120);
    expect(s.prisma.chatMessage.create).toHaveBeenCalledTimes(2);
  });

  it('cuenta solo las respuestas de hoy de esa mascota', async () => {
    const s = build(0);
    await s.svc.persistExchange('u', { id: 'pet-1', intelligence: 0 }, 'hola', 'hola');
    const where = s.prisma.chatMessage.count.mock.calls[0][0].where;
    expect(where).toMatchObject({ petId: 'pet-1', role: 'assistant' });
    expect(where.createdAt.gte.toISOString()).toMatch(/T00:00:00\.000Z$/);
  });

  it('si no se puede contar, el punto se concede', async () => {
    const s = build(0);
    s.prisma.chatMessage.count.mockRejectedValue(new Error('sin base de datos'));
    expect((await s.svc.persistExchange('u', { id: 'pet-1', intelligence: 5 }, 'hola', 'hola')).intelligence).toBe(6);
  });

  it('avisa al arrancar si la mente no está inyectada', () => {
    const s = build(0, false);
    const warn = jest.spyOn(s.svc.logger, 'warn').mockImplementation(() => undefined);
    s.svc.onModuleInit();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('Orden del prompt (spec 37 §3.6)', () => {
  const pet = (over: Record<string, unknown> = {}) => ({
    nickname: 'Lumo',
    rarity: 'rare',
    level: 7,
    stage: 'juvenile',
    visualSeed: 3,
    hunger: 70,
    happiness: 60,
    energy: 80,
    hygiene: 90,
    health: 100,
    species: { name: 'Axolunar', element: 'water', description: 'Vive en charcas de luna.' },
    ...over,
  });
  const opts = (over: Record<string, unknown> = {}) => ({ tier: 'agent' as const, now: NOW, timeZone: 'Europe/Madrid', personalityBlock: 'Carácter: curioso.', behaviorHint: 'Reacción decidida: escucha.', ...over });

  it('las reglas van antes que todo lo que cambia de un turno a otro', () => {
    const p = buildSystemPrompt(pet(), { displayName: 'Ana' }, opts());
    const at = (text: string) => p.indexOf(text);
    for (const volatile of ['Tus estadísticas', 'Estado de ánimo', 'La hora actual', 'Reacción decidida', 'Carácter:', 'Nivel 7']) {
      expect(at(volatile)).toBeGreaterThan(at('Reglas:'));
      expect(at(volatile)).toBeGreaterThan(at('Si el entrenador te pide algo ajeno'));
    }
    // La pista del turno es lo último: es lo que más cambia
    expect(p.trimEnd().endsWith('Reacción decidida: escucha.')).toBe(true);
  });

  it('dos turnos con distinto estado, hora y reacción comparten todo el principio', () => {
    const a = buildSystemPrompt(pet(), { displayName: 'Ana' }, opts());
    const b = buildSystemPrompt(pet({ hunger: 12, happiness: 95, level: 8 }), { displayName: 'Ana' }, opts({ now: new Date(NOW.getTime() + 3_600_000), behaviorHint: 'Reacción decidida: celebra.' }));
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    const shared = a.slice(0, i);
    expect(shared).toContain('Reglas:');
    expect(shared).toContain('Si el entrenador te pide algo ajeno');
    expect(shared).toContain('Tienes herramientas');
    expect(shared).not.toContain('La hora actual');
  });

  it('sin herramientas no se da la hora', () => {
    expect(buildSystemPrompt(pet(), { displayName: 'Ana' }, opts({ tier: 'chat' }))).not.toContain('La hora actual');
  });
});
