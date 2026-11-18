import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EMAIL_SENDER } from '../src/modules/mail/email.service';
import { validateEnv } from '../src/config/env.config';

/**
 * Verificación de correo + envíos del panel (e2e).
 *
 * Se activa EMAIL_VERIFICATION_REQUIRED sustituyendo el ConfigService del módulo (no se toca
 * process.env: las suites e2e corren en serie en el mismo proceso). El transporte de correo es un
 * fake que captura código, enlace y envíos (en BD solo hay hashes).
 */
const PW = 'Contrasena-Segura-123';

describe('Verificación de correo y envíos del panel (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const created: string[] = [];

  const verifications: { email: string; code: string; link: string }[] = [];
  const raws: { to: string; subject: string; html: string; headers?: Record<string, string> }[] = [];
  const fakeSender = {
    sendPasswordResetCode: jest.fn().mockResolvedValue(undefined),
    sendContactMessage: jest.fn().mockResolvedValue(undefined),
    sendVerification: jest.fn(async (email: string, d: { code: string; link: string }) => {
      verifications.push({ email, code: d.code, link: d.link });
    }),
    sendRaw: jest.fn(async (m: any) => {
      raws.push(m);
    }),
  };

  const overrides: Record<string, string> = { EMAIL_VERIFICATION_REQUIRED: 'true', EMAIL_CAMPAIGN_RATE_PER_SECOND: '200' };
  const real = new ConfigService(validateEnv(process.env));
  const config = new Proxy(real, {
    get(target, prop) {
      if (prop === 'get') {
        return (key: string, ...rest: unknown[]) => (key in overrides ? overrides[key] : (target.get as any)(key, ...rest));
      }
      const v = (target as any)[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });

  const until = async <T>(fn: () => Promise<T | undefined | null | false>, ms = 10_000): Promise<T> => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error('timeout esperando la condición');
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  async function register() {
    const email = `verif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const res = await api().post('/v1/auth/register').send({ email, password: PW }).expect(201);
    created.push(res.body.user.id);
    const mail = await until(async () => verifications.find((v) => v.email === email));
    return { email, userId: res.body.user.id as string, token: res.body.accessToken as string, body: res.body, mail };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider(EMAIL_SENDER)
      .useValue(fakeSender)
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.emailCampaign.deleteMany({ where: { createdById: { in: created } } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { userId: { in: created } } }).catch(() => {});
    for (const id of created) await prisma.user.delete({ where: { id } }).catch(() => {});
    await app.close();
  });

  describe('verificación', () => {
    it('registro → emailVerified=false, correo con código y enlace a /es/verify-email', async () => {
      const { body, mail } = await register();
      expect(body.user.emailVerified).toBe(false);
      expect(mail.code).toMatch(/^\d{6}$/);
      expect(mail.link).toMatch(/\/es\/verify-email\?token=[\w-]{20,}$/);
    });

    it('sin verificar: 403 EMAIL_NOT_VERIFIED en la API, pero /me, reenvío y logout-all funcionan', async () => {
      const { token } = await register();
      const blocked = await api().get('/v1/pets').set('Authorization', `Bearer ${token}`).expect(403);
      expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED');

      const me = await api().get('/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
      expect(me.body.emailVerified).toBe(false);

      await api().post('/v1/auth/verify-email/resend').set('Authorization', `Bearer ${token}`).expect(200);
    });

    it('con el código correcto se desbloquea al momento', async () => {
      const { token, email } = await register();
      // Reenvío: invalida el código anterior
      await api().post('/v1/auth/verify-email/resend').set('Authorization', `Bearer ${token}`).expect(200);
      const latest = verifications.filter((v) => v.email === email).pop()!;

      await api().post('/v1/auth/verify-email/confirm').set('Authorization', `Bearer ${token}`).send({ code: '12' }).expect(400);
      const res = await api()
        .post('/v1/auth/verify-email/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: latest.code })
        .expect(200);
      expect(res.body.emailVerified).toBe(true);

      await api().get('/v1/pets').set('Authorization', `Bearer ${token}`).expect(200);
      const me = await api().get('/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
      expect(me.body.emailVerified).toBe(true);
      const login = await api().post('/v1/auth/login').send({ email, password: PW }).expect(200);
      expect(login.body.user.emailVerified).toBe(true);
    });

    it('con el enlace (sin sesión) también se verifica; reusar el enlace sigue siendo éxito', async () => {
      const { token, mail } = await register();
      const linkToken = decodeURIComponent(mail.link.split('token=')[1]);
      await api().post('/v1/auth/verify-email/link').send({ token: 'x'.repeat(43) }).expect(400);
      await api().post('/v1/auth/verify-email/link').send({ token: linkToken }).expect(200);
      await api().post('/v1/auth/verify-email/link').send({ token: linkToken }).expect(200);
      await api().get('/v1/pets').set('Authorization', `Bearer ${token}`).expect(200);
    });

    it('tras 5 códigos incorrectos el token se bloquea aunque luego llegue el bueno', async () => {
      const { token, mail } = await register();
      const wrong = mail.code === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        await api().post('/v1/auth/verify-email/confirm').set('Authorization', `Bearer ${token}`).send({ code: wrong }).expect(400);
      }
      const res = await api()
        .post('/v1/auth/verify-email/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: mail.code })
        .expect(400);
      expect(res.body.message).toMatch(/Demasiados intentos/);
    });

    it('recuperar la contraseña también verifica el correo', async () => {
      const { email } = await register();
      await api().post('/v1/auth/reset/request').send({ email }).expect(200);
      const row = await prisma.passwordResetToken.findFirst({ where: { email } });
      const res = await api().post('/v1/auth/reset/confirm').send({ email, code: row!.code, newPassword: 'OtraContrasena-456' }).expect(200);
      expect(res.body.user.emailVerified).toBe(true);
    });
  });

  describe('envíos del panel', () => {
    async function admin() {
      const a = await register();
      await prisma.user.update({ where: { id: a.userId }, data: { role: 'superadmin', emailVerifiedAt: new Date() } });
      return a;
    }

    it('un usuario sin permiso no puede usar el panel de correos', async () => {
      const u = await register();
      await prisma.user.update({ where: { id: u.userId }, data: { emailVerifiedAt: new Date() } });
      await api().post('/v1/admin/emails/preview').set('Authorization', `Bearer ${u.token}`).send({ html: 'x' }).expect(403);
    });

    it('vista previa, recuento, prueba y envío a usuarios concretos con enlace de baja', async () => {
      const a = await admin();
      const auth = { Authorization: `Bearer ${a.token}` };
      const target = await register();

      const preview = await api().post('/v1/admin/emails/preview').set(auth).send({ subject: 'Hola', html: '<h2>Novedades</h2><script>x</script>' }).expect(200);
      expect(preview.body.html).toContain('Novedades');
      expect(preview.body.html).not.toContain('<script');

      const count = await api().post('/v1/admin/emails/audience/count').set(auth).send({ audience: { type: 'emails', emails: ['A@x.com', 'a@x.com'] } }).expect(200);
      expect(count.body.count).toBe(1);

      await api().post('/v1/admin/emails/test').set(auth).send({ subject: 'Prueba', html: '<p>hola</p>' }).expect(200);
      expect(raws.find((r) => r.to === a.email && r.subject === '[Prueba] Prueba')).toBeTruthy();

      const campaign = await api()
        .post('/v1/admin/emails')
        .set(auth)
        .send({ subject: 'Evento de invierno', html: '<p>¡Llega la nieve!</p>', audience: { type: 'users', userIds: [target.userId] } })
        .expect(201);
      expect(campaign.body.total).toBe(1);

      const done = await until(async () => {
        const r = await api().get(`/v1/admin/emails/${campaign.body.id}`).set(auth).expect(200);
        return r.body.status === 'sent' ? r.body : null;
      });
      expect(done.sent).toBe(1);
      // Solo le llega al usuario elegido (nunca a otras cuentas)
      expect(raws.filter((r) => r.subject === 'Evento de invierno').map((r) => r.to)).toEqual([target.email]);
      const mail = raws.find((r) => r.to === target.email && r.subject === 'Evento de invierno')!;
      expect(mail.html).toContain('¡Llega la nieve!');
      expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');

      // Baja con el enlace firmado del correo
      const url = new URL(mail.headers!['List-Unsubscribe'].slice(1, -1));
      const page = await api().get(`/v1/email/unsubscribe${url.search}`).expect(200);
      expect(page.text).toContain('Darme de baja');
      await api().post(`/v1/email/unsubscribe${url.search}`).type('form').send('List-Unsubscribe=One-Click').expect(200);
      const db = await prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
      expect(db.emailOptOutAt).not.toBeNull();
      await api().post('/v1/email/unsubscribe?token=falso.firma').expect(400);

      const list = await api().get('/v1/admin/emails').set(auth).expect(200);
      expect(list.body.items.some((c: any) => c.id === campaign.body.id)).toBe(true);
    });

    it('el panel puede marcar como verificado a un usuario', async () => {
      const a = await admin();
      const u = await register();
      await api().post(`/v1/admin/users/${u.userId}/verify-email`).set('Authorization', `Bearer ${a.token}`).expect(200);
      await api().get('/v1/pets').set('Authorization', `Bearer ${u.token}`).expect(200);
    });
  });
});
