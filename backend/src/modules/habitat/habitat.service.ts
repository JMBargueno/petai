import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { GameDataService } from '../game-data/game-data.service';
import {
  findFreePlacement,
  normalizeRotation,
  repairRoom,
  validatePlacement,
  type BlockedRect,
  type FurnitureShape,
  type Mount,
  type PlacedShape,
  type Placement,
  type PlacementError,
} from './habitat-layout';
import { computeActiveBuffs, type ActiveBuffs } from './habitat-buffs';
import type { MoveFurnitureInput, PlaceFurnitureInput } from './habitat.schemas';

export interface RoomConfig {
  id: string;
  name: string;
  gridWidth: number;
  gridHeight: number;
  /** Celdas sin suelo `[x, y, ancho, fondo]` (forma de la sala). */
  blocked?: BlockedRect[];
  unlockStage: string;
  description: string;
  theme?: Record<string, string>;
}

export interface FurnitureConfig {
  id: string;
  name: string;
  room: string;
  price: number;
  currency: 'coins' | 'gems';
  buffs: Record<string, number>;
  description: string;
  footprint?: [number, number];
  mount?: Mount;
  interaction?: 'sleep' | 'eat' | 'play' | 'bathe' | 'sit';
}

type ItemRow = { id: string; furnitureId: string; roomId: string; x: number; y: number; rotation: number };

/** Mensajes de error de colocación (400). */
const PLACEMENT_ERRORS: Record<PlacementError, string> = {
  out_of_bounds: 'Furniture does not fit there: out of the room grid',
  not_on_wall: 'Wall furniture must be placed against a wall (y = 0 with rotation 0/2, x = 0 with rotation 1/3)',
  collision: 'Cells already occupied by another furniture',
};

const STAGE_ORDER = ['baby', 'juvenile', 'adult', 'final'];

export interface HabitatData {
  rooms: RoomConfig[];
  furniture: FurnitureConfig[];
  buffCaps: Record<string, number>;
}

