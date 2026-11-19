import { AutonomyService } from '../mind/autonomy.service';
import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { GameDataService } from '../game-data/game-data.service';
import { BondingService } from '../bonding/bonding.service';
import { nightHoursBetween, safeTimeZone } from './sleep-cycle';
import { HabitatService } from '../habitat/habitat.service';
import { boostedRecovery, reducedDecay, type ActiveBuffs } from '../habitat/habitat-buffs';
import { STAGE_ORDER, stageForLevel, type Stage } from './stages';
import { DESKTOP_SKILL_REGISTRY, skillStateOf } from '../ai/desktop-skills';
/** Higiene a partir de la cual el baño se rechaza (balance.vitals.cleanMaxHygiene lo sustituye). */
const DEFAULT_CLEAN_MAX_HYGIENE = 80;
/** Por debajo de este intervalo (~36 s) el lazy tick no cambia nada. */
const MIN_TICK_HOURS = 0.01;

/** Nivel máximo de una mascota. */
const MAX_LEVEL = 100;
/** XP necesaria para pasar del nivel `level` al siguiente: round(100 · n^1.5). */
export function xpForLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.5));
}

function hoursSinceTick(pet: { lastTickAt: Date | string }, now: Date): number {
  return (now.getTime() - new Date(pet.lastTickAt).getTime()) / (1000 * 60 * 60);
}

