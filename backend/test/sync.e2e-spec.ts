import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SyncAction } from '../src/modules/sync/delta-sync.service';

/**
 * Sync / sincronía offline (e2e) — camino feliz (S-07).
 *
 * Rutas cubiertas (sync.controller.ts, módulo `sync`):
 *   - POST /v1/sync/push  — empuja un lote de acciones offline (200).
 *   - GET  /v1/sync/pull  — recupera los deltas acumulados desde una `sinceVersion` (200).
 *   - GET  /v1/sync/status— estado de sincronía del usuario (200).
 *
 * PRECONDICIONES REALES leídas de delta-sync.service.ts (sin adivinar):
 *   · El estado vive POR USUARIO en Redis (`sync:*:{userId}`, TTL `SYNC_STATE_TTL_MS`); si
 *     Redis no responde, hay un respaldo en memoria por usuario. Aquí Redis sí está arriba,
 *     así que cada push/pull refleja lo persistido en la clave del usuario.
 *   · `push` exige acciones válidas: `type` del enum, y —clave— OWNERSHIP: cada `petId`
 *     debe ser una `Pet` del usuario (`Pet.userId === user.id`). Las ajenas → rechazadas
 *     con `reason: 'ownership'` y NO mutan el estado.
 *   · `push` incrementa `version` UNA vez por lote y aplica cada acción al estado
 *     (`pet:{petId}`): feed → hunger+15, play → happiness+10/energy-10, etc., partiendo
 *     del estado inicial (80 en cada vital) cuando la mascota no está aún en el estado.
 *   · `pull(sinceVersion)` filtra por `version > sinceVersion` (no por timestamp), devolviendo
 *     los deltas pendientes y la `version` actual.
 */
