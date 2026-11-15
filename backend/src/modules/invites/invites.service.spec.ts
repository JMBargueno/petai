import { generateInviteCode, InvitesService, inviteStatus, normalizeInviteCode } from './invites.service';

function buildService() {
  const prismaMock: any = {
    appSettings: {
      findUnique: jest.fn(async () => null as any),
      upsert: jest.fn(async () => ({})),
    },
    inviteCode: {
      fields: { maxUses: { name: 'maxUses', modelName: 'InviteCode' } },
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUnique: jest.fn(async () => null as any),
      findUniqueOrThrow: jest.fn(async (q: any) => ({ id: 'inv-1', code: q?.where?.code ?? 'X', revokedAt: null, usedCount: 0, maxUses: 1, expiresAt: null })),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      create: jest.fn(async ({ data }: any) => ({ id: `inv-${data.code}`, ...data, usedCount: 0, revokedAt: null, createdAt: new Date(), createdBy: null })),
    },
    inviteRedemption: { create: jest.fn(async () => ({})) },
    auditLog: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg))),
  };
  return { service: new InvitesService(prismaMock as never), prismaMock };
}

const actor = { id: 'admin-1' };

describe('helpers de invitaciones', () => {
  it('generateInviteCode produce XXXX-XXXX sin caracteres ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateInviteCode()).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    }
  });

  it('normalizeInviteCode quita espacios y pasa a mayúsculas', () => {
    expect(normalizeInviteCode('  abcd-ef23 ')).toBe('ABCD-EF23');
  });

  it('inviteStatus respeta la precedencia revocado > agotado > caducado > activo', () => {
    const past = new Date(Date.now() - 1000);
    const base = { revokedAt: null, usedCount: 0, maxUses: 1, expiresAt: null };
    expect(inviteStatus(base)).toBe('active');
    expect(inviteStatus({ ...base, expiresAt: past })).toBe('expired');
    expect(inviteStatus({ ...base, usedCount: 1, expiresAt: past })).toBe('used');
    expect(inviteStatus({ ...base, usedCount: 1, revokedAt: past })).toBe('revoked');
  });
});

describe('InvitesService', () => {
  it('isInviteOnly es false si no hay fila de ajustes', async () => {
    const { service } = buildService();
    await expect(service.isInviteOnly()).resolves.toBe(false);
  });

  it('setRegistrationSettings guarda el ajuste y lo audita', async () => {
    const { service, prismaMock } = buildService();
    await expect(service.setRegistrationSettings(actor, { inviteOnly: true })).resolves.toEqual({ inviteOnly: true });
    expect(prismaMock.appSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { registrationInviteOnly: true } }));
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: { userId: 'admin-1', event: 'registration_settings_change', metadata: { inviteOnly: true } },
    });
  });

  it('setRegistrationSettings rechaza un cuerpo no booleano', async () => {
    const { service } = buildService();
    await expect(service.setRegistrationSettings(actor, { inviteOnly: 'sí' })).rejects.toMatchObject({ status: 400 });
  });

  it('create genera N códigos únicos con los parámetros dados y audita', async () => {
    const { service, prismaMock } = buildService();
    const res = await service.create(actor, { count: 5, maxUses: 3, note: 'beta' });
    expect(res.items).toHaveLength(5);
    expect(new Set(res.items.map((i) => i.code)).size).toBe(5);
    expect(res.items.every((i) => i.maxUses === 3 && i.note === 'beta' && i.status === 'active')).toBe(true);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ event: 'invite_create' }) }));
  });

  it('create reintenta si el código aleatorio ya existe', async () => {
    const { service, prismaMock } = buildService();
    const original = prismaMock.inviteCode.create.getMockImplementation();
    prismaMock.inviteCode.create.mockImplementationOnce(async () => {
      throw Object.assign(new Error('dup'), { code: 'P2002' });
    });
    prismaMock.inviteCode.create.mockImplementation(original);
    await expect(service.create(actor, {})).resolves.toHaveProperty('items.length', 1);
    expect(prismaMock.inviteCode.create).toHaveBeenCalledTimes(2);
  });

  it('create rechaza una caducidad pasada o un count excesivo', async () => {
    const { service } = buildService();
    await expect(service.create(actor, { expiresAt: '2000-01-01T00:00:00Z' })).rejects.toMatchObject({ status: 400 });
    await expect(service.create(actor, { count: 51 })).rejects.toMatchObject({ status: 400 });
  });

  it('redeem normaliza el código, hace el claim condicional y registra el canje', async () => {
    const { service, prismaMock } = buildService();
    await service.redeem(prismaMock, ' abcd-ef23 ', 'user-1');
    const where = prismaMock.inviteCode.updateMany.mock.calls[0][0].where;
    expect(where.code).toBe('ABCD-EF23');
    expect(where.revokedAt).toBeNull();
    expect(where.usedCount).toEqual({ lt: prismaMock.inviteCode.fields.maxUses });
    expect(prismaMock.inviteCode.updateMany.mock.calls[0][0].data).toEqual({ usedCount: { increment: 1 } });
    expect(prismaMock.inviteRedemption.create).toHaveBeenCalledWith({ data: { inviteCodeId: 'inv-1', userId: 'user-1' } });
  });

  it('redeem lanza 403 si el código no existe, está agotado, revocado o caducado', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.inviteCode.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.redeem(prismaMock, 'NOPE-NOPE', 'user-1')).rejects.toMatchObject({ status: 403 });
    expect(prismaMock.inviteRedemption.create).not.toHaveBeenCalled();
  });

  it('revoke da 404 si no existe y es idempotente si ya estaba revocado', async () => {
    const { service, prismaMock } = buildService();
    await expect(service.revoke(actor, 'missing')).rejects.toMatchObject({ status: 404 });

    prismaMock.inviteCode.findUnique.mockResolvedValueOnce({ id: 'inv-1', revokedAt: new Date() });
    await service.revoke(actor, 'inv-1');
    expect(prismaMock.inviteCode.updateMany).not.toHaveBeenCalled();

    prismaMock.inviteCode.findUnique.mockResolvedValueOnce({ id: 'inv-1', revokedAt: null });
    await service.revoke(actor, 'inv-1');
    expect(prismaMock.inviteCode.updateMany).toHaveBeenCalledWith({ where: { id: 'inv-1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({ data: { userId: 'admin-1', event: 'invite_revoke', metadata: { inviteId: 'inv-1' } } });
  });
});
