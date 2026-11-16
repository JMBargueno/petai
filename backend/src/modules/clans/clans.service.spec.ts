import { ClansService } from './clans.service';

/**
 * ClansService: creación/unirse/salir/invitar + resumen con presencia + chat + metas + listener de
 * actividad. Se decoupla de Prisma con un mock de `PrismaService` (patrón `invites.service.spec.ts`)
 * y de `RealtimeGateway`/`EventEmitter2` con mocks simples.
 */

const presence = { hasActiveDevices: jest.fn().mockResolvedValue(true) };
const events = { emit: jest.fn() };
const realtime = { emitToUser: jest.fn() };

function buildPrisma(): any {
  const prisma: any = {};
  prisma.clan = {
    findUnique: jest.fn(async () => null),
    create: jest.fn(async ({ data }: any) => ({
      id: 'clan-1',
      name: data.name,
      tag: data.tag,
      description: data.description ?? null,
      leaderId: data.leaderId,
      xp: 0,
    })),
    update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    delete: jest.fn(async () => ({})),
  };
  prisma.clanMembership = {
    findUnique: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
    create: jest.fn(async ({ data }: any) => ({
      id: 'm-1',
      role: data.role ?? 'member',
      joinedAt: new Date(),
      ...data,
    })),
    count: jest.fn(async () => 1),
    delete: jest.fn(async () => ({})),
    update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
  };
  prisma.clanMessage = {
    create: jest.fn(async ({ data }: any) => ({
      id: 'msg-1',
      clanId: data.clanId,
      userId: data.userId,
      body: data.body,
      createdAt: new Date(),
    })),
    findMany: jest.fn(async () => []),
    findFirst: jest.fn(async () => null),
    delete: jest.fn(async () => ({})),
  };
  prisma.clanGoal = {
    create: jest.fn(async ({ data }: any) => ({
      id: 'goal-1',
      clanId: data.clanId,
      title: data.title,
      description: data.description ?? null,
      metric: data.metric ?? 'generic',
      target: data.target,
      progress: 0,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    })),
    findMany: jest.fn(async () => []),
    findFirst: jest.fn(async () => null),
    update: jest.fn(async ({ where, data }: any) => ({
      id: where.id,
      clanId: 'clan-1',
      title: 'Meta',
      description: null,
      metric: 'generic',
      target: 100,
      progress: 0,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      ...data,
    })),
    delete: jest.fn(async () => ({})),
  };
  prisma.user = {
    findMany: jest.fn(async ({ where }: any) =>
      (where?.id?.in ?? [where?.id]).filter(Boolean).map((id: string) => ({ id, displayName: `n-${id}` })),
    ),
    findUnique: jest.fn(async ({ where }: any) => ({ id: where.id ?? 'bob' })),
  };
  prisma.$transaction = jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  return prisma;
}

const build = (prisma: any = buildPrisma()) => new ClansService(prisma as never, presence as never, events as never, realtime as never);
const actor = 'actor';

