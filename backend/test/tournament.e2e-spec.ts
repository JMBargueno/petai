import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TournamentService } from '../src/modules/tournament/tournament.service';

/**
 * Torneo (e2e) — camino feliz. Cubre las cuatro rutas públicas del módulo `tournament` y, a
 * través de los servicios, el ciclo completo del bracket (F-05):
 *   - GET  /v1/tournament/current    → estado, premios, contadores y participación propia
 *   - POST /v1/tournament/enter      → inscribe al jugador (cuota de 50 gemas + ELO ≥ 1700)
 *   - GET  /v1/tournament/bracket    → bracket con participantes REALES (petAId/petBId)
 *   - GET  /v1/tournament/standings  → ranking paginado + posición propia
 *   - `seed()` + `resolveRound()`    → el bracket avanza (bye/vacías incluidas), termina y paga
 *
 * Precondiciones reales leídas del código:
 *   - `enter` exige un torneo con status `entry` y `entryDeadline` futuro, pet ELO ≥ 1700 y
 *     saldo de gemas ≥ 50 (cuota ENTRY_FEE, cobro atómico vía WalletService).
 *   - `bracket`/`standings` exigen un torneo con status `bracket`/`active`/`finished`.
 *   - `current` crea el torneo automáticamente (status `entry`) si no existe ninguno activo.
 */
