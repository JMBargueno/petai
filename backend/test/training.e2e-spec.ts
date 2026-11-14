import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Training — dungeon elemental de entrenamiento (e2e) — camino feliz.
 *
 * Cubre las 3 rutas del módulo:
 *   POST /v1/training/start        → inicia sesión (5 pisos, 3 corazones, -10 energía)
 *   POST /v1/training/submit       → envía el elemento del piso; con ventaja avanza
 *   GET  /v1/training/active-buff  → devuelve el buff activo del pet
 *
 * PRECONDICIONES REALES leídas de `training.service.ts`:
 *   startTraining:
 *     · pet existe y es del usuario (petsService.getPetById → 404 si no).
 *     · pet.sleeping === false            (sino 400 'durmiendo').
 *     · pet.energy   >= 10 (ENERGY_COST)  (sino 400 'energía').
 *     · No hay TrainingSession activa del mismo user+pet (sino 400).
 *     · sesiones < 20 en las últimas 24h (DAILY_LIMIT).
 *     · Sin otra sesión terminada < 30s atrás (COOLDOWN_SECONDS).
 *     → descuenta 10 energía y crea una sesión `active` con seed random, 5 pisos,
 *       hearts=3, currentFloor=0. Devuelve { sessionId, petId, seed, floors
 *       (con enemyElement), hearts, currentFloor }.
 *   submitFloor:
 *     · Requiere una sesión `active` (userId+petId) — la que crea `start`.
 *     · element debe estar en ['fire','water','plant','electric','shadow','light'].
 *     · Si el elemento tiene VENTAJA sobre floors[currentFloor].enemyElement
 *       → `advanced`, currentFloor++, multiplier = combatCfg.elementAdvantage (>1),
 *       corazones intactos, status sigue `active`.
 *     · (El buff solo se asigna al completar el piso 5 → `completed`.)
 *   getActiveBuff:
 *     · Busca TrainingSession con buffExpiresAt > now y buffMultiplier != null.
 *     · Como el buff solo se fija al completar la dungeon, aquí se siembra el
 *       estado mínimo directo en `prisma` para validar la ruta de lectura.
 *
 * No hay bug de producción en las 3 rutas: se asertan los caminos felices reales.
 * Cada prueba usa un usuario fresco (pet con energía=100, sleeping=false, level=1)
 * para que cooldowns/límites diarios no interpongan.
 */

type Element = 'fire' | 'water' | 'plant' | 'electric' | 'shadow' | 'light';

// Inversa de la tabla ADVANTAGE de training.service.ts: dado el elemento enemigo,
// devuelve un atacante con ventaja garantizada (multiplier = elementAdvantage > 1).
const COUNTER: Record<Element, Element> = {
  plant: 'fire',
  fire: 'water',
  water: 'plant',
  electric: 'plant',
  light: 'shadow',
  shadow: 'light',
};

