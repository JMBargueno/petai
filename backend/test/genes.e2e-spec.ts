import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Genes (e2e) — camino feliz (feature 017-genes).
 *
 * El controller usa el prefijo `pets` (genes.controller.ts:10), así que las rutas
 * públicas son:
 *   GET  /v1/pets/:id/genes   → genes.service.getPetGenes
 *   POST /v1/pets/:id/analyze → genes.service.analyzeGene (consume 3 gemas, revela 1 gen)
 *
 * Precondiciones reales leídas del código de producción:
 *   · Propiedad: getPetById (pets.service.ts:43) usa findFirst({ id, userId }) → 404 si el pet
 *     no es propio. Por eso cada test eclosiona un huevo PROPIO (hatch propio).
 *   · analyzeGene (genes.service.ts:58): 400 si `hiddenGenes.length === 0` o si `user.gems < 3`
 *     (ANALYSIS_COST_GEMS = 3). El cobro es atómico vía wallet.debit dentro de una transacción.
 *   · Saldo inicial: register devuelve `gems: 10` (auth.e2e-spec.ts:46), suficiente para el análisis.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * BUG REAL DE PRODUCCIÓN (documento; NO se fuerza):
 *   · hatching.service.ts:191 crea el pet con `personality: { trait, temperament }` y SIN campo
 *     `genes`. El método GeneRevealService.assignAtHatch (gene-reveal.service.ts:30), que es el que
 *     debería asignar los genes ocultos al eclosionar, NUNCA es llamado desde el flujo de hatch
 *     (grep en backend/src/modules/hatching/* → 0 referencias a GeneReveal/assignAtHatch/genes).
 *   → Todo pet recién eclosionado tiene 0 genes, así que POST /analyze SIEMPRE falla con
 *     400 "No hay genes ocultos para revelar" en el flujo real. El endpoint WRITE es inoperable
 *     salvo sembrando el estado.
 *   · Se asertan los hechos reales: (a) el analyze sobre un pet recién eclosionado → 400 (bug),
 *     y (b) el happy-path real del analyze sembrando el estado mínimo directamente en `prisma`
 *     (un par de genes ocultos + saldo) para demostrar que, cuando las precondiciones se cumplen,
 *     la ruta revela el 1º gen oculto y debita 3 gemas.
 * ─────────────────────────────────────────────────────────────────────────────────
 */
describe('Genes (e2e) — happy path', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const createdUsers: string[] = [];

  type U = { token: string; userId: string; petId: string; auth: Record<string, string> };

  /** Helper: register → 201; GET /v1/eggs → [0].id; POST /v1/eggs/:id/hatch → 201 (pet propio). */
  async function makeUser(): Promise<U> {
    const email = `genes_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!', displayName: 'Genes Test' })
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

  /** Siembra el estado mínimo (personality) directamente en BD para el analyze/GET. */
  async function setPersonality(petId: string, personality: unknown) {
    await prisma.pet.update({
      where: { id: petId },
      data: { personality: personality as object },
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
    await app.close();
  });
  describe('GET /v1/pets/:id/genes', () => {
    it('1. pet recién eclosionado propio → 200 con 0 genes y shape correcto', async () => {
      const { petId, auth } = await makeUser();

      const res = await api().get(`/v1/pets/${petId}/genes`).set(auth).expect(200);
      // hatch no asigna genes → genes vacíos (ver BUG arriba). temperament proviene del hatch.
      expect(res.body).toMatchObject({
        petId,
        genes: [],
        totalGenes: 0,
        revealedGenes: 0,
        hiddenGenes: 0,
      });
      expect(typeof res.body.temperament).toBe('string');
    });

    it('2. refleja genes revelados/ocultos sembrados (mapping de effect) → 200', async () => {
      const { petId, auth } = await makeUser();
      // Estado mínimo sembrado: 1 gen revelado (veloz) + 1 oculto (aurora).
      await setPersonality(petId, {
        temperament: 'valiente',
        genes: [
          { type: 'veloz', revealed: true, revealedAt: '2026-01-01T00:00:00.000Z' },
          { type: 'aurora', revealed: false, revealedAt: null },
        ],
      });

      const res = await api().get(`/v1/pets/${petId}/genes`).set(auth).expect(200);
      expect(res.body).toMatchObject({
        petId,
        totalGenes: 2,
        revealedGenes: 1,
        hiddenGenes: 1,
        temperament: 'valiente',
      });
      const veloz = res.body.genes.find((g: any) => g.type === 'veloz');
      const aurora = res.body.genes.find((g: any) => g.type === 'aurora');
      expect(veloz).toMatchObject({ revealed: true, effect: '+10% VEL' });
      expect(veloz.revealedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(aurora).toMatchObject({ revealed: false });
      expect(aurora.effect).toBeUndefined(); // oculto → sin effect
    });
  });
  describe('POST /v1/pets/:id/analyze', () => {
    it('3. pet recién eclosionado (sin genes sembrados) → 400 (BUG: hatch no asigna genes)', async () => {
      const { petId, auth } = await makeUser();

      // Flujo real: el pet no tiene genes ocultos → analyze siempre falla (ver BUG arriba).
      const res = await api().post(`/v1/pets/${petId}/analyze`).set(auth);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/genes ocultos/i);
    });

    it('4. happy path real (estado mínimo sembrado) → 201, revela 1º gen oculto y debita 3 gemas', async () => {
      const { petId, userId, auth } = await makeUser();

      // Precondiciones reales: gen(s) ocultos + saldo >= 3 gemas (register da 10; fijamos 10).
      await prisma.user.update({ where: { id: userId }, data: { gems: 10 } });
      await setPersonality(petId, {
        temperament: 'valiente',
        genes: [
          { type: 'veloz', revealed: false, revealedAt: null },
          { type: 'aurora', revealed: false, revealedAt: null },
        ],
      });

      const res = await api().post(`/v1/pets/${petId}/analyze`).set(auth).expect(201);
      // Se revela el PRIMER gen oculto (veloz) y se debitan 3 gemas.
      expect(res.body).toMatchObject({
        revealed: { type: 'veloz', effect: '+10% VEL' },
        remainingGems: 7, // 10 - 3
        hiddenGenes: 1, // 2 - 1
      });
      expect(res.body.revealed.revealedAt).toEqual(expect.any(String));

      // Efecto real en BD: veloz revelado (con revealedAt), aurora sigue oculto, temperament
      // preservado y saldo debitado de forma atómica.
      const after = await prisma.pet.findUnique({ where: { id: petId } });
      const genes = (after!.personality as any).genes as Array<{
        type: string;
        revealed: boolean;
        revealedAt: string | null;
      }>;
      expect(genes[0]).toMatchObject({ type: 'veloz', revealed: true });
      expect(genes[0].revealedAt).toEqual(expect.any(String));
      expect(genes[1]).toMatchObject({ type: 'aurora', revealed: false });
      expect((after!.personality as any).temperament).toBe('valiente');
      expect((await prisma.user.findUnique({ where: { id: userId } }))!.gems).toBe(7);
    });
  });
});



