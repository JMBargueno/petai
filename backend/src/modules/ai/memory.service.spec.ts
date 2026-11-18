import { MemoryService } from './memory.service';

const at = (n: number) => new Date(1_700_000_000_000 + n * 1000);

function makeProvider(output: string | Error) {
  const chat = jest.fn(async function* () {
    if (output instanceof Error) throw output;
    yield { type: 'delta', text: output.slice(0, 10) };
    yield { type: 'delta', text: output.slice(10) };
    yield { type: 'done' };
  });
  return { chat, test: jest.fn() } as any;
}

describe('MemoryService', () => {
  let prisma: any;
  let usage: any;
  let svc: MemoryService;
  const created: any[] = [];

  const userMsgs = (n: number) =>
    Array.from({ length: n * 2 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
      createdAt: at(i),
    }));

  beforeEach(() => {
    created.length = 0;
    prisma = {
      petMemory: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(({ data }) => { created.push(data); return Promise.resolve(data); }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      chatMessage: { findMany: jest.fn().mockResolvedValue(userMsgs(6)) },
      pet: { findFirst: jest.fn() },
      petContextProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    usage = { hasQuota: jest.fn().mockResolvedValue(true), record: jest.fn().mockResolvedValue(undefined) };
    svc = new MemoryService(prisma, usage);
  });

  const JSON_OK = '{"summary":"Hablaron de pesca","facts":["Le gusta pescar"]}';

  it('no hace nada por debajo del nivel de memoria (intelligence < 200)', async () => {
    const p = makeProvider(JSON_OK);
    await svc.maybeSummarize('p1', 199, p, 'm', 'u1', 'byok');
    expect(p.chat).not.toHaveBeenCalled();
  });

  it('si la cuota mensual está agotada no consume tokens en la extracción', async () => {
    usage.hasQuota.mockResolvedValue(false);
    const p = makeProvider(JSON_OK);
    await svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'managed');
    expect(usage.hasQuota).toHaveBeenCalledWith('u1', 'managed');
    expect(p.chat).not.toHaveBeenCalled();
  });

  it('registra el consumo de la extracción (estimado si el proveedor no informa del uso)', async () => {
    const p = makeProvider(JSON_OK);
    await svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok');
    expect(usage.record).toHaveBeenCalledTimes(1);
    expect(usage.record.mock.calls[0][0]).toBe('u1');
    expect(usage.record.mock.calls[0][1]).toBeGreaterThan(0);
  });

  it('no resume hasta acumular 6 mensajes del usuario', async () => {
    prisma.chatMessage.findMany.mockResolvedValue(userMsgs(5));
    const p = makeProvider(JSON_OK);
    await svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok');
    expect(p.chat).not.toHaveBeenCalled();
  });

  it('resume y guarda resumen + hechos nuevos; el resumen marca el último mensaje procesado', async () => {
    const p = makeProvider(JSON_OK);
    await svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok');
    expect(p.chat).toHaveBeenCalledTimes(1);
    const [msgs, opts] = p.chat.mock.calls[0];
    expect(msgs[0].content).toContain('extractor de recuerdos');
    expect(opts).toMatchObject({ model: 'm', temperature: 0 });
    const summary = created.find((c) => c.kind === 'summary');
    expect(summary.content).toBe('Hablaron de pesca');
    expect(summary.createdAt).toEqual(at(11));
    expect(created.filter((c) => c.kind === 'fact').map((c) => c.content)).toEqual(['Le gusta pescar']);
  });

  it('no duplica hechos ya conocidos y poda los más antiguos al superar el tope', async () => {
    const existing = Array.from({ length: 50 }, (_, i) => ({
      id: `f${i}`, kind: 'fact', content: i === 49 ? 'Le gusta pescar' : `Hecho ${i}`, createdAt: at(i),
    }));
    prisma.petMemory.findMany.mockResolvedValue(existing);
    const p = makeProvider('{"summary":"x resumen","facts":["Le gusta PESCAR","Tiene un loro"]}');
    await svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok');
    expect(created.filter((c) => c.kind === 'fact').map((c) => c.content)).toEqual(['Tiene un loro']);
    // 50 existentes + 1 nuevo = 51 → se borra el más antiguo
    expect(prisma.petMemory.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['f0'] } } });
  });

  it('una salida inválida no guarda nada y respeta el enfriamiento (no reintenta de inmediato)', async () => {
    const p = makeProvider('lo siento, no puedo');
    await svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok');
    expect(created).toHaveLength(0);
    await svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok');
    expect(p.chat).toHaveBeenCalledTimes(1);
  });

  it('un fallo del proveedor no lanza excepción hacia el chat', async () => {
    const p = makeProvider(new Error('boom'));
    await expect(svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok')).resolves.toBeUndefined();
    expect(created).toHaveLength(0);
  });

  it('no lanza dos extracciones a la vez para la misma mascota', async () => {
    const p = makeProvider(JSON_OK);
    await Promise.all([svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok'), svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok')]);
    expect(p.chat).toHaveBeenCalledTimes(1);
  });

  it('recall devuelve vacío sin memoria y un bloque con hechos relevantes si los hay', async () => {
    expect(await svc.recall('p1', 'hola')).toBe('');
    prisma.petMemory.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where.kind === 'fact' ? [{ content: 'Le gusta pescar' }] : [{ content: 'Hablaron de peces' }]));
    const block = await svc.recall('p1', '¿vamos a pescar?');
    expect(block).toContain('- Le gusta pescar');
    expect(block).toContain('(resumen) Hablaron de peces');
  });

  it('poda los resúmenes antiguos: conserva los 20 más recientes (incluida la marca de procesado)', async () => {
    prisma.petMemory.findMany.mockImplementation((args: any) =>
      Promise.resolve(args.where.kind === 'summary' && args.skip === 20 ? [{ id: 's-old-1' }, { id: 's-old-2' }] : []));
    await svc.maybeSummarize('p1', 250, makeProvider(JSON_OK), 'm', 'u1', 'byok');
    const pruneQuery = prisma.petMemory.findMany.mock.calls.find((c: any) => c[0].skip === 20)[0];
    expect(pruneQuery).toMatchObject({ where: { petId: 'p1', kind: 'summary' }, orderBy: { createdAt: 'desc' } });
    expect(prisma.petMemory.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['s-old-1', 's-old-2'] } } });
  });

  it('recall añade los hábitos del escritorio al bloque', async () => {
    prisma.petMemory.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where.kind === 'habit' ? [{ content: 'Suele programar por la tarde' }] : []));
    expect(await svc.recall('p1', 'hola')).toContain('(hábito en el ordenador) Suele programar por la tarde');
  });

  describe('ingestDigest (hábitos de escritorio)', () => {
    const NOW = new Date('2026-11-16T10:00:00Z');
    const coding = { coding: [0, 0, 0, 0, 240, 0], reading: [0, 0, 100, 0, 0, 0] };
    const petOk = { id: 'p1', intelligence: 300, bonding: 80, desktopSkills: { context_awareness: true } };

    it('guarda el perfil y hace upsert de los hábitos por clave; borra los que ya no se cumplen', async () => {
      prisma.pet.findFirst.mockResolvedValue(petOk);
      const r = await svc.ingestDigest('u1', 'p1', { appMinutes: coding }, NOW);
      expect(r.stored).toBe(true);
      expect(prisma.petContextProfile.upsert.mock.calls[0][0].create.lastDigestAt).toEqual(NOW);
      const keys = prisma.petMemory.upsert.mock.calls.map((c: any) => c[0].where.petId_key.key);
      expect(keys).toEqual(expect.arrayContaining(['habit:coding_time', 'habit:main_activity']));
      expect(prisma.petMemory.deleteMany).toHaveBeenCalledWith({
        where: { petId: 'p1', kind: 'habit', key: { notIn: keys } },
      });
    });

    it('sin context_awareness activa ignora las apps (el servidor decide, no el cliente)', async () => {
      prisma.pet.findFirst.mockResolvedValue({ ...petOk, desktopSkills: {} });
      const r = await svc.ingestDigest('u1', 'p1', { appMinutes: coding }, NOW);
      expect(r.stored).toBe(false);
      expect(prisma.petContextProfile.upsert).not.toHaveBeenCalled();
    });

    it('un digest cada 12 h como mucho y nunca de una mascota ajena', async () => {
      prisma.pet.findFirst.mockResolvedValue(petOk);
      prisma.petContextProfile.findUnique.mockResolvedValue({ data: {}, lastDigestAt: new Date(NOW.getTime() - 3600_000) });
      await expect(svc.ingestDigest('u1', 'p1', { appMinutes: coding }, NOW)).rejects.toThrow('hace poco');
      prisma.pet.findFirst.mockResolvedValue(null);
      await expect(svc.ingestDigest('u1', 'p1', { appMinutes: coding }, NOW)).rejects.toThrow('no encontrada');
    });

    it('rechaza un digest malformado o demasiado grande', async () => {
      prisma.pet.findFirst.mockResolvedValue(petOk);
      await expect(svc.ingestDigest('u1', 'p1', { appMinutes: { coding: [1] } }, NOW)).rejects.toThrow('franjas');
      await expect(svc.ingestDigest('u1', 'p1', { pad: 'x'.repeat(5000) }, NOW)).rejects.toThrow('demasiado grande');
    });

    it('borrar un hábito lo silencia para que no vuelva; olvidar todo borra el perfil', async () => {
      prisma.pet.findFirst.mockResolvedValue({ id: 'p1', intelligence: 300 });
      prisma.petMemory.findFirst.mockResolvedValue({ kind: 'habit', key: 'habit:coding_time' });
      prisma.petMemory.deleteMany.mockResolvedValue({ count: 1 });
      prisma.petContextProfile.findUnique.mockResolvedValue({ data: { muted: [] }, lastDigestAt: NOW });
      await svc.remove('u1', 'p1', 'h1');
      expect(prisma.petContextProfile.update.mock.calls[0][0].data.data.muted).toEqual(['habit:coding_time']);
      await svc.clear('u1', 'p1');
      expect(prisma.petContextProfile.deleteMany).toHaveBeenCalledWith({ where: { petId: 'p1' } });
    });
  });

  it('list/remove/clear exigen que la mascota sea del usuario', async () => {
    prisma.pet.findFirst.mockResolvedValue(null);
    await expect(svc.list('u', 'p')).rejects.toThrow('no encontrada');
    await expect(svc.remove('u', 'p', 'm')).rejects.toThrow('no encontrada');
    await expect(svc.clear('u', 'p')).rejects.toThrow('no encontrada');
    prisma.pet.findFirst.mockResolvedValue({ id: 'p', intelligence: 10 });
    prisma.petMemory.deleteMany.mockResolvedValue({ count: 0 });
    await expect(svc.remove('u', 'p', 'zzz')).rejects.toThrow('Recuerdo no encontrado');
    const l = await svc.list('u', 'p');
    expect(l).toMatchObject({ unlocked: false, unlockAt: 200, memories: [] });
  });
});

