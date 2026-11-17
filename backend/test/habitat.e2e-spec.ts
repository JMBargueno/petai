import * as fs from 'fs';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const dataDir = path.resolve(__dirname, '../../shared/game-data');
const habitatData = JSON.parse(fs.readFileSync(path.join(dataDir, 'habitats.json'), 'utf8'));

/**
 * Hábitat (e2e) — camino feliz. Cubre las 4 rutas del módulo (`habitat.controller.ts`):
 *   - GET    /v1/habitat                    (estado del hábitat: petId + seed + salas)
 *   - POST   /v1/habitat/furniture/:id/place  (colocar mueble: cobra el precio y crea el item)
 *   - GET    /v1/habitat/buffs              (buffs activos agregados de los muebles colocados)
 *   - DELETE /v1/habitat/furniture/:id      (retirar un mueble del hábitat)
 *
 * Precondiciones reales leídas de `habitat.controller.ts` + `habitat.service.ts`:
 *   - Todas las rutas exigen que el usuario tenga una mascota (si no → 404) → se eclosiona un huevo.
 *   - La mascota recién eclosionada está en `stage: 'baby'` (ver `hatching.service.ts:182`); la sala
 *     "sala" se desbloquea en 'baby', así que se puede colocar ahí sin evolucionar.
 *   - `place` NO exige posesión de inventario del mueble. Exige (a) saldo suficiente vía
 *     `WalletService.debit` y (b) que el hábitat YA EXISTA en BD (`tx.habitat.findUnique`,
 *     `habitat.service.ts:86` — si no existe lanza 'Habitat not found for this pet'). Por eso siembra
 *     coins y llama GET /v1/habitat ANTES de colocar (esa raíz inicializa el hábitat).
 */