@Injectable()
export class HabitatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly gameData: GameDataService,
  ) {}

  /**
   * C-03: el game-data de hábitat se lee de `GameDataService` (snapshot validado con zod y
   * con hot-reload) en lugar de un `require` directo del JSON en el constructor.
   */
  private data(): HabitatData {
    const data = this.gameData.getHabitats();
    if (!data) throw new InternalServerErrorException('Game-data de hábitat no cargado');
    return data as HabitatData;
  }

  /** Catálogo del hábitat (salas, muebles y topes de buffs) para la interfaz de los clientes. */
  getCatalog() {
    const { rooms, furniture, buffCaps } = this.data();
    return { rooms, furniture, buffCaps };
  }

  async getHabitat(userId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { userId } });
    if (!pet) {
      throw new NotFoundException('No pet found for this user');
    }

    let habitat = await this.prisma.habitat.findUnique({
      where: { petId: pet.id },
      include: { items: true },
    });

    if (!habitat) {
      await this.initializeHabitat(pet.id, pet.stage);
      const fresh = await this.prisma.habitat.findUnique({
        where: { petId: pet.id },
        include: { items: true },
      });
      return fresh ? this.buildHabitatResponse(fresh, pet.stage) : null;
    }

    // Datos anteriores a las huellas (cada mueble ocupaba 1 celda): si alguno ya no es válido
    // (solapado, fuera de la sala o un mueble de pared lejos de la pared) se recoloca una vez.
    if (await this.repairLayout(habitat.items)) {
      habitat = await this.prisma.habitat.findUnique({ where: { petId: pet.id }, include: { items: true } });
      if (!habitat) return null;
    }

    return this.buildHabitatResponse(habitat, pet.stage);
  }

  /**
   * Coloca un mueble comprado. Con `x`/`y` (y opcionalmente `rotation`) va a esa celda si cabe;
   * sin posición se usa el primer hueco donde quepa su huella (comportamiento de los clientes
   * antiguos, que no envían cuerpo).
   */
  async placeFurniture(userId: string, furnitureId: string, input: PlaceFurnitureInput = {}) {
    const pet = await this.prisma.pet.findFirst({ where: { userId } });
    if (!pet) throw new NotFoundException('No pet found for this user');

    const furniture = this.data().furniture.find((f) => f.id === furnitureId);
    if (!furniture) throw new NotFoundException('Furniture not found');

    const room = this.data().rooms.find((r) => r.id === furniture.room);
    if (!room) throw new BadRequestException('Invalid room for furniture');

    if (STAGE_ORDER.indexOf(pet.stage) < STAGE_ORDER.indexOf(room.unlockStage)) {
      throw new BadRequestException(`Room locked. Requires stage: ${room.unlockStage}`);
    }

    // S-05 (SDD §3.3): cobro atómico race-safe (C-01) y entrega en la misma transacción. Si no hay
    // hueco o la posición no es válida, el cargo se revierte.
    return await this.prisma.$transaction(async (tx) => {
      const { ok } = await this.wallet.debit(tx, userId, furniture.currency, furniture.price);
      if (!ok) throw new BadRequestException(`Not enough ${furniture.currency}`);

      const habitat = await tx.habitat.findUnique({ where: { petId: pet.id } });
      if (!habitat) throw new NotFoundException('Habitat not found for this pet');
      await this.lockHabitat(tx, habitat.id);

      const existing = await tx.habitatItem.findMany({ where: { petId: pet.id, roomId: room.id } });
      const others = existing.map((i) => this.placedShape(i));

      let placement: Placement | null;
      if (input.x !== undefined && input.y !== undefined) {
        placement = { x: input.x, y: input.y, rotation: normalizeRotation(input.rotation) };
        const err = validatePlacement(room, furniture, placement, others);
        if (err) throw new BadRequestException(PLACEMENT_ERRORS[err]);
      } else {
        placement = findFreePlacement(room, furniture, others);
        if (!placement) throw new BadRequestException('No free cells in room');
      }

      const item = await tx.habitatItem.create({
        data: { petId: pet.id, habitatId: habitat.id, furnitureId: furniture.id, roomId: room.id, ...placement },
      });
      return { message: 'Furniture placed', furnitureId, room: room.id, itemId: item.id, ...placement };
    });
  }

  /** Mueve y/o gira un mueble ya colocado (sin cobro). Lo que no se envía se conserva. */
  async moveFurniture(userId: string, itemId: string, input: MoveFurnitureInput) {
    const pet = await this.prisma.pet.findFirst({ where: { userId } });
    if (!pet) throw new NotFoundException('No pet found for this user');

    return await this.prisma.$transaction(async (tx) => {
      const item = await tx.habitatItem.findFirst({ where: { id: itemId, petId: pet.id } });
      if (!item) throw new NotFoundException('Furniture not found in habitat');
      await this.lockHabitat(tx, item.habitatId);

      const room = this.data().rooms.find((r) => r.id === item.roomId);
      if (!room) throw new BadRequestException('Invalid room for furniture');
      const shape = this.shapeOf(item.furnitureId);

      const placement: Placement = {
        x: input.x ?? item.x,
        y: input.y ?? item.y,
        rotation: normalizeRotation(input.rotation ?? item.rotation),
      };
      const others = (await tx.habitatItem.findMany({ where: { petId: pet.id, roomId: item.roomId } }))
        .filter((i) => i.id !== item.id)
        .map((i) => this.placedShape(i));
      const err = validatePlacement(room, shape, placement, others);
      if (err) throw new BadRequestException(PLACEMENT_ERRORS[err]);

      await tx.habitatItem.update({ where: { id: item.id }, data: placement });
      return { message: 'Furniture moved', itemId: item.id, furnitureId: item.furnitureId, room: item.roomId, ...placement };
    });
  }

  /** Quita un mueble concreto (por id de item). */
  async removeItem(userId: string, itemId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { userId } });
    if (!pet) throw new NotFoundException('No pet found for this user');

    const item = await this.prisma.habitatItem.findFirst({ where: { id: itemId, petId: pet.id } });
    if (!item) throw new NotFoundException('Furniture not found in habitat');

    await this.prisma.habitatItem.delete({ where: { id: item.id } });
    return { message: 'Furniture removed', itemId: item.id, furnitureId: item.furnitureId };
  }

  /** Quita un mueble por tipo (el más reciente). Se mantiene para los clientes antiguos. */
  async removeFurniture(userId: string, furnitureId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { userId } });
    if (!pet) throw new NotFoundException('No pet found for this user');

    const item = await this.prisma.habitatItem.findFirst({
      where: { petId: pet.id, furnitureId },
      orderBy: { purchasedAt: 'desc' },
    });
    if (!item) throw new NotFoundException('Furniture not found in habitat');

    await this.prisma.habitatItem.delete({ where: { id: item.id } });
    return { message: 'Furniture removed', furnitureId, itemId: item.id };
  }

  /** Forma (huella y montaje) de un mueble del catálogo; desconocido → 1×1 de suelo. */
  private shapeOf(furnitureId: string): FurnitureShape {
    const f = this.data().furniture.find((x) => x.id === furnitureId);
    return { footprint: f?.footprint ?? [1, 1], mount: f?.mount ?? 'floor' };
  }

  private placedShape(i: ItemRow): PlacedShape {
    return { id: i.id, x: i.x, y: i.y, rotation: i.rotation ?? 0, ...this.shapeOf(i.furnitureId) };
  }

  /**
   * Bloqueo de fila del hábitat: serializa colocaciones concurrentes del mismo usuario (ya no hay
   * índice único por celda que las frene).
   */
  private async lockHabitat(tx: Prisma.TransactionClient, habitatId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Habitat" WHERE "id" = ${habitatId} FOR UPDATE`);
  }

  /** Recoloca los muebles no válidos de cada sala. Devuelve `true` si cambió algo. */
  private async repairLayout(items: ItemRow[]): Promise<boolean> {
    const updates: { id: string; to: Placement }[] = [];
    for (const room of this.data().rooms) {
      const inRoom = items.filter((i) => i.roomId === room.id).map((i) => ({ ...this.placedShape(i), id: i.id }));
      if (inRoom.length === 0) continue;
      updates.push(...repairRoom(room, inRoom).moved);
    }
    if (updates.length === 0) return false;
    await this.prisma.$transaction(
      updates.map((u) => this.prisma.habitatItem.update({ where: { id: u.id }, data: u.to })),
    );
    return true;
  }

  async getActiveBuffs(userId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { userId } });
    if (!pet) throw new NotFoundException('No pet found for this user');

    const items = await this.prisma.habitatItem.findMany({ where: { petId: pet.id } });
    // Mismo cálculo (suma + recorte a `buffCaps`) que usa la lógica de juego: ver habitat-buffs.ts
    const activeBuffs = computeActiveBuffs(items.map((i) => i.furnitureId), this.data());
    return { petId: pet.id, activeBuffs, itemCount: items.length };
  }

  /**
   * Buffs activos (ya recortados a `buffCaps`) de una mascota concreta, para la lógica de juego
   * (lazy tick de vitales y combate). Mismo cálculo que `getActiveBuffs`.
   */
  async getActiveBuffsForPet(petId: string): Promise<ActiveBuffs> {
    const items = await this.prisma.habitatItem.findMany({ where: { petId }, select: { furnitureId: true } });
    return computeActiveBuffs(items.map((i) => i.furnitureId), this.data());
  }

  /**
   * Buffs activos de varias mascotas con UNA sola consulta (lista de mascotas, combate, torneos).
   * Cada id pedido aparece en el mapa; sin muebles, con `{}`.
   */
  async getActiveBuffsForPets(petIds: string[]): Promise<Map<string, ActiveBuffs>> {
    const ids = Array.from(new Set(petIds));
    const out = new Map<string, ActiveBuffs>();
    if (ids.length === 0) return out;
    if (ids.length === 1) {
      out.set(ids[0], await this.getActiveBuffsForPet(ids[0]));
      return out;
    }
    const items = await this.prisma.habitatItem.findMany({
      where: { petId: { in: ids } },
      select: { petId: true, furnitureId: true },
    });
    const byPet = new Map<string, string[]>(ids.map((id) => [id, []]));
    for (const it of items) byPet.get(it.petId)?.push(it.furnitureId);
    const data = this.data();
    for (const [id, furnitureIds] of byPet) out.set(id, computeActiveBuffs(furnitureIds, data));
    return out;
  }

  async unlockRoom(petId: string, newStage: string) {
    const newStageIdx = STAGE_ORDER.indexOf(newStage);
    const habitat = await this.prisma.habitat.findUnique({ where: { petId } });
    if (!habitat) return;

    const newlyUnlocked = this.data().rooms
      .filter(
        (r) =>
          STAGE_ORDER.indexOf(r.unlockStage) <= newStageIdx &&
          !habitat.rooms.includes(r.id),
      )
      .map((r) => r.id);

    if (newlyUnlocked.length > 0) {
      await this.prisma.habitat.update({
        where: { petId },
        data: { rooms: [...habitat.rooms, ...newlyUnlocked] },
      });
    }
  }

  private async initializeHabitat(petId: string, stage: string) {
    const stageIdx = STAGE_ORDER.indexOf(stage);
    const unlockedRooms = this.data().rooms
      .filter((r) => STAGE_ORDER.indexOf(r.unlockStage) <= stageIdx)
      .map((r) => r.id);

    await this.prisma.habitat.create({
      data: { petId, habitatSeed: Math.floor(Math.random() * 100000), rooms: unlockedRooms },
    });
  }

  private buildHabitatResponse(
    habitat: {
      petId: string;
      habitatSeed: number;
      rooms: string[];
      items: ItemRow[];
    },
    petStage: string,
  ) {
    const petStageIdx = STAGE_ORDER.indexOf(petStage);

    const rooms = this.data().rooms.map((room) => ({
      id: room.id,
      name: room.name,
      description: room.description,
      theme: room.theme ?? null,
      gridWidth: room.gridWidth,
      gridHeight: room.gridHeight,
      blocked: room.blocked ?? [],
      unlocked: STAGE_ORDER.indexOf(room.unlockStage) <= petStageIdx,
      active: habitat.rooms.includes(room.id),
      items: habitat.items
        .filter((i) => i.roomId === room.id)
        .map((i) => ({ id: i.id, furnitureId: i.furnitureId, x: i.x, y: i.y, rotation: i.rotation ?? 0 })),
    }));

    return { petId: habitat.petId, habitatSeed: habitat.habitatSeed, rooms };
  }
}