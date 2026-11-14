import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

const DAY_MS = 24 * 3600 * 1000;
// Vida del boss que sembramos: muy por encima de `maxDamagePerAttack` (50.000 por defecto)
// para que un ataque nunca liquide el raid y no dispare `settle` de forma accidental.
const RAID_HP_GLOBAL = 1_000_000;
// Coste de energía por ataque (default del cfg de raids, `balance.json` no define `raids`).
const ENERGY_COST = 15;

/**
 * Raid / Jefe global (e2e) — camino feliz.
 *
 * Cubre el módulo `raid` (raid.controller.ts):
 *   - GET  /v1/raid/current      → jefe activo con su HP global y contribuciones.
 *   - POST /v1/raid/attack       → resta HP al jefe con descuento ATOMICO de energía y suma daño.
 *   - GET  /v1/raid/leaderboard  → refleja el daño aportado (top de RaidParticipant).
 *   - GET  /v1/raid/history      → raids pasadas (status `settled`).
 *
 * El raid es GLOBAL (getActiveRaid elige el raid `active` de `startedAt` más reciente), así que
 * para que el test sea determinista y aislado: expiramos cualquier raid activo pendiente y
 * sembramos uno propio, fresco y con vida completa, en beforeAll.
 */
describe('Raid: jefe global, ataque, leaderboard e historial (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];
  let raidId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /**
   * Crea un entrenador + mascota fuerte (nivel alto, ataque reforzado) con energía suficiente
   * y `lastTickAt` fresco, para que el ataque garantice daño > 0 y el tick perezoso no decaiga
   * la energía de forma relevante (descuento observable = ENERGY_COST).
   */
  async function signup(opts: { level?: number; atk?: number; energy?: number } = {}) {
    const reg = await api().post('/v1/auth/register').send({
      email: `raid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@petai.local`,
      password: 'Password123!',
      displayName: 'Entrenador Raid',
    }).expect(201);
    const token = reg.body.accessToken as string;
    const a = auth(token);
    const eggs = await api().get('/v1/eggs').set(a).expect(200);
    const petId = (await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(a).expect(201)).body.id as string;
    const userId = (await api().get('/v1/me').set(a).expect(200)).body.id as string;
    createdUsers.push(userId);

    const level = opts.level ?? 30;
    const pet = await prisma.pet.findUniqueOrThrow({ where: { id: petId } });
    await prisma.pet.update({
      where: { id: petId },
      data: {
        level,
        sleeping: false,
        energy: opts.energy ?? 100,
        lastTickAt: new Date(),
        combatStats: {
          ...(pet.combatStats as any),
          allocated: { atk: opts.atk ?? 400, esp: 100, def: 60, hp: 120, vel: 60 },
        } as any,
      },
    });
    return { token, auth: a, userId, petId };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    // Aíslamos el raid global: expiramos lo que haya activo y sembramos uno propio.
    await prisma.raid.updateMany({ where: { status: 'active' }, data: { status: 'expired', endedAt: new Date() } });
    const now = new Date();
    const raid = await prisma.raid.create({
      data: {
        element: 'fire',
        theme: 'Inferno Dragon',
        // Nivel bajo a propósito: el daño del ataque es `bossMaxHp - bossFinalHp` de una simulación
        // completa (raid.service.ts). Con un jefe lvl-50, un pet lvl-30 a veces no llega a herirlo
        // (daño 0 según la semilla) → flake. Con un jefe débil el pet siempre inflige daño > 0.
        level: 10,
        hpGlobal: RAID_HP_GLOBAL,
        hpRemaining: RAID_HP_GLOBAL,
        status: 'active',
        startedAt: now,
        endsAt: new Date(now.getTime() + DAY_MS),
      },
    });
    raidId = raid.id;

    // Limpio la caché de lectura `raid:current:*` para que `current` recalculé fresco.
    await redis
      .run(async (r) => {
        const keys = await r.keys(`${redis.key('raid:current:')}*`);
        if (keys.length) await r.del(...keys);
      })
      .catch(() => {});
  });

  afterAll(async () => {
    for (const id of createdUsers) await prisma.user.delete({ where: { id } }).catch(() => {});
    await app.close();
  });


  describe('GET /v1/raid/current', () => {
    it('a) devuelve el jefe activo con su shape, HP completo y sin contribuciones propias', async () => {
      const { token } = await signup();

      const res = await api().get('/v1/raid/current').set(auth(token)).expect(200);
      const b = res.body;

      expect(b.id).toBe(raidId);
      expect(b.status).toBe('active');
      expect(b.theme).toBe('Inferno Dragon');
      expect(b.element).toBe('fire');
      expect(b.level).toBe(10);
      expect(b.hpGlobal).toBe(RAID_HP_GLOBAL);
      expect(b.hpRemaining).toBe(RAID_HP_GLOBAL);
      expect(b.hpPercent).toBe(100);
      expect(b.participantCount).toBe(0);
      expect(b.myContribution).toBeNull();
      expect(b.startedAt).toEqual(expect.any(String));
      expect(b.endsAt).toEqual(expect.any(String));

      // El guard exige JWT.
      await api().get('/v1/raid/current').expect(401);
    });
  });

  describe('POST /v1/raid/attack', () => {
    it('b) resta HP al jefe, descuenta energía de forma atómica y registra el daño', async () => {
      const { token, petId, userId } = await signup({ energy: 100 });

      const before = await prisma.raid.findUniqueOrThrow({ where: { id: raidId }, select: { hpRemaining: true } });
      const petBefore = await prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { energy: true } });

      // `@Post()` sin `@HttpCode(200)`: NestJS responde 201 Created por defecto.
      const res = await api().post('/v1/raid/attack').set(auth(token)).send({ petId }).expect(201);
      const body = res.body;

      // Shape real de la respuesta.
      expect(typeof body.damage).toBe('number');
      expect(body.damage).toBeGreaterThan(0);
      expect(typeof body.seed).toBe('number');
      expect(typeof body.rounds).toBe('number');
      expect(['pet won', 'boss won', 'draw']).toContain(body.result);
      expect(body.hpRemaining).toBeGreaterThanOrEqual(0);
      expect(typeof body.hpPercent).toBe('number');
      expect(typeof body.settled).toBe('boolean');
      expect(body.settled).toBe(false); // 1 ataque no liquida un boss de 1M de vida
      expect(body.replay).toEqual(expect.any(Object));

      // 1) El HP del jefe baja EXACTAMENTE por el daño declarado.
      const after = await prisma.raid.findUniqueOrThrow({ where: { id: raidId }, select: { hpRemaining: true } });
      expect(before.hpRemaining - after.hpRemaining).toBe(body.damage);
      expect(body.hpRemaining).toBe(after.hpRemaining);

      // 2) La energía del usuario se descuenta en el coste del ataque (descuento atómico).
      const petAfter = await prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { energy: true } });
      expect(petBefore.energy - petAfter.energy).toBeCloseTo(ENERGY_COST, 1);

      // 3) El daño queda registrado para el leaderboard (RaidParticipant).
      const part = await prisma.raidParticipant.findUnique({
        where: { raidId_userId: { raidId, userId } },
      });
      expect(part).not.toBeNull();
      expect(part!.damageDealt).toBe(body.damage);
      expect(part!.totalAttacks).toBe(1);

      // Un ataque sin petId es inválido.
      const { token: t2 } = await signup({ energy: 100 });
      await api().post('/v1/raid/attack').set(auth(t2)).send({}).expect(400);
    });
  });



  describe('GET /v1/raid/leaderboard', () => {
    it('c) refleja el daño aportado por el atacante (mine=true, suma en totalDamage)', async () => {
      const { token, petId, userId } = await signup({ energy: 100 });
      const atk = await api().post('/v1/raid/attack').set(auth(token)).send({ petId }).expect(201);
      const damage = atk.body.damage as number;
      expect(damage).toBeGreaterThan(0);

      const res = await api().get('/v1/raid/leaderboard').set(auth(token)).expect(200);
      const b = res.body;

      expect(b.raidId).toBe(raidId);
      expect(b.hpRemaining).toBeGreaterThanOrEqual(0);
      expect(typeof b.totalDamage).toBe('number');
      expect(b.totalDamage).toBeGreaterThanOrEqual(damage);
      expect(Array.isArray(b.entries)).toBe(true);
      expect(b.entries.length).toBeGreaterThan(0);

      const mine = b.entries.find((e: any) => e.userId === userId);
      expect(mine).toBeDefined();
      expect(mine.mine).toBe(true);
      expect(mine.damageDealt).toBe(damage);
      expect(mine.attacks).toBe(1);
      expect(mine.petId).toBe(petId);
      expect(mine.rank).toBeGreaterThanOrEqual(1);
      expect(typeof mine.percentage).toBe('number');
      expect(typeof mine.displayName).toBe('string');

      await api().get('/v1/raid/leaderboard').expect(401);
    });
  });

  describe('GET /v1/raid/history', () => {
    it('d) lista raids pasadas (status settled) con su shape', async () => {
      const { token } = await signup();
      const ended = new Date(Date.now() - 3600 * 1000);
      const settled = await prisma.raid.create({
        data: {
          element: 'water',
          theme: 'Abyssal Leviathan',
          level: 55,
          hpGlobal: 500_000,
          hpRemaining: 0,
          status: 'settled',
          startedAt: new Date(Date.now() - 2 * DAY_MS),
          endsAt: new Date(Date.now() - DAY_MS),
          endedAt: ended,
          settledAt: ended,
        },
      });

      const res = await api().get('/v1/raid/history?limit=10').set(auth(token)).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      const found = res.body.find((r: any) => r.id === settled.id);
      expect(found).toBeDefined();
      expect(found.status).toBe('settled');
      expect(found.theme).toBe('Abyssal Leviathan');
      expect(found.element).toBe('water');
      expect(found.hpGlobal).toBe(500_000);
      expect(found.startedAt).toEqual(expect.any(String));
      expect(found.endedAt).toEqual(expect.any(String));

      await api().get('/v1/raid/history').expect(401);
    });
  });

  // F-06: se ejecuta al final porque liquida el raid activo (un test posterior vertería un raidId distinto).
  describe('F-06: el jefe se remata aunque un golpe exceda la vida restante', () => {
    it('la vida llega a 0 y el raid se liquida (antes el golpe final no se aplicaba)', async () => {
      const { token, petId } = await signup({ energy: 100 });

      // Vida por debajo del cap de daño por ataque (50.000): algún golpe excederá la vida restante.
      // Antes, `hpRemaining >= damage` rechazaba ese golpe (0 filas) y el jefe quedaba a medio rematar.
      // Ahora `GREATEST(hp - LEAST(hp, daño), 0)` lleva la vida a 0 y dispara el settle.
      await prisma.raid.update({ where: { id: raidId }, data: { hpRemaining: 10_000, status: 'active' } });

      let body: any;
      for (let i = 0; i < 15; i++) {
        await prisma.pet.update({ where: { id: petId }, data: { energy: 100 } }); // reponer energía entre golpes
        body = (await api().post('/v1/raid/attack').set(auth(token)).send({ petId }).expect(201)).body;
        if (body.settled) break;
      }

      expect(body.hpRemaining).toBe(0);
      const raid = await prisma.raid.findUniqueOrThrow({ where: { id: raidId } });
      expect(raid.hpRemaining).toBe(0);
      expect(raid.status).toBe('settled');
    });
  });
});

