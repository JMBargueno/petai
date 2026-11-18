import { BadRequestException } from '@nestjs/common';
import { AdminEmailService } from './admin-email.service';
import { UnsubscribeTokens } from './unsubscribe';

describe('UnsubscribeTokens', () => {
  const t = new UnsubscribeTokens(undefined, 'jwt-secret-for-tests');

  it('firma y verifica', () => {
    const token = t.create('3f0c4a4e-1111-4222-8333-444455556666');
    expect(t.verify(token)).toBe('3f0c4a4e-1111-4222-8333-444455556666');
  });

  it('rechaza firmas manipuladas u otros secretos', () => {
    const token = t.create('u1');
    expect(t.verify(token.replace(/^u1/, 'u2'))).toBeNull();
    expect(t.verify(`${token}x`)).toBeNull();
    expect(new UnsubscribeTokens('otro-secreto-de-16+', 'x').verify(token)).toBeNull();
    expect(t.verify(undefined)).toBeNull();
    expect(t.verify('sin-punto')).toBeNull();
  });
});

describe('AdminEmailService', () => {
  let prisma: any;
  let email: { sendRaw: jest.Mock };
  let queue: { add: jest.Mock };
  let service: AdminEmailService;
  const config = {
    get: (k: string) =>
      ({
        PUBLIC_WEB_URL: 'https://pockai.world',
        PUBLIC_API_URL: 'https://game-api.pockai.world',
        API_PREFIX: 'v1',
        JWT_ACCESS_SECRET: 'jwt-secret-for-tests',
        EMAIL_CAMPAIGN_RATE_PER_SECOND: '1000',
      })[k],
  } as any;

  beforeEach(() => {
    const tx = { emailCampaign: { create: jest.fn().mockResolvedValue({ id: 'c1' }) }, auditLog: { create: jest.fn() } };
    prisma = {
      tx,
      user: { count: jest.fn(), findMany: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      emailCampaign: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    email = { sendRaw: jest.fn().mockResolvedValue(undefined) };
    queue = { add: jest.fn() };
    service = new AdminEmailService(prisma, config, email as any, queue as any);
  });

  it('los segmentos excluyen a quien se dio de baja y filtran por rol/verificación', async () => {
    prisma.user.count.mockResolvedValue(7);
    await service.count({ type: 'segment', role: 'user', verified: 'unverified' });
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { emailOptOutAt: null, role: 'user', emailVerifiedAt: null } });
    await service.count({ type: 'segment', verified: 'verified' });
    expect(prisma.user.count).toHaveBeenLastCalledWith({ where: { emailOptOutAt: null, emailVerifiedAt: { not: null } } });
  });

  it('la lista de correos se deduplica (sin distinguir mayúsculas) y descuenta las bajas', async () => {
    prisma.user.count.mockResolvedValue(0);
    expect(await service.count({ type: 'emails', emails: ['A@x.com', 'a@x.com', 'b@x.com'] })).toBe(2);
    prisma.user.count.mockResolvedValue(1);
    expect(await service.count({ type: 'emails', emails: ['a@x.com', 'b@x.com'] })).toBe(1);
    expect(prisma.user.count).toHaveBeenLastCalledWith({ where: { email: { in: ['a@x.com', 'b@x.com'] }, emailOptOutAt: { not: null } } });
  });

  it('la lista de correos no envía a cuentas dadas de baja', async () => {
    prisma.emailCampaign.findUnique.mockResolvedValue({
      id: 'c3', status: 'queued', subject: 'S', preheader: null, html: '<p>x</p>',
      audience: { type: 'emails', emails: ['baja@x.com', 'ok@x.com', 'externo@y.com'] }, cursor: null, sent: 0, failed: 0, total: 2, lastError: null, startedAt: null,
    });
    prisma.user.findMany.mockResolvedValueOnce([
      { id: 'u1', email: 'baja@x.com', emailOptOutAt: new Date() },
      { id: 'u2', email: 'ok@x.com', emailOptOutAt: null },
    ]);
    expect(await service.process('c3')).toEqual({ sent: 2, failed: 0 });
    expect(email.sendRaw.mock.calls.map((c) => c[0].to)).toEqual(['ok@x.com', 'externo@y.com']);
    // Solo las cuentas llevan enlace de baja
    expect(email.sendRaw.mock.calls[1][0].headers).toBeUndefined();
  });

  it('crear sin destinatarios es un 400', async () => {
    prisma.user.count.mockResolvedValue(0);
    await expect(
      service.create({ id: 'admin' }, { subject: 'Hola', html: '<p>x</p>', audience: { type: 'segment' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('crear guarda, audita y encola la campaña', async () => {
    prisma.user.count.mockResolvedValue(3);
    await service.create({ id: 'admin' }, { subject: 'Hola', html: '<p>x</p>', audience: { type: 'segment', role: 'admin' } });
    expect(prisma.tx.emailCampaign.create.mock.calls[0][0].data).toMatchObject({ subject: 'Hola', total: 3, createdById: 'admin' });
    expect(prisma.tx.auditLog.create.mock.calls[0][0].data).toMatchObject({ userId: 'admin', event: 'email_campaign_create' });
    expect(queue.add).toHaveBeenCalledWith('send', { campaignId: 'c1' }, expect.objectContaining({ jobId: 'c1' }));
  });

  it('valida el contenido', async () => {
    await expect(service.create({ id: 'a' }, { subject: '', html: 'x', audience: { type: 'segment' } })).rejects.toThrow(/asunto/);
    await expect(service.create({ id: 'a' }, { subject: 'x', html: 'x', audience: { type: 'emails', emails: ['nope'] } })).rejects.toThrow(/no válido/);
  });

  it('procesa por lotes, con enlace de baja y List-Unsubscribe para cuentas', async () => {
    prisma.emailCampaign.findUnique.mockResolvedValue({
      id: 'c1', status: 'queued', subject: 'Novedades', preheader: null, html: '<p>Hola<script>x</script></p>',
      audience: { type: 'segment', verified: 'any' }, cursor: null, sent: 0, failed: 0, total: 2, lastError: null, startedAt: null,
    });
    prisma.user.findMany
      .mockResolvedValueOnce([{ id: 'u1', email: 'a@x.com' }, { id: 'u2', email: 'b@x.com' }])
      .mockResolvedValueOnce([]);
    email.sendRaw.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('550 rechazado'));

    expect(await service.process('c1')).toEqual({ sent: 1, failed: 1 });
    const first = email.sendRaw.mock.calls[0][0];
    expect(first.to).toBe('a@x.com');
    expect(first.html).toContain('Hola');
    expect(first.html).not.toContain('<script');
    expect(first.headers['List-Unsubscribe']).toMatch(/^<https:\/\/game-api\.pockai\.world\/v1\/email\/unsubscribe\?token=u1\./);
    expect(first.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    // Segundo lote pedido a partir del último id (reanudable)
    expect(prisma.user.findMany.mock.calls[1][0].where).toEqual({ AND: [{ emailOptOutAt: null }, { id: { gt: 'u2' } }] });
    expect(prisma.emailCampaign.update).toHaveBeenLastCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ status: 'sent' }),
    });
  });

  it('"usuarios concretos": el cursor no amplía el envío a otras cuentas', async () => {
    prisma.emailCampaign.findUnique.mockResolvedValue({
      id: 'c2', status: 'queued', subject: 'S', preheader: null, html: '<p>x</p>',
      audience: { type: 'users', userIds: ['3f0c4a4e-1111-4222-8333-444455556666'] }, cursor: null, sent: 0, failed: 0, total: 1, lastError: null, startedAt: null,
    });
    prisma.user.findMany
      .mockResolvedValueOnce([{ id: '3f0c4a4e-1111-4222-8333-444455556666', email: 'a@x.com' }])
      .mockResolvedValueOnce([]);
    await service.process('c2');
    expect(prisma.user.findMany.mock.calls[1][0].where).toEqual({
      AND: [
        { id: { in: ['3f0c4a4e-1111-4222-8333-444455556666'] }, emailOptOutAt: null },
        { id: { gt: '3f0c4a4e-1111-4222-8333-444455556666' } },
      ],
    });
  });

  it('una campaña ya terminada no se reenvía', async () => {
    prisma.emailCampaign.findUnique.mockResolvedValue({ id: 'c1', status: 'sent', sent: 5, failed: 0 });
    expect(await service.process('c1')).toEqual({ sent: 5, failed: 0 });
    expect(email.sendRaw).not.toHaveBeenCalled();
  });

  it('la baja exige un enlace firmado', async () => {
    expect(await service.applyUnsubscribe('u1.firma-falsa')).toBe(false);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    const token = service.unsubscribe.create('u1');
    expect(await service.applyUnsubscribe(token)).toBe(true);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u1', emailOptOutAt: null }, data: { emailOptOutAt: expect.any(Date) } });
  });
});
