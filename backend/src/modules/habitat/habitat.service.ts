import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface RoomConfig {
  id: string;
  name: string;
  gridWidth: number;
  gridHeight: number;
  unlockStage: string;
  description: string;
}

interface FurnitureConfig {
  id: string;
  name: string;
  room: string;
  price: number;
  currency: 'coins' | 'gems';
  buffs: Record<string, number>;
  description: string;
}

interface HabitatData {
  rooms: RoomConfig[];
  furniture: FurnitureConfig[];
  buffCaps: Record<string, number>;
}

@Injectable()
export class HabitatService {
  private habitatData: HabitatData;

  constructor(private readonly prisma: PrismaService) {
    this.habitatData = require('../../../../shared/game-data/habitats.json');
  }

  async getHabitat(userId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { userId } });
    if (!pet) {
      throw new NotFoundException('No pet found for this user');
    }

    const habitat = await this.prisma.habitat.findUnique({
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

    return this.buildHabitatResponse(habitat, pet.stage);
  }

  async placeFurniture(userId: string, furnitureId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { userId } });
    if (!pet) throw new NotFoundException('No pet found for this user');

    const furniture = this.habitatData.furniture.find((f) => f.id === furnitureId);
    if (!furniture) throw new NotFoundException('Furniture not found');

    const room = this.habitatData.rooms.find((r) => r.id === furniture.room);
    if (!room) throw new BadRequestException('Invalid room for furniture');

    const stageOrder = ['baby', 'juvenile', 'adult', 'final'];
    if (stageOrder.indexOf(pet.stage) < stageOrder.indexOf(room.unlockStage)) {
      throw new BadRequestException(`Room locked. Requires stage: ${room.unlockStage}`);
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (furniture.currency === 'coins' && user.coins < furniture.price) {
      throw new BadRequestException('Not enough coins');
    }
    if (furniture.currency === 'gems' && user.gems < furniture.price) {
      throw new BadRequestException('Not enough gems');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: furniture.currency === 'coins'
        ? { coins: { decrement: furniture.price } }
        : { gems: { decrement: furniture.price } },
    });

    const habitat = await this.prisma.habitat.findUnique({ where: { petId: pet.id } });
    if (!habitat) throw new NotFoundException('Habitat not found for this pet');

    const existing = await this.prisma.habitatItem.findMany({
      where: { petId: pet.id, roomId: room.id },
    });
    const occupied = new Set(existing.map((i) => `${i.x},${i.y}`));

    for (let x = 0; x < room.gridWidth; x++) {
      for (let y = 0; y < room.gridHeight; y++) {
        if (!occupied.has(`${x},${y}`)) {
          await this.prisma.habitatItem.create({
            data: { petId: pet.id, habitatId: habitat.id, furnitureId: furniture.id, roomId: room.id, x, y },
          });
          return { message: 'Furniture placed', furnitureId, room: room.id };
        }
      }
    }
    throw new BadRequestException('No free cells in room');
  }

  async removeFurniture(userId: string, furnitureId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { userId } });
    if (!pet) throw new NotFoundException('No pet found for this user');

    const item = await this.prisma.habitatItem.findFirst({
      where: { petId: pet.id, furnitureId },
    });
    if (!item) throw new NotFoundException('Furniture not found in habitat');

    await this.prisma.habitatItem.delete({ where: { id: item.id } });
    return { message: 'Furniture removed', furnitureId };
  }

  async getActiveBuffs(userId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { userId } });
    if (!pet) throw new NotFoundException('No pet found for this user');

    const items = await this.prisma.habitatItem.findMany({ where: { petId: pet.id } });
    const aggregated: Record<string, number> = {};

    for (const item of items) {
      const furn = this.habitatData.furniture.find((f) => f.id === item.furnitureId);
      if (furn?.buffs) {
        for (const [k, v] of Object.entries(furn.buffs)) {
          aggregated[k] = (aggregated[k] || 0) + v;
        }
      }
    }

    const capped: Record<string, number> = {};
    for (const [k, v] of Object.entries(aggregated)) {
      const cap = this.habitatData.buffCaps[k];
      capped[k] = cap ? Math.min(v, cap) : v;
    }

    return { petId: pet.id, activeBuffs: capped, itemCount: items.length };
  }

  async unlockRoom(petId: string, newStage: string) {
    const stageOrder = ['baby', 'juvenile', 'adult', 'final'];
    const newStageIdx = stageOrder.indexOf(newStage);
    const habitat = await this.prisma.habitat.findUnique({ where: { petId } });
    if (!habitat) return;

    const newlyUnlocked = this.habitatData.rooms
      .filter(
        (r) =>
          stageOrder.indexOf(r.unlockStage) <= newStageIdx &&
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
    const stageOrder = ['baby', 'juvenile', 'adult', 'final'];
    const stageIdx = stageOrder.indexOf(stage);
    const unlockedRooms = this.habitatData.rooms
      .filter((r) => stageOrder.indexOf(r.unlockStage) <= stageIdx)
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
      items: { id: string; furnitureId: string; roomId: string; x: number; y: number }[];
    },
    petStage: string,
  ) {
    const stageOrder = ['baby', 'juvenile', 'adult', 'final'];
    const petStageIdx = stageOrder.indexOf(petStage);

    const rooms = this.habitatData.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      description: room.description,
      gridWidth: room.gridWidth,
      gridHeight: room.gridHeight,
      unlocked: stageOrder.indexOf(room.unlockStage) <= petStageIdx,
      active: habitat.rooms.includes(room.id),
      items: habitat.items
        .filter((i) => i.roomId === room.id)
        .map((i) => ({ id: i.id, furnitureId: i.furnitureId, x: i.x, y: i.y })),
    }));

    return { petId: habitat.petId, habitatSeed: habitat.habitatSeed, rooms };
  }
}