describe('ClansService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('createClan crea el clan con el actor como Forjador (creator) y devuelve el resumen', async () => {
    const prisma = buildPrisma();
    const summary = await build(prisma).createClan(actor, { name: 'Horda', tag: 'horda', description: 'epico' });
    expect(prisma.clan.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Horda', tag: 'horda', leaderId: actor }) }),
    );
    expect(prisma.clanMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: actor, role: 'creator' }) }),
    );
    expect(summary.leaderId).toBe(actor);
    expect(summary.memberCount).toBe(1);
    expect(summary.members[0].role).toBe('creator');
    expect(summary.members[0].isOnline).toBe(true);
  });

  it('createClan da 400 si el actor ya pertenece a un clan', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'c' });
    await expect(build(prisma).createClan(actor, { name: 'X', tag: 'x' })).rejects.toMatchObject({ status: 400 });
    expect(prisma.clan.create).not.toHaveBeenCalled();
  });

  it('createClan da 400 si la etiqueta ya está en uso', async () => {
    const prisma = buildPrisma();
    prisma.clan.findUnique.mockResolvedValueOnce({ id: 'other' });
    await expect(build(prisma).createClan(actor, { name: 'X', tag: 'horda' })).rejects.toMatchObject({ status: 400 });
  });

  it('createClan da 400 si faltan name o tag', async () => {
    await expect(build().createClan(actor, { name: '', tag: 'x' })).rejects.toMatchObject({ status: 400 });
    await expect(build().createClan(actor, { name: 'X', tag: '  ' })).rejects.toMatchObject({ status: 400 });
  });

  it('getMyClan da 404 si no pertenece a ningún clan', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce(null);
    await expect(build(prisma).getMyClan(actor)).rejects.toMatchObject({ status: 404 });
  });

  it('getMyClan devuelve el roster con presencia por miembro', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1' });
    prisma.clan.findUnique.mockResolvedValueOnce({
      id: 'clan-1',
      name: 'Horda',
      tag: 'horda',
      description: null,
      leaderId: actor,
      xp: 12,
    });
    prisma.clanMembership.findMany.mockResolvedValueOnce([
      { userId: actor, role: 'leader', joinedAt: new Date('2026-01-01') },
      { userId: 'bob', role: 'member', joinedAt: new Date('2026-01-02') },
    ]);
    const summary = await build(prisma).getMyClan(actor);
    expect(summary.memberCount).toBe(2);
    expect(summary.members).toHaveLength(2);
    expect(summary.members.every((m) => m.isOnline === true)).toBe(true);
    expect(summary.leader.userId).toBe(actor);
  });

  it('joinClan da 404 si el clan no existe', async () => {
    const prisma = buildPrisma();
    prisma.clan.findUnique.mockResolvedValueOnce(null);
    await expect(build(prisma).joinClan(actor, { tag: 'horda' })).rejects.toMatchObject({ status: 404 });
  });

  it('joinClan da 400 si el actor ya está en un clan', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'c' });
    await expect(build(prisma).joinClan(actor, { tag: 'horda' })).rejects.toMatchObject({ status: 400 });
  });

  it('joinClan añade al actor como miembro', async () => {
    const prisma = buildPrisma();
    prisma.clan.findUnique.mockResolvedValue({
      id: 'clan-2',
      name: 'X',
      tag: 'horda',
      description: null,
      leaderId: 'l',
      xp: 0,
    });
    const summary = await build(prisma).joinClan(actor, { tag: 'horda' });
    expect(prisma.clanMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clanId: 'clan-2', userId: actor, role: 'member' }),
      }),
    );
    expect(summary.id).toBe('clan-2');
  });

  it('leaveClan: el Forjador no puede salir si quedan otros miembros (400)', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1' });
    prisma.clan.findUnique.mockResolvedValueOnce({ id: 'clan-1', leaderId: actor, tag: 'horda' });
    prisma.clanMembership.count.mockResolvedValueOnce(2);
    await expect(build(prisma).leaveClan(actor)).rejects.toMatchObject({ status: 400 });
    expect(prisma.clan.delete).not.toHaveBeenCalled();
  });

  it('leaveClan: el último miembro disuelve el clan', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1' });
    prisma.clan.findUnique.mockResolvedValueOnce({ id: 'clan-1', leaderId: actor, tag: 'horda' });
    prisma.clanMembership.count.mockResolvedValueOnce(1);
    const res = await build(prisma).leaveClan(actor);
    expect(prisma.clanMembership.delete).toHaveBeenCalled();
    expect(prisma.clan.delete).toHaveBeenCalledWith({ where: { id: 'clan-1' } });
    expect(res.success).toBe(true);
    expect(res.message).toContain('disuelto');
  });

  it('leaveClan da 404 si no pertenece a ningún clan', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce(null);
    await expect(build(prisma).leaveClan(actor)).rejects.toMatchObject({ status: 404 });
  });


  it('inviteMember: 403 si el actor es un simple Hermano (member)', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1', role: 'member' });
    await expect(build(prisma).inviteMember(actor, 'clan-1', { userId: 'bob' })).rejects.toMatchObject({
      status: 403,
    });
    expect(prisma.clanMembership.create).not.toHaveBeenCalled();
  });

  it('inviteMember: 404 si el clan no existe', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1', role: 'creator' });
    prisma.clan.findUnique.mockResolvedValueOnce(null);
    await expect(build(prisma).inviteMember(actor, 'clan-1', { userId: 'bob' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('inviteMember: 400 si el destinatario ya pertenece a un clan', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1', role: 'creator' });
    prisma.clan.findUnique.mockResolvedValueOnce({ id: 'clan-1', leaderId: actor });
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm2', clanId: 'otro' });
    await expect(build(prisma).inviteMember(actor, 'clan-1', { userId: 'bob' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('inviteMember: un Vigía (moderator) invita por email y crea el miembro', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1', role: 'moderator' });
    prisma.clan.findUnique.mockResolvedValue({ id: 'clan-1', leaderId: 'otra' });
    // email → usuario, luego verificación por id, luego "sin clan"
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'bob' }); // por email
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'bob' }); // por id
    prisma.clanMembership.findUnique.mockResolvedValueOnce(null);
    const summary = await build(prisma).inviteMember(actor, 'clan-1', { email: 'bob@x.com' });
    expect(prisma.clanMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clanId: 'clan-1', userId: 'bob', role: 'member' }),
      }),
    );
    expect(summary.id).toBe('clan-1');
  });

  it('getMembers: 403 si el actor no pertenece a ese clan', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'otro', role: 'member' });
    await expect(build(prisma).getMembers(actor, 'clan-1')).rejects.toMatchObject({ status: 403 });
  });

  // ── Rangos del Nexo ─────────────────────────────────────────────────────────

  /** Encola la membresía del actor y la del objetivo (en ese orden) en `clanMembership.findUnique`. */
  const withRoles = (prisma: any, actorRole: string, targetRole: string, clanId = 'clan-1') => {
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm-actor', clanId: 'clan-1', userId: actor, role: actorRole });
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm-bob', clanId, userId: 'bob', role: targetRole });
    prisma.clan.findUnique.mockResolvedValue({ id: 'clan-1', name: 'Horda', tag: 'horda', description: null, leaderId: actor, xp: 0 });
    prisma.clanMembership.findMany.mockResolvedValue([
      { userId: actor, role: actorRole, joinedAt: new Date(1) },
      { userId: 'bob', role: targetRole, joinedAt: new Date(2) },
    ]);
  };

  it.each([
    ['moderator', 'member'],
    ['admin', 'moderator'],
    ['admin', 'member'],
    ['creator', 'admin'],
  ])('kickMember: un %s puede expulsar a un %s', async (actorRole, targetRole) => {
    const prisma = buildPrisma();
    withRoles(prisma, actorRole, targetRole);
    await build(prisma).kickMember(actor, 'clan-1', 'bob');
    expect(prisma.clanMembership.delete).toHaveBeenCalledWith({ where: { id: 'm-bob' } });
    expect(realtime.emitToUser).toHaveBeenCalledWith('bob', 'clan:member_kicked', expect.objectContaining({ userId: 'bob' }));
  });

  it.each([
    ['member', 'member'],
    ['moderator', 'moderator'],
    ['moderator', 'admin'],
    ['admin', 'admin'],
    ['admin', 'creator'],
  ])('kickMember: un %s NO puede expulsar a un %s (403)', async (actorRole, targetRole) => {
    const prisma = buildPrisma();
    withRoles(prisma, actorRole, targetRole);
    await expect(build(prisma).kickMember(actor, 'clan-1', 'bob')).rejects.toMatchObject({ status: 403 });
    expect(prisma.clanMembership.delete).not.toHaveBeenCalled();
  });

  it('kickMember: 404 si el objetivo no es de este clan', async () => {
    const prisma = buildPrisma();
    withRoles(prisma, 'creator', 'member', 'otro-clan');
    await expect(build(prisma).kickMember(actor, 'clan-1', 'bob')).rejects.toMatchObject({ status: 404 });
  });

  it('kickMember: 400 si intenta expulsarse a sí mismo', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1', role: 'creator' });
    await expect(build(prisma).kickMember(actor, 'clan-1', actor)).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    ['admin', 'member', 'moderator'],
    ['admin', 'moderator', 'member'],
    ['creator', 'member', 'admin'],
    ['creator', 'admin', 'member'],
  ])('setMemberRole: un %s cambia a un %s a %s', async (actorRole, targetRole, newRole) => {
    const prisma = buildPrisma();
    withRoles(prisma, actorRole, targetRole);
    await build(prisma).setMemberRole(actor, 'clan-1', 'bob', newRole);
    expect(prisma.clanMembership.update).toHaveBeenCalledWith({ where: { id: 'm-bob' }, data: { role: newRole } });
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      actor,
      'clan:role_changed',
      expect.objectContaining({ userId: 'bob', role: newRole }),
    );
  });

  it.each([
    ['moderator', 'member', 'moderator'],
    ['admin', 'member', 'admin'],
    ['admin', 'admin', 'member'],
  ])('setMemberRole: un %s NO puede cambiar a un %s a %s (403)', async (actorRole, targetRole, newRole) => {
    const prisma = buildPrisma();
    withRoles(prisma, actorRole, targetRole);
    await expect(build(prisma).setMemberRole(actor, 'clan-1', 'bob', newRole)).rejects.toMatchObject({ status: 403 });
    expect(prisma.clanMembership.update).not.toHaveBeenCalled();
  });

  it('setMemberRole: 400 si el rango no es asignable (creator o desconocido)', async () => {
    await expect(build().setMemberRole(actor, 'clan-1', 'bob', 'creator')).rejects.toMatchObject({ status: 400 });
    await expect(build().setMemberRole(actor, 'clan-1', 'bob', 'leader')).rejects.toMatchObject({ status: 400 });
  });

  it('transferCreator: el Forjador cede la Forja y queda como Guardián', async () => {
    const prisma = buildPrisma();
    withRoles(prisma, 'creator', 'moderator');
    await build(prisma).transferCreator(actor, 'clan-1', 'bob');
    expect(prisma.clanMembership.update).toHaveBeenCalledWith({ where: { id: 'm-bob' }, data: { role: 'creator' } });
    expect(prisma.clanMembership.update).toHaveBeenCalledWith({ where: { id: 'm-actor' }, data: { role: 'admin' } });
    expect(prisma.clan.update).toHaveBeenCalledWith({ where: { id: 'clan-1' }, data: { leaderId: 'bob' } });
  });

  it('transferCreator: 403 si el actor no es el Forjador', async () => {
    const prisma = buildPrisma();
    withRoles(prisma, 'admin', 'member');
    await expect(build(prisma).transferCreator(actor, 'clan-1', 'bob')).rejects.toMatchObject({ status: 403 });
    expect(prisma.clan.update).not.toHaveBeenCalled();
  });

  it('updateClan: un Guardián renombra el clan; un Vigía no puede', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1', role: 'admin' });
    prisma.clan.findUnique.mockResolvedValue({ id: 'clan-1', name: 'Nuevo', tag: 'horda', description: null, leaderId: 'x', xp: 0 });
    await build(prisma).updateClan(actor, 'clan-1', { name: ' Nuevo ', description: '' });
    expect(prisma.clan.update).toHaveBeenCalledWith({ where: { id: 'clan-1' }, data: { name: 'Nuevo', description: null } });

    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1', role: 'moderator' });
    await expect(build(prisma).updateClan(actor, 'clan-1', { name: 'X' })).rejects.toMatchObject({ status: 403 });
  });

  it('disbandClan: solo el Forjador disuelve y se avisa a todos', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1', role: 'admin' });
    await expect(build(prisma).disbandClan(actor, 'clan-1')).rejects.toMatchObject({ status: 403 });
    expect(prisma.clan.delete).not.toHaveBeenCalled();

    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1', role: 'creator' });
    prisma.clanMembership.findMany.mockResolvedValueOnce([{ userId: actor }, { userId: 'bob' }]);
    const res = await build(prisma).disbandClan(actor, 'clan-1');
    expect(prisma.clan.delete).toHaveBeenCalledWith({ where: { id: 'clan-1' } });
    expect(realtime.emitToUser).toHaveBeenCalledWith('bob', 'clan:disbanded', expect.objectContaining({ clanId: 'clan-1' }));
    expect(res.success).toBe(true);
  });

  it('un rol heredado "leader" se trata como Forjador', async () => {
    const prisma = buildPrisma();
    withRoles(prisma, 'leader', 'admin');
    await build(prisma).kickMember(actor, 'clan-1', 'bob');
    expect(prisma.clanMembership.delete).toHaveBeenCalled();
  });

  // ── Chat ────────────────────────────────────────────────────────────────────

  it('sendMessage crea el mensaje, resuelve senderName y emite clan:message a los miembros', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1' });
    prisma.clanMembership.findMany.mockResolvedValueOnce([{ userId: actor }, { userId: 'bob' }]);
    const msg = await build(prisma).sendMessage(actor, 'clan-1', '  hola  ');
    expect(prisma.clanMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { clanId: 'clan-1', userId: actor, body: 'hola' } }),
    );
    expect(msg.senderName).toBe('n-actor');
    expect(msg.body).toBe('hola');
    expect(realtime.emitToUser).toHaveBeenCalledTimes(2);
    expect(realtime.emitToUser).toHaveBeenCalledWith(actor, 'clan:message', expect.objectContaining({ body: 'hola' }));
  });

  it('sendMessage da 400 si el mensaje está vacío', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1' });
    await expect(build(prisma).sendMessage(actor, 'clan-1', '   ')).rejects.toMatchObject({ status: 400 });
  });

  it('sendMessage da 400 si el mensaje supera 500 caracteres', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1' });
    await expect(build(prisma).sendMessage(actor, 'clan-1', 'x'.repeat(501))).rejects.toMatchObject({ status: 400 });
  });

  it('getMessages devuelve los mensajes recientes con senderName y paginación', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1' });
    prisma.clanMessage.findMany.mockResolvedValueOnce([
      { id: 'msg-2', clanId: 'clan-1', userId: 'bob', body: 'b', createdAt: new Date(2) },
      { id: 'msg-1', clanId: 'clan-1', userId: actor, body: 'a', createdAt: new Date(1) },
    ]);
    const rows = await build(prisma).getMessages(actor, 'clan-1', { limit: 5, before: '2020-01-01T00:00:00.000Z' });
    expect(prisma.clanMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clanId: 'clan-1', createdAt: { lt: new Date('2020-01-01T00:00:00.000Z') } }),
        take: 5,
      }),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].senderName).toBe('n-bob');
    expect(rows[1].senderName).toBe('n-actor');
  });

  it('assertMembership: 404 si el actor no tiene clan', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce(null);
    await expect(build(prisma).sendMessage(actor, 'clan-1', 'hola')).rejects.toMatchObject({ status: 404 });
  });

  it('assertMembership: 403 si el actor pertenece a otro clan', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'otro-clan' });
    await expect(build(prisma).getMessages(actor, 'clan-1')).rejects.toMatchObject({ status: 403 });
  });

  it('deleteMessage: el autor borra su mensaje aunque sea Hermano', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1', role: 'member' });
    prisma.clanMessage.findFirst.mockResolvedValueOnce({ id: 'msg-1', clanId: 'clan-1', userId: actor });
    await build(prisma).deleteMessage(actor, 'clan-1', 'msg-1');
    expect(prisma.clanMessage.delete).toHaveBeenCalledWith({ where: { id: 'msg-1' } });
  });

  it('deleteMessage: un Hermano no puede borrar mensajes de otros; un Vigía sí', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1', role: 'member' });
    prisma.clanMessage.findFirst.mockResolvedValueOnce({ id: 'msg-1', clanId: 'clan-1', userId: 'bob' });
    await expect(build(prisma).deleteMessage(actor, 'clan-1', 'msg-1')).rejects.toMatchObject({ status: 403 });

    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1', role: 'moderator' });
    prisma.clanMessage.findFirst.mockResolvedValueOnce({ id: 'msg-1', clanId: 'clan-1', userId: 'bob' });
    await build(prisma).deleteMessage(actor, 'clan-1', 'msg-1');
    expect(prisma.clanMessage.delete).toHaveBeenCalledTimes(1);
  });

  // ── Metas ───────────────────────────────────────────────────────────────────

  it('createGoal crea la meta y devuelve el DTO', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1' });
    const goal = await build(prisma).createGoal(actor, 'clan-1', { title: '1000 xp', metric: 'xp', target: 1000 });
    expect(prisma.clanGoal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clanId: 'clan-1', title: '1000 xp', metric: 'xp', target: 1000 }),
      }),
    );
    expect(goal.id).toBe('goal-1');
    expect(goal.status).toBe('active');
  });

  it('createGoal da 400 si falta el título o el target no es > 0', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValue({ id: 'm', clanId: 'clan-1' });
    await expect(build(prisma).createGoal(actor, 'clan-1', { title: '', target: 10 })).rejects.toMatchObject({ status: 400 });
    await expect(build(prisma).createGoal(actor, 'clan-1', { title: 'x', target: 0 })).rejects.toMatchObject({ status: 400 });
    await expect(build(prisma).createGoal(actor, 'clan-1', { title: 'x' })).rejects.toMatchObject({ status: 400 });
  });

  it('getGoals lista las metas del clan', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1' });
    prisma.clanGoal.findMany.mockResolvedValueOnce([
      { id: 'g1', clanId: 'clan-1', title: 'A', description: null, metric: 'xp', target: 10, progress: 5, status: 'active', createdAt: new Date(), updatedAt: new Date(), completedAt: null },
      { id: 'g2', clanId: 'clan-1', title: 'B', description: null, metric: 'visits', target: 3, progress: 3, status: 'completed', createdAt: new Date(), updatedAt: new Date(), completedAt: new Date() },
    ]);
    const goals = await build(prisma).getGoals(actor, 'clan-1');
    expect(goals).toHaveLength(2);
    expect(goals[0].id).toBe('g1');
    expect(goals[1].status).toBe('completed');
  });

  it('addGoalProgress suma el progreso y emite clan:goal_progress y clan:goal_completed', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1' });
    prisma.clanGoal.findFirst.mockResolvedValueOnce({ id: 'goal-1', clanId: 'clan-1', status: 'active', progress: 90, target: 100, metric: 'generic', title: 'M', description: null, createdAt: new Date(), updatedAt: new Date(), completedAt: null });
    prisma.clanGoal.update.mockResolvedValueOnce({ id: 'goal-1', clanId: 'clan-1', title: 'M', description: null, metric: 'generic', target: 100, progress: 100, status: 'completed', createdAt: new Date(), updatedAt: new Date(), completedAt: new Date() });
    prisma.clanMembership.findMany.mockResolvedValueOnce([{ userId: actor }]);
    const goal = await build(prisma).addGoalProgress(actor, 'clan-1', 'goal-1', 10);
    expect(goal.progress).toBe(100);
    expect(realtime.emitToUser).toHaveBeenCalledWith(actor, 'clan:goal_progress', expect.objectContaining({ progress: 100 }));
    expect(realtime.emitToUser).toHaveBeenCalledWith(actor, 'clan:goal_completed', expect.anything());
  });

  it('addGoalProgress da 400 si la meta ya está completada', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1' });
    prisma.clanGoal.findFirst.mockResolvedValueOnce({ id: 'goal-1', clanId: 'clan-1', status: 'completed', progress: 5, target: 5, metric: 'generic', title: 'M', description: null, createdAt: new Date(), updatedAt: new Date(), completedAt: new Date() });
    await expect(build(prisma).addGoalProgress(actor, 'clan-1', 'goal-1', 1)).rejects.toMatchObject({ status: 400 });
  });

  it('addGoalProgress da 404 si la meta no existe', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1' });
    prisma.clanGoal.findFirst.mockResolvedValueOnce(null);
    await expect(build(prisma).addGoalProgress(actor, 'clan-1', 'nope', 1)).rejects.toMatchObject({ status: 404 });
  });

  it('deleteGoal: 403 si el actor es un simple Hermano', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1', role: 'member' });
    await expect(build(prisma).deleteGoal(actor, 'clan-1', 'goal-1')).rejects.toMatchObject({ status: 403 });
    expect(prisma.clanGoal.delete).not.toHaveBeenCalled();
  });

  it('deleteGoal: un Vigía elimina la meta', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1', role: 'moderator' });
    prisma.clanGoal.findFirst.mockResolvedValueOnce({ id: 'goal-1', clanId: 'clan-1', status: 'active', progress: 0, target: 10, metric: 'generic', title: 'M', description: null, createdAt: new Date(), updatedAt: new Date(), completedAt: null });
    const res = await build(prisma).deleteGoal(actor, 'clan-1', 'goal-1');
    expect(prisma.clanGoal.delete).toHaveBeenCalledWith({ where: { id: 'goal-1' } });
    expect(res.success).toBe(true);
  });

  // ── onClanActivity (listener clan:activity) ─────────────────────────────────

  it('onClanActivity: sin clan no hace nada', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce(null);
    await build(prisma).onClanActivity({ userId: actor, xp: 10, visits: 1 });
    expect(prisma.clan.update).not.toHaveBeenCalled();
    expect(prisma.clanGoal.findMany).not.toHaveBeenCalled();
  });

  it('onClanActivity: suma XP al clan y avanza una meta xp sin completar', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1' });
    prisma.clanGoal.findMany.mockResolvedValueOnce([
      { id: 'g1', clanId: 'clan-1', metric: 'xp', progress: 50, target: 100, status: 'active' },
    ]);
    await build(prisma).onClanActivity({ userId: actor, xp: 10, visits: 1 });
    expect(prisma.clan.update).toHaveBeenCalledWith({
      where: { id: 'clan-1' },
      data: { xp: { increment: 10 } },
    });
    expect(prisma.clanGoal.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { progress: 60 },
    });
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });

  it('onClanActivity: completa una meta y emite clan:goal_completed a los miembros', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockResolvedValueOnce({ id: 'm', clanId: 'clan-1' });
    prisma.clanMembership.findMany.mockResolvedValueOnce([{ userId: actor }]);
    prisma.clanGoal.findMany.mockResolvedValueOnce([
      { id: 'g1', clanId: 'clan-1', metric: 'visits', progress: 2, target: 3, status: 'active' },
    ]);
    await build(prisma).onClanActivity({ userId: actor, xp: 0, visits: 1 });
    expect(prisma.clan.update).not.toHaveBeenCalled(); // xp = 0
    expect(prisma.clanGoal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'g1' },
        data: expect.objectContaining({ progress: 3, status: 'completed' }),
      }),
    );
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      actor,
      'clan:goal_completed',
      expect.objectContaining({ id: 'g1', status: 'completed' }),
    );
  });

  it('onClanActivity: nunca lanza hacia el emisor aunque la BD falle (mejor esfuerzo)', async () => {
    const prisma = buildPrisma();
    prisma.clanMembership.findUnique.mockRejectedValueOnce(new Error('db caído'));
    await expect(build(prisma).onClanActivity({ userId: actor, xp: 10, visits: 1 })).resolves.toBeUndefined();
  });
});

