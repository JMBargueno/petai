import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisService } from '../../redis/redis.service';
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
  interaction?: 'sleep' | 'eat' | 'play' | 'bathe' | 'sit' | 'listen';
  /** Solo se puede tener uno (spec 42). */
  unique?: boolean;
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

export interface FurnitureUseConfig {
  dailyCap: number;
  cooldownSeconds: number;
  effects: Record<string, Partial<Record<'hunger' | 'happiness' | 'energy' | 'hygiene', number>>>;
}

export interface FurnitureUseResult {
  /** Si el uso ha tenido efecto. */
  applied: boolean;
  /** Por qué no: límite diario, enfriamiento, fuera de su hábitat, dormido o desactivado. */
  reason?: 'daily_cap' | 'cooldown' | 'away' | 'asleep' | 'disabled';
  interaction: string;
  petId: string;
  vitals: { hunger: number; happiness: number; energy: number; hygiene: number };
  remainingToday?: number;
}

@Injectable()
export class HabitatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly gameData: GameDataService,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  /** Respaldo en memoria de los contadores de uso cuando Redis no responde. */
  private readonly localUses = new Map<string, number>();
  private readonly localCooldown = new Map<string, number>();

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

    const room = this.targetRoom(furniture, input.roomId);
    if (!room) throw new BadRequestException('Invalid room for furniture');

    if (STAGE_ORDER.indexOf(pet.stage) < STAGE_ORDER.indexOf(room.unlockStage)) {
      throw new BadRequestException(`Room locked. Requires stage: ${room.unlockStage}`);
    }

    // S-05 (SDD §3.3): cobro atómico race-safe (C-01) y entrega en la misma transacción. Si no hay
    // hueco o la posición no es válida, el cargo se revierte.
    return await this.prisma.$transaction(async (tx) => {
      // Muebles únicos (spec 42): solo se compran una vez; para cambiarlos de sala se mueven.
      if (furniture.unique && (await tx.habitatItem.count({ where: { petId: pet.id, furnitureId: furniture.id } })) > 0) {
        throw new BadRequestException('Already owned: move it to another room instead');
      }
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

      // Cambiar de sala solo vale para los muebles de cualquier sala (`room: "*"`, spec 42).
      const changingRoom = input.roomId !== undefined && input.roomId !== item.roomId;
      const def = this.data().furniture.find((f) => f.id === item.furnitureId);
      if (changingRoom && def?.room !== '*') throw new BadRequestException('This furniture cannot change room');
      const room = this.data().rooms.find((r) => r.id === (changingRoom ? input.roomId : item.roomId));
      if (!room) throw new BadRequestException('Invalid room for furniture');
      if (changingRoom && STAGE_ORDER.indexOf(pet.stage) < STAGE_ORDER.indexOf(room.unlockStage)) {
        throw new BadRequestException(`Room locked. Requires stage: ${room.unlockStage}`);
      }
      const shape = this.shapeOf(item.furnitureId);

      const others = (await tx.habitatItem.findMany({ where: { petId: pet.id, roomId: room.id } }))
        .filter((i) => i.id !== item.id)
        .map((i) => this.placedShape(i));
      let placement: Placement | null;
      if (changingRoom && (input.x === undefined || input.y === undefined)) {
        // A otra sala sin posición: al primer hueco donde quepa
        placement = findFreePlacement(room, shape, others);
        if (!placement) throw new BadRequestException('No free cells in room');
      } else {
        placement = {
          x: input.x ?? item.x,
          y: input.y ?? item.y,
          rotation: normalizeRotation(input.rotation ?? item.rotation),
        };
        const err = validatePlacement(room, shape, placement, others);
        if (err) throw new BadRequestException(PLACEMENT_ERRORS[err]);
      }

      await tx.habitatItem.update({ where: { id: item.id }, data: { ...placement, roomId: room.id } });
      return { message: 'Furniture moved', itemId: item.id, furnitureId: item.furnitureId, room: room.id, ...placement };
    });
  }

  /**
   * Sala donde va un mueble. Los de cualquier sala (`room: "*"`) usan la que pide el cliente o,
   * si no dice ninguna (clientes antiguos), la primera del catálogo.
   */
  private targetRoom(furniture: FurnitureConfig, roomId?: string): RoomConfig | undefined {
    const rooms = this.data().rooms;
    if (furniture.room !== '*') return rooms.find((r) => r.id === furniture.room);
    return roomId ? rooms.find((r) => r.id === roomId) : rooms[0];
  }

  /** Muebles distintos que tiene colocados la mascota (desbloquean habilidades, spec 42). */
  async ownedFurniture(petId: string): Promise<string[]> {
    const rows = await this.prisma.habitatItem.findMany({ where: { petId }, select: { furnitureId: true }, distinct: ['furnitureId'] });
    return rows.map((r) => r.furnitureId);
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

  /**
   * El Pockai ha usado un mueble en su sala (lo avisa el cliente, que es quien lo ve). El efecto
   * es pequeño y está acotado en servidor: un tope diario por mascota y un enfriamiento entre
   * usos, para que dejar la sala abierta no sustituya a cuidar de la mascota. Pasados los
   * límites no es un error: se contesta `applied: false` con el motivo.
   */
  async useItem(userId: string, itemId: string, now = new Date()): Promise<FurnitureUseResult> {
    const item = await this.prisma.habitatItem.findUnique({ where: { id: itemId } });
    const pet = item ? await this.prisma.pet.findFirst({ where: { id: item.petId, userId } }) : null;
    if (!item || !pet) throw new NotFoundException('Furniture not found in habitat');
    const interaction = this.data().furniture.find((f) => f.id === item.furnitureId)?.interaction;
    if (!interaction) throw new BadRequestException('Este mueble no se puede usar');

    const vitals = () => ({ hunger: pet.hunger, happiness: pet.happiness, energy: pet.energy, hygiene: pet.hygiene });
    const skip = (reason: FurnitureUseResult['reason']): FurnitureUseResult => ({ applied: false, reason, interaction, petId: pet.id, vitals: vitals() });
    const cfg = (this.gameData.getBalance() as { habitat?: { use?: FurnitureUseConfig } } | null)?.habitat?.use;
    const effect = cfg?.effects?.[interaction];
    if (!cfg || !effect) return skip('disabled');
    if (!pet.inHabitat) return skip('away');
    if (pet.sleeping && interaction !== 'sleep') return skip('asleep');

    const day = now.toISOString().slice(0, 10);
    const dayKey = `furniture:day:${pet.id}:${day}`;
    const used = await this.useCount(dayKey);
    if (used >= cfg.dailyCap) return skip('daily_cap');
    if (!(await this.acquireUseCooldown(pet.id, cfg.cooldownSeconds, now))) return skip('cooldown');

    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    const data: Record<string, number> = {};
    for (const [vital, delta] of Object.entries(effect)) data[vital] = clamp(((pet as unknown as Record<string, number>)[vital] ?? 0) + delta);
    const updated = await this.prisma.pet.update({ where: { id: pet.id }, data });
    const count = await this.bumpUseCount(dayKey);
    // La mente lo recuerda (una vez al día) y deriva un poco su carácter. Nunca rompe la respuesta.
    try {
      this.events?.emit('habitat:furniture_used', { userId, petId: pet.id, interaction, firstToday: count === 1 });
    } catch {
      /* la mente es opcional */
    }
    return {
      applied: true,
      interaction,
      petId: pet.id,
      vitals: { hunger: updated.hunger, happiness: updated.happiness, energy: updated.energy, hygiene: updated.hygiene },
      remainingToday: Math.max(0, cfg.dailyCap - count),
    };
  }

  private async useCount(key: string): Promise<number> {
    const raw = await this.redis?.run((c) => c.get(this.redis!.key(key)), 'habitat.use.get');
    const n = typeof raw === 'string' ? Number(raw) : NaN;
    return Math.max(Number.isFinite(n) ? n : 0, this.localUses.get(key) ?? 0);
  }

  private async bumpUseCount(key: string): Promise<number> {
    if (this.localUses.size > 5000) this.localUses.clear();
    const local = (this.localUses.get(key) ?? 0) + 1;
    this.localUses.set(key, local);
    const remote = await this.redis?.run(async (c) => {
      const n = await c.incr(this.redis!.key(key));
      if (n === 1) await c.expire(this.redis!.key(key), 36 * 60 * 60);
      return n;
    }, 'habitat.use.incr');
    return Math.max(local, typeof remote === 'number' ? remote : 0);
  }

  /** `true` si puede usar un mueble ahora (y deja puesto el enfriamiento). */
  private async acquireUseCooldown(petId: string, seconds: number, now: Date): Promise<boolean> {
    const until = this.localCooldown.get(petId) ?? 0;
    if (until > now.getTime()) return false;
    const key = `furniture:cooldown:${petId}`;
    const set = await this.redis?.run((c) => c.set(this.redis!.key(key), '1', 'EX', seconds, 'NX'), 'habitat.use.cooldown');
    // Redis responde y ya había enfriamiento (otra réplica): no toca
    if (this.redis && set === null && (await this.redis.run((c) => c.exists(this.redis!.key(key)), 'habitat.use.exists')) === 1) return false;
    if (this.localCooldown.size > 5000) this.localCooldown.clear();
    this.localCooldown.set(petId, now.getTime() + seconds * 1000);
    return true;
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