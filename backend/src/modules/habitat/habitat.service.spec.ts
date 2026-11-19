import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HabitatService } from './habitat.service';

const habitats = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/habitats.json'), 'utf8'),
);

type Item = { id: string; petId: string; habitatId: string; furnitureId: string; roomId: string; x: number; y: number; rotation: number; purchasedAt: Date };

/** Prisma en memoria con lo justo que usa HabitatService. */
function makePrisma(items: Item[] = [], stage = 'adult') {
  let seq = 0;
  const habitat = { id: 'h1', petId: 'p1', habitatSeed: 1, rooms: ['sala', 'jardin', 'santuario'] };
  const where = (w: any) => (i: Item) =>
    Object.entries(w).every(([k, v]) => (i as any)[k] === v);
  const prisma: any = {
    pet: { findFirst: jest.fn(async () => ({ id: 'p1', userId: 'u1', stage })) },
    habitat: {
      findUnique: jest.fn(async (args: any) => (args?.include?.items ? { ...habitat, items: items.slice() } : habitat)),
    },
    habitatItem: {
      findMany: jest.fn(async ({ where: w }: any) => items.filter(where(w))),
      findFirst: jest.fn(async ({ where: w }: any) => items.find(where(w)) ?? null),
      count: jest.fn(async ({ where: w }: any) => items.filter(where(w)).length),
      create: jest.fn(async ({ data }: any) => {
        const it = { id: `i${++seq}`, purchasedAt: new Date(), rotation: 0, ...data };
        items.push(it);
        return it;
      }),
      update: jest.fn(async ({ where: w, data }: any) => {
        const it = items.find((i) => i.id === w.id)!;
        Object.assign(it, data);
        return it;
      }),
      delete: jest.fn(async ({ where: w }: any) => {
        items.splice(items.findIndex((i) => i.id === w.id), 1);
      }),
    },
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };
  return { prisma, items };
}

function makeService(items: Item[] = [], opts: { stage?: string; funds?: boolean } = {}) {
  const { prisma } = makePrisma(items, opts.stage);
  const wallet = { debit: jest.fn(async () => ({ ok: opts.funds !== false })) };
  const gameData = { getHabitats: () => habitats };
  const service = new HabitatService(prisma, wallet as any, gameData as any);
  return { service, prisma, wallet, items };
}

const item = (o: Partial<Item>): Item => ({
  id: 'x', petId: 'p1', habitatId: 'h1', furnitureId: 'toy_ball', roomId: 'sala', x: 0, y: 0, rotation: 0, purchasedAt: new Date(), ...o,
});

