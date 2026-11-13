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
      },
      chatMessage: { findMany: jest.fn().mockResolvedValue(userMsgs(6)) },
      pet: { findFirst: jest.fn() },
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
