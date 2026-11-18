import * as fs from 'fs';
import * as path from 'path';
import { interpretMessage } from './conversation.engine';
import { MindMemoryService } from './mind-memory.service';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const cfg = balance.personality;
const DAY = 86_400_000;
const T0 = new Date('2026-11-10T12:00:00Z');

/** Tabla `PetMemory` en memoria, con lo justo de Prisma para `remember` y `enforceCapacity`. */
function setup() {
  const rows: any[] = [];
  let seq = 0;
  const petMemory = {
    findFirst: jest.fn(async ({ where }: any) =>
      rows.find(
        (r) =>
          r.petId === where.petId &&
          r.content === where.content &&
          r.createdAt >= where.createdAt.gte &&
          r.createdAt < where.createdAt.lt,
      ) ?? null,
    ),
    findUnique: jest.fn(async ({ where }: any) => rows.find((r) => r.petId === where.petId_key.petId && r.key === where.petId_key.key) ?? null),
    findMany: jest.fn(async ({ where }: any) => rows.filter((r) => r.petId === where.petId)),
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `m${++seq}`, key: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      rows.push(row);
      return row;
    }),
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const found = rows.find((r) => r.petId === where.petId_key.petId && r.key === where.petId_key.key);
      if (found) return Object.assign(found, update, { updatedAt: new Date() });
      const row = { id: `m${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...create };
      rows.push(row);
      return row;
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      for (const id of where.id.in) rows.splice(rows.findIndex((r) => r.id === id), 1);
      return { count: where.id.in.length };
    }),
  };
  const prisma = { petMemory, pet: { findUnique: jest.fn(async () => ({ userId: 'u1', intelligence: 0 })) } };
  const mind = { config: () => cfg };
  const svc = new MindMemoryService(prisma as any, mind as any);
  return { svc, rows };
}

describe('MindMemoryService — spec 37 §2.3: episodios que se repiten', () => {
  const affection = () => {
    const turn = interpretMessage('te quiero mucho');
    return { intent: turn.intent, episode: turn.episode! };
  };
  const input = (at: Date) => {
    const { intent, episode } = affection();
    return {
      layer: 'episodic' as const,
      kind: 'event',
      key: `ep:${intent}`,
      bump: true,
      content: episode.content,
      importance: episode.importance,
      valence: episode.valence,
      subject: 'owner',
      createdAt: at,
    };
  };

  it('tres «te quiero» en días distintos dejan un solo episodio', async () => {
    const s = setup();
    for (let day = 0; day < 3; day++) await s.svc.remember('p1', [input(new Date(T0.getTime() + day * DAY))]);
    const episodes = s.rows.filter((r) => r.layer === 'episodic');
    expect(episodes).toHaveLength(1);
    expect(episodes[0].key).toBe('ep:affection');
  });

  it('cada repetición lo trae al presente y le da algo más de importancia, con tope', async () => {
    const s = setup();
    const base = affection().episode.importance;
    await s.svc.remember('p1', [input(T0)]);
    expect(s.rows[0].importance).toBe(base);

    const later = new Date(T0.getTime() + 5 * DAY);
    await s.svc.remember('p1', [input(later)]);
    expect(s.rows[0].createdAt).toEqual(later);
    expect(s.rows[0].importance).toBeCloseTo(Math.min(cfg.memory.repeatCap, base + cfg.memory.repeatBoost), 5);

    for (let i = 0; i < 40; i++) await s.svc.remember('p1', [input(new Date(later.getTime() + i * DAY))]);
    expect(s.rows[0].importance).toBeLessThanOrEqual(Math.max(base, cfg.memory.repeatCap));
    expect(s.rows).toHaveLength(1);
  });

  it('episodios de intenciones distintas no se pisan', async () => {
    const s = setup();
    await s.svc.remember('p1', [input(T0)]);
    const sad = interpretMessage('Hoy he tenido un día bastante malo');
    await s.svc.remember('p1', [
      { layer: 'episodic', kind: 'event', key: `ep:${sad.intent}`, bump: true, content: sad.episode!.content, importance: sad.episode!.importance, valence: sad.episode!.valence },
    ]);
    expect(s.rows.map((r) => r.key).sort()).toEqual(['ep:affection', `ep:${sad.intent}`].sort());
  });

  it('sin `bump`, una clave sigue actualizando sin tocar la fecha ni sumar importancia', async () => {
    const s = setup();
    const habit = { layer: 'semantic' as const, kind: 'habit', key: 'habit:x', content: 'Suele programar por la tarde', importance: 0.5 };
    await s.svc.remember('p1', [{ ...habit, createdAt: T0 }]);
    await s.svc.remember('p1', [{ ...habit, content: 'Suele programar por la noche' }]);
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({ content: 'Suele programar por la noche', importance: 0.5, createdAt: T0 });
  });
});
