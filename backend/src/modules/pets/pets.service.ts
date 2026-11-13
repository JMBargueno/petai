import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { GameDataService } from '../game-data/game-data.service';

@Injectable()
export class PetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly gameData: GameDataService,
  ) {}

  async getPets(userId: string) {
    const pets = await this.prisma.pet.findMany({
      where: { userId },
      include: { species: true, pattern: true },
      orderBy: { createdAt: 'desc' },
    });

    const updatedPets = [];
    for (const pet of pets) {
      const updated = await this.applyLazyTick(pet);
      updatedPets.push(updated);
    }
    return updatedPets;
  }

  async getPetById(userId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, userId },
      include: { species: true, pattern: true },
    });
    if (!pet) {
      throw new NotFoundException('Mascota no encontrada');
    }
    return this.applyLazyTick(pet);
  }

  async feed(userId: string, petId: string, itemId: string) {
    const pet = await this.getPetById(userId, petId);
    if (pet.sleeping) {
      throw new BadRequestException('No puedes alimentar a la mascota mientras duerme');
    }

    const item = await this.inventoryService.consumeItem(userId, itemId);
    const effects = item.effects as any;

    const isFavorite = pet.species.favoriteFood === item.id;
    const multiplier = isFavorite ? 1.5 : 1.0;

    const hungerBoost = (effects.hunger || 0) * multiplier;
    const happinessBoost = (effects.happiness || 0) * multiplier;
    const healthBoost = effects.health || 0;
    const energyBoost = effects.energy || 0;

    const newHunger = Math.min(100, Math.max(0, pet.hunger + hungerBoost));
    const newHappiness = Math.min(100, Math.max(0, pet.happiness + happinessBoost));
    const newHealth = Math.min(100, Math.max(0, pet.health + healthBoost));
    const newEnergy = Math.min(100, Math.max(0, pet.energy + energyBoost));

    // Otorgar algo de XP al alimentar
    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data: {
        hunger: newHunger,
        happiness: newHappiness,
        health: newHealth,
        energy: newEnergy,
        lastTickAt: new Date(),
      },
      include: { species: true, pattern: true },
    });

    const withXp = await this.addXpInternal(updated, 15);
    this.realtimeGateway.emitPetUpdate(userId, withXp);
    return withXp;
  }

  async clean(userId: string, petId: string) {
    const pet = await this.getPetById(userId, petId);
    if (pet.sleeping) {
      throw new BadRequestException('No puedes bañar a la mascota mientras duerme');
    }

    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data: {
        hygiene: 100.0,
        happiness: Math.min(100, pet.happiness + 10),
        lastTickAt: new Date(),
      },
      include: { species: true, pattern: true },
    });

    const withXp = await this.addXpInternal(updated, 10);
    this.realtimeGateway.emitPetUpdate(userId, withXp);
    return withXp;
  }

  async sleep(userId: string, petId: string) {
    const pet = await this.getPetById(userId, petId);
    if (pet.sleeping) {
      throw new BadRequestException('La mascota ya está durmiendo');
    }

    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data: { sleeping: true, lastTickAt: new Date() },
      include: { species: true, pattern: true },
    });

    this.realtimeGateway.emitPetUpdate(userId, updated);
    return updated;
  }

  async wake(userId: string, petId: string) {
    const pet = await this.getPetById(userId, petId);
    if (!pet.sleeping) {
      throw new BadRequestException('La mascota ya está despierta');
    }

    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data: { sleeping: false, lastTickAt: new Date() },
      include: { species: true, pattern: true },
    });

    this.realtimeGateway.emitPetUpdate(userId, updated);
    return updated;
  }

  async heal(userId: string, petId: string, itemId: string) {
    const pet = await this.getPetById(userId, petId);
    const item = await this.inventoryService.consumeItem(userId, itemId);
    const effects = item.effects as any;

    if (!effects.curesSick && (effects.health || 0) <= 0) {
      throw new BadRequestException('Este objeto no tiene propiedades medicinales');
    }

    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data: {
        health: Math.min(100, pet.health + (effects.health || 40)),
        sick: false,
        lastTickAt: new Date(),
      },
      include: { species: true, pattern: true },
    });

    this.realtimeGateway.emitPetUpdate(userId, updated);
    return updated;
  }

  async updatePet(userId: string, petId: string, data: { nickname?: string; strategy?: string }) {
    await this.getPetById(userId, petId);

    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data: {
        nickname: data.nickname,
        strategy: data.strategy,
      },
      include: { species: true, pattern: true },
    });

    this.realtimeGateway.emitPetUpdate(userId, updated);
    return updated;
  }

  private async applyLazyTick(pet: any) {
    const now = new Date();
    const elapsedMs = now.getTime() - new Date(pet.lastTickAt).getTime();
    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    if (elapsedHours < 0.01) {
      return pet; // Menos de ~36 segundos, sin cambio significativo
    }

    const balance = this.gameData.getBalance();
    const decay = pet.sleeping
      ? balance.vitals.decayPerHour.sleeping
      : balance.vitals.decayPerHour.awake;

    let newHunger = Math.max(0, pet.hunger - decay.hunger * elapsedHours);
    let newHappiness = Math.max(0, pet.happiness - decay.happiness * elapsedHours);
    let newEnergy = pet.sleeping
      ? Math.min(100, pet.energy + Math.abs(decay.energy) * elapsedHours)
      : Math.max(0, pet.energy - decay.energy * elapsedHours);
    let newHygiene = Math.max(0, pet.hygiene - decay.hygiene * elapsedHours);
    let newHealth = pet.health;

    // Si hambre o higiene están críticamente bajas (< 15), la salud decae
    if (newHunger < 15.0 || newHygiene < 15.0) {
      newHealth = Math.max(0, newHealth - 3.0 * elapsedHours);
    }

    const isSick = newHealth < 20.0 ? true : pet.sick;

    return this.prisma.pet.update({
      where: { id: pet.id },
      data: {
        hunger: Number(newHunger.toFixed(2)),
        happiness: Number(newHappiness.toFixed(2)),
        energy: Number(newEnergy.toFixed(2)),
        hygiene: Number(newHygiene.toFixed(2)),
        health: Number(newHealth.toFixed(2)),
        sick: isSick,
        lastTickAt: now,
      },
      include: { species: true, pattern: true },
    });
  }

  private async addXpInternal(pet: any, xpGained: number) {
    let currentXp = pet.xp + xpGained;
    let currentLevel = pet.level;
    let statPoints = pet.statPoints;
    let stage = pet.stage;

    // xp(n) = round(100 * n^1.5)
    let neededXp = Math.round(100 * Math.pow(currentLevel, 1.5));

    while (currentXp >= neededXp && currentLevel < 100) {
      currentXp -= neededXp;
      currentLevel += 1;
      statPoints += 3; // 3 puntos de combate por nivel

      // Hitos de evolución
      if (currentLevel >= 50) stage = 'final';
      else if (currentLevel >= 25) stage = 'adult';
      else if (currentLevel >= 10) stage = 'juvenile';

      neededXp = Math.round(100 * Math.pow(currentLevel, 1.5));
    }

    return this.prisma.pet.update({
      where: { id: pet.id },
      data: {
        xp: currentXp,
        level: currentLevel,
        statPoints,
        stage,
      },
      include: { species: true, pattern: true },
    });
  }
}
