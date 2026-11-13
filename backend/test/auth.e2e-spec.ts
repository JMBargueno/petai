import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthThrottleService } from '../src/modules/auth/auth-throttle.service';

const PASSWORD = 'Contrasena-Segura-123';

describe('Autenticación: validación, límite de intentos y sesiones (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let config: ConfigService;
  const api = () => request(app.getHttpServer());
  const uniqueEmail = (p = 'auth') => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;

  function register(email = uniqueEmail(), password = PASSWORD, extra: object = {}) {
    return api().post('/v1/auth/register').send({ email, password, ...extra });
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    config = app.get(ConfigService);
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  beforeEach(() => {
    // Estado limpio del limitador y límites por defecto; cada bloque activa lo que necesita
    (app.get(AuthThrottleService) as any).hits.clear();
    config.set('AUTH_RATE_LIMIT_FORCE', 'false');
    for (const k of ['AUTH_LOGIN_MAX_FAILS_PER_ACCOUNT', 'AUTH_LOGIN_MAX_FAILS_PER_IP', 'AUTH_REGISTER_MAX_PER_IP', 'AUTH_REFRESH_MAX_PER_MINUTE']) {
      config.set(k, undefined);
    }
  });

  describe('registro', () => {
    it('1. acepta datos válidos, normaliza el correo y devuelve tokens y usuario sin datos sensibles', async () => {
      const email = uniqueEmail('Mayus').toUpperCase().replace('@PETAI.LOCAL', '@petai.local');
      const res = await register(`  ${email}  `, PASSWORD, { displayName: '  Ana  ' }).expect(201);
      expect(res.body.user).toMatchObject({ email: email.toLowerCase(), displayName: 'Ana', coins: 100, gems: 10 });
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it.each([
      ['sin cuerpo', undefined],
      ['cuerpo vacío', {}],
      ['correo inválido', { email: 'no-es-un-correo', password: PASSWORD }],
      ['correo sin dominio', { email: 'a@b', password: PASSWORD }],
      ['correo no textual', { email: 5, password: PASSWORD }],
      ['correo demasiado largo', { email: `${'a'.repeat(250)}@x.io`, password: PASSWORD }],
      ['sin contraseña', { email: 'a@petai.local' }],
      ['contraseña corta', { email: 'a@petai.local', password: 'abc1234' }],
      ['contraseña demasiado larga', { email: 'a@petai.local', password: 'x'.repeat(129) }],
      ['contraseña no textual', { email: 'a@petai.local', password: ['a'] }],
      ['displayName vacío', { email: 'a@petai.local', password: PASSWORD, displayName: '   ' }],
      ['displayName demasiado largo', { email: 'a@petai.local', password: PASSWORD, displayName: 'x'.repeat(51) }],
      ['displayName no textual', { email: 'a@petai.local', password: PASSWORD, displayName: { a: 1 } }],
    ])('2. rechaza con 400 (nunca 500): %s', async (_n, body) => {
      const r = api().post('/v1/auth/register');
      await (body === undefined ? r : r.send(body)).expect(400);
    });

    it('3. un JSON roto responde 400', async () => {
      await api().post('/v1/auth/register').set('Content-Type', 'application/json').send('{"email":').expect(400);
    });

    it('4. el correo es único sin distinguir mayúsculas, y los campos extra se ignoran', async () => {
      const email = uniqueEmail();
      await register(email, PASSWORD, { coins: 999999, gems: 999999, id: 'otro', passwordHash: 'x' }).expect(201);
      await register(email.toUpperCase().replace('@PETAI.LOCAL', '@petai.local')).expect(409);
      const login = await api().post('/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
      expect(login.body.user.coins).toBe(100);
    });

    it('5. dos registros simultáneos del mismo correo: solo uno se crea', async () => {
      const email = uniqueEmail();
      const rs = await Promise.all([register(email), register(email)]);
      expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it('6. los caracteres de control del nombre se eliminan', async () => {
      const res = await register(uniqueEmail(), PASSWORD, { displayName: 'An\u0000a\n' }).expect(201);
      expect(res.body.user.displayName).toBe('Ana');
    });
  });

  describe('login', () => {
    let email: string;
    beforeAll(async () => {
      email = uniqueEmail('login');
      await register(email).expect(201);
    });

    it('7. correcto → 200; entradas malformadas → 400', async () => {
      await api().post('/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
      for (const body of [undefined, {}, { email }, { password: PASSWORD }, { email: 5, password: PASSWORD }, { email, password: ['x'] }, { email, password: 'x'.repeat(129) }]) {
        const r = api().post('/v1/auth/login');
        await (body === undefined ? r : r.send(body)).expect(400);
      }
    });

    it('8. cuenta inexistente y contraseña errónea dan la misma respuesta y ambas ejecutan argon2 (sin pista por tiempos)', async () => {
      const spy = jest.spyOn(argon2, 'verify');
      const wrongPass = await api().post('/v1/auth/login').send({ email, password: 'incorrecta-123' }).expect(401);
      const calls1 = spy.mock.calls.length;
      const unknown = await api().post('/v1/auth/login').send({ email: uniqueEmail('nadie'), password: 'incorrecta-123' }).expect(401);
      expect(spy.mock.calls.length).toBe(calls1 + 1);
      expect(unknown.body.message).toBe(wrongPass.body.message);
      spy.mockRestore();
    });

    it('9. las cuentas antiguas con contraseña corta aún pueden entrar (la política solo aplica al registro)', async () => {
      const legacy = uniqueEmail('legacy');
      await prisma.user.create({ data: { email: legacy, passwordHash: await argon2.hash('corta'), displayName: 'Legacy' } });
      await api().post('/v1/auth/login').send({ email: legacy, password: 'corta' }).expect(200);
    });
  });

  describe('límite de intentos', () => {
    beforeEach(() => config.set('AUTH_RATE_LIMIT_FORCE', 'true'));

    it('10. tras N fallos la cuenta se bloquea (429) aunque se acierte la contraseña; otras cuentas no', async () => {
      config.set('AUTH_LOGIN_MAX_FAILS_PER_ACCOUNT', 3);
      const email = uniqueEmail('lock');
      const other = uniqueEmail('lock2');
      await register(email).expect(201);
      await register(other).expect(201);
      for (let i = 0; i < 3; i++) await api().post('/v1/auth/login').send({ email, password: 'mal-' + i }).expect(401);
      const blocked = await api().post('/v1/auth/login').send({ email, password: PASSWORD }).expect(429);
      expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0);
      await api().post('/v1/auth/login').send({ email: other, password: PASSWORD }).expect(200);
    });

    it('11. un acierto reinicia el contador de esa cuenta', async () => {
      config.set('AUTH_LOGIN_MAX_FAILS_PER_ACCOUNT', 3);
      const email = uniqueEmail('reset');
      await register(email).expect(201);
      for (let i = 0; i < 2; i++) await api().post('/v1/auth/login').send({ email, password: 'mal-' + i }).expect(401);
      await api().post('/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
      for (let i = 0; i < 2; i++) await api().post('/v1/auth/login').send({ email, password: 'mal-' + i }).expect(401);
      await api().post('/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
    });

    it('12. el barrido de muchas cuentas desde una IP también se frena', async () => {
      config.set('AUTH_LOGIN_MAX_FAILS_PER_IP', 5);
      for (let i = 0; i < 5; i++) await api().post('/v1/auth/login').send({ email: uniqueEmail('x'), password: 'mal-1234' }).expect(401);
      await api().post('/v1/auth/login').send({ email: uniqueEmail('y'), password: 'mal-1234' }).expect(429);
    });

    it('13. el registro masivo desde una IP se limita', async () => {
      config.set('AUTH_REGISTER_MAX_PER_IP', 3);
      for (let i = 0; i < 3; i++) await register().expect(201);
      await register().expect(429);
    });

    it('14. los intentos de registro inválidos también cuentan', async () => {
      config.set('AUTH_REGISTER_MAX_PER_IP', 2);
      await api().post('/v1/auth/register').send({}).expect(400);
      await api().post('/v1/auth/register').send({}).expect(400);
      await api().post('/v1/auth/register').send({}).expect(429);
    });

    it('15. el refresh también tiene límite', async () => {
      config.set('AUTH_REFRESH_MAX_PER_MINUTE', 2);
      await api().post('/v1/auth/refresh').send({ refreshToken: 'x'.repeat(20) }).expect(401);
      await api().post('/v1/auth/refresh').send({ refreshToken: 'x'.repeat(20) }).expect(401);
      await api().post('/v1/auth/refresh').send({ refreshToken: 'x'.repeat(20) }).expect(429);
    });
  });

  describe('sesiones y refresh tokens', () => {
    let email: string;
    const login = async () => (await api().post('/v1/auth/login').send({ email, password: PASSWORD }).expect(200)).body;
    beforeAll(async () => {
      email = uniqueEmail('sess');
      await register(email).expect(201);
    });

    it('16. el refresh rota el token: el nuevo sirve y el antiguo ya no', async () => {
      const s = await login();
      const r = await api().post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);
      expect(r.body.accessToken).toBeTruthy();
      expect(r.body.refreshToken).not.toBe(s.refreshToken);
      await api().post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
      await api().post('/v1/auth/refresh').send({ refreshToken: r.body.refreshToken }).expect(200);
    });

    it('17. dos refresh simultáneos con el mismo token: solo uno prospera', async () => {
      const s = await login();
      const rs = await Promise.all([
        api().post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }),
        api().post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }),
      ]);
      expect(rs.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('18. reutilizar un refresh token ya revocado (pasado el margen) cierra todas las sesiones', async () => {
      const s1 = await login();
      const s2 = await login();
      const rotated = (await api().post('/v1/auth/refresh').send({ refreshToken: s1.refreshToken }).expect(200)).body;
      // Se simula que el token se revocó hace un minuto (fuera del margen de dos usos legítimos casi simultáneos)
      const hash = require('crypto').createHash('sha256').update(s1.refreshToken).digest('hex');
      await prisma.refreshToken.updateMany({ where: { hash }, data: { revokedAt: new Date(Date.now() - 60_000) } });

      await api().post('/v1/auth/refresh').send({ refreshToken: s1.refreshToken }).expect(401);
      await api().post('/v1/auth/refresh').send({ refreshToken: rotated.refreshToken }).expect(401); // el robo invalida el resto
      await api().post('/v1/auth/refresh').send({ refreshToken: s2.refreshToken }).expect(401);
    });

    it('19. tokens basura, de otro tipo o mal formados se rechazan sin 500', async () => {
      const s = await login();
      for (const body of [undefined, {}, { refreshToken: 5 }, { refreshToken: {} }, { refreshToken: 'corto' }, { refreshToken: 'x'.repeat(5000) }]) {
        const r = api().post('/v1/auth/refresh');
        await (body === undefined ? r : r.send(body)).expect(400);
      }
      await api().post('/v1/auth/refresh').send({ refreshToken: 'basura.basura.basura' }).expect(401);
      // Un access token no sirve como refresh token (secretos distintos)
      await api().post('/v1/auth/refresh').send({ refreshToken: s.accessToken }).expect(401);
    });

    it('20. dos logins en el mismo segundo producen refresh tokens distintos (jti) y la caducidad sale del token', async () => {
      const [a, b] = await Promise.all([login(), login()]);
      expect(a.refreshToken).not.toBe(b.refreshToken);
      const row = await prisma.refreshToken.findFirstOrThrow({
        where: { hash: require('crypto').createHash('sha256').update(a.refreshToken).digest('hex') },
      });
      const exp = JSON.parse(Buffer.from(a.refreshToken.split('.')[1], 'base64').toString()).exp * 1000;
      expect(row.expiresAt.getTime()).toBe(exp);
    });

    it('21. logout revoca el token (idempotente) y valida la entrada', async () => {
      const s = await login();
      await api().post('/v1/auth/logout').send({ refreshToken: s.refreshToken }).expect(200);
      await api().post('/v1/auth/logout').send({ refreshToken: s.refreshToken }).expect(200);
      await api().post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
      await api().post('/v1/auth/logout').send({}).expect(400);
    });
  });
});