describe('HabitatService (huellas, colocación y movimiento)', () => {
  it('sin posición coloca en el primer hueco donde cabe la huella y bloquea el hábitat', async () => {
    const { service, prisma, items } = makeService([item({ id: 'a', x: 0, y: 0 })]);
    const res = await service.placeFurniture('u1', 'soft_bed');
    expect(res).toMatchObject({ message: 'Furniture placed', room: 'sala', x: 0, y: 1, rotation: 0 });
    expect(items).toHaveLength(2);
    expect(prisma.$queryRaw).toHaveBeenCalled(); // SELECT … FOR UPDATE
  });

  it('con posición valida huella, límites y colisiones (y no deja el cobro hecho)', async () => {
    const { service } = makeService([item({ id: 'a', furnitureId: 'soft_bed', x: 5, y: 5 })]);
    await expect(service.placeFurniture('u1', 'toy_ball', { x: 6, y: 5 })).rejects.toThrow(BadRequestException);
    await expect(service.placeFurniture('u1', 'soft_bed', { x: 13, y: 0, rotation: 0 })).rejects.toThrow(/out of the room/);
    const ok = await service.placeFurniture('u1', 'soft_bed', { x: 13, y: 0, rotation: 1 });
    expect(ok).toMatchObject({ x: 13, y: 0, rotation: 1 });
  });

  it('los muebles de pared solo van contra la pared', async () => {
    const { service } = makeService();
    await expect(service.placeFurniture('u1', 'wall_shelf', { x: 4, y: 3 })).rejects.toThrow(/against a wall/);
    await expect(service.placeFurniture('u1', 'wall_shelf', { x: 4, y: 0 })).resolves.toMatchObject({ y: 0 });
  });

  it('sin saldo falla antes de colocar', async () => {
    const { service, items } = makeService([], { funds: false });
    await expect(service.placeFurniture('u1', 'toy_ball')).rejects.toThrow(/Not enough coins/);
    expect(items).toHaveLength(0);
  });

  it('respeta el bloqueo de sala por etapa', async () => {
    const { service } = makeService([], { stage: 'baby' });
    await expect(service.placeFurniture('u1', 'garden_pond')).rejects.toThrow(/Room locked/);
  });

  it('moveFurniture mueve y gira sin chocar consigo mismo', async () => {
    const { service, items } = makeService([
      item({ id: 'bed', furnitureId: 'soft_bed', x: 2, y: 2 }),
      item({ id: 'ball', x: 5, y: 2 }),
    ]);
    // Girar en el sitio: la cama ya ocupa 2,2; no debe contarse como colisión.
    await expect(service.moveFurniture('u1', 'bed', { rotation: 1 })).resolves.toMatchObject({ x: 2, y: 2, rotation: 1 });
    await expect(service.moveFurniture('u1', 'bed', { x: 4, y: 2, rotation: 0 })).rejects.toThrow(/occupied/);
    await service.moveFurniture('u1', 'bed', { x: 7, y: 7 });
    expect(items.find((i) => i.id === 'bed')).toMatchObject({ x: 7, y: 7, rotation: 1 });
    await expect(service.moveFurniture('u1', 'nope', { x: 1, y: 1 })).rejects.toThrow(NotFoundException);
  });

  it('removeItem quita un mueble concreto', async () => {
    const { service, items } = makeService([item({ id: 'a' }), item({ id: 'b' })]);
    await expect(service.removeItem('u1', 'b')).resolves.toMatchObject({ itemId: 'b', furnitureId: 'toy_ball' });
    expect(items.map((i) => i.id)).toEqual(['a']);
  });

  it('getHabitat repara una vez los datos antiguos y devuelve rotación y tema', async () => {
    // Antiguo: cama en 0,1 (ocupa 0,1–1,1) y una pelota en 1,1 que ahora se solapa.
    const { service, prisma } = makeService([
      item({ id: 'bed', furnitureId: 'soft_bed', x: 0, y: 1 }),
      item({ id: 'ball', x: 1, y: 1 }),
    ]);
    const res: any = await service.getHabitat('u1');
    const sala = res.rooms.find((r: any) => r.id === 'sala');
    expect(sala.theme).toMatchObject({ floor: expect.stringMatching(/^#/) });
    const ball = sala.items.find((i: any) => i.id === 'ball');
    expect(ball).toMatchObject({ rotation: 0 });
    expect(ball.x === 1 && ball.y === 1).toBe(false);
    expect(prisma.habitatItem.update).toHaveBeenCalledTimes(1);

    prisma.habitatItem.update.mockClear();
    await service.getHabitat('u1');
    expect(prisma.habitatItem.update).not.toHaveBeenCalled(); // ya reparado
  });
});

describe('HabitatService · muebles de cualquier sala (spec 42)', () => {
  it('el MP3 va a la sala que pide el cliente, o a la primera si no dice ninguna', async () => {
    const { service } = makeService();
    await expect(service.placeFurniture('u1', 'mp3', { roomId: 'jardin' })).resolves.toMatchObject({ room: 'jardin' });
    const { service: other } = makeService();
    await expect(other.placeFurniture('u1', 'mp3')).resolves.toMatchObject({ room: 'sala' });
  });

  it('respeta el bloqueo de la sala elegida', async () => {
    const { service } = makeService([], { stage: 'baby' });
    await expect(service.placeFurniture('u1', 'mp3', { roomId: 'santuario' })).rejects.toThrow(/Room locked/);
  });

  it('es único: no se compra dos veces (y no se cobra)', async () => {
    const { service, wallet } = makeService([item({ id: 'm', furnitureId: 'mp3', x: 3, y: 3 })]);
    await expect(service.placeFurniture('u1', 'mp3', { roomId: 'jardin' })).rejects.toThrow(/Already owned/);
    expect(wallet.debit).not.toHaveBeenCalled();
  });

  it('se mueve a otra sala sin cobro; los muebles normales no pueden cambiar de sala', async () => {
    const { service, items } = makeService([item({ id: 'm', furnitureId: 'mp3', x: 3, y: 3 }), item({ id: 'b', x: 6, y: 6 })]);
    await expect(service.moveFurniture('u1', 'm', { roomId: 'jardin' })).resolves.toMatchObject({ room: 'jardin' });
    expect(items.find((i) => i.id === 'm')!.roomId).toBe('jardin');
    await expect(service.moveFurniture('u1', 'b', { roomId: 'jardin' })).rejects.toThrow(/cannot change room/);
  });
});
