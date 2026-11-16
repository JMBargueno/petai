import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { EmailVerificationService, MAX_CODE_ATTEMPTS } from './email-verification.service';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

describe('EmailVerificationService', () => {
  let prisma: any;
  let throttle: { consume: jest.Mock };
  let email: { sendVerification: jest.Mock };
  let service: EmailVerificationService;
  const config = (values: Record<string, string> = {}) => ({ get: (k: string) => values[k] }) as any;

  beforeEach(() => {
    const tx = {
      emailVerificationToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), deleteMany: jest.fn() },
      user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn() },
    };
    prisma = {
      tx,
      user: { findUnique: jest.fn() },
      emailVerificationToken: {
        deleteMany: jest.fn().mockReturnValue('del'),
        create: jest.fn().mockReturnValue('create'),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((arg: any) => (typeof arg === 'function' ? arg(tx) : Promise.all(arg))),
    };
    throttle = { consume: jest.fn().mockResolvedValue(undefined) };
    email = { sendVerification: jest.fn().mockResolvedValue(undefined) };
    service = new EmailVerificationService(
      prisma,
      throttle as any,
      config({ PUBLIC_WEB_URL: 'https://pockai.world/', EMAIL_VERIFICATION_TTL_MINUTES: '60' }),
      email as any,
    );
  });

  describe('send', () => {
    it('crea un token (hasheado) y envía código + enlace', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', displayName: 'Ana', emailVerifiedAt: null });
      const res = await service.send('u1', { ip: '1.1.1.1' });
      expect(res).toEqual({ ok: true, alreadyVerified: false });
      expect(throttle.consume).toHaveBeenCalledWith('verify-send-user:u1', expect.any(Number), expect.any(Number));
      expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });

      const [to, data] = email.sendVerification.mock.calls[0];
      expect(to).toBe('a@b.c');
      expect(data.code).toMatch(/^\d{6}$/);
      expect(data.expiresInMinutes).toBe(60);
      expect(data.link).toMatch(/^https:\/\/pockai\.world\/es\/verify-email\?token=[\w-]+$/);

      const created = prisma.emailVerificationToken.create.mock.calls[0][0].data;
      expect(created.codeHash).toBe(sha256(data.code));
      const token = decodeURIComponent(data.link.split('token=')[1]);
      expect(created.linkTokenHash).toBe(sha256(token));
      // Ni el código ni el token se guardan en claro.
      expect(Object.values(created)).not.toContain(data.code);
      expect(Object.values(created)).not.toContain(token);
    });

    it('no envía si ya está verificada', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', emailVerifiedAt: new Date() });
      expect(await service.send('u1')).toEqual({ ok: true, alreadyVerified: true });
      expect(email.sendVerification).not.toHaveBeenCalled();
    });

    it('sin límite cuando throttled=false (registro / panel)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', emailVerifiedAt: null });
      await service.send('u1', { throttled: false });
      expect(throttle.consume).not.toHaveBeenCalled();
    });

    it('sendAfterRegister nunca lanza aunque falle el SMTP', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', emailVerifiedAt: null });
      email.sendVerification.mockRejectedValue(new Error('smtp caído'));
      expect(() => service.sendAfterRegister('u1')).not.toThrow();
      await new Promise((r) => setImmediate(r));
    });
  });

  describe('confirmCode', () => {
    const token = { id: 't1', userId: 'u1', email: 'a@b.c', codeHash: sha256('123456') };

    beforeEach(() => prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: null }));

    it('verifica con el código correcto (canje atómico + auditoría)', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue(token);
      expect(await service.confirmCode('u1', { code: '123456' }, 'ip')).toEqual({ ok: true, emailVerified: true });
      expect(prisma.tx.emailVerificationToken.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', consumedAt: null },
        data: { consumedAt: expect.any(Date) },
      });
      expect(prisma.tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', email: 'a@b.c', emailVerifiedAt: null },
        data: { emailVerifiedAt: expect.any(Date) },
      });
      expect(prisma.tx.auditLog.create).toHaveBeenCalledWith({ data: { userId: 'u1', event: 'email_verified', metadata: { via: 'code' } } });
    });

    it('rechaza un código incorrecto (y cuenta el intento)', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue(token);
      await expect(service.confirmCode('u1', { code: '000000' }, 'ip')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.emailVerificationToken.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', consumedAt: null, attempts: { lt: MAX_CODE_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      expect(prisma.tx.user.updateMany).not.toHaveBeenCalled();
    });

    it('con los intentos agotados no compara', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue(token);
      prisma.emailVerificationToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.confirmCode('u1', { code: '123456' }, 'ip')).rejects.toThrow(/Demasiados intentos/);
      expect(prisma.tx.user.updateMany).not.toHaveBeenCalled();
    });

    it('sin token vivo: error', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue(null);
      await expect(service.confirmCode('u1', { code: '123456' }, 'ip')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('valida el formato del código', async () => {
      await expect(service.confirmCode('u1', { code: '12ab' }, 'ip')).rejects.toThrow(/6 dígitos/);
    });

    it('ya verificada: éxito idempotente', async () => {
      prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
      expect(await service.confirmCode('u1', { code: '123456' }, 'ip')).toEqual({ ok: true, emailVerified: true });
    });
  });

  describe('confirmLink', () => {
    const linkToken = 'x'.repeat(43);

    it('verifica con un enlace vigente', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 't1', userId: 'u1', email: 'a@b.c', consumedAt: null, expiresAt: new Date(Date.now() + 60_000),
      });
      expect(await service.confirmLink({ token: linkToken }, 'ip')).toEqual({ ok: true, emailVerified: true });
      expect(prisma.emailVerificationToken.findUnique).toHaveBeenCalledWith({ where: { linkTokenHash: sha256(linkToken) } });
    });

    it('enlace caducado: error', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 't1', userId: 'u1', email: 'a@b.c', consumedAt: null, expiresAt: new Date(Date.now() - 1),
      });
      await expect(service.confirmLink({ token: linkToken }, 'ip')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('enlace ya usado con la cuenta verificada: éxito (doble clic)', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({ id: 't1', userId: 'u1', consumedAt: new Date() });
      prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
      expect(await service.confirmLink({ token: linkToken }, 'ip')).toEqual({ ok: true, emailVerified: true });
    });

    it('enlace desconocido: error', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(null);
      await expect(service.confirmLink({ token: linkToken }, 'ip')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('required refleja EMAIL_VERIFICATION_REQUIRED', () => {
    expect(service.required).toBe(false);
    const on = new EmailVerificationService(prisma, throttle as any, config({ EMAIL_VERIFICATION_REQUIRED: 'true' }), email as any);
    expect(on.required).toBe(true);
  });
});