describe('Tournament: inscripciones, bracket y posiciones (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: TournamentService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function makePlayer(elo = 1800, gems = 200) {
    const email = `tour_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api().post('/v1/auth/register').send({ email, password: 'Password123!' }).expect(201);
    const token = reg.body.accessToken as string;
    const headers = auth(token);
    const eggs = await api().get('/v1/eggs').set(headers).expect(200);
    const petId = (await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(headers).expect(201)).body.id as string;
    const userId = (await api().get('/v1/me').set(headers).expect(200)).body.id as string;
    createdUsers.push(userId);
    await prisma.pet.update({ where: { id: petId }, data: { elo } });
    await prisma.user.update({ where: { id: userId }, data: { gems } });
    return { token, auth: headers, userId, petId, elo };
  }

  async function makeEntryTournament() {
    return prisma.tournament.create({
      data: {
        status: 'entry',
        entryFee: 50,
        totalPrizePool: 3000,
        entryDeadline: new Date(Date.now() + 2 * 24 * 3600 * 1000),
        endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
    service = app.get(TournamentService);
  });

  afterAll(async () => {
    for (const id of createdUsers) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  it('1. GET /tournament/current → 200 con estado, premios, contadores y participación propia', async () => {
    const p = await makePlayer();
    const res = await api().get('/v1/tournament/current').set(p.auth).expect(200);
    const b = res.body;
    expect(b.id).toBeTruthy();
    expect(['entry', 'bracket', 'active']).toContain(b.status);
    expect(b.entryFee).toBe(50);
    expect(b.totalPrizePool).toBe(3000);
    expect(b.bracketSize).toBe(64);
    expect(typeof b.entryCount).toBe('number');
    expect(b.hasEntered).toBe(false);
    expect(b.myPlacement).toBeNull();
  });

  it('2. POST /tournament/enter → inscribe al jugador, cobra 50 gemas y crea la entrada', async () => {
    const tour = await makeEntryTournament();
    const p = await makePlayer(1800, 200);
    await prisma.tournament.update({ where: { id: tour.id }, data: { status: 'entry' } });
    const before = await prisma.user.findUnique({ where: { id: p.userId } });
    const res = await api().post('/v1/tournament/enter').set(p.auth).send({ petId: p.petId }).expect(201);
    expect(res.body.tournamentId).toBe(tour.id);
    expect(res.body.feePaid).toBe(50);
    const after = await prisma.user.findUnique({ where: { id: p.userId } });
    expect(after!.gems).toBe(before!.gems - 50);
    const entry = await prisma.tournamentEntry.findUnique({
      where: { tournamentId_userId: { tournamentId: tour.id, userId: p.userId } },
    });
    expect(entry).not.toBeNull();
    expect(entry!.petId).toBe(p.petId);
    expect(entry!.elo).toBe(1800);
  });

  it('3. seed() → GET /bracket devuelve participantes REALES (petAId/petBId, no undefined)', async () => {
    const tour = await makeEntryTournament();
    const players: Awaited<ReturnType<typeof makePlayer>>[] = [];
    for (let i = 0; i < 4; i++) players.push(await makePlayer(1750 + i * 10, 100));
    for (const p of players) {
      await api().post('/v1/tournament/enter').set(p.auth).send({ petId: p.petId }).expect(201);
    }
    // Cerramos el periodo de inscripción y sembramos el bracket (mismo criterio que el cron).
    await prisma.tournament.update({ where: { id: tour.id }, data: { entryDeadline: new Date(Date.now() - 1000) } });
    await service.seed(); // entry → bracket + buildBracket (partidas con petAId/petBId reales)

    const res = await api().get('/v1/tournament/bracket').set(players[0].auth).expect(200);
    const b = res.body;
    expect(b.rounds['1']).toHaveLength(32); // un bracket de 64 hojas tiene 32 partidas de ronda 1
    const withPets = (b.rounds['1'] as any[]).filter((m) => m.petA || m.petB);
    expect(withPets.length).toBeGreaterThan(0); // los inscritos aparecen como participantes
    for (const m of withPets) {
      if (m.petA) expect(m.petA).toMatchObject({ name: expect.anything(), elo: expect.any(Number) });
      if (m.petB) expect(m.petB).toMatchObject({ name: expect.anything(), elo: expect.any(Number) });
    }
    expect(b.entries).toHaveLength(4);
    const firstEntry = b.entries[0];
    expect(firstEntry).toHaveProperty('petId');
    expect(firstEntry).toHaveProperty('elo');
  });

  it('4. GET /tournament/standings → 200 con ranking paginado, orden por ELO y posición propia', async () => {
    const tour = await prisma.tournament.create({
      data: {
        status: 'bracket',
        entryFee: 50,
        totalPrizePool: 3000,
        entryDeadline: new Date(Date.now() + 2 * 24 * 3600 * 1000),
        endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        startedAt: new Date(),
      },
    });
    const elos = [1750, 1760, 1770, 1780, 1790];
    const players: Awaited<ReturnType<typeof makePlayer>>[] = [];
    for (let i = 0; i < elos.length; i++) {
      const p = await makePlayer(elos[i]);
      players.push(p);
      await prisma.tournamentEntry.create({
        data: { tournamentId: tour.id, userId: p.userId, petId: p.petId, elo: elos[i] },
      });
    }

    const res = await api().get('/v1/tournament/standings').set(players[0].auth).expect(200);
    const b = res.body;
    expect(b.tournamentId).toBe(tour.id);
    expect(b.status).toBe('bracket');
    expect(b.total).toBe(5);
    expect(b.entries).toHaveLength(5);
    expect(b.entries[0]).toHaveProperty('rank', 1);
    expect(b.entries[0]).toHaveProperty('elo');
    expect(b.entries[0]).toHaveProperty('mine', false);
    for (let i = 1; i < b.entries.length; i++) {
      expect(b.entries[i].elo).toBeLessThanOrEqual(b.entries[i - 1].elo);
    }
    expect(b.me).not.toBeNull();
    expect(b.me.rank).toBe(5);
    expect(b.me.placement).toBeNull();
  });

  it('5. resolveRound() avanza el bracket hasta terminar y paga al campeón (F-05)', async () => {
    const tour = await makeEntryTournament();
    const players: Awaited<ReturnType<typeof makePlayer>>[] = [];
    for (let i = 0; i < 8; i++) players.push(await makePlayer(1750 + i * 10, 300));
    for (const p of players) {
      await api().post('/v1/tournament/enter').set(p.auth).send({ petId: p.petId }).expect(201);
    }
    await prisma.tournament.update({ where: { id: tour.id }, data: { entryDeadline: new Date(Date.now() - 1000) } });
    await service.seed(); // 64 hojas: 8 con mascotas y 56 vacías (bye/vacías)

    // Un front por llamada: avanza ronda a ronda hasta terminar (tope defensivo de 10).
    for (let i = 0; i < 10; i++) {
      await service.resolveRound();
      const t = await prisma.tournament.findUnique({ where: { id: tour.id } });
      if (t?.status === 'finished') break;
    }

    const t = await prisma.tournament.findUnique({ where: { id: tour.id } });
    expect(t!.status).toBe('finished'); // F-05: el torneo termina (antes quedaba atascado en `bracket`)

    // El campeón cobra el premio y queda placement 1.
    const champion = await prisma.tournamentEntry.findFirst({ where: { tournamentId: tour.id, placement: 1 } });
    expect(champion).toBeTruthy();
    const champUser = await prisma.user.findUnique({ where: { id: champion!.userId } });
    // 300 gemas iniciales − 50 de cuota + 1000 de premio = 1250.
    expect(champUser!.gems).toBeGreaterThanOrEqual(1250);
  });
});