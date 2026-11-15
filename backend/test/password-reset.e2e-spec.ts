import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Recuperación de contraseña (e2e) — camino feliz + seguridad.
 *
 * Rutas (prefijo global `v1`):
 *   - POST /v1/auth/reset/request  → pide un código de 6 dígitos por email (sin enumeración)
 *   - POST /v1/auth/reset/confirm  → con el código cambia la contraseña, cierra sesiones, emite sesión nueva
 *
 * El transporte de email es de consola (dev/tests), así que el código se lee de BD para conducir el
 * flujo: esto prueba la lógica de los endpoints, no el envío del correo.
 */
const OLD_PW = 'Contrasena-Segura-123';
const NEW_PW = 'NuevaContrasena-789';

describe('Recuperación de contraseña (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const created: string[] = [];

  async function register(): Promise<{ email: string; userId: string }> {
    const email = `reset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const res = await api().post('/v1/auth/register').send({ email, password: OLD_PW }).expect(201);
    created.push(res.body.user.id);
    return { email, userId: res.body.user.id };
  }

  /** Lee el código vivo del email desde BD (el sender es de consola). */
  async function getCode(email: string): Promise<string> {
    const row = await prisma.passwordResetToken.findFirst({ where: { email } });
    return row!.code;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const id of created) await prisma.user.delete({ where: { id } }).catch(() => {});
    await app.close();
  });

  it('flujo completo: request → confirm → la nueva contraseña funciona y la vieja no', async () => {
    const { email } = await register();

    const r = await api().post('/v1/auth/reset/request').send({ email }).expect(200);
    expect(r.body.ok).toBe(true);
    const code = await getCode(email);
    expect(code).toMatch(/^\d{6}$/);

    // La vieja contraseña sigue sirviendo antes del reset.
    await api().post('/v1/auth/login').send({ email, password: OLD_PW }).expect(200);

    const c = await api()
      .post('/v1/auth/reset/confirm')
      .send({ email, code, newPassword: NEW_PW })
      .expect(200);
    expect(c.body.ok).toBe(true);
    expect(c.body.accessToken).toBeTruthy();

    // La sesión emitida es válida.
    await api().get('/v1/me').set('Authorization', `Bearer ${c.body.accessToken}`).expect(200);

    // La vieja contraseña ya NO sirve; la nueva SÍ.
    await api().post('/v1/auth/login').send({ email, password: OLD_PW }).expect(401);
    await api().post('/v1/auth/login').send({ email, password: NEW_PW }).expect(200);
  });

  it('el código es de un solo uso: el segundo confirm responde 400', async () => {
    const { email } = await register();
    await api().post('/v1/auth/reset/request').send({ email }).expect(200);
    const code = await getCode(email);
    await api().post('/v1/auth/reset/confirm').send({ email, code, newPassword: NEW_PW }).expect(200);
    await api().post('/v1/auth/reset/confirm').send({ email, code, newPassword: 'Otra-12345678' }).expect(400);
  });

  it('un código caducado se rechaza', async () => {
    const { email } = await register();
    await api().post('/v1/auth/reset/request').send({ email }).expect(200);
    const row = await prisma.passwordResetToken.findFirstOrThrow({ where: { email } });
    await prisma.passwordResetToken.update({
      where: { code: row.code },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await api().post('/v1/auth/reset/confirm').send({ email, code: row.code, newPassword: NEW_PW }).expect(400);
  });

  it('no enumera cuentas: el correo inexistente responde igual y no crea código', async () => {
    const { email } = await register();
    const ghost = `no_existe_${Date.now()}@petai.local`;
    const a = await api().post('/v1/auth/reset/request').send({ email }).expect(200);
    const b = await api().post('/v1/auth/reset/request').send({ email: ghost }).expect(200);
    expect(a.body).toEqual(b.body);
    expect(await prisma.passwordResetToken.findFirst({ where: { email: ghost } })).toBeNull();
  });

  it('un confirm con código de otro email no prospera', async () => {
    const owner = await register();
    await api().post('/v1/auth/reset/request').send({ email: owner.email }).expect(200);
    const code = await getCode(owner.email);
    // El código existe, pero se intenta canjear con un email distinto.
    await api()
      .post('/v1/auth/reset/confirm')
      .send({ email: `otro_${Date.now()}@petai.local`, code, newPassword: NEW_PW })
      .expect(400);
    // El código sigue vivo para el dueño original.
    await api().post('/v1/auth/reset/confirm').send({ email: owner.email, code, newPassword: NEW_PW }).expect(200);
  });

  it('rechaza entradas no válidas (400, nunca 500)', async () => {
    const { email } = await register();
    await api().post('/v1/auth/reset/request').send({}).expect(400);
    await api().post('/v1/auth/reset/request').send({ email: 'no-es-un-email' }).expect(400);
    await api().post('/v1/auth/reset/confirm').send({}).expect(400);
    await api().post('/v1/auth/reset/confirm').send({ email, code: '12ab34', newPassword: NEW_PW }).expect(400);
    await api().post('/v1/auth/reset/confirm').send({ email, code: '000000', newPassword: 'corta' }).expect(400);
  });
});