describe('MemoryService — spec 37 lote 2 (memoria v2)', () => {
  const when = (n: number) => new Date(1_700_000_000_000 + n * 1000);
  const provider = (output: string) =>
    ({
      chat: jest.fn(async function* () {
        yield { type: 'delta', text: output };
        yield { type: 'done' };
      }),
      test: jest.fn(),
    }) as any;

  function setup(facts: { id: string; content: string }[] = []) {
    const created: any[] = [];
    const prisma: any = {
      petMemory: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(({ where }: any) => Promise.resolve(where.kind === 'fact' ? facts.map((f, i) => ({ ...f, kind: 'fact', createdAt: when(i) })) : [])),
        create: jest.fn(({ data }: any) => {
          created.push(data);
          return Promise.resolve(data);
        }),
        update: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      chatMessage: {
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: 12 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `m${i}`, createdAt: when(i) })),
        ),
      },
      pet: { findFirst: jest.fn() },
      petContextProfile: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    };
    const usage: any = { hasQuota: jest.fn().mockResolvedValue(true), record: jest.fn().mockResolvedValue(undefined) };
    const mindMemory: any = { remember: jest.fn(async () => 1), enforceCapacity: jest.fn(async () => undefined) };
    const svc = new MemoryService(prisma, usage, undefined, mindMemory);
    return { svc, prisma, created, mindMemory };
  }

  const KNOWN = [
    { id: 'f-madrid', content: 'Vive en Madrid' },
    { id: 'f-gato', content: 'Tiene un gato' },
  ];

  it('enseña al extractor los hechos conocidos, numerados', async () => {
    const s = setup(KNOWN);
    const p = provider('{"summary":"x resumen","facts":[]}');
    await s.svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok');
    const user = p.chat.mock.calls[0][0][1].content;
    expect(user).toContain('1. Vive en Madrid');
    expect(user).toContain('2. Tiene un gato');
  });

  it('una corrección sustituye el hecho antiguo en vez de añadir otro', async () => {
    const s = setup(KNOWN);
    const p = provider(JSON.stringify({ summary: 'Se mudó', facts: [{ op: 'update', index: 1, text: 'Vive en Barcelona', importance: 0.9 }] }));
    await s.svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok');
    expect(s.prisma.petMemory.update).toHaveBeenCalledWith({ where: { id: 'f-madrid' }, data: { content: 'Vive en Barcelona', importance: 0.9 } });
    expect(s.created.filter((c) => c.kind === 'fact')).toEqual([]);
  });

  it('una baja borra solo ese hecho de esa mascota', async () => {
    const s = setup(KNOWN);
    const p = provider(JSON.stringify({ summary: 'Ya no tiene gato', facts: [{ op: 'delete', index: 2 }] }));
    await s.svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok');
    expect(s.prisma.petMemory.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['f-gato'] }, petId: 'p1' } });
  });

  it('un índice fuera de rango no toca nada', async () => {
    const s = setup(KNOWN);
    const p = provider(JSON.stringify({ summary: 'x resumen', facts: [{ op: 'delete', index: 7 }, { op: 'update', index: 9, text: 'Otra cosa' }] }));
    await s.svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok');
    expect(s.prisma.petMemory.update).not.toHaveBeenCalled();
    expect(s.prisma.petMemory.deleteMany).not.toHaveBeenCalled();
  });

  it('no da de alta un hecho que ya dice lo mismo que una corrección', async () => {
    const s = setup(KNOWN);
    const p = provider(
      JSON.stringify({
        summary: 'Se mudó',
        facts: [{ op: 'update', index: 1, text: 'Vive en Barcelona' }, { op: 'add', text: 'Tiene un GATO' }, { op: 'add', text: 'Toca el piano', importance: 0.4 }],
      }),
    );
    await s.svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok');
    expect(s.created.filter((c) => c.kind === 'fact').map((c) => [c.content, c.importance])).toEqual([['Toca el piano', 0.4]]);
  });

  it('los episodios extraídos van a la memoria episódica a través de la mente', async () => {
    const s = setup();
    const p = provider(JSON.stringify({ summary: 'Aprobó', facts: [], episodes: [{ text: 'Mi entrenador me contó que aprobó el examen', importance: 0.7, valence: 0.8 }] }));
    await s.svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok');
    expect(s.mindMemory.remember).toHaveBeenCalledWith('p1', [
      expect.objectContaining({ layer: 'episodic', kind: 'event', subject: 'owner', content: 'Mi entrenador me contó que aprobó el examen', importance: 0.7, valence: 0.8 }),
    ]);
  });

  it('tras guardar aplica la capacidad por retención y no los topes fijos', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `f${i}`, content: `Hecho ${i}` }));
    const s = setup(many);
    const p = provider(JSON.stringify({ summary: 'x resumen', facts: [{ op: 'add', text: 'Tiene un loro' }] }));
    await s.svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok');
    expect(s.mindMemory.enforceCapacity).toHaveBeenCalledWith('p1');
    // Ni se borran los hechos más antiguos por orden de llegada ni se podan resúmenes por número
    expect(s.prisma.petMemory.deleteMany).not.toHaveBeenCalled();
  });

  it('el marcador de «procesado hasta» se sigue escribiendo aunque no haya resumen', async () => {
    const s = setup();
    const p = provider(JSON.stringify({ summary: '', facts: [{ op: 'add', text: 'Tiene un loro' }] }));
    await s.svc.maybeSummarize('p1', 250, p, 'm', 'u1', 'byok');
    const marker = s.created.find((c) => c.kind === 'summary');
    expect(marker).toMatchObject({ importance: 0.1, createdAt: when(11) });
  });
});
