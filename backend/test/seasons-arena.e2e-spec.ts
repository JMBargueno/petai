import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SeasonsService } from '../src/modules/seasons/seasons.service';

/**
 * Arena: premios de fin de temporada por liga/ELO (spec-11 leagueSettle, "pendiente desde la Fase 4").
 *
 * Al cerrar una temporada, `SeasonsService.settleSeason` dispara `ArenaSettleService`: para cada
 * usuario con al menos un pet, calcula la liga de su mejor pet (máx. ELO) y reparte el reward de esa
 * liga (gemas/monedas + título), registrando una liquidación idempotente por (usuario, temporada).
 * El transporte de datos de juego (ligas/settle) sale de `balance.json`.
 */
describe('Arena: premios de fin de temporada por liga/ELO (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const created: string[] = [];

  async function signup(): Promise<{ token: string; userId: string }> {
    const email = `arena_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api().post('/v1/auth/register').send({ email, password: 'Password123!' }).expect(201);
    created.push(reg.body.user.id);
    return { token: reg.body.accessToken, userId: reg.body.user.id };
  }

  async function seedRefs() {
    let species = await prisma.species.findFirst();
    if (!species) {
      species = await prisma.species.create({
        data: {
          id: 'sp_arena_test',
          name: 'TestSpecies',
          description: 't',
          element: 'fuego',
          rarity: 'common',
          baseStats: { atk: 10, def: 10, spd: 10 },
          favoriteFood: 'food_bread',
          spriteKey: 'sp_arena_test',
          defaultPalette: { base: '#333333', accent: '#aaaaaa' },
        },
      });
    }
    let pattern = await prisma.pattern.findFirst();
    if (!pattern) {
      pattern = await prisma.pattern.create({
        data: { id: 'pat_arena_test', name: 'TestPattern', description: 't', rarity: 'common' },
      });
    }
    return { speciesId: species.id, patternId: pattern.id };
  }

  async function addPet(userId: string, elo: number) {
    const refs = await seedRefs();
    return prisma.pet.create({
      data: {
        userId,
        speciesId: refs.speciesId,
        patternId: refs.patternId,
        rarity: 'common',
        palette: { base: '#333333', accent: '#aaaaaa' },
        visualSeed: 42,
        nickname: 'ArenaTest',
        combatStats: { atk: 10, def: 10, spd: 10, hp: 100 },
        elo,
      },
    });
  }

  /** Crea/actualiza una temporada dedicada con endTime en el pasado y activa (para poder liquidarla). */
  async function makeEndedSeason(id: string) {
    await prisma.season.upsert({
      where: { id },
      update: { isActive: true, endTime: new Date(Date.now() - 1000) },
      create: {
        id,
        name: 'Temporada Test',
        theme: 'fuego',
        startTime: new Date(Date.now() - 86_400_000),
        endTime: new Date(Date.now() - 1000),
        isActive: true,
      },
    });
    return id;
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

  it('al cerrar la temporada recompensa por la liga del mejor pet, es idempotente y expone /results', async () => {
    const { token, userId } = await signup();
    await addPet(userId, 1950); // → Mítica
    const seasonId = await makeEndedSeason(`arena_t1_${userId}`);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const r1 = await app.get(SeasonsService).settleSeason(seasonId);
    expect(r1.settled).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.title).toBe('Campeón Mítico');
    expect(after.gems - before.gems).toBe(500);
    expect(after.coins - before.coins).toBe(400);

    const settle = await prisma.seasonLeagueSettlement.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });
    expect(settle).toMatchObject({ leagueId: 'mythic', gemsAwarded: 500, coinsAwarded: 400, bestElo: 1950 });

    // Endpoint GET /seasons/:id/results
    const res = await api().get(`/v1/seasons/${seasonId}/results`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.leagueId).toBe('mythic');
    expect(res.body.title).toBe('Campeón Mítico');

    // Idempotencia: re-liquidar no reparte de nuevo (la temporada ya está cerrada)
    const r2 = await app.get(SeasonsService).settleSeason(seasonId);
    expect(r2.settled).toBe(false);
    const after2 = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after2.gems - before.gems).toBe(500); // sin duplicar
  });

  it('un jugador sin pet no recibe premio de arena', async () => {
    const { userId } = await signup(); // solo registro, sin pet
    const seasonId = await makeEndedSeason(`arena_t2_${userId}`);
    await app.get(SeasonsService).settleSeason(seasonId);
    const settle = await prisma.seasonLeagueSettlement.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });
    expect(settle).toBeNull();
  });

  it('/results exige autenticación (401) y responde 404 sin liquidación', async () => {
    const { token } = await signup();
    await api().get('/v1/seasons/arena_x/results').expect(401);
    await api().get(`/v1/seasons/arena_noexiste/results`).set('Authorization', `Bearer ${token}`).expect(404);
  });
});