@Injectable()
export class PetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly gameData: GameDataService,
    private readonly eventEmitter: EventEmitter2,
    private readonly bonding: BondingService,
    // Vida autónoma (spec 36): opcional para no romper tests que construyen el servicio a mano
    @Optional() private readonly autonomy?: AutonomyService,
    // Buffs de muebles (spec 10): opcional por la misma razón; sin él no hay buffs
    @Optional() private readonly habitat?: HabitatService,
  ) {}

  async getPets(userId: string) {
    const pets = await this.prisma.pet.findMany({
      where: { userId },
      include: { species: true, pattern: true },
      orderBy: { createdAt: 'desc' },
    });

    // Buffs del hábitat con UNA consulta para todas las mascotas que van a hacer tick
    const now = new Date();
    const toTick = pets.filter((p) => hoursSinceTick(p, now) >= MIN_TICK_HOURS).map((p) => p.id);
    const buffsByPet = this.habitat && toTick.length ? await this.habitat.getActiveBuffsForPets(toTick) : undefined;

    const owned = await this.ownedFurnitureByPet(pets.map((p) => p.id));
    const updatedPets = [];
    for (const pet of pets) {
      const ticked = await this.applyLazyTick(pet, buffsByPet?.get(pet.id) ?? (buffsByPet ? {} : undefined));
      // Vida autónoma (spec 36): los clientes cargan la lista al abrir; como mucho una simulación por hora y mascota
      const updated = this.autonomy ? await this.autonomy.catchUp(ticked) : ticked;
      // Campos de vínculo (feature 006): el cliente recibe el rango sin calcular nada
      updatedPets.push({ ...updated, ...this.bonding.bondingFields(updated), ownedFurniture: owned.get(pet.id) ?? [] });
    }
    return updatedPets;
  }

  /**
   * Muebles distintos que tiene colocados cada mascota (spec 42): algunas habilidades de escritorio
   * se desbloquean con un mueble. Lo calcula el servidor; los clientes solo lo muestran.
   */
  private async ownedFurnitureByPet(petIds: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (!petIds.length) return out;
    const rows = await this.prisma.habitatItem.findMany({
      where: { petId: { in: petIds } },
      select: { petId: true, furnitureId: true },
      distinct: ['petId', 'furnitureId'],
    });
    for (const r of rows ?? []) out.set(r.petId, [...(out.get(r.petId) ?? []), r.furnitureId]);
    return out;
  }

  async getPetById(userId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, userId },
      include: { species: true, pattern: true },
    });
    if (!pet) {
      throw new NotFoundException('Mascota no encontrada');
    }
    const ticked = await this.applyLazyTick(pet);
    // Vida autónoma (spec 36): simula lo que hizo mientras no estabas (perezoso, sin LLM)
    const updated = this.autonomy ? await this.autonomy.catchUp(ticked) : ticked;
    const owned = await this.ownedFurnitureByPet([pet.id]);
    return { ...updated, ...this.bonding.bondingFields(updated), ownedFurniture: owned.get(pet.id) ?? [] };
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
    // Vínculo (feature 006): la alimentación exitosa sube el bonding (+2 según balance); su
    // propio `pet:update` llega después para que el cliente reciba el vínculo ya aplicado
    await this.bonding.recordInteraction(petId, userId, 'feed');
    this.eventEmitter.emit('pet:fed', { userId, petId });
    this.realtimeGateway.emitPetAction(userId, petId, 'fed', { favorite: isFavorite, itemId: item.id });
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
    // Vínculo (feature 006): el baño exitoso sube el bonding (+1 según balance)
    await this.bonding.recordInteraction(petId, userId, 'clean');
    this.eventEmitter.emit('pet:cleaned', { userId, petId });
    this.realtimeGateway.emitPetAction(userId, petId, 'cleaned');
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
    // Vínculo (feature 006): dormirlo también cuenta como interacción (+0.5 según balance)
    await this.bonding.recordInteraction(petId, userId, 'sleep');
    this.eventEmitter.emit('pet:slept', { userId, petId });
    this.realtimeGateway.emitPetAction(userId, petId, 'slept');
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
    this.realtimeGateway.emitPetAction(userId, petId, 'woke');
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

    // Una medicina puede traer más efectos que la salud (el Elixir Reparador baja la felicidad):
    // se aplican todos, como al alimentar, y cada vital se queda entre 0 y 100.
    const clamp = (v: number) => Math.min(100, Math.max(0, v));

    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data: {
        health: clamp(pet.health + (effects.health || 40)),
        hunger: clamp(pet.hunger + (effects.hunger || 0)),
        happiness: clamp(pet.happiness + (effects.happiness || 0)),
        energy: clamp(pet.energy + (effects.energy || 0)),
        sick: false,
        lastTickAt: new Date(),
      },
      include: { species: true, pattern: true },
    });

    this.realtimeGateway.emitPetUpdate(userId, updated);
    this.realtimeGateway.emitPetAction(userId, petId, 'healed');
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
    // Vínculo (feature 006): la evolución sube el bonding (+5); el vínculo previo se conserva (FR-015)
    await this.bonding.recordInteraction(petId, userId, 'evolve');
    this.eventEmitter.emit('pet:evolved', { userId, petId });
    this.realtimeGateway.emitPetAction(userId, petId, 'evolved', { stage: 'final' });
    return updated;
  }

  /**
   * Usar cualquier objeto del inventario (spec 41, Mochila): reparte según el `kind` a la acción
   * que ya existe para él. Así un cliente no tiene que saber qué ruta corresponde a cada objeto.
   */
  async useItem(userId: string, petId: string, itemId?: string) {
    if (!itemId || typeof itemId !== 'string' || itemId.length > 64) {
      throw new BadRequestException('itemId es obligatorio');
    }
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Objeto no encontrado');
    switch (item.kind) {
      case 'food':
        return this.feed(userId, petId, itemId);
      case 'medicine':
        return this.heal(userId, petId, itemId);
      case 'evolution':
        if (itemId !== this.gameData.getBalance().evolution?.finalStageItemId) {
          throw new BadRequestException('Este objeto no se puede usar');
        }
        return this.evolve(userId, petId);
      case 'level_up':
        return this.useLevelUpItem(userId, petId, itemId);
      default:
        throw new BadRequestException('Este objeto no se puede usar sobre la mascota');
    }
  }

  /**
   * Enhebrador y similares (`kind: level_up`, spec 41): sube `effects.levels` niveles y conserva la XP
   * que la mascota llevaba dentro de su nivel. Pasa por `addXpInternal` con la XP exacta de cada
   * nivel, así que puntos de combate, cambio de etapa y eventos `pet:level_up` son los de siempre.
   */
  async useLevelUpItem(userId: string, petId: string, itemId: string) {
    const pet = await this.getPetById(userId, petId);
    if (pet.level >= MAX_LEVEL) {
      throw new BadRequestException('Tu Pockai ya está en el nivel máximo');
    }
    const candidate = await this.prisma.item.findUnique({ where: { id: itemId } });
    const levels = Math.max(1, Math.floor(Number((candidate?.effects as any)?.levels) || 1));

    await this.inventoryService.consumeItem(userId, itemId, 'level_up');

    const target = Math.min(MAX_LEVEL, pet.level + levels);
    let xpToGrant = 0;
    for (let lv = pet.level; lv < target; lv++) xpToGrant += xpForLevel(lv);
    // Como el umbral crece con el nivel, la XP que ya llevaba no encadena un nivel extra.
    const updated = await this.addXpInternal(pet, xpToGrant);
    this.realtimeGateway.emitPetUpdate(userId, updated);
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

  /**
   * @param buffs buffs del hábitat ya recortados (spec 10). Si no se pasan, se consultan aquí,
   *   tras la salida temprana, para que un tick sin cambios no cueste ninguna consulta.
   */
  private async applyLazyTick(pet: any, buffs?: ActiveBuffs) {
    const now = new Date();
    const elapsedHours = hoursSinceTick(pet, now);

    if (elapsedHours < MIN_TICK_HOURS) {
      return pet; // Menos de ~36 segundos, sin cambio significativo
    }

    const habitatBuffs: ActiveBuffs = buffs ?? (this.habitat ? await this.habitat.getActiveBuffsForPet(pet.id) : {});

    const balance = this.gameData.getBalance();
    const decay = pet.sleeping
      ? balance.vitals.decayPerHour.sleeping
      : balance.vitals.decayPerHour.awake;

    // Zona horaria del propietario (ciclo de sueño). El clima ya no incide en los vitales: la
    // ubicación se queda en el dispositivo y el servidor no la conoce.
    const owner = await this.prisma.user.findUnique({
      where: { id: pet.userId },
      select: { timezone: true },
    });

    // Ciclo de sueño: horas del intervalo que caen en la noche local del usuario
    const sleepCfg = balance.sleep;
    let nightHours = 0;
    if (sleepCfg) {
      nightHours = nightHoursBetween(
        new Date(pet.lastTickAt),
        now,
        safeTimeZone(owner?.timezone),
        sleepCfg.nightStartHour,
        sleepCfg.nightEndHour,
      );
    }

    const newHunger = Math.max(0, pet.hunger - decay.hunger * elapsedHours);
    // Buffs del hábitat (spec 10): reducen el decaimiento base de felicidad e higiene en su porcentaje
    const newHappiness = Math.max(
      0,
      pet.happiness - reducedDecay(decay.happiness, habitatBuffs, 'happiness_decay_reduction') * elapsedHours,
    );
    let newEnergy: number;
    let newHealth = pet.health;
    if (pet.sleeping) {
      // Dormir de noche recupera más energía y regenera algo de salud
      const effectiveHours = elapsedHours + (sleepCfg ? (sleepCfg.sleepingNightEnergyBonus - 1) * nightHours : 0);
      // Buff `energy_recovery_boost` (spec 10): la cama y la lámpara aumentan la recuperación al dormir
      const recoveryPerHour = boostedRecovery(Math.abs(decay.energy), habitatBuffs, 'energy_recovery_boost');
      newEnergy = Math.min(100, pet.energy + recoveryPerHour * effectiveHours);
      if (sleepCfg) {
        newHealth = Math.min(100, newHealth + sleepCfg.sleepingNightHealthRegenPerHour * nightHours);
      }
    } else {
      // Estar despierto de noche cansa más
      const effectiveHours = elapsedHours + (sleepCfg ? (sleepCfg.awakeNightEnergyMultiplier - 1) * nightHours : 0);
      newEnergy = Math.max(0, pet.energy - decay.energy * effectiveHours);
    }
    let newHygiene = Math.max(
      0,
      pet.hygiene - reducedDecay(decay.hygiene, habitatBuffs, 'hygiene_decay_reduction') * elapsedHours,
    );

    // Si hambre o higiene están críticamente bajas (< 15), la salud decae
    if (newHunger < 15.0 || newHygiene < 15.0) {
      newHealth = Math.max(0, newHealth - 3.0 * elapsedHours);
    }

    const isSick = newHealth < 20.0 ? true : pet.sick;
    if (isSick && !pet.sick) {
      this.realtimeGateway.emitPetAction(pet.userId, pet.id, 'sick');
    }

    // Vínculo (feature 006): el decaimiento por abandono vive en el mismo lazy tick que las
    // vitales (Constitución IV, sin cron por pet). Idempotente: al aplicar, `applyDecay`
    // re-fija `lastInteractionAt` y persiste el `BondingEvent(reason="decay")` + los eventos WS.
    await this.bonding.applyDecay(pet, now);

    // Notificación con personalidad (feature 007): si alguna vital cae por debajo del umbral crítico
    // se emite el evento de dominio; el dispatcher decide si notificar (rate limit/dedup/quiet hours).
    const updated = await this.prisma.pet.update({
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

    const criticalThreshold = this.gameData.getNotificationConfig().vitalsCriticalThreshold;
    if (
      newHunger < criticalThreshold ||
      newHappiness < criticalThreshold ||
      newEnergy < criticalThreshold ||
      newHygiene < criticalThreshold
    ) {
      this.eventEmitter.emit('pet:vitals-critical', {
        userId: pet.userId,
        petId: pet.id,
        vitals: {
          hunger: newHunger,
          happiness: newHappiness,
          energy: newEnergy,
          hygiene: newHygiene,
        },
      });
    }

    return updated;
  }

  /**
   * Da XP por la vía de nivel (sube nivel, puntos y etapa, y avisa con `level_up`/`evolved`).
   * Para recompensas que no pasan por `applyActivityReward` (aventuras, entrenamiento…).
   */
  async grantXp(userId: string, petId: string, xp: number) {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, userId } });
    if (!pet) throw new NotFoundException('Mascota no encontrada');
    if (xp <= 0) return pet;
    return this.addXpInternal(pet, xp);
  }

  private async addXpInternal(pet: any, xpGained: number) {
    let currentXp = pet.xp + xpGained;
    let currentLevel = pet.level;
    let statPoints = pet.statPoints;
    let stage = pet.stage;
    let levelChanged = false;

    // xp(n) = round(100 * n^1.5)
    let neededXp = xpForLevel(currentLevel);

    while (currentXp >= neededXp && currentLevel < MAX_LEVEL) {
      currentXp -= neededXp;
      currentLevel += 1;
      statPoints += 3; // 3 puntos de combate por nivel
      levelChanged = true;

      // Hitos de evolución automáticos (la forma final requiere un objeto: ver evolve())
      const reached = stageForLevel(currentLevel);
      if (STAGE_ORDER.indexOf(reached) > STAGE_ORDER.indexOf(stage as Stage)) stage = reached;

      neededXp = xpForLevel(currentLevel);
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
      this.realtimeGateway.emitPetAction(pet.userId, pet.id, 'level_up', { level: currentLevel });
    }
    // Cambio de etapa automático por nivel (juvenil/adulto). Solo se anima: no cuenta como
    // `pet:evolved` (misiones y logros de evolución siguen ligados a evolve()).
    if (stage !== pet.stage) {
      this.realtimeGateway.emitPetAction(pet.userId, pet.id, 'evolved', { stage });
    }

    return updated;
  }

  async updateDesktopSkills(userId: string, petId: string, skills: Record<string, boolean>) {
    const pet = await this.getPetById(userId, petId);

    // Umbrales del registro único de habilidades: sin copia aparte que se quede atrás
    const SKILL_REQUIREMENTS: Record<string, { bonding: number; intelligence: number }> = Object.fromEntries(
      DESKTOP_SKILL_REGISTRY.map((sk) => [sk.id, { bonding: sk.requiredBonding, intelligence: sk.requiredIntelligence }]),
    );

    const petBonding = typeof pet.bonding === 'number' ? pet.bonding : 0;
    const petIntelligence = typeof pet.intelligence === 'number' ? pet.intelligence : 0;
    const petIntelligenceLevel =
      petIntelligence >= 500 || petIntelligence === 3 ? 3 : petIntelligence >= 200 || petIntelligence === 2 ? 2 : 1;

    for (const [skillId, enabled] of Object.entries(skills)) {
      // Habilidades que se desbloquean con un mueble del hábitat (spec 42)
      const info = DESKTOP_SKILL_REGISTRY.find((sk) => sk.id === skillId);
      if (enabled && info?.requiredFurniture) {
        const st = skillStateOf(info, {}, pet as any);
        if (st.state === 'locked' && st.missingFurniture) {
          throw new BadRequestException(`Para activar "${skillId}" necesitas el mueble ${st.missingFurniture} en tu hábitat`);
        }
      }
      if (enabled && SKILL_REQUIREMENTS[skillId]) {
        const req = SKILL_REQUIREMENTS[skillId];
        if (petBonding < req.bonding || petIntelligenceLevel < req.intelligence) {
          const reqTier =
            req.intelligence === 3 ? 'Agente (500 pts)' : req.intelligence === 2 ? 'Memoria (200 pts)' : 'Charla';
          throw new BadRequestException(
            `No cumples los requisitos para activar "${skillId}" (Vínculo requerido: ${req.bonding} pts, IA requerida: ${reqTier})`,
          );
        }
      }
    }

    const currentSkills = (pet.desktopSkills as Record<string, boolean>) || {};
    const merged = { ...currentSkills, ...skills };

    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data: {
        desktopSkills: merged,
      },
      include: { species: true, pattern: true },
    });

    const result = { ...updated, ...this.bonding.bondingFields(updated) };
    this.realtimeGateway.emitPetUpdate(userId, result);
    return result;
  }

  async setInHabitat(userId: string, petId: string, inHabitat: boolean) {
    await this.getPetById(userId, petId);

    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data: {
        inHabitat: Boolean(inHabitat),
      },
      include: { species: true, pattern: true },
    });

    const result = { ...updated, ...this.bonding.bondingFields(updated) };
    this.realtimeGateway.emitPetUpdate(userId, result);
    return result;
  }

  /**
   * Marca `petId` como el pockai activo del jugador (el de su escritorio). Lo usan el hábitat del
   * clan y las visitas para mostrar la mascota que el jugador tiene elegida. 404 si no es suya.
   */
  async setActivePet(userId: string, petId: string): Promise<{ activePetId: string }> {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, userId }, select: { id: true } });
    if (!pet) throw new NotFoundException('Mascota no encontrada');
    await this.prisma.user.update({ where: { id: userId }, data: { activePetId: pet.id } });
    return { activePetId: pet.id };
  }
}