describe('Hábitat (e2e) — camino feliz', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** register → GET /v1/eggs → POST /v1/eggs/:id/hatch (petId) → GET /v1/me (userId). */
  async function createPetUser() {
    const email = `habitat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const authH = auth(token);

    const eggs = await api().get('/v1/eggs').set(authH).expect(200);
    const eggId = eggs.body[0].id as string;
    const pet = await api().post(`/v1/eggs/${eggId}/hatch`).set(authH).expect(201);
    const petId = pet.body.id as string;

    const me = await api().get('/v1/me').set(authH).expect(200);
    const userId = me.body.id as string;
    createdUsers.push(userId);

    return { token, authH, userId, petId };
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
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  describe('GET /v1/habitat (raíz)', () => {
    it('a) devuelve el estado del hábitat: petId, seed y las 4 salas; la sala inicial está desbloqueada y activa', async () => {
      const { authH, petId } = await createPetUser();

      const res = await api().get('/v1/habitat').set(authH).expect(200);
      const body = res.body;

      expect(body.petId).toBe(petId);
      expect(typeof body.habitatSeed).toBe('number');
      expect(Array.isArray(body.rooms)).toBe(true);
      // `buildHabitatResponse` mapea TODAS las salas definidas en game-data (4).
      expect(body.rooms).toHaveLength(habitatData.rooms.length);

      // La sala "sala" (unlockStage 'baby') está desbloqueada y activa para una pet en stage 'baby'.
      const sala = body.rooms.find((r: any) => r.id === 'sala');
      expect(sala).toMatchObject({ unlocked: true, active: true, items: [] });

      // El jardín (unlockStage 'juvenile') sigue bloqueado/inactivo para una baby.
      const jardin = body.rooms.find((r: any) => r.id === 'jardin');
      expect(jardin).toMatchObject({ unlocked: false, active: false });

      // Efecto real: la raíz inicializa el hábitat en BD con la sala activa.
      const habitat = await prisma.habitat.findUnique({ where: { petId } });
      expect(habitat).not.toBeNull();
      expect(habitat!.rooms).toContain('sala');
    });
  });

  describe('GET /v1/habitat/catalog', () => {
    it('devuelve 200 con salas, muebles y topes de buffs (contrato del game-data)', async () => {
      const { authH } = await createPetUser();
      const res = await api().get('/v1/habitat/catalog').set(authH).expect(200);
      const body = res.body;

      expect(Array.isArray(body.rooms)).toBe(true);
      expect(body.rooms).toHaveLength(habitatData.rooms.length);
      expect(Array.isArray(body.furniture)).toBe(true);
      expect(body.furniture.length).toBeGreaterThanOrEqual(1);
      for (const f of body.furniture) {
        expect(f.id).toBeTruthy();
        expect(f.room).toBeTruthy();
        expect(f.price).toBeGreaterThanOrEqual(0);
        expect(['coins', 'gems']).toContain(f.currency);
      }
      expect(body.buffCaps).toMatchObject({
        hygiene_decay_reduction_max: 0.4,
        happiness_decay_reduction_max: 0.3,
      });
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/habitat/catalog').expect(401);
    });
  });

  describe('furniture: place → buffs → remove (flujo secuencial)', () => {
    // Un solo usuario atraviesa el flujo completo; cada prueba asume el estado de la anterior.
    let authH: Record<string, string>;
    let userId: string;
    let petId: string;

    beforeAll(async () => {
      const u = await createPetUser();
      authH = u.authH;
      userId = u.userId;
      petId = u.petId;
      // Saldo suficiente para todos los muebles del flujo (incl. el test del cap de buffs):
      // fountain(400)+soft_bed(600)+toy_ball(400)+3×fountain(1200) = 2600.
      await prisma.user.update({ where: { id: userId }, data: { coins: 5000, gems: 10 } });
      // Precondición real de `place`: el hábitat debe existir. La raíz lo inicializa.
      await api().get('/v1/habitat').set(authH).expect(200);
    });

    it('b) place: coloca un mueble (201), cobra el precio en coins y lo refleja en el hábitat', async () => {
      const coinsBefore = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coins;
      const furniture = habitatData.furniture.find((f: any) => f.id === 'fountain_water')!;

      const res = await api()
        .post('/v1/habitat/furniture/fountain_water/place')
        .set(authH)
        .expect(201);

      expect(res.body).toMatchObject({
        message: 'Furniture placed',
        furnitureId: 'fountain_water',
        room: 'sala',
      });

      // Efecto real de la economía: se descuenta el precio del mueble (coins).
      const coinsAfter = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coins;
      expect(coinsAfter).toBe(coinsBefore - furniture.price);

      // Y se crea el item en BD, en la sala del mueble.
      const item = await prisma.habitatItem.findFirst({
        where: { petId, furnitureId: 'fountain_water' },
      });
      expect(item).not.toBeNull();
      expect(item!.roomId).toBe('sala');

      // Y aparece en la raíz del hábitat dentro de la sala.
      const root = await api().get('/v1/habitat').set(authH).expect(200);
      const sala = root.body.rooms.find((r: any) => r.id === 'sala');
      expect(sala.items).toHaveLength(1);
      expect(sala.items[0].furnitureId).toBe('fountain_water');
    });

    it('c) buffs: devuelve los buffs activos agregados de los muebles colocados', async () => {
      // Colocamos dos muebles más para que la agregación de buffs sea observable.
      await api().post('/v1/habitat/furniture/soft_bed/place').set(authH).expect(201);
      await api().post('/v1/habitat/furniture/toy_ball/place').set(authH).expect(201);

      const res = await api().get('/v1/habitat/buffs').set(authH).expect(200);
      const body = res.body;

      expect(body.petId).toBe(petId);
      expect(body.itemCount).toBe(3);
      // fountain_water (hygiene 0.15) + soft_bed (energy 0.20) + toy_ball (happiness 0.10).
      expect(body.activeBuffs).toMatchObject({
        hygiene_decay_reduction: 0.15,
        energy_recovery_boost: 0.2,
        happiness_decay_reduction: 0.1,
      });
      // Los valores están por debajo de sus topes (0.40/0.40/0.30), así que se devuelven sin topar.
      // (El cap sí se aplica cuando se supera: ver el test e).)
    });

    it('d) remove: retira un mueble (200) y deja de contarse en el hábitat y en los buffs', async () => {
      const res = await api()
        .delete('/v1/habitat/furniture/fountain_water')
        .set(authH)
        .expect(200);
      expect(res.body).toMatchObject({
        message: 'Furniture removed',
        furnitureId: 'fountain_water',
      });

      // Ya no hay item de fountain_water en BD.
      const item = await prisma.habitatItem.findFirst({
        where: { petId, furnitureId: 'fountain_water' },
      });
      expect(item).toBeNull();

      // La sala ahora tiene 2 muebles y los buffs ya no incluyen hygiene_decay_reduction.
      const root = await api().get('/v1/habitat').set(authH).expect(200);
      const sala = root.body.rooms.find((r: any) => r.id === 'sala');
      expect(sala.items).toHaveLength(2);

      const buffs = (await api().get('/v1/habitat/buffs').set(authH).expect(200)).body;
      expect(buffs.itemCount).toBe(2);
      expect(buffs.activeBuffs).not.toHaveProperty('hygiene_decay_reduction');
    });

    it('e) buffs: al superar el tope (cap) el valor se limita al máximo del catálogo', async () => {
      // fountain_water da hygiene_decay_reduction 0.15 por unidad. Colocando 3 (0.45 > cap 0.40),
      // el buff debe toparse en 0.40 (buffCaps.hygiene_decay_reduction_max) y no en la suma cruda.
      await api().post('/v1/habitat/furniture/fountain_water/place').set(authH).expect(201);
      await api().post('/v1/habitat/furniture/fountain_water/place').set(authH).expect(201);
      await api().post('/v1/habitat/furniture/fountain_water/place').set(authH).expect(201);

      const buffs = (await api().get('/v1/habitat/buffs').set(authH).expect(200)).body;
      expect(buffs.itemCount).toBe(5); // soft_bed + toy_ball + 3× fountain_water
      expect(buffs.activeBuffs.hygiene_decay_reduction).toBe(0.4); // topado (sin fix: 0.45)
    });
  });

  describe('colocación isométrica: posición, giro, movimiento y borrado por item', () => {
    let authH: Record<string, string>;
    let userId: string;
    let petId: string;

    beforeAll(async () => {
      const u = await createPetUser();
      authH = u.authH;
      userId = u.userId;
      petId = u.petId;
      await prisma.user.update({ where: { id: userId }, data: { coins: 5000, gems: 10 } });
      await api().get('/v1/habitat').set(authH).expect(200);
    });

    it('coloca en una celda concreta con giro y devuelve itemId, x, y y rotation', async () => {
      // soft_bed tiene huella 2×1; girada (rotation 1) ocupa 1×2.
      const res = await api()
        .post('/v1/habitat/furniture/soft_bed/place')
        .set(authH)
        .send({ x: 13, y: 0, rotation: 1 })
        .expect(201);
      expect(res.body).toMatchObject({ furnitureId: 'soft_bed', room: 'sala', x: 13, y: 0, rotation: 1 });
      expect(typeof res.body.itemId).toBe('string');

      const root = await api().get('/v1/habitat').set(authH).expect(200);
      const sala = root.body.rooms.find((r: any) => r.id === 'sala');
      expect(sala.theme).toMatchObject({ floor: expect.stringMatching(/^#/) });
      expect(sala.items[0]).toMatchObject({ id: res.body.itemId, x: 13, y: 0, rotation: 1 });
    });

    it('rechaza posiciones fuera de la sala, solapadas o de pared lejos de la pared, sin cobrar', async () => {
      const before = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coins;
      await api().post('/v1/habitat/furniture/soft_bed/place').set(authH).send({ x: 13, y: 0, rotation: 0 }).expect(400);
      await api().post('/v1/habitat/furniture/toy_ball/place').set(authH).send({ x: 13, y: 1 }).expect(400);
      await api().post('/v1/habitat/furniture/wall_shelf/place').set(authH).send({ x: 4, y: 3 }).expect(400);
      await api().post('/v1/habitat/furniture/toy_ball/place').set(authH).send({ x: 2 }).expect(400); // x sin y
      const after = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coins;
      expect(after).toBe(before);
    });

    it('PATCH mueve y gira sin coste; DELETE por item quita ese mueble', async () => {
      const placed = await api()
        .post('/v1/habitat/furniture/toy_ball/place')
        .set(authH)
        .send({ x: 2, y: 2 })
        .expect(201);
      const coins = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coins;

      const moved = await api()
        .patch(`/v1/habitat/items/${placed.body.itemId}`)
        .set(authH)
        .send({ x: 5, y: 6 })
        .expect(200);
      expect(moved.body).toMatchObject({ itemId: placed.body.itemId, x: 5, y: 6 });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coins).toBe(coins);

      // Encima de la cama (13,0–13,1) no se puede.
      await api().patch(`/v1/habitat/items/${placed.body.itemId}`).set(authH).send({ x: 13, y: 1 }).expect(400);
      await api().patch('/v1/habitat/items/no-existe').set(authH).send({ x: 1, y: 1 }).expect(404);

      await api().delete(`/v1/habitat/items/${placed.body.itemId}`).set(authH).expect(200);
      const gone = await prisma.habitatItem.findUnique({ where: { id: placed.body.itemId } });
      expect(gone).toBeNull();
      expect(await prisma.habitatItem.count({ where: { petId } })).toBe(1); // queda la cama
    });
  });
});
