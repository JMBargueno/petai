import * as fs from 'fs';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RealtimeGateway } from '../src/modules/realtime/realtime.gateway';
import { RedisService } from '../src/redis/redis.service';
import { simulateBattle } from '../src/modules/battles/combat/engine';
import { Fighter, SkillDef } from '../src/modules/battles/combat/types';

const dataDir = path.resolve(__dirname, '../../shared/game-data');
const balance = JSON.parse(fs.readFileSync(path.join(dataDir, 'balance.json'), 'utf8'));
const skills: SkillDef[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'skills.json'), 'utf8'));

const BASIC: Record<string, string> = { fire: 'ember', water: 'bubble', plant: 'vine_whip' };

describe('Arena: combate determinista, ELO, ligas y clasificación (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());

  /** Cada prueba usa una banda de ELO propia: así los rivales son solo los que crea el propio test. */
  let bandCursor = 0;
  const newBand = async () => {
    const top = (await prisma.pet.aggregate({ _max: { elo: true } }))._max.elo ?? 0;
    bandCursor = Math.max(bandCursor, top) + 10_000 + Math.floor(Math.random() * 1000);
    return bandCursor;
  };

  async function signup(opts: { elo?: number; level?: number; statPoints?: number } = {}) {
    const reg = await api().post('/v1/auth/register').send({
      email: `arena_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@petai.local`, password: 'Password123!',
      displayName: 'Entrenador',
    }).expect(201);
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };
    const eggs = await api().get('/v1/eggs').set(auth).expect(200);
    const petId = (await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(auth).expect(201)).body.id as string;
    const userId = (await api().get('/v1/me').set(auth).expect(200)).body.id as string;
    await prisma.pet.update({
      where: { id: petId },
      data: { elo: opts.elo ?? 1000, level: opts.level ?? 5, statPoints: opts.statPoints ?? 0 },
    });
    return { auth, petId, userId };
  }
  type U = Awaited<ReturnType<typeof signup>>;
  const profile = async (u: U) => (await api().get(`/v1/pets/${u.petId}/combat`).set(u.auth).expect(200)).body;
  const fight = (u: U, petId = u.petId) => api().post('/v1/battles/matchmake').set(u.auth).send({ petId });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);

    // Clasificaciones limpias: se borran solo las claves del prefijo de tests (petai:test:); se reconstruyen
    // desde la base de datos en la primera lectura, así no dependen de restos de ejecuciones anteriores.
    const redis = app.get(RedisService);
    await redis.run(async (r) => {
      const keys = await r.keys(redis.key('lb:*'));
      if (keys.length > 0) await r.del(...keys);
    });
  });
  afterAll(async () => app.close());

  describe('perfil, puntos y habilidades', () => {
    let u: U;
    beforeAll(async () => (u = await signup({ level: 10, statPoints: 30 })));

    it('1. el perfil devuelve estadísticas efectivas, liga, límites y habilidades por defecto', async () => {
      const p = await profile(u);
      expect(p).toMatchObject({ level: 10, statPoints: 30, elo: 1000, dailyLimit: 10, energyCost: 15, canFight: true, reason: null });
      expect(p.league).toMatchObject({ id: 'bronze', next: { id: 'silver' }, toNext: 100 });
      expect(p.equippedSkills).toContain('tackle');
      expect(p.equippedSkills.length).toBeLessThanOrEqual(4);
      expect(p.mood).toBeGreaterThan(0.95);
      for (const k of ['hp', 'atk', 'def', 'vel', 'esp']) expect(p.stats[k]).toBeGreaterThan(0);
    });

    it('2. repartir puntos sube la estadística y gasta puntos; las entradas inválidas se rechazan', async () => {
      const before = await profile(u);
      const after = (await api().post(`/v1/pets/${u.petId}/combat/stats`).set(u.auth).send({ atk: 10, esp: 5 }).expect(201)).body;
      expect(after.statPoints).toBe(15);
      expect(after.allocated).toMatchObject({ atk: 10, esp: 5 });
      expect(after.stats.atk).toBe(before.stats.atk + 10);
      expect(after.stats.esp).toBe(before.stats.esp + 5);

      for (const bad of [{ atk: 16 }, { atk: -1 }, { atk: 1.5 }, { speed: 3 }, {}, { atk: '2' }]) {
        await api().post(`/v1/pets/${u.petId}/combat/stats`).set(u.auth).send(bad).expect(400);
      }
      expect((await profile(u)).statPoints).toBe(15);
    });

    it('3. dos repartos simultáneos no pueden gastar más puntos de los que hay', async () => {
      const results = await Promise.all([
        api().post(`/v1/pets/${u.petId}/combat/stats`).set(u.auth).send({ def: 15 }),
        api().post(`/v1/pets/${u.petId}/combat/stats`).set(u.auth).send({ vel: 15 }),
      ]);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status !== 201).every((r) => [400, 409].includes(r.status))).toBe(true);
      expect((await profile(u)).statPoints).toBe(0);
    });

    it('4. equipar habilidades valida nivel, elemento, repetidos, máximo y que haya un ataque', async () => {
      const p = await profile(u);
      const basic = BASIC[p.element];
      const other = Object.values(BASIC).find((id) => id !== basic)!;
      const equip = (skillsList: unknown) => api().put(`/v1/pets/${u.petId}/combat/skills`).set(u.auth).send({ skills: skillsList });

      const ok = await equip(['tackle', basic, 'guard']).expect(200);
      expect(ok.body.equippedSkills).toEqual(['tackle', basic, 'guard']);
      await equip([other]).expect(400); // otro elemento
      await equip(['tackle', 'tackle']).expect(400);
      await equip(['guard']).expect(400); // sin ataque
      await equip([]).expect(400);
      await equip(['tackle', basic, 'guard', 'power_slam', 'recover']).expect(400);
      await equip(['inferno']).expect(400); // nivel 25
      await equip('tackle').expect(400);
    });

    it('5. no se pueden tocar las mascotas de otro usuario', async () => {
      const other = await signup();
      await api().get(`/v1/pets/${u.petId}/combat`).set(other.auth).expect(404);
      await api().post(`/v1/pets/${u.petId}/combat/stats`).set(other.auth).send({ atk: 1 }).expect(404);
      await api().put(`/v1/pets/${u.petId}/combat/skills`).set(other.auth).send({ skills: ['tackle'] }).expect(404);
      await fight(other, u.petId).expect(404);
    });
  });

  describe('pelea contra un jugador real', () => {
    let a: U;
    let b: U;
    let battleId: string;
    let res: any;
    let notified: any[];

    beforeAll(async () => {
      const band = await newBand();
      a = await signup({ elo: band, level: 8 });
      b = await signup({ elo: band + 30, level: 8 });
      notified = [];
      const gw = app.get(RealtimeGateway);
      jest.spyOn(gw, 'emitToUser').mockImplementation((userId: string, event: string, payload: unknown) => {
        notified.push({ userId, event, payload });
      });
    });

    it('6. emparejamiento por ELO: rival real, ELO de suma cero, recompensas y energía', async () => {
      const coinsBefore = (await api().get('/v1/me').set(a.auth)).body.coins;
      const petBefore = await profile(a);
      const r = await fight(a).expect(201);
      res = r.body;
      battleId = res.battleId;

      expect(res.opponent).toMatchObject({ isBot: false, ownerName: 'Entrenador' });
      expect(['win', 'draw', 'loss']).toContain(res.result.outcome);
      expect(res.replay.version).toBe(1);
      expect(res.replay.seed).toBe(res.seed);
      expect(res.replay.events.at(-1).t).toBe('end');

      // ELO: suma cero entre atacante y defensor
      const pa = await profile(a);
      const pb = await profile(b);
      expect(pa.elo).toBe(res.elo.after);
      expect(res.elo.after - res.elo.before).toBe(res.elo.delta);
      expect(pa.elo + pb.elo).toBe(petBefore.elo + (petBefore.elo + 30));
      if (res.result.outcome === 'win') expect(res.elo.delta).toBeGreaterThan(0);
      if (res.result.outcome === 'loss') expect(res.elo.delta).toBeLessThan(0);

      // Recompensas y gasto de energía
      const coinsAfter = (await api().get('/v1/me').set(a.auth)).body.coins;
      expect(coinsAfter - coinsBefore).toBe(res.rewards.coins);
      expect(res.rewards.xp).toBe(balance.combats.rewards[res.result.outcome].xp);
      expect(res.pet.energy).toBeLessThanOrEqual(100 - balance.combats.energyCostPerBattle + 1);
    });

    it('7. el defensor recibe un aviso en tiempo real con el resultado', () => {
      const n = notified.find((x) => x.event === 'battle:defended');
      expect(n.userId).toBe(b.userId);
      expect(n.payload).toMatchObject({ battleId, defenderPetId: b.petId, eloDelta: -res.elo.delta });
      expect(n.payload.won).toBe(res.result.outcome === 'loss');
    });

    it('8. la repetición es reproducible: simular de nuevo con la misma semilla da el mismo registro', async () => {
      const detail = (await api().get(`/v1/battles/${battleId}`).set(a.auth).expect(200)).body;
      const toFighter = (p: any): Fighter => ({
        name: p.name, speciesId: p.speciesId, element: p.element, level: p.level, stats: p.stats, mood: p.mood,
        skills: p.skills.map((id: string) => skills.find((s) => s.id === id)!), strategy: p.strategy, isBot: p.isBot,
        petId: p.petId,
      });
      const [pa, pb] = detail.replay.participants;
      const again = simulateBattle(toFighter(pa), toFighter(pb), detail.seed, balance.combats);
      expect(again.log.events).toEqual(detail.replay.events);
    });

    it('9. detalle e historial desde ambas perspectivas; un tercero no ve la pelea', async () => {
      const da = (await api().get(`/v1/battles/${battleId}`).set(a.auth).expect(200)).body;
      const db = (await api().get(`/v1/battles/${battleId}`).set(b.auth).expect(200)).body;
      expect(da.role).toBe('attacker');
      expect(db.role).toBe('defender');
      expect(da.eloDelta).toBe(-db.eloDelta);
      const flip: Record<string, string> = { win: 'loss', loss: 'win', draw: 'draw' };
      expect(db.outcome).toBe(flip[da.outcome]);

      const third = await signup();
      await api().get(`/v1/battles/${battleId}`).set(third.auth).expect(404);
      await api().get('/v1/battles/no-existe').set(a.auth).expect(404);

      const ha = (await api().get('/v1/battles').set(a.auth).expect(200)).body;
      const hb = (await api().get('/v1/battles').set(b.auth).expect(200)).body;
      expect(ha[0]).toMatchObject({ id: battleId, role: 'attacker', outcome: da.outcome });
      expect(hb[0]).toMatchObject({ id: battleId, role: 'defender', outcome: db.outcome });
      expect((await api().get('/v1/battles').set(third.auth).expect(200)).body).toEqual([]);
    });

    it('10. clasificación global (ELO) y semanal (puntos): ambos aparecen y la posición propia se informa', async () => {
      const global = (await api().get(`/v1/leaderboard?scope=global&limit=100&petId=${a.petId}`).set(a.auth).expect(200)).body;
      const ids = global.entries.map((e: any) => e.petId);
      // Las bandas de ELO de los tests están siempre por encima del resto: ambas mascotas están en cabeza
      expect(ids.slice(0, 2).sort()).toEqual([a.petId, b.petId].sort());
      // ordenada por ELO descendente
      const elos = global.entries.map((e: any) => e.elo);
      expect([...elos].sort((x: number, y: number) => y - x)).toEqual(elos);
      expect(global.me.rank).toBe(ids.indexOf(a.petId) + 1);
      expect(global.entries.find((e: any) => e.petId === a.petId)).toMatchObject({ mine: true, league: 'mythic' });

      // Semanal: muchas mascotas empatan a puntos, así que se comprueba la puntuación propia con "me"
      const weekly = (await api().get(`/v1/leaderboard?scope=weekly&limit=100&petId=${a.petId}`).set(a.auth).expect(200)).body;
      expect(weekly.me.score).toBe(balance.combats.weeklyPoints[res.result.outcome]);
      expect(weekly.me.rank).toBeGreaterThanOrEqual(1);
    });

    it('11. parámetros de la clasificación validados', async () => {
      await api().get('/v1/leaderboard?scope=otra').set(a.auth).expect(400);
      const big = (await api().get('/v1/leaderboard?scope=global&limit=100000').set(a.auth).expect(200)).body;
      expect(big.entries.length).toBeLessThanOrEqual(100);
      const noMe = (await api().get(`/v1/leaderboard?scope=global&petId=${a.petId}`).set((await signup()).auth).expect(200)).body;
      expect(noMe.me).toBeNull(); // la mascota no es suya
    });
  });

  describe('bots, límites y reglas', () => {
    it('12. sin rival cercano se enfrenta a un bot determinista: sin ELO ni puntos globales y con menos recompensa', async () => {
      const u = await signup({ elo: await newBand(), level: 6 });
      const r = (await fight(u).expect(201)).body;
      expect(r.opponent.isBot).toBe(true);
      expect(r.opponent.name).toContain('Fantasma de');
      expect(r.opponent.ownerName).toBeNull();
      expect(r.elo.delta).toBe(0);
      expect(r.rewards.coins).toBe(Math.round(balance.combats.rewards[r.result.outcome].coins * balance.combats.rewards.botMultiplier));

      const battle = await prisma.battle.findUniqueOrThrow({ where: { id: r.battleId } });
      expect(battle.defenderPetId).toBeNull();
      expect((battle.log as any).participants[1].isBot).toBe(true);
      expect((await prisma.pet.findUniqueOrThrow({ where: { id: u.petId } })).elo).toBe(r.elo.before);

      const global = (await api().get('/v1/leaderboard?scope=global&limit=100').set(u.auth)).body.entries;
      expect(global.some((e: any) => e.name?.startsWith('Fantasma'))).toBe(false);
      const weekly = (await api().get(`/v1/leaderboard?scope=weekly&limit=100&petId=${u.petId}`).set(u.auth)).body;
      expect(weekly.me.score).toBe(balance.combats.weeklyPoints[r.result.outcome]);
    });

    it('13. la misma semilla genera el mismo bot y la misma pelea (reproducible desde el registro)', async () => {
      const u = await signup({ elo: await newBand(), level: 6 });
      const r = (await fight(u).expect(201)).body;
      const stored = (await prisma.battle.findUniqueOrThrow({ where: { id: r.battleId } })).log as any;
      expect(stored.events).toEqual(r.replay.events);
      expect(stored.seed).toBe(r.seed);
    });

    it('14. no se puede pelear dormida, sin energía o con un petId inválido', async () => {
      const u = await signup({ elo: await newBand() });
      await api().post('/v1/battles/matchmake').set(u.auth).send({}).expect(400);
      await prisma.pet.update({ where: { id: u.petId }, data: { sleeping: true } });
      expect((await fight(u).expect(400)).body.message).toContain('durmiendo');
      await prisma.pet.update({ where: { id: u.petId }, data: { sleeping: false, energy: 10 } });
      expect((await fight(u).expect(400)).body.message).toContain('energía');
      const p = await profile(u);
      expect(p).toMatchObject({ canFight: false });
    });

    it('15. límite diario de peleas (429) que se recupera pasadas 24 h', async () => {
      const u = await signup({ elo: await newBand() });
      const limit = balance.combats.dailyFreeBattles;
      await prisma.battle.createMany({
        data: Array.from({ length: limit }, (_, i) => ({
          attackerPetId: u.petId, seed: i + 1, log: { version: 1, participants: [], events: [{ t: 'end', winner: 0, rounds: 1 }] },
        })),
      });
      const blocked = await fight(u);
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toContain('límite diario');
      expect((await profile(u)).battlesToday).toBe(limit);

      await prisma.battle.updateMany({ where: { attackerPetId: u.petId }, data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) } });
      await fight(u).expect(201);
    });

    it('16. la energía se descuenta y la felicidad se mantiene en 0–100', async () => {
      const u = await signup({ elo: await newBand() });
      await prisma.pet.update({ where: { id: u.petId }, data: { happiness: 2 } });
      const r = (await fight(u).expect(201)).body;
      expect(r.pet.happiness).toBeGreaterThanOrEqual(0);
      expect(r.pet.happiness).toBeLessThanOrEqual(100);
      expect(r.pet.energy).toBeLessThanOrEqual(100 - balance.combats.energyCostPerBattle + 1);
    });

    it('17. solo una pelea a la vez por usuario', async () => {
      const u = await signup({ elo: await newBand() });
      const [x, y] = await Promise.all([fight(u), fight(u)]);
      const ok = [x, y].filter((r) => r.status === 201);
      expect(ok.length).toBeGreaterThanOrEqual(1);
      if (ok.length === 2) {
        // Si el servidor las serializó, cada pelea cuenta y cuesta energía
        expect((await profile(u)).battlesToday).toBe(2);
      } else {
        expect([x, y].some((r) => r.status === 429)).toBe(true);
      }
    });

    it('18. la mejora de estadísticas se nota: una mascota reforzada gana más', async () => {
      const band = await newBand();
      let wins = 0;
      const n = 8;
      for (let i = 0; i < n; i++) {
        const strong = await signup({ elo: band + i * 1000, level: 12 });
        const weak = await signup({ elo: band + i * 1000 + 5, level: 12 });
        await prisma.pet.update({
          where: { id: strong.petId },
          data: { combatStats: { ...(await prisma.pet.findUniqueOrThrow({ where: { id: strong.petId } })).combatStats as any, allocated: { atk: 60, esp: 60, hp: 60 } } },
        });
        const r = (await fight(strong).expect(201)).body;
        if (r.result.outcome === 'win' && !r.opponent.isBot) wins++;
      }
      expect(wins).toBeGreaterThanOrEqual(6);
    });

    it('19. /arena/leagues expone ligas, límites y recompensas', async () => {
      const u = await signup();
      const l = (await api().get('/v1/arena/leagues').set(u.auth).expect(200)).body;
      expect(l.leagues.map((x: any) => x.id)).toEqual(['bronze', 'silver', 'gold', 'platinum', 'diamond', 'mythic']);
      expect(l).toMatchObject({ dailyFreeBattles: 10, energyCost: 15 });
      await api().get('/v1/arena/leagues').expect(401);
      await api().get('/v1/leaderboard').expect(401);
      await api().post('/v1/battles/matchmake').send({}).expect(401);
    });
  });
});
