import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Modding / Workshop (e2e) — camino feliz (feature 024).
 *
 * Cubre las 8 rutas públicas del módulo:
 *   POST   /v1/modding/publish
 *   GET    /v1/modding/workshop
 *   GET    /v1/modding/:id
 *   POST   /v1/modding/:id/rate
 *   POST   /v1/modding/:id/report
 *   POST   /v1/modding/:id/download
 *   PATCH  /v1/modding/:id
 *   DELETE /v1/modding/:id
 *
 * PRECONDICIONES REALES leídas del service (modding.service.ts) + schemas zod (modding.schemas.ts):
 *   · publish valida con `publishModSchema` (S-10, `.strict()` → rechaza campos sobrantes).
 *     Body mínimo válido: `{ type, name, data }` con `data` NO vacío. `description` default ''.
 *     `validateData` exige por tipo: species → data.stats(baseStats)+data.element (stats ≤999);
 *     furniture → data.buff|data.effect; minigame → data.api. `rarity` si se envía:
 *     common/rare/super_rare/legendary/mythic. Rate-limit: 5 pub/día (R-05, TTL en Redis).
 *   · report (S-17): ÚNICO por usuario+mod → happy-path usa un usuario que reporta una sola vez.
 *     `reason` obligatorio. 3 reports → auto-hidden.
 *   · rate: `stars` entero 1..5 (upsert por modId+userId). Media pública solo con ≥3 ratings.
 *   · download: dedup por (modId, userId, petId). `petId` opcional; devuelve `snapshot: mod.data`.
 *     minigame además devuelve `minigameSandbox`.
 *   · update / remove: SOLO el creator (else 403). remove es soft (`status: 'deleted'`).
 *
 * NOTA: `publish` funciona vía API, así que cada test publica un mod real y reutiliza su `id`
 * para las demás rutas. Cada test usa usuarios frescos para que el rate-limit diario (5) y la
 * unicidad de report no acoplen pruebas.
 */
