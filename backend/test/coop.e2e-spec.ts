import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Amistad + Co-op (e2e) — cableado real (feature 021 / spec-21).
 *
 * Rutas (coop-friends.controller.ts + presence.controller.ts, prefijo global `v1`):
 *   - GET   /v1/coop/friends
 *   - POST  /v1/coop/friends             { targetUserId }
 *   - POST  /v1/coop/friends/:id/accept
 *   - POST  /v1/coop/friends/:id/decline
 *   - POST  /v1/coop/visit               { ownerId, petId, action }
 *   - GET   /v1/coop/history
 *
 * Cubre el flujo completo que antes quedaba pausado (amistad en memoria, `checkFriendship`
 * siempre false): petición → aceptación → la visita co-op ahora SÍ prospera (200), modifica los
 * vitales del pet del dueño y queda registrada en el historial. También decline, límite diario,
 * validaciones y los códigos de error.
 */
describe('Amistad + Co-op (e2e) — cableado real', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  type U = { token: string; userId: string; petId: string; auth: Record<string, string>; email: string; handle: string };

  /** register → hatch un pet (petId) → /v1/me (userId). */
  async function makeUser(): Promise<U> {
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const email = `coop_${suffix}@petai.local`;
    const handle = `coop_${suffix}`.slice(0, 20);
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!', displayName: 'Coop Test', handle })
      .expect(201);
    const token = reg.body.accessToken as string;
    const a = auth(token);
    const eggs = await api().get('/v1/eggs').set(a).expect(200);
    const petId = (await api().post(`/v1/eggs/${eggs.body[0].id}/hatch`).set(a).expect(201)).body
      .id as string;
    const userId = (await api().get('/v1/me').set(a).expect(200)).body.id as string;
    createdUsers.push(userId);
    return { token, userId, petId, auth: a, email, handle };
  }

  /** Devuelve la fila de amistad de `who` hacia `other` (id + status) desde su lista. */
  async function findFriendship(who: U, otherId: string) {
    const res = await api().get('/v1/coop/friends').set(who.auth).expect(200);
    return res.body.find((f: any) => f.otherUserId === otherId);
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
      await prisma.coopVisit.deleteMany({ where: { ownerId: id } }).catch(() => {});
      await prisma.coopVisit.deleteMany({ where: { visitorId: id } }).catch(() => {});
      await prisma.coopFriendship.deleteMany({ where: { OR: [{ ownerId: id }, { visitorId: id }] } }).catch(() => {});
      await prisma.pet.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  describe('POST /coop/friends (petición)', () => {
    it('crea una petición pending; aparece como outgoing para el emisor y incoming para el destinatario', async () => {
      const a = await makeUser();
      const b = await makeUser();

      const req = await api()
        .post('/v1/coop/friends')
        .set(a.auth)
        .send({ targetUserId: b.userId })
        .expect(200);
      expect(req.body.status).toBe('pending');

      const fromA = await findFriendship(a, b.userId);
      expect(fromA).toMatchObject({ status: 'pending', direction: 'outgoing' });
      const fromB = await findFriendship(b, a.userId);
      expect(fromB).toMatchObject({ status: 'pending', direction: 'incoming' });
    });

    it('rechaza enviársela a sí mismo (400) y sin targetUserId (400)', async () => {
      const a = await makeUser();
      await api().post('/v1/coop/friends').set(a.auth).send({ targetUserId: a.userId }).expect(400);
      await api().post('/v1/coop/friends').set(a.auth).send({}).expect(400);
    });

    it('exige autenticación (401 sin token)', async () => {
      await api().post('/v1/coop/friends').send({ targetUserId: 'x' }).expect(401);
    });
  });

  describe('POST /coop/friends/:id/accept', () => {
    it('el destinatario acepta → accepted; solo quien la recibió puede hacerlo', async () => {
      const a = await makeUser();
      const b = await makeUser();
      await api().post('/v1/coop/friends').set(a.auth).send({ targetUserId: b.userId }).expect(200);

      const id = (await findFriendship(b, a.userId))!.id as string;
      await api().post(`/v1/coop/friends/${id}/accept`).set(a.auth).expect(403);

      const acc = await api().post(`/v1/coop/friends/${id}/accept`).set(b.auth).expect(200);
      expect(acc.body.status).toBe('accepted');
      expect((await findFriendship(b, a.userId))!.status).toBe('accepted');
      expect((await findFriendship(a, b.userId))!.status).toBe('accepted');
    });

    it('rechaza re-aceptar una ya resuelta (400)', async () => {
      const a = await makeUser();
      const b = await makeUser();
      await api().post('/v1/coop/friends').set(a.auth).send({ targetUserId: b.userId }).expect(200);
      const id = (await findFriendship(b, a.userId))!.id as string;
      await api().post(`/v1/coop/friends/${id}/accept`).set(b.auth).expect(200);
      await api().post(`/v1/coop/friends/${id}/accept`).set(b.auth).expect(400);
    });
  });

  describe('POST /coop/friends/:id/decline', () => {
    it('el destinatario rechaza → revoked; la amistad no habilita visitas', async () => {
      const a = await makeUser();
      const b = await makeUser();
      await api().post('/v1/coop/friends').set(a.auth).send({ targetUserId: b.userId }).expect(200);
      const id = (await findFriendship(b, a.userId))!.id as string;
      const dec = await api().post(`/v1/coop/friends/${id}/decline`).set(b.auth).expect(200);
      expect(dec.body.status).toBe('revoked');

      // Sin amistad aceptada, a no puede visitar el pet de b.
      await api()
        .post('/v1/coop/visit')
        .set(a.auth)
        .send({ ownerId: b.userId, petId: b.petId, action: 'feed' })
        .expect(403);
    });
  });

  describe('POST /coop/visit (flujo feliz una vez amigos)', () => {
    it('la visita prospera (200), sube un vital del pet del dueño (clamp) y queda en su historial', async () => {
      const a = await makeUser(); // emisor → ahora amigo
      const b = await makeUser(); // destinatario / dueño del pet
      await api().post('/v1/coop/friends').set(a.auth).send({ targetUserId: b.userId }).expect(200);
      const id = (await findFriendship(b, a.userId))!.id as string;
      await api().post(`/v1/coop/friends/${id}/accept`).set(b.auth).expect(200);

      // Baja el hambre del pet de b para poder ver el cambio (un hatch queda en 100).
      await prisma.pet.update({ where: { id: b.petId }, data: { hunger: 50 } });

      const visit = await api()
        .post('/v1/coop/visit')
        .set(a.auth)
        .send({ ownerId: b.userId, petId: b.petId, action: 'feed' })
        .expect(200);
      expect(visit.body.success).toBe(true);

      // Efecto real: feed → +10 de hambre (50 → 60).
      const pet = await prisma.pet.findUniqueOrThrow({ where: { id: b.petId } });
      expect(pet.hunger).toBe(60);

      // Historial del dueño: 1 visita de a.
      const hist = await api().get('/v1/coop/history').set(b.auth).expect(200);
      expect(hist.body.visits).toHaveLength(1);
      expect(hist.body.visits[0]).toMatchObject({ visitorId: a.userId, petId: b.petId, action: 'feed' });
    });

    it('rechaza visitar un pet ajeno al dueño declarado (404)', async () => {
      const a = await makeUser();
      const b = await makeUser();
      const c = await makeUser(); // dueño real del pet
      await api().post('/v1/coop/friends').set(a.auth).send({ targetUserId: b.userId }).expect(200);
      const id = (await findFriendship(b, a.userId))!.id as string;
      await api().post(`/v1/coop/friends/${id}/accept`).set(b.auth).expect(200);
      // b visita un pet de c pero declara ownerId=a: a y b son amigos (pasa la amistad),
      // pero el pet no pertenece a a → 404.
      await api()
        .post('/v1/coop/visit')
        .set(b.auth)
        .send({ ownerId: a.userId, petId: c.petId, action: 'feed' })
        .expect(404);
    });

    it('sin amistad aceptada → 403 (estriño social)', async () => {
      const owner = await makeUser();
      const stranger = await makeUser();
      await api()
        .post('/v1/coop/visit')
        .set(auth(stranger.token))
        .send({ ownerId: owner.userId, petId: owner.petId, action: 'play' })
        .expect(403);
    });

    it('aplica el límite diario (429 a partir de la 6.ª visita del día)', async () => {
      const a = await makeUser();
      const b = await makeUser();
      await api().post('/v1/coop/friends').set(a.auth).send({ targetUserId: b.userId }).expect(200);
      const id = (await findFriendship(b, a.userId))!.id as string;
      await api().post(`/v1/coop/friends/${id}/accept`).set(b.auth).expect(200);

      for (let i = 0; i < 5; i++) {
        await api()
          .post('/v1/coop/visit')
          .set(a.auth)
          .send({ ownerId: b.userId, petId: b.petId, action: 'clean' })
          .expect(200);
      }
      await api()
        .post('/v1/coop/visit')
        .set(a.auth)
        .send({ ownerId: b.userId, petId: b.petId, action: 'feed' })
        .expect(429);
    });
  });

  describe('Invitar por @nickname + listado enriquecido', () => {
    it('invita por @nickname (sin targetUserId) y la respuesta trae el nombre, el nickname y el pet del otro', async () => {
      const a = await makeUser();
      const b = await makeUser();

      const req = await api()
        .post('/v1/coop/friends')
        .set(a.auth)
        .send({ handle: `@${b.handle.toUpperCase()}` })
        .expect(200);
      expect(req.body.status).toBe('pending');
      expect(req.body.otherUserId).toBe(b.userId);
      expect(req.body.otherDisplayName).toBe('Coop Test');
      expect(req.body.otherHandle).toBe(b.handle);
      expect(req.body.otherPet).toMatchObject({ petId: b.petId });

      // El listado de a (outgoing) también trae el nombre + pet de b.
      const list = await api().get('/v1/coop/friends').set(a.auth).expect(200);
      const entry = list.body.find((f: any) => f.otherUserId === b.userId);
      expect(entry).toMatchObject({ status: 'pending', direction: 'outgoing', otherDisplayName: 'Coop Test', otherHandle: b.handle });
      expect(entry.otherPet).toMatchObject({ petId: b.petId });
    });

    it('rechaza invitar a un nickname inexistente (404)', async () => {
      const a = await makeUser();
      await api()
        .post('/v1/coop/friends')
        .set(a.auth)
        .send({ handle: `nadie_${Math.random().toString(36).slice(2, 8)}` })
        .expect(404);
    });

    it('ya no se invita por email (400 con aviso de actualizar la app, sin revelar si existe)', async () => {
      const a = await makeUser();
      const b = await makeUser();
      const res = await api().post('/v1/coop/friends').set(a.auth).send({ email: b.email }).expect(400);
      expect(res.body.message).toContain('@nickname');
    });
  });
});