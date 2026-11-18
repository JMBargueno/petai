import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MindService } from '../src/modules/mind/mind.service';

/**
 * Mente (e2e) — spec 37 §1.1: escrituras concurrentes en `Pet.personality`.
 *
 * `Pet.personality` es un JSON que se lee, se modifica y se reescribe entero. Sin bloquear la
 * fila, dos escrituras simultáneas parten del mismo valor y la segunda pisa a la primera. Solo
 * una base de datos real puede demostrarlo: con un Prisma de pega las llamadas no se solapan.
 */
describe('Mind (e2e) — escrituras concurrentes en la personalidad', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mind: MindService;
  const api = () => request(app.getHttpServer());

  async function makePet(): Promise<string> {
    const email = `mind_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!', displayName: 'Mind Test' })
      .expect(201);
    const a = { Authorization: `Bearer ${reg.body.accessToken as string}` };
    const eggs = await api().get('/v1/eggs').set(a).expect(200);
    return (await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(a).expect(201)).body.id as string;
  }

  /** Deja a la mascota con una personalidad neutra y sin deriva gastada. */
  async function reset(petId: string, extra: Record<string, unknown> = {}) {
    const dims = { curiosity: 50, sociability: 50, bravery: 50, affection: 50, temper: 50 };
    await prisma.pet.update({ where: { id: petId }, data: { personality: { dims, ...extra } } });
  }

  const dimsOf = async (petId: string) =>
    ((await prisma.pet.findUnique({ where: { id: petId } }))!.personality as any).dims as Record<string, number>;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
    mind = app.get(MindService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('N experiencias a la vez suman lo mismo que aplicadas en serie', async () => {
    const N = 8;
    const now = new Date();

    const serialPet = await makePet();
    await reset(serialPet);
    for (let i = 0; i < N; i++) await mind.applyExperience(serialPet, ['chat'], now);
    const serial = await dimsOf(serialPet);
    // La prueba solo vale si la deriva en serie se nota
    expect(serial.affection).toBeGreaterThan(50);

    const concurrentPet = await makePet();
    await reset(concurrentPet);
    await Promise.all(Array.from({ length: N }, () => mind.applyExperience(concurrentPet, ['chat'], now)));
    const concurrent = await dimsOf(concurrentPet);

    expect(concurrent.affection).toBeCloseTo(serial.affection, 3);
    expect(concurrent.sociability).toBeCloseTo(serial.sociability, 3);
  });

  it('una deriva y un parche simultáneos no se pisan', async () => {
    const petId = await makePet();
    await reset(petId, { genes: [{ type: 'veloz' }] });
    const now = new Date();

    await Promise.all([
      mind.applyExperience(petId, ['fed'], now),
      mind.patchStored(petId, { lastNeglectDay: '2026-11-18' } as any),
      mind.applyExperience(petId, ['cleaned'], now),
    ]);

    const stored = (await prisma.pet.findUnique({ where: { id: petId } }))!.personality as any;
    expect(stored.lastNeglectDay).toBe('2026-11-18');
    expect(stored.genes).toEqual([{ type: 'veloz' }]);
    // Las dos experiencias suben la afectividad; si una se perdiera, subiría menos
    const expected = await (async () => {
      const other = await makePet();
      await reset(other);
      await mind.applyExperience(other, ['fed'], now);
      await mind.applyExperience(other, ['cleaned'], now);
      return dimsOf(other);
    })();
    expect(stored.dims.affection).toBeCloseTo(expected.affection, 3);
  });
});
