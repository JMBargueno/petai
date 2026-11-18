import * as fs from 'fs';
import * as path from 'path';
import { validateStoryData } from '../game-data/story-data.schemas';
import { DecisionStoryGenerator } from './decision-story.generator';

const dir = path.resolve(__dirname, '../../../../shared/game-data');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, `${f}.json`), 'utf8'));
const storyData = validateStoryData({ stories: read('stories'), locations: read('story-locations'), seeds: read('story-seeds') }).data;
const PER_DAY = storyData.config.bucket.storiesPerDay;

/** Prisma en memoria con lo justo que usa el generador sobre `decisionStory`. */
function fakePrisma() {
  const rows: any[] = [];
  let seq = 0;
  const matches = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([k, cond]: [string, any]) => {
      const v = row[k];
      if (cond === null || typeof cond !== 'object') return v === cond;
      if ('not' in cond && !(cond.not === null ? v !== null && v !== undefined : v !== cond.not)) return false;
      if ('lt' in cond && !(v < cond.lt)) return false;
      if ('lte' in cond && !(v <= cond.lte)) return false;
      if ('gte' in cond && !(v >= cond.gte)) return false;
      if ('in' in cond && !cond.in.includes(v)) return false;
      return true;
    });
  const sort = (list: any[], orderBy: any) => {
    const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap((o: any) => Object.entries(o)) as [string, string][];
    return [...list].sort((a, b) => {
      for (const [k, dir] of keys) {
        if (a[k] === b[k]) continue;
        return (a[k] < b[k] ? -1 : 1) * (dir === 'desc' ? -1 : 1);
      }
      return 0;
    });
  };
  const decisionStory = {
    count: async ({ where }: any) => rows.filter((r) => matches(r, where)).length,
    findMany: async ({ where, orderBy, take }: any = {}) => {
      const out = sort(rows.filter((r) => matches(r, where)), orderBy);
      return (take ? out.slice(0, take) : out).map((r) => ({ ...r, tallies: r.tallies ?? [] }));
    },
    findFirst: async ({ where, orderBy }: any = {}) => sort(rows.filter((r) => matches(r, where)), orderBy)[0] ?? null,
    create: async ({ data }: any) => {
      if (rows.some((r) => r.day === data.day && r.slot === data.slot)) throw Object.assign(new Error('unique'), { code: 'P2002' });
      const row = { id: `s${++seq}`, arcKey: null, arcChapter: 0, parentStoryId: null, closesArc: false, seedId: null, rerunOfId: null, closedAt: null, canonSummary: null, ...data };
      rows.push(row);
      return row;
    },
    updateMany: async ({ where, data }: any) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
    groupBy: async ({ by, where }: any) => {
      const key = by[0];
      const groups = new Map<any, any[]>();
      for (const r of rows.filter((x) => matches(x, where))) groups.set(r[key], [...(groups.get(r[key]) ?? []), r]);
      return [...groups].map(([value, list]) => ({
        [key]: value,
        _count: { _all: list.length },
        _max: { day: list.map((l) => l.day).sort().pop() },
      }));
    },
  };
  return { rows, prisma: { decisionStory } as any };
}

/** Respuesta de IA válida: una semilla con otro título. */
const aiStory = (title: string) => {
  const { id: _id, ...content } = storyData.seeds[0];
  return { ...content, title };
};

function build(aiImpl?: (req: any) => any) {
  const { rows, prisma } = fakePrisma();
  const requests: any[] = [];
  const systemAi = {
    isAvailable: jest.fn(async () => !!aiImpl),
    completeJson: jest.fn(async (req: any) => {
      requests.push(req);
      return aiImpl(req);
    }),
  };
  const gameData = { getStoryData: () => storyData, getLore: () => read('lore') };
  const config = { get: jest.fn(() => undefined) };
  const cronLock = { guard: jest.fn(async () => 'tok'), release: jest.fn(async () => undefined) };
  const gen = new DecisionStoryGenerator(prisma, gameData as any, systemAi as any, cronLock as any, config as any);
  return { gen, rows, requests, systemAi };
}

const ok = (title: string) => ({ ok: true, data: aiStory(title), model: 'test/model', usage: { promptTokens: 100, completionTokens: 200, costUsd: 0.001 } });
const fail = () => ({ ok: false, reason: 'invalid', usage: { promptTokens: 0, completionTokens: 0, costUsd: 0.0005 } });

