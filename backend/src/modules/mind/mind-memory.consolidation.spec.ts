import * as fs from 'fs';
import * as path from 'path';
import { MindMemoryService } from './mind-memory.service';
import { buildLayeredMemoryBlock, selectForPrompt } from './memory.engine';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const cfg = balance.personality;
const CAP = cfg.memory.capacity.chat.episodic;
const DAY = 86_400_000;
const NOW = Date.now();

/** `PetMemory` y `Pet.personality` en memoria, con lo justo de Prisma. */
function setup(opts: { failPatch?: boolean } = {}) {
  const rows: any[] = [];
  const pet: any = { userId: 'u1', intelligence: 0, personality: {} };
  let seq = 0;
  const byKey = (where: any) => rows.find((r) => r.petId === where.petId_key.petId && r.key === where.petId_key.key);
  const petMemory = {
    findFirst: jest.fn(async ({ where }: any) => rows.find((r) => r.petId === where.petId && r.content === where.content && r.createdAt >= where.createdAt.gte && r.createdAt < where.createdAt.lt) ?? null),
    findUnique: jest.fn(async ({ where }: any) => byKey(where) ?? null),
    findMany: jest.fn(async ({ where }: any) => rows.filter((r) => r.petId === where.petId)),
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `m${++seq}`, key: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      rows.push(row);
      return row;
    }),
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const found = byKey(where);
      if (found) return Object.assign(found, update, { updatedAt: new Date() });
      const row = { id: `m${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...create };
      rows.push(row);
      return row;
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      const match = (r: any) => (where.id ? where.id.in.includes(r.id) : where.key.in.includes(r.key));
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1);
      return { count: before - rows.length };
    }),
  };
  const prisma = { petMemory, pet: { findUnique: jest.fn(async () => pet) } };
  const mind = {
    config: () => cfg,
    patchStored: jest.fn(async (_id: string, patch: any) => {
      if (opts.failPatch) throw new Error('sin base de datos');
      Object.assign(pet.personality, patch);
    }),
  };
  return { svc: new MindMemoryService(prisma as any, mind as any), rows, pet };
}

const encounter = (i: number, subject = 'pet:brasa', valence = 0.6) => ({
  layer: 'episodic' as const,
  kind: 'encounter',
  content: `Quedé con alguien, vez número ${i}.`,
  importance: 0.5,
  valence,
  subject,
  createdAt: new Date(NOW - (200 - i) * DAY),
});

describe('MindMemoryService — consolidación (spec 41, fase E)', () => {
  it('lo que no cabe se pliega en un resumen antes de olvidarse', async () => {
    const s = setup();
    await s.svc.feel('p1', 'pet:brasa', 'Brasa (Pockai de Ana)', 0.3);
    const total = CAP + 8;
    for (let i = 0; i < total; i++) await s.svc.remember('p1', [encounter(i)]);

    expect(s.rows.filter((r) => r.layer === 'episodic')).toHaveLength(CAP);
    const digest = s.rows.find((r) => r.key === 'sum:pet:brasa');
    expect(digest).toMatchObject({ layer: 'semantic', kind: 'digest', subject: 'pet:brasa' });
    expect(digest.content).toBe('He quedado muchísimas veces con Brasa (Pockai de Ana): nos conocemos de sobra. Casi siempre lo pasamos genial.');
    // Cada episodio olvidado cuenta una vez, ni más ni menos
    expect(s.pet.personality.digests['sum:pet:brasa'].count).toBe(total - CAP);
    // Un solo resumen por grupo, por muchas veces que se reescriba
    expect(s.rows.filter((r) => r.kind === 'digest')).toHaveLength(1);
  });

  it('el resumen llega al prompt cuando se habla de ese amigo', async () => {
    const s = setup();
    await s.svc.feel('p1', 'pet:brasa', 'Brasa (Pockai de Ana)', 0.3);
    for (let i = 0; i < CAP + 4; i++) await s.svc.remember('p1', [encounter(i)]);
    const block = buildLayeredMemoryBlock(selectForPrompt(s.rows, '¿te acuerdas de Brasa?', new Date(), cfg, 1400), new Date());
    expect(block).toContain('(de hace tiempo) He quedado varias veces con Brasa');
  });

  it('con un solo episodio olvidado no escribe resumen, pero lo cuenta', async () => {
    const s = setup();
    await s.svc.feel('p1', 'pet:brasa', 'Brasa (Pockai de Ana)', 0.3);
    for (let i = 0; i < CAP + 1; i++) await s.svc.remember('p1', [encounter(i)]);
    expect(s.rows.some((r) => r.kind === 'digest')).toBe(false);
    expect(s.pet.personality.digests['sum:pet:brasa'].count).toBe(1);
  });

  it('sin relación guardada no hay con quién: cuenta, pero no escribe', async () => {
    const s = setup();
    for (let i = 0; i < CAP + 4; i++) await s.svc.remember('p1', [encounter(i, 'pet:nadie')]);
    expect(s.rows.some((r) => r.kind === 'digest')).toBe(false);
    expect(s.pet.personality.digests['sum:pet:nadie'].count).toBe(4);
  });

  it('lo nacido del chat se olvida sin resumen, como antes', async () => {
    const s = setup();
    for (let i = 0; i < CAP + 5; i++) {
      await s.svc.remember('p1', [{ layer: 'episodic', kind: 'event', content: `Mi entrenador me contó algo, vez ${i}.`, importance: 0.5, subject: 'owner', createdAt: new Date(NOW - (200 - i) * DAY) }]);
    }
    expect(s.rows).toHaveLength(CAP);
    expect(s.pet.personality.digests).toBeUndefined();
  });

  it('si consolidar falla, se olvida igual y guardar no se rompe', async () => {
    const s = setup({ failPatch: true });
    await s.svc.feel('p1', 'pet:brasa', 'Brasa (Pockai de Ana)', 0.3);
    for (let i = 0; i < CAP + 3; i++) await expect(s.svc.remember('p1', [encounter(i)])).resolves.toBe(1);
    expect(s.rows.filter((r) => r.layer === 'episodic')).toHaveLength(CAP);
  });

  it('olvidar un resumen borra también su contador; olvidarlo todo, todos', async () => {
    const s = setup();
    s.pet.personality.digests = { 'sum:find': { count: 3, valence: 0.5, firstAt: 1, lastAt: 2 }, 'sum:pet:brasa': { count: 4, valence: 0.5, firstAt: 1, lastAt: 2 } };
    await s.svc.forgetDigests('p1', 'emo:owner');
    expect(Object.keys(s.pet.personality.digests)).toHaveLength(2);
    await s.svc.forgetDigests('p1', 'sum:find');
    expect(Object.keys(s.pet.personality.digests)).toEqual(['sum:pet:brasa']);
    await s.svc.forgetDigests('p1');
    expect(s.pet.personality.digests).toEqual({});
  });
});
