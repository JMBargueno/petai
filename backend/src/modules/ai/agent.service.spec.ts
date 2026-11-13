import { AgentService } from './agent.service';

const NOW = new Date('2026-11-13T12:00:00Z');
const ctx = { userId: 'u1', petId: 'p1', timeZone: 'Europe/Madrid', now: NOW };
const call = (name: string, args: any = {}) => ({ id: 'c1', name, arguments: JSON.stringify(args) });

describe('AgentService', () => {
  let prisma: any;
  let pets: any;
  let svc: AgentService;
  const memory: any = { search: jest.fn().mockResolvedValue(['A Ana le gusta pescar']) };
  const gameData: any = {
    getBalance: () => ({
      minigames: { minEnergy: 10, energyCost: 10, games: { catch_food: { name: 'A' }, reflex: { name: 'R' }, memory_match: { name: 'M' } } },
    }),
  };

  beforeEach(() => {
    prisma = {
      pendingAction: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(({ data }) => Promise.resolve({ id: 'a1', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      reminder: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(({ data }) => Promise.resolve({ id: 'r1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Madrid' }) },
    };
    pets = {
      getPetById: jest.fn().mockResolvedValue({
        nickname: 'Chispa', species: { name: 'Ignisaurio', favoriteFood: 'spicy_berry' }, level: 3, stage: 'baby',
        hunger: 30, happiness: 40, energy: 80, hygiene: 90, health: 100, sick: false, sleeping: false,
      }),
    };
    svc = new AgentService(prisma, pets, gameData, memory);
  });

  const parse = (o: any) => JSON.parse(o.content);

  it('las herramientas de lectura devuelven datos reales de la mascota del contexto', async () => {
    const o: any = await svc.handle(ctx, call('get_my_status'));
    expect(o.kind).toBe('result');
    expect(parse(o)).toMatchObject({ nombre: 'Chispa', hambre: 30, animo: 'calm' });
    expect(pets.getPetById).toHaveBeenCalledWith('u1', 'p1'); // siempre la sesión, no el modelo
  });

  it('request_food usa el inventario del usuario y la comida favorita', async () => {
    prisma.inventoryItem.findMany.mockResolvedValue([{ itemId: 'spicy_berry', qty: 2, item: { name: 'Baya' } }]);
    const r = parse(await svc.handle(ctx, call('request_food')));
    expect(r).toMatchObject({ necesita_comer: true, comida_favorita: 'spicy_berry', tiene_la_favorita: true });
  });

  it('suggest_minigame se adapta al estado', async () => {
    expect(parse(await svc.handle(ctx, call('suggest_minigame'))).recomendado).toBe('catch_food'); // triste
    pets.getPetById.mockResolvedValue({ happiness: 90, energy: 5, sleeping: false });
    expect(parse(await svc.handle(ctx, call('suggest_minigame'))).recomendado).toBeNull(); // cansado
  });

  it('search_memory y list_reminders delegan en sus fuentes', async () => {
    expect(parse(await svc.handle(ctx, call('search_memory', { query: 'pesca' }))).recuerdos).toEqual(['A Ana le gusta pescar']);
    expect(memory.search).toHaveBeenCalledWith('p1', 'pesca', 5);
    prisma.reminder.findMany.mockResolvedValue([{ id: 'r1', text: 'x', dueAt: NOW }]);
    expect(parse(await svc.handle(ctx, call('list_reminders'))).recordatorios).toHaveLength(1);
    expect(prisma.reminder.findMany.mock.calls[0][0].where.userId).toBe('u1');
  });

  it('create_reminder NO se ejecuta: crea una acción pendiente con resumen del servidor', async () => {
    const o: any = await svc.handle(ctx, call('create_reminder', { text: 'Sacar la basura', due_at: '2026-11-14T09:30:00+01:00' }));
    expect(o.kind).toBe('confirm');
    expect(o.action.summary).toContain('«Sacar la basura»');
    expect(prisma.reminder.create).not.toHaveBeenCalled();
    expect(prisma.pendingAction.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', petId: 'p1', tool: 'create_reminder' });
    expect(parse(o).note).toContain('NO se ha ejecutado');
  });

  it('argumentos inválidos, JSON roto o herramienta desconocida se devuelven al modelo como error', async () => {
    expect(parse(await svc.handle(ctx, call('create_reminder', { text: 'x', due_at: 'ayer' }))).error).toBeTruthy();
    expect(parse(await svc.handle(ctx, { id: 'c', name: 'search_memory', arguments: '{roto' })).error).toContain('JSON');
    expect(parse(await svc.handle(ctx, call('borrar_todo'))).error).toContain('desconocida');
    expect(prisma.pendingAction.create).not.toHaveBeenCalled();
  });

  it('limita las acciones pendientes por usuario', async () => {
    prisma.pendingAction.count.mockResolvedValue(5);
    const o: any = await svc.handle(ctx, call('create_reminder', { text: 'algo', due_at: '2026-11-14T09:30:00Z' }));
    expect(o.kind).toBe('result');
    expect(parse(o).error).toContain('demasiadas');
  });

  describe('herramientas del escritorio', () => {
    const withClient = { ...ctx, clientTools: ['open_url', 'read_clipboard'] };

    it('sin declararlas el cliente, el modelo recibe un error y no se crea ninguna acción', async () => {
      const o: any = await svc.handle(ctx, call('open_url', { url: 'https://example.com' }));
      expect(o.kind).toBe('result');
      expect(parse(o).error).toContain('app de escritorio');
      expect(prisma.pendingAction.create).not.toHaveBeenCalled();
    });

    it('declaradas, proponen una acción marcada como clientSide con la URL validada', async () => {
      const o: any = await svc.handle(withClient, call('open_url', { url: 'https://example.com' }));
      expect(o.kind).toBe('confirm');
      expect(o.action.clientSide).toBe(true);
      expect(o.action.summary).toContain('https://example.com/');
      expect(prisma.pendingAction.create.mock.calls[0][0].data.args).toEqual({ url: 'https://example.com/' });
    });

    it('una URL peligrosa nunca llega a ser acción', async () => {
      for (const url of ['javascript:alert(1)', 'http://localhost:3000', 'file:///etc/passwd']) {
        const o: any = await svc.handle(withClient, call('open_url', { url }));
        expect(o.kind).toBe('result');
        expect(parse(o).error).toBeTruthy();
      }
      expect(prisma.pendingAction.create).not.toHaveBeenCalled();
    });

    it('confirmar NO ejecuta nada en el servidor: devuelve los argumentos validados al cliente, una sola vez', async () => {
      prisma.pendingAction.findUniqueOrThrow.mockResolvedValue({
        id: 'a1', tool: 'open_url', summary: 'Abrir…', args: { url: 'https://example.com/' },
      });
      const r: any = await svc.confirm('u1', 'p1', 'a1');
      expect(r).toMatchObject({ ok: true, clientSide: true, tool: 'open_url', args: { url: 'https://example.com/' } });
      expect(prisma.reminder.create).not.toHaveBeenCalled();
      expect(prisma.pendingAction.updateMany.mock.calls[0][0].where.status).toBe('pending');
    });

    it('si los argumentos guardados dejan de ser válidos, no se devuelven al cliente', async () => {
      prisma.pendingAction.findUniqueOrThrow.mockResolvedValue({
        id: 'a1', tool: 'open_url', summary: 'x', args: { url: 'http://localhost:3000' },
      });
      await expect(svc.confirm('u1', 'p1', 'a1')).rejects.toThrow('ya no es válida');
    });

    it('listPending marca las acciones de escritorio', async () => {
      prisma.pendingAction.findMany.mockResolvedValue([
        { id: 'a', tool: 'open_url', summary: 's', expiresAt: NOW },
        { id: 'b', tool: 'create_reminder', summary: 's', expiresAt: NOW },
      ]);
      const l = await svc.listPending('u1', 'p1');
      expect(l.map((a) => a.clientSide)).toEqual([true, false]);
    });
  });

  describe('confirmación', () => {
    const stored = { id: 'a1', tool: 'create_reminder', summary: 'Crear…', args: { text: 'Sacar la basura', due_at: '2026-11-14T08:30:00.000Z' } };

    it('confirmar ejecuta la herramienta una sola vez', async () => {
      prisma.pendingAction.findUniqueOrThrow.mockResolvedValue(stored);
      const r = await svc.confirm('u1', 'p1', 'a1');
      expect(r.ok).toBe(true);
      expect(prisma.reminder.create).toHaveBeenCalledTimes(1);
      expect(prisma.reminder.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', petId: 'p1', text: 'Sacar la basura' });
      // el claim exige estado pending, dueño, mascota y no caducada
      expect(prisma.pendingAction.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'a1', userId: 'u1', petId: 'p1', status: 'pending' });
    });

    it('una segunda confirmación (o ajena, o caducada) falla sin ejecutar nada', async () => {
      prisma.pendingAction.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.confirm('u1', 'p1', 'a1')).rejects.toThrow('ya fue resuelta');
      expect(prisma.reminder.create).not.toHaveBeenCalled();
    });

    it('revalida los argumentos guardados: si la fecha ya pasó, no se ejecuta', async () => {
      prisma.pendingAction.findUniqueOrThrow.mockResolvedValue({ ...stored, args: { text: 'x algo', due_at: '2020-01-01T00:00:00.000Z' } });
      await expect(svc.confirm('u1', 'p1', 'a1')).rejects.toThrow('ya no es válida');
      expect(prisma.reminder.create).not.toHaveBeenCalled();
      expect(prisma.pendingAction.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { status: 'rejected' } });
    });

    it('respeta el máximo de recordatorios pendientes', async () => {
      prisma.pendingAction.findUniqueOrThrow.mockResolvedValue(stored);
      prisma.reminder.count.mockResolvedValue(20);
      await expect(svc.confirm('u1', 'p1', 'a1')).rejects.toThrow('20 recordatorios');
      expect(prisma.reminder.create).not.toHaveBeenCalled();
    });

    it('rechazar marca la acción y no ejecuta nada', async () => {
      await expect(svc.reject('u1', 'p1', 'a1')).resolves.toEqual({ ok: true });
      expect(prisma.reminder.create).not.toHaveBeenCalled();
      prisma.pendingAction.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.reject('u1', 'p1', 'a1')).rejects.toThrow();
    });
  });

  it('los recordatorios siempre se filtran por usuario', async () => {
    await svc.markDelivered('u1', 'r1');
    expect(prisma.reminder.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'r1', userId: 'u1' });
    prisma.reminder.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.markDelivered('u2', 'r1')).rejects.toThrow('no encontrado');
    prisma.reminder.deleteMany.mockResolvedValue({ count: 0 });
    await expect(svc.deleteReminder('u2', 'r1')).rejects.toThrow('no encontrado');
  });
});
