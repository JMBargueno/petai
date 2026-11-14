import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { GameDataService } from '../game-data/game-data.service';
import { createRng } from '../battles/combat/rng';

export type Element = 'fire' | 'water' | 'plant' | 'electric' | 'shadow' | 'light';

const ELEMENTS: Element[] = ['fire', 'water', 'plant', 'electric', 'shadow', 'light'];

const ADVANTAGE: Record<Element, Element[]> = {
  fire: ['plant'],
  water: ['fire'],
  plant: ['water', 'electric'],
  electric: ['water'],
  shadow: ['light'],
  light: ['shadow'],
};

export interface FloorData {
  floor: number;
  enemyElement: Element;
  enemyName: string;
  enemyLevel: number;
}

export interface SubmitResponse {
  floor: number;
  result: 'advanced' | 'failed' | 'completed' | 'failed_dungeon';
  enemyElement: Element;
  playerElement: Element;
  multiplier: number;
  hearts: number;
  currentFloor: number;
  status: string;
  buff?: { multiplier: number; expiresAt: string };
  predictionBonus?: boolean;
  xp?: number;
  coins?: number;
}

@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);
  private readonly TOTAL_FLOORS = 5;
  private readonly MAX_HEARTS = 3;
  private readonly ENERGY_COST = 10;
  private readonly COOLDOWN_SECONDS = 30;
  private readonly DAILY_LIMIT = 20;
  private readonly BUFF_DURATION_MS = 24 * 60 * 60 * 1000;
  private readonly BASE_BUFF_MULTIPLIER = 0.05;
  private readonly PREDICTION_BONUS = 0.02;
  private readonly SESSION_TTL_MS = 10 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly petsService: PetsService,
    private readonly gameData: GameDataService,
  ) {}

  private get combatCfg() {
    return this.gameData.getBalance().combats;
  }

  async startTraining(userId: string, petId: string) {
    if (!petId) throw new BadRequestException('petId es obligatorio');

    const pet = await this.petsService.getPetById(userId, petId);
    if (pet.sleeping) throw new BadRequestException('La mascota está durmiendo');
    if (pet.energy < this.ENERGY_COST) throw new BadRequestException('La mascota no tiene suficiente energía');

    const activeSession = await this.prisma.trainingSession.findFirst({
      where: { userId, petId, status: 'active' },
    });
    if (activeSession) throw new BadRequestException('Ya tienes una sesión de entrenamiento activa');

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sessionsToday = await this.prisma.trainingSession.count({
      where: { userId, startedAt: { gte: dayAgo } },
    });
    if (sessionsToday >= this.DAILY_LIMIT) throw new BadRequestException('Límite diario alcanzado');

    const lastSession = await this.prisma.trainingSession.findFirst({
      where: { userId }, orderBy: { startedAt: 'desc' },
    });
    if (lastSession && Date.now() - lastSession.startedAt.getTime() < this.COOLDOWN_SECONDS * 1000) {
      throw new BadRequestException('Espera unos segundos antes de entrenar de nuevo');
    }

    const seed = randomInt(1, 2 ** 31 - 1);
    const floors = this.buildDungeon(seed, pet.level);

    await this.prisma.pet.update({
      where: { id: petId },
      data: { energy: Math.max(0, pet.energy - this.ENERGY_COST) },
    });

    const session = await this.prisma.trainingSession.create({
      data: { userId, petId, seed, floors: floors as any, status: 'active', hearts: this.MAX_HEARTS, currentFloor: 0 },
    });

    return { sessionId: session.id, petId, seed, floors, hearts: this.MAX_HEARTS, currentFloor: 0 };
  }

  async submitFloor(userId: string, petId: string, playerElement: string, prediction?: string): Promise<SubmitResponse> {
    const session = await this.prisma.trainingSession.findFirst({
      where: { userId, petId, status: 'active' },
    });
    if (!session) throw new NotFoundException('No hay sesión de entrenamiento activa');

    if (Date.now() - session.startedAt.getTime() > this.SESSION_TTL_MS) {
      await this.prisma.trainingSession.update({ where: { id: session.id }, data: { status: 'failed', finishedAt: new Date() } });
      throw new BadRequestException('La sesión de entrenamiento ha expirado');
    }

    const element = playerElement as Element;
    if (!ELEMENTS.includes(element)) throw new BadRequestException(`Elemento inválido: ${playerElement}`);

    const floors = session.floors as unknown as FloorData[];
    const currentFloorIdx = session.currentFloor;
    const floorData = floors[currentFloorIdx];
    if (!floorData) throw new BadRequestException('Piso inválido');

    const enemyElement = floorData.enemyElement;
    const multiplier = this.getElementMultiplier(element, enemyElement);
    const isAdvantageous = multiplier >= this.combatCfg.elementAdvantage;

    let hearts = session.hearts;
    let newStatus = session.status;
    let newCurrentFloor = currentFloorIdx;
    let result: SubmitResponse['result'];

    if (isAdvantageous) {
      newCurrentFloor = currentFloorIdx + 1;
      result = 'advanced';
    } else {
      hearts = Math.max(0, hearts - 1);
      if (hearts === 0) { newStatus = 'failed'; result = 'failed_dungeon'; }
      else { result = 'failed'; }
    }

    let buffMultiplier: number | null = null;
    let buffExpiresAt: Date | null = null;
    let xp = 0;
    let coins = 0;

    if (newCurrentFloor >= this.TOTAL_FLOORS) {
      newStatus = 'completed';
      result = 'completed';
      buffMultiplier = this.BASE_BUFF_MULTIPLIER;
      if (prediction) {
        const predFloor = floors[Math.min(currentFloorIdx, floors.length - 1)];
        if (prediction === predFloor.enemyElement) buffMultiplier = this.BASE_BUFF_MULTIPLIER + this.PREDICTION_BONUS;
      }
      buffExpiresAt = new Date(Date.now() + this.BUFF_DURATION_MS);
      xp = 50; coins = 36;
    } else if (newStatus === 'failed') {
      xp = Math.floor(50 * (currentFloorIdx / this.TOTAL_FLOORS));
      coins = Math.floor(36 * (currentFloorIdx / this.TOTAL_FLOORS));
    }

    const updated = await this.prisma.trainingSession.update({
      where: { id: session.id },
      data: {
        hearts, currentFloor: newCurrentFloor, status: newStatus,
        prediction, predictionCorrect: prediction === floorData.enemyElement,
        buffMultiplier, buffExpiresAt, xpAwarded: xp, coinsAwarded: coins,
        finishedAt: newStatus !== 'active' ? new Date() : undefined,
      },
    });

    if (newStatus === 'completed') {
      await this.prisma.pet.update({ where: { id: petId }, data: { xp: { increment: xp }, happiness: { increment: 12 } } });
      await this.prisma.user.update({ where: { id: userId }, data: { coins: { increment: coins } } });
    } else if (newStatus === 'failed') {
      await this.prisma.pet.update({ where: { id: petId }, data: { xp: { increment: xp } } });
    }

    const response: SubmitResponse = {
      floor: currentFloorIdx, result, enemyElement, playerElement: element,
      multiplier, hearts, currentFloor: newCurrentFloor, status: newStatus,
    };
    if (buffMultiplier && buffExpiresAt) response.buff = { multiplier: buffMultiplier, expiresAt: buffExpiresAt.toISOString() };
    if (prediction && updated.predictionCorrect) response.predictionBonus = true;
    if (xp) response.xp = xp;
    if (coins) response.coins = coins;

    return response;
  }

  async getActiveBuff(userId: string, petId?: string) {
    const where: any = { userId, buffExpiresAt: { gt: new Date() }, buffMultiplier: { not: null } };
    if (petId) where.petId = petId;
    const session = await this.prisma.trainingSession.findFirst({ where, orderBy: { buffExpiresAt: 'asc' } });
    if (!session) return { active: false, buff: null };
    return {
      active: true,
      buff: {
        petId: session.petId, multiplier: session.buffMultiplier, type: 'multiplicator',
        stats: ['atk', 'esp'], expiresAt: session.buffExpiresAt!.toISOString(),
        remainingMs: session.buffExpiresAt!.getTime() - Date.now(),
      },
    };
  }

  private buildDungeon(seed: number, petLevel: number): FloorData[] {
    const rng = createRng(seed);
    const floors: FloorData[] = [];
    const names: Record<Element, string> = { fire: 'Furnace', water: 'Torrente', plant: 'Esperanto', electric: 'Voltio', shadow: 'Umbra', light: 'Lumina' };
    for (let i = 0; i < this.TOTAL_FLOORS; i++) {
      const el = ELEMENTS[Math.floor(rng() * ELEMENTS.length)];
      const level = petLevel + i * 2 + Math.floor(rng() * 3);
      floors.push({ floor: i, enemyElement: el, enemyName: names[el], enemyLevel: level });
    }
    return floors;
  }

  private getElementMultiplier(attack: Element, defender: Element): number {
    const cfg = this.combatCfg;
    if (ADVANTAGE[attack]?.includes(defender)) return cfg.elementAdvantage;
    if (ADVANTAGE[defender]?.includes(attack)) return cfg.elementDisadvantage;
    return 1;
  }
}