describe('Training: dungeon elemental (e2e) — happy path', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const createdUsers: string[] = [];

  type U = { token: string; userId: string; petId: string; auth: Record<string, string> };

  /** Helper: register → GET /v1/eggs → POST /v1/eggs/:id/hatch (petId) → GET /v1/me (userId). */
  async function makeUser(): Promise<U> {
    const email = `train_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!', displayName: 'Train Test' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const a = auth(token);
    const eggs = await api().get('/v1/eggs').set(a).expect(200);
    const petId = (await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(a).expect(201)).body
      .id as string;
    const userId = (await api().get('/v1/me').set(a).expect(200)).body.id as string;
    createdUsers.push(userId);
    return { token, userId, petId, auth: a };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => app.close());

  it('POST /v1/training/start → crea sesión activa con 5 pisos, 3 corazones y descuenta energía', async () => {
    const u = await makeUser();

    const energyBefore = (await prisma.pet.findUnique({ where: { id: u.petId } }))!.energy;

    const res = await api()
      .post('/v1/training/start')
      .set(u.auth)
      .send({ petId: u.petId })
      .expect(201);

    const b = res.body;
    // Sesión creada y descripta
    expect(b.petId).toBe(u.petId);
    expect(b.sessionId).toBeTruthy();
    expect(typeof b.seed).toBe('number');
    expect(b.hearts).toBe(3);
    expect(b.currentFloor).toBe(0);
    // Dungeon de 5 pisos, cada uno con un elemento enemigo válido
    expect(Array.isArray(b.floors)).toBe(true);
    expect(b.floors).toHaveLength(5);
    for (const f of b.floors) {
      expect(['fire', 'water', 'plant', 'electric', 'shadow', 'light']).toContain(f.enemyElement);
      expect(typeof f.enemyLevel).toBe('number');
    }

    // Efecto real en BD: sesión `active` + energía descontada (ENERGY_COST = 10)
    const session = await prisma.trainingSession.findUnique({ where: { id: b.sessionId } });
    expect(session!.status).toBe('active');
    expect(session!.hearts).toBe(3);
    expect(session!.currentFloor).toBe(0);
    const pet = await prisma.pet.findUnique({ where: { id: u.petId } });
    expect(pet!.energy).toBeCloseTo(energyBefore - 10, 5);
  });

  it('POST /v1/training/submit → con elemento de ventaja avanza de piso (advanced, multiplier > 1)', async () => {
    const u = await makeUser();

    // Inicia la sesión y lee el elemento enemigo del piso actual para elegir la contra.
    const start = await api()
      .post('/v1/training/start')
      .set(u.auth)
      .send({ petId: u.petId })
      .expect(201);
    const floors = start.body.floors as Array<{ enemyElement: Element }>;
    const playerElement = COUNTER[floors[0].enemyElement];

    // Submit con el elemento que tiene VENTAJA sobre el enemigo → `advanced`.
    const res = await api()
      .post('/v1/training/submit')
      .set(u.auth)
      .send({ petId: u.petId, element: playerElement })
      .expect(201);

    const b = res.body;
    expect(b.result).toBe('advanced');
    expect(b.floor).toBe(0);
    expect(b.currentFloor).toBe(1);
    expect(b.hearts).toBe(3); // sin pérdidas con ventaja
    expect(b.status).toBe('active');
    expect(b.enemyElement).toBe(floors[0].enemyElement);
    expect(b.playerElement).toBe(playerElement);
    expect(b.multiplier).toBeGreaterThan(1); // elementAdvantage del balance

    // Efecto en BD: la sesión avanzó a currentFloor=1, sigue `active`, corazones intactos.
    const session = await prisma.trainingSession.findUnique({ where: { id: start.body.sessionId } });
    expect(session!.currentFloor).toBe(1);
    expect(session!.status).toBe('active');
    expect(session!.hearts).toBe(3);
  });

  it('GET /v1/training/active-buff → retorna el buff activo del pet (estado sembrado)', async () => {
    const u = await makeUser();

    // El buff solo se asigna al completar la dungeon; siembras el estado mínimo en BD.
    const buff = 0.05;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.trainingSession.create({
      data: {
        userId: u.userId,
        petId: u.petId,
        seed: 42,
        floors: [
          { floor: 0, enemyElement: 'fire', enemyName: 'Furnace', enemyLevel: 1 },
        ],
        currentFloor: 5,
        hearts: 3,
        status: 'completed',
        buffMultiplier: buff,
        buffExpiresAt: expiresAt,
        startedAt: new Date(Date.now() - 60 * 1000),
        finishedAt: new Date(Date.now() - 60 * 1000),
        xpAwarded: 50,
        coinsAwarded: 36,
      },
    });

    const res = await api()
      .get('/v1/training/active-buff')
      .set(u.auth)
      .expect(200);

    expect(res.body.active).toBe(true);
    expect(res.body.buff).toMatchObject({
      petId: u.petId,
      multiplier: buff,
      type: 'multiplicator',
      stats: ['atk', 'esp'],
    });
    expect(typeof res.body.buff.expiresAt).toBe('string');
    expect(res.body.buff.remainingMs).toBeGreaterThan(0);
  });
});

