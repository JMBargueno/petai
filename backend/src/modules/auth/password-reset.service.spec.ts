import * as argon2 from 'argon2';
import { BadRequestException } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';

const NEW_PW = 'NuevaContrasena123!';
const EMAIL = 'jugador@petai.local';
const USER_ID = 'user-1';

function build(opts: { userExists?: boolean; claimCount?: number } = {}) {
  const userExists = opts.userExists ?? true;
  const claimCount = opts.claimCount ?? 1;

  const token = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue(null), // sin colisión de código
    updateMany: jest.fn().mockResolvedValue({ count: claimCount }),
  };
  const user = {
    findUnique: jest.fn().mockResolvedValue(userExists ? { id: USER_ID, email: EMAIL } : null),
    update: jest.fn().mockResolvedValue({ id: USER_ID }),
  };
  const prisma = {
    user,
    passwordResetToken: token,
    // $transaction recibe el mismo objeto (el callback usa tx.passwordResetToken / tx.user).
    $transaction: jest.fn().mockImplementation((cb: any) => cb(prisma)),
  };
  const throttle = { consume: jest.fn().mockResolvedValue(undefined) };
  const auth = {
    logoutAll: jest.fn().mockResolvedValue({ ok: true, revoked: 0 }),
    issueSession: jest.fn().mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      user: { id: USER_ID, email: EMAIL, displayName: 'Astro', coins: 1, gems: 1 },
    }),
  };
  const mail = { sendPasswordResetCode: jest.fn().mockResolvedValue(undefined) };

  const service = new PasswordResetService(prisma as never, throttle as never, auth as never, mail as never);
  return { service, prisma, user, token, auth, mail, throttle };
}

describe('PasswordResetService', () => {
  describe('request', () => {
    it('cuenta existente: crea el código de 6 dígitos, lo envía y responde ok', async () => {
      const { service, token, mail } = build({ userExists: true });
      const res = await service.request({ email: EMAIL }, '127.0.0.1');

      expect(res).toEqual({ ok: true });
      expect(token.create).toHaveBeenCalledTimes(1);
      const created = token.create.mock.calls[0][0].data;
      expect(created.code).toMatch(/^\d{6}$/);
      expect(created.userId).toBe(USER_ID);
      expect(created.email).toBe(EMAIL);
      expect(mail.sendPasswordResetCode).toHaveBeenCalledTimes(1);
      expect(mail.sendPasswordResetCode.mock.calls[0][0]).toBe(EMAIL);
      expect(mail.sendPasswordResetCode.mock.calls[0][1]).toBe(created.code);
    });

    it('cuenta inexistente: no crea ni envía nada, pero responde igual (sin enumeración)', async () => {
      const { service, token, mail } = build({ userExists: false });
      const res = await service.request({ email: 'no@petai.local' }, '127.0.0.1');
      expect(res).toEqual({ ok: true });
      expect(token.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetCode).not.toHaveBeenCalled();
    });

    it('rechaza un email no válido (400)', async () => {
      const { service } = build();
      await expect(service.request({ email: 'no-es-un-email' }, '127.0.0.1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirm', () => {
    it('código válido: cambia la contraseña (argon2), canjea el código, cierra sesiones y emite sesión nueva', async () => {
      const { service, token, user, auth } = build({ userExists: true, claimCount: 1 });
      const res = await service.confirm({ email: EMAIL, code: '482913', newPassword: NEW_PW }, '127.0.0.1');

      expect(res.ok).toBe(true);
      expect(res.accessToken).toBe('at');
      expect(res.refreshToken).toBe('rt');
      // Canje: updateMany con consumedAt=null y un expiresAt futuro, marcando consumedAt.
      expect(token.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ code: '482913', consumedAt: null }),
          data: expect.objectContaining({ consumedAt: expect.any(Date) }),
        }),
      );
      // Contraseña nueva hasheada con argon2.
      expect(user.update).toHaveBeenCalledTimes(1);
      const newHash = user.update.mock.calls[0][0].data.passwordHash;
      expect(await argon2.verify(newHash, NEW_PW)).toBe(true);
      expect(auth.logoutAll).toHaveBeenCalledTimes(1);
      expect(auth.issueSession).toHaveBeenCalledWith(USER_ID);
    });

    it('código inválido o caducado (canje count=0): 400 y no toca la contraseña', async () => {
      const { service, user, auth } = build({ userExists: true, claimCount: 0 });
      await expect(
        service.confirm({ email: EMAIL, code: '000000', newPassword: NEW_PW }, '127.0.0.1'),
      ).rejects.toThrow('Código inválido o caducado');
      expect(user.update).not.toHaveBeenCalled();
      expect(auth.issueSession).not.toHaveBeenCalled();
    });

    it('rechaza un newPassword no válido (400, sin tocar BD)', async () => {
      const { service, user } = build();
      await expect(
        service.confirm({ email: EMAIL, code: '482913', newPassword: 'corta' }, '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
      expect(user.update).not.toHaveBeenCalled();
    });

    it('rechaza un código mal formado (400)', async () => {
      const { service, user } = build();
      await expect(
        service.confirm({ email: EMAIL, code: '12ab34', newPassword: NEW_PW }, '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
      expect(user.update).not.toHaveBeenCalled();
    });
  });
});
