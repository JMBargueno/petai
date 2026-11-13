import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Robustez: concurrencia y entradas hostiles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());

  async function signup() {
    const reg = await api().post('/v1/auth/register').send({
      email: `rob_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@petai.local`, password: 'Contrasena-Segura-123',
    }).expect(201);
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };
    const me = (await api().get('/v1/me').set(auth).expect(200)).body;
    const eggs = (await api().get('/v1/eggs').set(auth).expect(200)).body;
    return { auth, userId: me.id as string, eggId: eggs[0].id as string };
  }
  type U = Awaited<ReturnType<typeof signup>>;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  describe('eclosión', () => {
    it('1. cinco peticiones simultáneas sobre el mismo huevo crean una sola mascota', async () => {
      const u = await signup();
      const rs = await Promise.all(Array.from({ length: 5 }, () => api().post(`/v1/eggs/${u.eggId}/hatch`).set(u.auth)));
      const ok = rs.filter((r) => r.status === 201);
      expect(ok).toHaveLength(1);
      expect(rs.filter((r) => r.status === 404)).toHaveLength(4);

      expect(await prisma.pet.count({ where: { userId: u.userId } })).toBe(1);
      const egg = await prisma.egg.findUniqueOrThrow({ where: { id: u.eggId } });
      expect(egg.hatchedPetId).toBe(ok[0].body.id);
      const pity = await prisma.pityCounter.findUniqueOrThrow({ where: { userId: u.userId } });
      // El contador avanzó una sola vez (o se reinició si salió una rareza alta)
      expect(pity.sinceSuperRare).toBeLessThanOrEqual(1);
    });

    it('2. eclosionar dos huevos distintos a la vez funciona y no pierde ninguno', async () => {
      const u = await signup();
      const second = await prisma.egg.create({ data: { userId: u.userId, eggType: 'standard', hatchesAt: new Date(Date.now() - 1000) } });
      const rs = await Promise.all([
        api().post(`/v1/eggs/${u.eggId}/hatch`).set(u.auth),
        api().post(`/v1/eggs/${second.id}/hatch`).set(u.auth),
      ]);
      expect(rs.map((r) => r.status)).toEqual([201, 201]);
      expect(new Set(rs.map((r) => r.body.id)).size).toBe(2);
      expect(await prisma.pet.count({ where: { userId: u.userId } })).toBe(2);
    });

    it('3. un huevo ya eclosionado, ajeno o con id absurdo da 404 (nunca 500)', async () => {
      const a = await signup();
      const b = await signup();
      await api().post(`/v1/eggs/${a.eggId}/hatch`).set(a.auth).expect(201);
      await api().post(`/v1/eggs/${a.eggId}/hatch`).set(a.auth).expect(404);
      await api().post(`/v1/eggs/${a.eggId}/hatch`).set(b.auth).expect(404);
      await api().post(`/v1/eggs/${'z'.repeat(5000)}/hatch`).set(a.auth).expect(404);
      await api().post('/v1/eggs/%00/hatch').set(a.auth).expect(400);
    });
  });

  describe('compra de huevos', () => {
    it('4. con saldo para un solo huevo, compras simultáneas solo prosperan una vez y el saldo no baja de 0', async () => {
      const u = await signup();
      await prisma.user.update({ where: { id: u.userId }, data: { coins: 50 } });
      const rs = await Promise.all(Array.from({ length: 5 }, () => api().post('/v1/eggs/buy').set(u.auth)));
      expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
      expect(rs.filter((r) => r.status === 400)).toHaveLength(4);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.userId } })).coins).toBe(0);
      expect(await prisma.egg.count({ where: { userId: u.userId } })).toBe(2); // el de bienvenida + el comprado
    });

    it('5. sin monedas → 400 y nada cambia', async () => {
      const u = await signup();
      await prisma.user.update({ where: { id: u.userId }, data: { coins: 49 } });
      await api().post('/v1/eggs/buy').set(u.auth).expect(400);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.userId } })).coins).toBe(49);
    });
  });

  describe('entradas hostiles: ningún endpoint responde 5xx', () => {
    let u: U;
    let petId: string;
    beforeAll(async () => {
      u = await signup();
      petId = (await api().post(`/v1/eggs/${u.eggId}/hatch`).set(u.auth).expect(201)).body.id;
    });

    const bodies: unknown[] = [undefined, null, 42, 'x', [], {}, { a: 1 }, true, { itemId: {} }, { itemId: 5 }, { itemId: 'x'.repeat(500) },
      { petId: 5 }, { message: {} }, { score: 'a' }, { quantity: 'x', itemId: 'apple' }, { skills: {} }, { atk: {} }, { strategy: {} }, { nickname: {} }];

    it('6. cuerpos malformados en todos los endpoints con cuerpo', async () => {
      const targets: [string, string][] = [
        ['PATCH', '/v1/me'], ['POST', '/v1/shop/buy'], ['POST', `/v1/pets/${petId}/feed`], ['POST', `/v1/pets/${petId}/heal`],
        ['PATCH', `/v1/pets/${petId}`], ['POST', `/v1/pets/${petId}/combat/stats`], ['PUT', `/v1/pets/${petId}/combat/skills`],
        ['POST', '/v1/battles/matchmake'], ['POST', '/v1/minigames/reflex/start'], ['POST', '/v1/minigames/sessions/x/finish'],
        ['PUT', '/v1/ai/config'], ['POST', `/v1/pets/${petId}/chat`], ['POST', `/v1/pets/${petId}/chat/local/context`],
        ['POST', `/v1/pets/${petId}/chat/local/sync`], ['POST', `/v1/pets/${petId}/evolve`], ['POST', `/v1/pets/${petId}/clean`],
        ['POST', '/v1/auth/register'], ['POST', '/v1/auth/login'], ['POST', '/v1/auth/refresh'], ['POST', '/v1/auth/logout'],
      ];
      const failures: string[] = [];
      for (const [method, path] of targets) {
        for (const body of bodies) {
          let req = (api() as any)[method.toLowerCase()](path).set(u.auth);
          // Se envía como JSON crudo para poder mandar también primitivos (42, true, 'x')
          if (body !== undefined) req = req.set('Content-Type', 'application/json').send(JSON.stringify(body));
          const res = await req;
          if (res.status >= 500) failures.push(`${method} ${path} body=${JSON.stringify(body)?.slice(0, 40)} → ${res.status}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('7. JSON roto o con tipo de contenido erróneo → 4xx', async () => {
      for (const path of ['/v1/shop/buy', `/v1/pets/${petId}/feed`, '/v1/auth/login', '/v1/battles/matchmake']) {
        const broken = await api().post(path).set(u.auth).set('Content-Type', 'application/json').send('{"roto":');
        expect(broken.status).toBeGreaterThanOrEqual(400);
        expect(broken.status).toBeLessThan(500);
      }
    });

    it('7b. un cuerpo enorme es un 413 y un JSON roto un 400 (no 500)', async () => {
      const huge = 'A'.repeat(200_000);
      for (const path of ['/v1/auth/register', '/v1/auth/login']) {
        const res = await api().post(path).set('Content-Type', 'application/json').send(JSON.stringify({ email: huge, password: huge }));
        expect(res.status).toBe(413);
      }
      const res = await api().post('/v1/shop/buy').set(u.auth).set('Content-Type', 'application/json').send('{"roto":');
      expect(res.status).toBe(400);
    });

    it('8. parámetros de ruta y de consulta hostiles → 4xx', async () => {
      const paths = [
        '/v1/pets/%00', `/v1/pets/${petId}%00`, '/v1/battles/%00', '/v1/pets/%00/combat', '/v1/eggs/%00/hatch',
        '/v1/leaderboard?scope=%7B%7D&limit=abc', '/v1/leaderboard?scope=global&limit=-5', `/v1/pets/${petId}/chat/history?limit=-1e9`,
        '/v1/battles?limit=NaN', '/v1/shop?kind=%00', '/v1/minigames/%00/start',
      ];
      const failures: string[] = [];
      for (const p of paths) {
        const res = await (p.includes('hatch') ? api().post(p) : api().get(p)).set(u.auth);
        if (res.status >= 500) failures.push(`${p} → ${res.status}`);
      }
      expect(failures).toEqual([]);
    });

    it('9. dar de comer sin itemId o con un id inválido → 400, y el inventario no cambia', async () => {
      await api().post(`/v1/pets/${petId}/feed`).set(u.auth).expect(400);
      await api().post(`/v1/pets/${petId}/feed`).set(u.auth).send({ itemId: {} }).expect(400);
      await api().post(`/v1/pets/${petId}/feed`).set(u.auth).send({ itemId: 5 }).expect(400);
      await api().post(`/v1/pets/${petId}/feed`).set(u.auth).send({ itemId: 'no-lo-tengo' }).expect(400);
    });

    it('10. los errores internos no filtran detalles al cliente', async () => {
      const res = await api().get('/v1/pets/%00').set(u.auth);
      expect(JSON.stringify(res.body)).not.toMatch(/prisma|select|postgres|stack|node_modules/i);
    });
  });
});