describe('DecisionStoryGenerator', () => {
  it('genera el bucket con la IA: la primera historia abre una Crónica y el resto son autoconclusivas', async () => {
    let n = 0;
    const { gen, rows, requests } = build(() => ok(`Historia ${++n}`));
    const report = await gen.generateForDay('2026-03-02', { allowFallback: false });

    expect(report.created).toHaveLength(PER_DAY);
    expect(report.pending).toEqual([]);
    expect(report.costUsd).toBeCloseTo(0.001 * PER_DAY);
    expect(rows.map((r) => r.source)).toEqual(Array(PER_DAY).fill('ai'));
    expect(rows[0]).toMatchObject({ slot: 0, arcKey: 'arc-2026-03-02', arcChapter: 1, parentStoryId: null, model: 'test/model', costUsd: 0.001 });
    expect(rows.slice(1).every((r) => r.arcKey === null)).toBe(true);
    expect(rows[0].scenes).toMatchObject({ v: 1 });
    expect(requests[0].user).toContain('capítulo 1 de una nueva Crónica');
    expect(requests[1].user).toContain('autoconclusiva');
    // Los títulos ya creados hoy se pasan para no repetir tema
    expect(requests[1].user).toContain('«Historia 1»');
  });

  it('es idempotente: no vuelve a generar los huecos que ya existen', async () => {
    let n = 0;
    const { gen, rows, systemAi } = build(() => ok(`H${++n}`));
    await gen.generateForDay('2026-03-02', { allowFallback: false });
    const again = await gen.generateForDay('2026-03-02', { allowFallback: false });
    expect(again.created).toEqual([]);
    expect(rows).toHaveLength(PER_DAY);
    expect(systemAi.completeJson).toHaveBeenCalledTimes(PER_DAY);
  });

  it('al día siguiente cierra el anterior y la Crónica continúa con lo que votó la mayoría', async () => {
    let n = 0;
    const { gen, rows, requests } = build(() => ok(`H${++n}`));
    await gen.generateForDay('2026-03-02', { allowFallback: false });
    const chronicle = rows[0];
    // La comunidad vota la opción 1 de la primera escena por encima del mínimo para ser canon
    const voted = chronicle.scenes.scenes[0].choices[1];
    chronicle.tallies = [{ sceneIndex: 0, optionIndex: 1, count: 40 }];
    requests.length = 0;

    await gen.generateForDay('2026-03-03', { allowFallback: false });

    expect(chronicle.closedAt).toBeInstanceOf(Date);
    expect(chronicle.canon.options[0]).toBe(1);
    expect(chronicle.canonSummary).toContain(voted.canonLine);
    const next = rows.find((r) => r.day === '2026-03-03' && r.slot === 0);
    expect(next).toMatchObject({ arcKey: 'arc-2026-03-02', arcChapter: 2, parentStoryId: chronicle.id });
    expect(requests[0].user).toContain('capítulo 2');
    expect(requests[0].user).toContain(voted.canonLine);
    // Lo decidido ayer en las historias sueltas llega como eco del mundo
    const standalone = rows.find((r) => r.day === '2026-03-02' && r.slot === 1);
    expect(requests[1].user).toContain(standalone.canonSummary);
  });

  it('cierra la Crónica al llegar al máximo de capítulos y después abre otra', async () => {
    let n = 0;
    const { gen, rows } = build(() => ok(`H${++n}`));
    const max = storyData.config.arc.maxChapters;
    let day = '2026-03-01';
    for (let i = 0; i < max + 1; i++) {
      await gen.generateForDay(day, { allowFallback: false });
      day = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    }
    const chronicles = rows.filter((r) => r.slot === 0);
    expect(chronicles[max - 1]).toMatchObject({ arcChapter: max, closesArc: true, arcKey: 'arc-2026-03-01' });
    expect(chronicles[max]).toMatchObject({ arcChapter: 1, closesArc: false });
    expect(chronicles[max].arcKey).not.toBe('arc-2026-03-01');
  });

  it('si la IA falla y aún no toca el respaldo, deja los huecos pendientes', async () => {
    const { gen, rows } = build(() => fail());
    const report = await gen.generateForDay('2026-03-02', { allowFallback: false });
    expect(rows).toHaveLength(0);
    expect(report.pending).toHaveLength(PER_DAY);
    expect(report.costUsd).toBeGreaterThan(0);
  });

  it('sin historias antiguas, el respaldo usa semillas distintas', async () => {
    const { gen, rows } = build(() => fail());
    const report = await gen.generateForDay('2026-03-02', { allowFallback: true });
    expect(report.created.map((c) => c.source)).toEqual(Array(PER_DAY).fill('seed'));
    expect(new Set(rows.map((r) => r.seedId)).size).toBe(PER_DAY);
    expect(rows.every((r) => r.arcKey === null)).toBe(true);
  });

  it('las semillas rotan: al día siguiente entra primero la que no salió', async () => {
    const { gen, rows } = build(() => fail());
    await gen.generateForDay('2026-03-02', { allowFallback: true });
    const used = new Set(rows.map((r) => r.seedId));
    const unused = storyData.seeds.find((s) => !used.has(s.id));
    await gen.generateForDay('2026-03-03', { allowFallback: true });
    expect(rows.find((r) => r.day === '2026-03-03' && r.slot === 0).seedId).toBe(unused.id);
  });

  it('con historias antiguas de la IA, el respaldo las repone (la menos repuesta primero) y no las de la Crónica', async () => {
    let n = 0;
    let aiUp = true;
    const { gen, rows } = build(() => (aiUp ? ok(`H${++n}`) : fail()));
    await gen.generateForDay('2026-01-01', { allowFallback: false });
    aiUp = false;
    const old = rows.filter((r) => r.day === '2026-01-01');

    await gen.generateForDay('2026-03-02', { allowFallback: true });
    const reruns = rows.filter((r) => r.day === '2026-03-02' && r.source === 'rerun');
    // Solo hay PER_DAY-1 autoconclusivas antiguas: el resto se rellena con una semilla
    expect(reruns).toHaveLength(PER_DAY - 1);
    expect(reruns.map((r) => r.rerunOfId).sort()).toEqual(old.filter((o) => !o.arcKey).map((o) => o.id).sort());
    expect(reruns.every((r) => r.arcKey === null)).toBe(true);
    expect(rows.filter((r) => r.day === '2026-03-02' && r.source === 'seed')).toHaveLength(1);
    expect(reruns[0].scenes).toEqual(old.find((o) => o.id === reruns[0].rerunOfId).scenes);
  });

  it('skipAi no llama a la IA', async () => {
    const { gen, systemAi } = build(() => ok('x'));
    await gen.generateForDay('2026-03-02', { allowFallback: true, skipAi: true });
    expect(systemAi.completeJson).not.toHaveBeenCalled();
  });

  describe('ensureBucket', () => {
    it('no genera antes de la hora, y a partir de ella solo si falta algo', async () => {
      let n = 0;
      const { gen, rows } = build(() => ok(`H${++n}`));
      // 00:30 UTC = 01:30 en Madrid: todavía no son las 2
      expect(await gen.ensureBucket(new Date('2026-03-02T00:30:00Z'))).toBeNull();
      expect(rows).toHaveLength(0);
      // 01:10 UTC = 02:10 en Madrid
      const report = await gen.ensureBucket(new Date('2026-03-02T01:10:00Z'));
      expect(report.day).toBe('2026-03-02');
      expect(rows).toHaveLength(PER_DAY);
      expect(await gen.ensureBucket(new Date('2026-03-02T01:20:00Z'))).toBeNull();
    });

    it('antes de la hora límite espera a la IA; después rellena con el respaldo', async () => {
      const { gen, rows } = build(() => fail());
      const early = await gen.ensureBucket(new Date('2026-03-02T02:00:00Z')); // 03:00 Madrid
      expect(early.pending).toHaveLength(PER_DAY);
      expect(rows).toHaveLength(0);
      const late = await gen.ensureBucket(new Date('2026-03-02T05:30:00Z')); // 06:30 Madrid
      expect(late.created).toHaveLength(PER_DAY);
    });

    it('sin IA disponible va directo al respaldo sin llamarla', async () => {
      const { gen, rows, systemAi } = build();
      await gen.ensureBucket(new Date('2026-03-02T01:10:00Z'));
      expect(rows).toHaveLength(PER_DAY);
      expect(systemAi.completeJson).not.toHaveBeenCalled();
    });
  });
});