describe('Modding / Workshop (e2e) — happy path', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const createdMods: string[] = [];
  const createdUsers: string[] = [];

  type U = { token: string; userId: string };

  /** Helper: POST /v1/auth/register → 201 → GET /v1/me (userId). Email único por run. */
  async function makeUser(): Promise<U> {
    const email = `mod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!', displayName: 'Mod Test' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const userId = (await api().get('/v1/me').set(auth(token)).expect(200)).body.id as string;
    createdUsers.push(userId);
    return { token, userId };
  }

  /** Body mínimo válido de `publish` (furniture: sin sprite/minigame, el más autocontenido). */
  const furnitureMod = (name: string) => ({
    type: 'furniture',
    name,
    description: 'Mueble de prueba del workshop',
    rarity: 'common',
    data: { buff: { stat: 'luck', value: 1 } },
  });

  type Published = { id: string } & Record<string, unknown>;
  /** Publica un mod vía API (camino feliz real) y registra su id para limpieza. */
  async function publish(token: string, body: object = furnitureMod('Sofa Mágico')): Promise<Published> {
    const res = await api().post('/v1/modding/publish').set(auth(token)).send(body).expect(201);
    const out = res.body as Published;
    createdMods.push(out.id);
    return out;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const id of createdMods) {
      await prisma.mod.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdUsers) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  describe('POST /v1/modding/publish', () => {
    it('publica un mod válido y devuelve el snapshot público (S-10)', async () => {
      const u = await makeUser();
      const body = { ...furnitureMod('Silla Común'), spriteUrl: 'https://cdn.petai.local/silla.svg' };
      const res = await api().post('/v1/modding/publish').set(auth(u.token)).send(body).expect(201);
      const m = res.body as Record<string, unknown>;
      expect(m).toMatchObject({
        type: 'furniture',
        name: 'Silla Común',
        description: 'Mueble de prueba del workshop',
        rarity: 'common',
        status: 'published',
        creatorId: u.userId,
        downloads: 0,
        ratingCount: 0,
        reportCount: 0,
        spriteUrl: 'https://cdn.petai.local/silla.svg',
      });
      expect(m).toHaveProperty('id', expect.any(String));
      expect(m.avgRating).toBeNull();
      expect(m.data).toEqual({ buff: { stat: 'luck', value: 1 } });
    });

    it('acepta un mod de especie con stats/element válidos', async () => {
      const u = await makeUser();
      const body = {
        type: 'species',
        name: 'Fénix',
        description: 'Ave legendaria',
        element: 'fire',
        rarity: 'legendary',
        data: { element: 'fire', stats: { hp: 100, atk: 42, def: 30 } },
      };
      const res = await api().post('/v1/modding/publish').set(auth(u.token)).send(body).expect(201);
      expect(res.body).toMatchObject({ type: 'species', element: 'fire', rarity: 'legendary' });
      expect(res.body.data).toMatchObject({ element: 'fire', stats: { hp: 100, atk: 42, def: 30 } });
    });
  });

  describe('GET /v1/modding/workshop', () => {
    it('lista mods publicados con filtros y paginación', async () => {
      const u = await makeUser();
      const name = `Estatua${Date.now().toString(36).toUpperCase()}`;
      const created = await publish(u.token, furnitureMod(name));

      const res = await api()
        .get(`/v1/modding/workshop?type=furniture&q=${encodeURIComponent(name)}&limit=50`)
        .expect(200);
      const page = res.body as { items: unknown[]; total: number; page: number; limit: number; pages: number };
      expect(page.items.length).toBeGreaterThanOrEqual(1);
      expect(page.total).toBeGreaterThanOrEqual(1);
      expect(page.page).toBe(1);
      expect(page.limit).toBe(50);
      // El mod recién publicado aparece (búsqueda por nombre, insensible a mayúsculas).
      const hit = page.items.find((i) => (i as Record<string, unknown>).id === created.id);
      expect(hit).toBeDefined();
    });
  });

  describe('GET /v1/modding/:id', () => {
    it('devuelve el detalle del mod (snapshot público)', async () => {
      const u = await makeUser();
      const created = await publish(u.token, furnitureMod('Mesa Ejecutiva'));
      const res = await api().get(`/v1/modding/${created.id}`).expect(200);
      expect(res.body).toMatchObject({
        id: created.id,
        type: 'furniture',
        name: 'Mesa Ejecutiva',
        status: 'published',
        creatorId: u.userId,
      });
      expect(res.body.data).toEqual({ buff: { stat: 'luck', value: 1 } });
    });
  });

  describe('POST /v1/modding/:id/rate', () => {
    it('registra un rating de 1-5 y actualiza el agregado', async () => {
      const creator = await makeUser();
      const rater = await makeUser();
      const created = await publish(creator.token, furnitureMod('Lámpara'));

      const res = await api()
        .post(`/v1/modding/${created.id}/rate`)
        .set(auth(rater.token))
        .send({ stars: 5, rating: 'Genial' })
        .expect(201);
      expect(res.body).toMatchObject({ modId: created.id, average: 5, count: 1, showAverage: false });

      const row = await prisma.mod.findUnique({ where: { id: created.id } });
      expect(row!.ratingCount).toBe(1);
      expect(row!.avgRating).toBe(5);
    });
  });

  describe('POST /v1/modding/:id/report', () => {
    it('registra el primer report (S-17) y no oculta con 1 solo report', async () => {
      const creator = await makeUser();
      const reporter = await makeUser();
      const created = await publish(creator.token, furnitureMod('Carpeta'));

      const res = await api()
        .post(`/v1/modding/${created.id}/report`)
        .set(auth(reporter.token))
        .send({ reason: 'contenido inapropiado', details: 'detalle' })
        .expect(201);
      expect(res.body).toMatchObject({ reportCount: 1, hidden: false });
      expect(res.body).toHaveProperty('reportId', expect.any(String));

      const row = await prisma.mod.findUnique({ where: { id: created.id } });
      expect(row!.reportCount).toBe(1);
      expect(row!.status).toBe('published');
    });
  });

  describe('POST /v1/modding/:id/download', () => {
    it('registra la descarga, devuelve el snapshot e incrementa downloads', async () => {
      const creator = await makeUser();
      const downloader = await makeUser();
      const created = await publish(creator.token, furnitureMod('Arcón'));

      const res = await api()
        .post(`/v1/modding/${created.id}/download`)
        .set(auth(downloader.token))
        .send({})
        .expect(201);
      expect(res.body).toMatchObject({ message: 'Mod descargado' });
      expect(res.body.snapshot).toEqual({ buff: { stat: 'luck', value: 1 } });
      expect(res.body.minigameSandbox).toBeUndefined();

      const row = await prisma.mod.findUnique({ where: { id: created.id } });
      expect(row!.downloads).toBe(1);
    });
  });

  describe('PATCH /v1/modding/:id', () => {
    it('el creator actualiza campos parciales del mod', async () => {
      const u = await makeUser();
      const created = await publish(u.token, furnitureMod('Taburete'));

      const res = await api()
        .patch(`/v1/modding/${created.id}`)
        .set(auth(u.token))
        .send({ name: 'Taburete V2', rarity: 'rare' })
        .expect(200);
      expect(res.body).toMatchObject({ id: created.id, name: 'Taburete V2', rarity: 'rare' });

      const row = await prisma.mod.findUnique({ where: { id: created.id } });
      expect(row!.name).toBe('Taburete V2');
      expect(row!.rarity).toBe('rare');
    });
  });

  describe('DELETE /v1/modding/:id', () => {
    it('el creator borra el mod (soft) y deja de estar disponible', async () => {
      const u = await makeUser();
      const created = await publish(u.token, furnitureMod('Tapiz'));

      const res = await api().delete(`/v1/modding/${created.id}`).set(auth(u.token)).expect(200);
      expect(res.body).toMatchObject({ message: 'Mod borrado', snapshotPreserved: true });

      const row = await prisma.mod.findUnique({ where: { id: created.id } });
      expect(row!.status).toBe('deleted');
      await api().get(`/v1/modding/${created.id}`).expect(404);
    });
  });
});

