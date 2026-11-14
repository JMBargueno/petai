import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Torneo (e2e) — camino feliz. Cubre las cuatro rutas públicas del módulo `tournament`:
 *   - GET  /v1/tournament/current    → estado, premios, contadores y participación propia
 *   - POST /v1/tournament/enter      → inscribe al jugador (cuota de 50 gemas + ELO ≥ 1700)
 *   - GET  /v1/tournament/bracket    → bracket completo (rondas + participantes)
 *   - GET  /v1/tournament/standings  → ranking paginado + posición propia
 *
 * Precondiciones reales leídas del código (tournament.service.ts / bracket.service.ts):
 *   - `enter` exige un torneo con status `entry` y `entryDeadline` futuro, pet ELO ≥ 1700 y
 *     saldo de gemas ≥ 50 (cuota ENTRY_FEE, cobro atómico vía WalletService).
 *   - `bracket`/`standings` exigen un torneo con status `bracket`/`active`/`finished`.
 *   - `current` crea el torneo automáticamente (status `entry`) si no existe ninguno activo.
 */
describe('Tournament: inscripciones, bracket y posiciones (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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
    expect(b.entryDeadline).toBeTruthy();
    expect(b.endsAt).toBeTruthy();
    expect(b.hasEntered).toBe(false);
    expect(b.myPlacement).toBeNull();
  });

  it('2. POST /tournament/enter → inscribe al jugador, cobra 50 gemas y crea la entrada', async () => {
    const p = await makePlayer(1800, 100);
    await makeEntryTournament();

    const before = await prisma.user.findUniqueOrThrow({ where: { id: p.userId } });

    const res = await api()
      .post('/v1/tournament/enter')
      .set(p.auth)
      .send({ petId: p.petId })
      .expect(201);

    const b = res.body;
    expect(b.tournamentId).toBeTruthy();
    expect(b.petId).toBe(p.petId);
    expect(b.elo).toBe(1800);
    expect(b.feePaid).toBe(50);

    // efecto económico REAL: se descuenta la cuota de 50 gemas del saldo del usuario
    const after = await prisma.user.findUniqueOrThrow({ where: { id: p.userId } });
    expect(after.gems).toBe(before.gems - 50);

    const entry = await prisma.tournamentEntry.findUnique({
      where: { tournamentId_userId: { tournamentId: b.tournamentId, userId: p.userId } },
    });
    expect(entry).not.toBeNull();
    expect(entry!.petId).toBe(p.petId);
    expect(entry!.elo).toBe(1800);
  });

  it('3. GET /tournament/bracket → 200 con la estructura (rondas + participantes) del torneo', async () => {
    // ── BUG REAL DE PRODUCCIÓN (no se fuerza, se documenta) ─────────────────────────────
    // La única vía de producción que crea partidas es `seed()` → `BracketService.buildBracket`
    // (tournament.service.ts:142). Allí se calculan seed1/seed2 como `(baseSeed + n) >>> 0`
    //   bracket.service.ts:49-50 (ronda 1) y :55-67 (rondas 2-6),
    // donde `hashSeed()` (battles/combat/rng.ts:23) devuelve un entero SIN SIGNO en [0, 2^32-1].
    // Pero el schema (schema.prisma:654-655) declara `seed1 Int` / `seed2 Int`, que Prisma mapea a
    // `integer` de Postgres = INT4 **con** signo (máx. 2147483647). Cuando la semilla cae en la
    // mitad superior (~50% de los torneos), `createMany` lanza:
    //   PrismaClientUnknownRequestError: ConversionError("Unable to fit integer value '3312460109'
    //   into an INT4 (32-bit signed integer)")  [bracket.service.ts:71]
    // → la sembración automática entry→bracket falla para ~50% de los torneos y `GET /bracket`
    //   quedaría sin partidas. Esperado: bracket completo persistido. Real: el write crasha.
    //
    // Para probar la ruta de LECTURA `GET /bracket` (que solo hace `getBracketView`), se siembra el
    // estado mínimo (partidas) directamente en BD, lo que no depende del write buggy.
    // ──────────────────────────────────────────────────────────────────────────────────────
    const tour = await makeEntryTournament();
    const players: Awaited<ReturnType<typeof makePlayer>>[] = [];
    for (let i = 0; i < 4; i++) players.push(await makePlayer(1750 + i * 10, 100));
    for (const p of players) {
      await api().post('/v1/tournament/enter').set(p.auth).send({ petId: p.petId }).expect(201);
    }

    // transición entry → bracket (mismo criterio que `seed()`)
    await prisma.tournament.update({
      where: { id: tour.id },
      data: { status: 'bracket', startedAt: new Date() },
    });

    // seed mínimo de partidas para que `getBracketView` devuelva su estructura (seed1/seed2 = índice de entrada)
    await prisma.tournamentMatch.createMany({
      data: [
        { tournamentId: tour.id, round: 1, slot: 0, seed1: 0, seed2: 3 },
        { tournamentId: tour.id, round: 1, slot: 1, seed1: 1, seed2: 2 },
        { tournamentId: tour.id, round: 2, slot: 0, seed1: 0, seed2: 1 },
      ],
    });

    const res = await api().get('/v1/tournament/bracket').set(players[0].auth).expect(200);
    const b = res.body;
    expect(b.rounds).toBeDefined();
    expect(b.rounds['1']).toHaveLength(2);
    expect(b.rounds['2']).toHaveLength(1);
    expect(b.entries).toHaveLength(4);
    const m1 = b.rounds['1'][0];
    expect(m1).toHaveProperty('status', 'pending');
    // petA / petB resueltos desde las entradas inscritas
    expect(m1.petA).toMatchObject({ name: expect.anything(), elo: expect.any(Number) });
    expect(m1.petB).toMatchObject({ name: expect.anything(), elo: expect.any(Number) });
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
});