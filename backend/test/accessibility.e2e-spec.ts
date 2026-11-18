import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Accesibilidad (e2e) — camino feliz.
 *
 * Rutas cubiertas (accessibility.controller.ts):
 *   - GET  /v1/accessibility/prefs
 *   - PUT  /v1/accessibility/prefs
 *   - GET  /v1/accessibility/minigames/accessible
 *   - GET  /v1/accessibility/config
 *
 * Módulo de configuración/preferencias: persiste las prefs de accesibilidad del usuario
 * (1 registro con defaults) y expone la config centralizada desde `accessibility.json`.
 * El camino feliz clave: leer prefs actuales, actualizarlas (parcial) y comprobar que la
 * actualización persiste y se devuelve.
 */
describe('Accesibilidad (e2e) — camino feliz', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signup(): Promise<{ token: string; userId: string }> {
    const email = `accessibility_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const me = await api().get('/v1/me').set(auth(token)).expect(200);
    const userId = me.body.id as string;
    createdUsers.push(userId);
    return { token, userId };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const id of createdUsers) {
      await prisma.accessibilityPrefs.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  describe('GET /accessibility/prefs', () => {
    it('devuelve 200 con las prefs actuales y sus defaults (forma real)', async () => {
      const { token } = await signup();
      const res = await api().get('/v1/accessibility/prefs').set(auth(token)).expect(200);
      const body = res.body;

      // Defaults del modelo AccessibilityPrefs.
      expect(body.highContrast).toBe(false);
      expect(body.reduceMotion).toBe(false);
      expect(body.captions).toBe(true);
      expect(body.simpleMode).toBe(false);
      expect(body.reduceHaptics).toBe(false);
      expect(body.fontSizeScale).toBe(100);
      expect(body.colorblindMode).toBeNull();
      // updatedAt se serializa como fecha válida.
      expect(new Date(body.updatedAt).getTime()).not.toBeNaN();
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/accessibility/prefs').expect(401);
    });
  });

  describe('PUT /accessibility/prefs', () => {
    it('actualiza prefs de forma parcial: el cambio persiste y se devuelve', async () => {
      const { token, userId } = await signup();

      const res = await api()
        .put('/v1/accessibility/prefs')
        .set(auth(token))
        .send({ highContrast: true, fontSizeScale: 150, colorblindMode: 'deuteranopia' })
        .expect(200);
      const body = res.body;

      // Los campos enviados se reflejan en la respuesta.
      expect(body.highContrast).toBe(true);
      expect(body.fontSizeScale).toBe(150);
      expect(body.colorblindMode).toBe('deuteranopia');

      // Actualización parcial: los campos no enviados conservan sus defaults.
      expect(body.captions).toBe(true);
      expect(body.simpleMode).toBe(false);

      // Persistencia real en BD.
      const row = await prisma.accessibilityPrefs.findUnique({
        where: { userId },
      });
      expect(row).not.toBeNull();
      expect(row!.highContrast).toBe(true);
      expect(row!.fontSizeScale).toBe(150);
      expect(row!.colorblindMode).toBe('deuteranopia');
    });

    it('clampa fontSizeScale al rango [50,200]', async () => {
      const { token } = await signup();

      const res = await api()
        .put('/v1/accessibility/prefs')
        .set(auth(token))
        .send({ fontSizeScale: 999 })
        .expect(200);
      expect(res.body.fontSizeScale).toBe(200);
    });

    it('acepta colorblindMode=null para desactivarlo', async () => {
      const { token } = await signup();
      await api()
        .put('/v1/accessibility/prefs')
        .set(auth(token))
        .send({ colorblindMode: 'tritanopia' })
        .expect(200);

      const res = await api()
        .put('/v1/accessibility/prefs')
        .set(auth(token))
        .send({ colorblindMode: null })
        .expect(200);
      expect(res.body.colorblindMode).toBeNull();
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().put('/v1/accessibility/prefs').send({ highContrast: true }).expect(401);
    });
  });


  describe('GET /accessibility/minigames/accessible', () => {
    it('devuelve 200 con las variantes accesibles de los minijuegos', async () => {
      const { token } = await signup();
      const res = await api()
        .get('/v1/accessibility/minigames/accessible')
        .set(auth(token))
        .expect(200);
      const body = res.body;

      expect(Array.isArray(body)).toBe(true);
      // Uno por minijuego de balance.json (los 3 clásicos y las 6 Pruebas de los Seis Flujos).
      expect(body).toHaveLength(9);
      for (const item of body) {
        expect(item.accessible).toBe(true);
        expect(item.rewards).toBe('equal');
        expect(item.params).toBeTruthy();
        expect(typeof item.base).toBe('string');
        expect(typeof item.variant).toBe('string');
      }
      // Verifica una variante concreta del config.
      const catchFood = body.find((m: any) => m.base === 'catch_food');
      expect(catchFood).toMatchObject({ variant: 'catch_food_easy' });
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/accessibility/minigames/accessible').expect(401);
    });
  });

  describe('GET /accessibility/config', () => {
    it('devuelve 200 con la config centralizada de accesibilidad', async () => {
      const { token } = await signup();
      const res = await api().get('/v1/accessibility/config').set(auth(token)).expect(200);
      const body = res.body;

      expect(body).toMatchObject({
        highContrast: { minRatio: 7, textMin: 16 },
        fontSize: { min: 50, max: 200, default: 100 },
      });
      expect(Array.isArray(body.colorblindModes)).toBe(true);
      expect(body.colorblindModes).toContain('deuteranopia');
      expect(body.shortcuts).toMatchObject({ feed: 'F', clean: 'C' });
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/accessibility/config').expect(401);
    });
  });
});

