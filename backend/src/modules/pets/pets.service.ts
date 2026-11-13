import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { GameDataService } from '../game-data/game-data.service';
import { nightHoursBetween, safeTimeZone } from './sleep-cycle';

const STAGE_ORDER = ['baby', 'juvenile', 'adult', 'final'];
/** Higiene a partir de la cual el baño se rechaza (balance.vitals.cleanMaxHygiene lo sustituye). */
const DEFAULT_CLEAN_MAX_HYGIENE = 80;

@Injectable()
export class PetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly gameData: GameDataService,
    private readonly eventEmitter: EventEmitter2,
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

  async feed(userId: string, petId: string, itemId?: string) {
    if (!itemId || typeof itemId !== 'string') {
      throw new BadRequestException('itemId es obligatorio');
    }
    const pet = await this.getPetById(userId, petId);
    if (pet.sleeping) {
      throw new BadRequestException('No puedes alimentar a la mascota mientras duerme');
    }

    const item = await this.inventoryService.consumeItem(userId, itemId, 'food');
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
    this.eventEmitter.emit('pet:fed', { userId, petId });
    return withXp;
  }

  async clean(userId: string, petId: string) {
    const pet = await this.getPetById(userId, petId);
    if (pet.sleeping) {
      throw new BadRequestException('No puedes bañar a la mascota mientras duerme');
    }
    // El baño da XP y felicidad: solo cuenta si la mascota lo necesita. Sin esta condición la acción
    // (gratuita y sin espera) se podía repetir sin fin para subir de nivel.
    const cleanMaxHygiene = this.gameData.getBalance().vitals?.cleanMaxHygiene ?? DEFAULT_CLEAN_MAX_HYGIENE;
    if (pet.hygiene >= cleanMaxHygiene) {
      throw new BadRequestException('La mascota ya está limpia; báñala cuando se ensucie');
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
    this.eventEmitter.emit('pet:cleaned', { userId, petId });
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
    this.eventEmitter.emit('pet:slept', { userId, petId });
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

  async heal(userId: string, petId: string, itemId?: string) {
    let targetItemId = itemId;
    if (!targetItemId || typeof targetItemId !== 'string') {
      const medicineItem = await this.prisma.inventoryItem.findFirst({
        where: { userId, qty: { gt: 0 }, item: { kind: 'medicine' } },
        include: { item: true },
      });
      if (!medicineItem) {
        throw new BadRequestException('No tienes medicinas en tu inventario para curar a la mascota');
      }
      targetItemId = medicineItem.itemId;
    }
    const pet = await this.getPetById(userId, petId);

    // Se valida ANTES de gastar el objeto: un 400 no debe costarle la medicina al usuario
    const candidate = targetItemId.length <= 64 ? await this.prisma.item.findUnique({ where: { id: targetItemId } }) : null;
    const candidateEffects = (candidate?.effects ?? {}) as any;
    if (candidate && candidate.kind === 'medicine' && !candidateEffects.curesSick && (candidateEffects.health || 0) <= 0) {
      throw new BadRequestException('Este objeto no tiene propiedades medicinales');
    }

    const item = await this.inventoryService.consumeItem(userId, targetItemId, 'medicine');
    const effects = item.effects as any;

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

  /** Forma final: nivel mínimo + consumo del objeto especial de evolución. */
  async evolve(userId: string, petId: string) {
    const pet = await this.getPetById(userId, petId);
    const cfg = this.gameData.getBalance().evolution;

    if (pet.stage === 'final') {
      throw new BadRequestException('La mascota ya está en su forma final');
    }
    if (pet.stage !== 'adult' || pet.level < cfg.finalStageMinLevel) {
      throw new BadRequestException(
        `La forma final requiere una mascota adulta de nivel ${cfg.finalStageMinLevel} o superior`,
      );
    }

    await this.inventoryService.consumeItem(userId, cfg.finalStageItemId, 'evolution');

    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data: { stage: 'final' },
      include: { species: true, pattern: true },
    });
    this.realtimeGateway.emitPetUpdate(userId, updated);
    this.eventEmitter.emit('pet:evolved', { userId, petId });
    return updated;
  }

  /** Recompensa de actividades (minijuegos): XP, felicidad y coste de energía. */
  async applyActivityReward(
    userId: string,
    petId: string,
    reward: { xp: number; happiness: number; energyCost: number },
  ) {
    const pet = await this.getPetById(userId, petId);
    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data: {
        // La felicidad puede bajar (p. ej. perder una pelea) pero siempre se mantiene en 0–100
        happiness: Math.min(100, Math.max(0, pet.happiness + reward.happiness)),
        energy: Math.max(0, pet.energy - reward.energyCost),
        lastTickAt: new Date(),
      },
      include: { species: true, pattern: true },
    });
    const withXp = await this.addXpInternal(updated, reward.xp);
    this.realtimeGateway.emitPetUpdate(userId, withXp);
    return withXp;
  }

  async updatePet(userId: string, petId: string, input: { nickname?: string; strategy?: string } | undefined) {
    await this.getPetById(userId, petId);

    const data: { nickname?: string; strategy?: string } = {};
    if (input?.nickname !== undefined) {
      const nick = typeof input.nickname === 'string' ? input.nickname.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
      if (nick.length < 1 || nick.length > 30) {
        throw new BadRequestException('nickname debe tener entre 1 y 30 caracteres');
      }
      data.nickname = nick;
    }
    if (input?.strategy !== undefined) {
      if (!['aggressive', 'defensive', 'balanced'].includes(input.strategy as string)) {
        throw new BadRequestException('strategy debe ser aggressive, defensive o balanced');
      }
      data.strategy = input.strategy;
    }

    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data,
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

    // Ciclo de sueño: horas del intervalo que caen en la noche local del usuario
    const sleepCfg = balance.sleep;
    let nightHours = 0;
    if (sleepCfg) {
      const owner = await this.prisma.user.findUnique({
        where: { id: pet.userId },
        select: { timezone: true },
      });
      nightHours = nightHoursBetween(
        new Date(pet.lastTickAt),
        now,
        safeTimeZone(owner?.timezone),
        sleepCfg.nightStartHour,
        sleepCfg.nightEndHour,
      );
    }

    let newHunger = Math.max(0, pet.hunger - decay.hunger * elapsedHours);
    let newHappiness = Math.max(0, pet.happiness - decay.happiness * elapsedHours);
    let newEnergy: number;
    let newHealth = pet.health;
    if (pet.sleeping) {
      // Dormir de noche recupera más energía y regenera algo de salud
      const effectiveHours = elapsedHours + (sleepCfg ? (sleepCfg.sleepingNightEnergyBonus - 1) * nightHours : 0);
      newEnergy = Math.min(100, pet.energy + Math.abs(decay.energy) * effectiveHours);
      if (sleepCfg) {
        newHealth = Math.min(100, newHealth + sleepCfg.sleepingNightHealthRegenPerHour * nightHours);
      }
    } else {
      // Estar despierto de noche cansa más
      const effectiveHours = elapsedHours + (sleepCfg ? (sleepCfg.awakeNightEnergyMultiplier - 1) * nightHours : 0);
      newEnergy = Math.max(0, pet.energy - decay.energy * effectiveHours);
    }
    let newHygiene = Math.max(0, pet.hygiene - decay.hygiene * elapsedHours);

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
    let levelChanged = false;

    // xp(n) = round(100 * n^1.5)
    let neededXp = Math.round(100 * Math.pow(currentLevel, 1.5));

    while (currentXp >= neededXp && currentLevel < 100) {
      currentXp -= neededXp;
      currentLevel += 1;
      statPoints += 3; // 3 puntos de combate por nivel
      levelChanged = true;

      // Hitos de evolución automáticos (la forma final requiere un objeto: ver evolve())
      let reached = 'baby';
      if (currentLevel >= 25) reached = 'adult';
      else if (currentLevel >= 10) reached = 'juvenile';
      if (STAGE_ORDER.indexOf(reached) > STAGE_ORDER.indexOf(stage)) stage = reached;

      neededXp = Math.round(100 * Math.pow(currentLevel, 1.5));
    }

    const updated = await this.prisma.pet.update({
      where: { id: pet.id },
      data: {
        xp: currentXp,
        level: currentLevel,
        statPoints,
        stage,
      },
      include: { species: true, pattern: true },
    });

    if (levelChanged) {
      this.eventEmitter.emit('pet:level_up', { userId: pet.userId, petId: pet.id });
    }

    return updated;
  }
}
