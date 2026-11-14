import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DevModule } from '../src/modules/dev/dev.module';
import { GameDataModule } from '../src/modules/game-data/game-data.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GameDataWatcherService } from '../src/modules/dev/game-data-watcher.service';

/**
 * E2E de los endpoints dev (`/dev/*`). Se monta `DevModule` con `PrismaService` y el watcher
 * mockeados (sin DB/Redis), de modo que el hot-reload se prueba sobre el `GameDataService` real
 * (carga los JSON de `shared/game-data`).
 */
describe('Dev endpoints (e2e)', () => {
  let app: INestApplication;

  const prismaMock = {
    pet: { findFirst: jest.fn(), createMany: jest.fn(), update: jest.fn() },
    user: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [DevModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(GameDataWatcherService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = () => request(app.getHttpServer()).get('/v1/dev/game-data');

  it('GET /dev/game-data devuelve el snapshot vigente', async () => {
    const r = await get().expect(200);
    expect(r.body.balance).toBeTruthy();
    expect(Array.isArray(r.body.species)).toBe(true);
    expect(typeof r.body.loadedAt).toBe('string');
    expect(r.body.source).toBe('disk');
  });

  it('POST /dev/hot-reload (inline) aplica el cambio y GET lo refleja', async () => {
    const current = (await get().expect(200)).body;
    const newBalance = JSON.parse(JSON.stringify(current.balance));
    newBalance.combats.elo.k = 18;
    const r = await request(app.getHttpServer())
      .post('/v1/dev/hot-reload')
      .send({ file: 'balance', source: 'inline', content: JSON.stringify(newBalance) })
      .expect(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.changedFields).toContain('combats.elo.k');

    const after = await get().expect(200);
    expect(after.body.balance.combats.elo.k).toBe(18);
    expect(after.body.source).toBe('inline');
  });

  it('POST /dev/hot-reload con JSON malformado devuelve 400 y no cambia', async () => {
    const before = (await get()).body;
    await request(app.getHttpServer())
      .post('/v1/dev/hot-reload')
      .send({ file: 'balance', source: 'inline', content: '{ no es json' })
      .expect(400);
    const after = await get();
    expect(after.body.balance).toEqual(before.balance);
  });

  it('POST /dev/hot-reload con schema inválido devuelve 400 con el path del campo', async () => {
    const bad = JSON.parse(JSON.stringify((await get()).body.species));
    bad[0] = { ...bad[0], element: 'plasma' };
    const r = await request(app.getHttpServer())
      .post('/v1/dev/hot-reload')
      .send({ file: 'species', source: 'inline', content: JSON.stringify(bad) })
      .expect(400);
    expect(r.body.ok).toBe(false);
    expect(r.body.errors.some((e) => e.path.includes('element'))).toBe(true);
  });

  it('POST /dev/hot-reload con file desconocido devuelve 404', async () => {
    await request(app.getHttpServer())
      .post('/v1/dev/hot-reload')
      .send({ file: 'nope', source: 'inline', content: '{}' })
      .expect(404);
  });

  it('POST /dev/seed (dryRun) devuelve el plan sin persistir', async () => {
    prismaMock.$transaction = jest.fn();
    const r = await request(app.getHttpServer())
      .post('/v1/dev/seed')
      .send({ users: 5, pets: 20, level: { min: 1, max: 10 }, dryRun: true })
      .expect(200);
    expect(r.body.usersCreated).toBe(5);
    expect(r.body.petsCreated).toBe(20);
    expect(r.body.dryRun).toBe(true);
    expect(typeof r.body.durationMs).toBe('number');
    expect(r.body.distribution).toBeDefined();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('POST /dev/action valida petId en el servidor (404 si no existe)', async () => {
    prismaMock.pet.findFirst = jest.fn().mockResolvedValue(null);
    await request(app.getHttpServer())
      .post('/v1/dev/action')
      .send({ action: 'feed', petId: 'no-existe', args: { foodId: 'apple' } })
      .expect(404);
  });

  it('POST /dev/action con acción no soportada devuelve 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/dev/action')
      .send({ action: 'teleport', petId: 'x' })
      .expect(400);
  });

  it('POST /dev/action feed válido devuelve 200 con vitales', async () => {
    prismaMock.pet.findFirst = jest.fn().mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      speciesId: 'ignisaur',
      level: 5,
      nickname: 'Igni',
      strategy: 'balanced',
      hunger: 80,
      happiness: 80,
      energy: 80,
      health: 80,
      sick: false,
      combatStats: { hp: 50, atk: 55, def: 45, vel: 48, esp: 52, allocated: {} },
      skills: [],
      species: { favoriteFood: 'spicy_berry' },
    });
    prismaMock.pet.update = jest.fn().mockResolvedValue({});
    const r = await request(app.getHttpServer())
      .post('/v1/dev/action')
      .send({ action: 'feed', petId: 'p1', args: { foodId: 'apple' } })
      .expect(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.result.vitaleAfter).toBeGreaterThan(r.body.result.vitaleBefore);
  });
});

describe('Dev endpoints ausentes en producción (SC-007)', () => {
  it('sin DevModule, GET /dev/game-data devuelve 404', async () => {
    const mod = await Test.createTestingModule({ imports: [GameDataModule] }).compile();
    const prodApp = mod.createNestApplication();
    prodApp.setGlobalPrefix('v1');
    await prodApp.init();
    await request(prodApp.getHttpServer()).get('/v1/dev/game-data').expect(404);
    await prodApp.close();
  });
});