describe('Sync: push, pull y status (e2e) — happy path', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const createdUsers: string[] = [];
  const createdPets: string[] = [];

  type U = { token: string; userId: string; auth: Record<string, string> };

  /**
   * Siembra un pet propio del usuario usando la primera species y el primer pattern
   * existentes en BD (ids reales → FK válidas). Determinista: sin aleatoriedad.
   */
  async function seedPet(userId: string, nickname: string) {
    const [sp, pat] = await Promise.all([
      prisma.species.findFirst(),
      prisma.pattern.findFirst(),
    ]);
    if (!sp || !pat) throw new Error('BD no sembrada: falta species/pattern');
    const pet = await prisma.pet.create({
      data: {
        userId,
        speciesId: sp.id,
        rarity: 'normal',
        patternId: pat.id,
        palette: { primary: '#123456', secondary: '#654321', accent: '#000000' },
        shiny: false,
        visualSeed: 123456,
        nickname,
        level: 1,
        xp: 0,
        stage: 'baby',
        combatStats: { hp: 100, atk: 50, def: 40, vel: 30, esp: 20 },
      },
    });
    createdPets.push(pet.id);
    return pet;
  }

  async function signup(): Promise<U> {
    const email = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!', displayName: 'Sync Test' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const a = auth(token);
    const userId = (await api().get('/v1/me').set(a).expect(200)).body.id as string;
    createdUsers.push(userId);
    return { token, userId, auth: a };
  }

  const act = (id: string, petId: string, type: SyncAction['type'] = 'feed'): SyncAction => ({
    id,
    petId,
    type,
    args: {},
    timestamp: Date.now(),
  });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const id of createdPets) {
      await prisma.pet.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdUsers) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  describe('POST /v1/sync/push', () => {
    it('aplica un lote de acciones propias: nueva versión, applied y estado actualizado', async () => {
      const { userId, auth: a } = await signup();
      const pet = await seedPet(userId, 'Sync Pet');

      // Lote de dos acciones sobre la misma mascota propia: feed + play.
      const actions = [act('a1', pet.id, 'feed'), act('a2', pet.id, 'play')];
      const res = await api().post('/v1/sync/push').set(a).send({ actions }).expect(200);
      const body = res.body;

      // Un solo push → una sola versión; ambas acciones aplicadas, nada rechazado.
      expect(body.newVersion).toBe(1);
      expect(body.applied).toEqual(['a1', 'a2']);
      expect(body.rejected).toEqual([]);

      // Estado por mascota (`pet:{petId}`) partiendo de 80 en cada vital:
      // feed → hunger 80+15=95; play → happiness 80+10=90, energy 80-10=70.
      const petState = body.state[`pet:${pet.id}`] as Record<string, number>;
      expect(petState.hunger).toBe(95);
      expect(petState.happiness).toBe(90);
      expect(petState.energy).toBe(70);
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().post('/v1/sync/push').send({ actions: [act('a1', 'pet')] }).expect(401);
    });
  });
  describe('GET /v1/sync/pull', () => {
    it('recupera los deltas persistidos y la versión actual desde versión 0', async () => {
      const { userId, auth: a } = await signup();
      const pet = await seedPet(userId, 'Pull Pet');

      // Dos pushes separados → dos versiones (1 y 2) con su delta cada una.
      await api().post('/v1/sync/push').set(a).send({ actions: [act('a1', pet.id, 'feed')] }).expect(200);
      await api().post('/v1/sync/push').set(a).send({ actions: [act('a2', pet.id, 'play')] }).expect(200);

      const res = await api().get('/v1/sync/pull').set(a).expect(200);
      const body = res.body;
      expect(body.version).toBe(2);
      expect(Array.isArray(body.deltas)).toBe(true);
      expect(body.deltas).toHaveLength(2);

      // Deltas en orden de versión, cada uno con su petId y el tipo de acción.
      expect(body.deltas.map((d: { version: number }) => d.version)).toEqual([1, 2]);
      for (const d of body.deltas) {
        expect(d.petId).toBe(pet.id);
        expect(d.changes.action).toBeDefined();
        expect(typeof d.timestamp).toBe('number');
      }
      expect(body.deltas[0].changes.action).toBe('feed');
      expect(body.deltas[1].changes.action).toBe('play');
    });

    it('filtra por `version > sinceVersion` (pull incremental)', async () => {
      const { userId, auth: a } = await signup();
      const pet = await seedPet(userId, 'Delta Pet');

      await api().post('/v1/sync/push').set(a).send({ actions: [act('a1', pet.id, 'feed')] }).expect(200);
      await api().post('/v1/sync/push').set(a).send({ actions: [act('a2', pet.id, 'clean')] }).expect(200);
      await api().post('/v1/sync/push').set(a).send({ actions: [act('a3', pet.id, 'sleep')] }).expect(200);

      // sinceVersion=1 → solo los deltas de la versión 2 y 3 (los posteriores a 1).
      const since1 = await api().get('/v1/sync/pull?sinceVersion=1').set(a).expect(200);
      expect(since1.body.version).toBe(3);
      expect(since1.body.deltas).toHaveLength(2);
      expect(since1.body.deltas.map((d: { version: number }) => d.version)).toEqual([2, 3]);

      // sinceVersion=3 → nada pendiente (el cliente ya está al día).
      const since3 = await api().get('/v1/sync/pull?sinceVersion=3').set(a).expect(200);
      expect(since3.body.version).toBe(3);
      expect(since3.body.deltas).toEqual([]);
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/sync/pull').expect(401);
    });
  });

  describe('GET /v1/sync/status', () => {
    it('refleja la versión y la última sincronía tras un push', async () => {
      const { userId, auth: a } = await signup();
      const pet = await seedPet(userId, 'Status Pet');

      await api().post('/v1/sync/push').set(a).send({ actions: [act('a1', pet.id, 'feed')] }).expect(200);

      const res = await api().get('/v1/sync/status').set(a).expect(200);
      const body = res.body;
      expect(body.version).toBe(1);
      expect(body.pendingCount).toBe(0);
      expect(body.lastSyncAt).not.toBeNull();
      expect(new Date(body.lastSyncAt).getTime()).not.toBeNaN();
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().get('/v1/sync/status').expect(401);
    });
  });

  describe('Ownership (S-07)', () => {
    it('rechaza acciones sobre una mascota ajena sin mutar el estado propio', async () => {
      const ownerA = await signup();
      const ownerB = await signup();
      const petA = await seedPet(ownerA.userId, 'A pet');
      const petB = await seedPet(ownerB.userId, 'B pet');

      // El usuario A intenta empujar una acción propia y una sobre el pet de B.
      const actions = [act('own', petA.id, 'feed'), act('foreign', petB.id, 'play')];
      const res = await api().post('/v1/sync/push').set(ownerA.auth).send({ actions }).expect(200);
      const body = res.body;

      // La acción ajena se rechaza por ownership; la propia se aplica.
      expect(body.applied).toEqual(['own']);
      expect(body.rejected).toEqual([{ actionId: 'foreign', reason: 'ownership' }]);
      expect(body.newVersion).toBe(1);
      expect(body.state[`pet:${petA.id}`]).toBeDefined();
      expect(body.state[`pet:${petB.id}`]).toBeUndefined();

      // B no ve ningún delta de A: su pull sigue vacío.
      const pullB = await api().get('/v1/sync/pull').set(ownerB.auth).expect(200);
      expect(pullB.body.deltas).toEqual([]);
    });
  });
});
