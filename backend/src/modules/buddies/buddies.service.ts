import { Injectable, BadRequestException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createRng, hashSeed } from '../battles/combat/rng';
import { MindService } from '../mind/mind.service';
import { EncounterService } from '../mind/encounter.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { BondingService } from '../bonding/bonding.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { InteractionEngineService, SCENE_NOTE, SCENE_TO_BUDDY } from './interaction-engine.service';

/**
 * Servicio de Pet Buddies (feature 029). Coordina pares de 2 pets del mismo usuario,
 * rola interacciones espontáneas vía el motor, aplica efectos (bonding + happiness)
 * respetando cooldown y daily cap, y persiste cada interacción para analytics.
 */
@Injectable()
export class BuddiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pets: PetsService,
    private readonly bonding: BondingService,
    private readonly realtime: RealtimeGateway,
    private readonly engine: InteractionEngineService,
    @Optional() private readonly mind?: MindService,
    @Optional() private readonly encounters?: EncounterService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  /** Intentos de interacción de cada pareja desde que arrancó el proceso (parte de la semilla). */
  private readonly attempts = new Map<string, number>();

  /** Crea (o recupera) el par buddy entre dos pets del mismo usuario. */
  async pair(userId: string, petAId: string, petBId: string) {
    if (petAId === petBId) {
      throw new BadRequestException('Los dos pets deben ser distintos');
    }
    const petA = await this.pets.getPetById(userId, petAId);
    const petB = await this.pets.getPetById(userId, petBId);
    if (petA.userId !== userId || petB.userId !== userId) {
      throw new BadRequestException('Ambos pets deben pertenecer al usuario');
    }

    const normalized = [petAId, petBId].sort();
    const [a, b] = normalized;
    const pair = await this.prisma.buddyPair.upsert({
      where: { userId_petAId_petBId: { userId, petAId: a, petBId: b } },
      update: { separated: false },
      create: { userId, petAId: a, petBId: b, separated: false },
    });
    return pair;
  }

  /** Estado del buddy de un pet (par asociado, separado o no). */
  async getForPet(userId: string, petId: string) {
    const pair = await this.prisma.buddyPair.findFirst({
      where: { userId, OR: [{ petAId: petId }, { petBId: petId }] },
    });
    const interactions = await this.prisma.buddyInteraction.count({
      where: {
        userId,
        OR: [{ petAId: petId }, { petBId: petId }],
        createdAt: { gte: new Date(Date.now() - this.engine.DAILY_WINDOW_MS) },
      },
    });
    return {
      petId,
      buddyActive: !!pair && !pair.separated,
      separated: pair?.separated ?? false,
      buddyPetId: pair ? (pair.petAId === petId ? pair.petBId : pair.petAId) : null,
      todayBuddyInteractions: interactions,
      pair,
    };
  }

  /** Historial de interacciones del usuario (limitado a 50). */
  async interactions(userId: string, limit = 50) {
    const rows = await this.prisma.buddyInteraction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    return rows;
  }

  /**
   * Rola y aplica una interacción espontánea. Devuelve `null` si no hay condiciones
   * (menos de 2 pets, cooldown, cap, o el roll no produce interacción).
   */
  async trigger(userId: string, requestedPetId?: string) {
    const pairs = await this.prisma.buddyPair.findMany({ where: { userId, separated: false } });
    if (pairs.length === 0) return null;

    const pair =
      pairs.find((p) => p.petAId === requestedPetId || p.petBId === requestedPetId) ?? pairs[0];
    const petAId = pair.petAId;
    const petBId = pair.petBId;

    const petA = await this.pets.getPetById(userId, petAId);
    const petB = await this.pets.getPetById(userId, petBId);

    // Un pet dormido o enfermo no interacciona (spec Riesgos).
    if (petA.sleeping || petB.sleeping || petA.sick || petB.sick) return null;

    // Cooldown: máx 3 interacciones en 5 min (AC4).
    const recent = await this.prisma.buddyInteraction.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - this.engine.COOLDOWN_MS) } },
    });
    if (recent >= this.engine.COOLDOWN_MAX) return null;

    const state = {
      bothTired: petA.energy < 40 && petB.energy < 40,
      environmentalActive: true,
    };
    // Azar sembrado por la pareja y la ranura: nada de Math.random (spec 37 §6.3). La ranura es el
    // minuto más el número de intento de la pareja, para que un tic sin suerte no condene a
    // todos los del mismo minuto.
    const attempt = this.attempts.get(pair.id) ?? 0;
    this.attempts.set(pair.id, attempt + 1);
    const slot = Math.floor(Date.now() / this.engine.SLOT_MS) * 1000 + (attempt % 1000);
    const rng = createRng(hashSeed(`buddy:${pair.id}:${slot}`));
    const rHappens = rng();
    let type = null as ReturnType<InteractionEngineService['rollInteraction']>;
    let note: string | undefined;
    let scene: { previous: string | null } | null = null;
    if (this.mind && this.encounters) {
      // Qué hacen lo decide el cerebro, con las dos personalidades y cómo se llevan
      if (rHappens >= this.engine.INTERACTION_CHANCE) return null;
      const [da, db] = [await this.mind.ensureDims(petA), await this.mind.ensureDims(petB)];
      const res = await this.encounters.resolve({
        host: { id: petA.id, name: petA.nickname, ownerName: '', dims: da.dims, energy: petA.energy ?? 60 },
        guest: { id: petB.id, name: petB.nickname, ownerName: '', dims: db.dims, energy: petB.energy ?? 60 },
        slot,
        first: false,
        sameHome: true,
      });
      type = SCENE_TO_BUDDY[res.scene.type] ?? 'idle_chat';
      note = SCENE_NOTE[res.scene.type];
      scene = { previous: res.previous };
    } else {
      type = this.engine.rollInteraction(() => rHappens, state);
    }
    if (!type) return null;

    const effect = { ...this.engine.effectsFor(type), ...(note ? { note } : {}) };
    const bondingToday = await this.prisma.buddyInteraction.count({
      where: { userId, type, createdAt: { gte: new Date(Date.now() - this.engine.DAILY_WINDOW_MS) } },
    });
    const bondingAllowed = bondingToday < this.engine.DAILY_BONDING_CAP;

    await this.applyEffect(petAId, userId, effect, bondingAllowed);
    await this.applyEffect(petBId, userId, effect, bondingAllowed);

    const record = await this.prisma.buddyInteraction.create({
      data: {
        userId,
        petAId,
        petBId,
        type,
        duration: this.engine.durationFor(type),
        effects: { ...effect, bondingAllowed },
      },
    });

    // La mente guarda el recuerdo de cada uno y mueve su relación, con el mismo tope diario que
    // el vínculo. Nunca rompe la interacción.
    if (scene && bondingAllowed) {
      try {
        this.events?.emit('buddy:interacted', { userId, petAId, petBId, slot, previous: scene.previous });
      } catch {
        /* la mente es opcional */
      }
    }

    const payload = { type, petAId, petBId, duration: record.duration, effects: effect };
    this.realtime.emitToUser(userId, 'buddy:interaction', payload);
    this.realtime.emitPetAction(userId, petAId, 'buddy_play', { type });
    this.realtime.emitPetAction(userId, petBId, 'buddy_play', { type });

    return { ...record, effects: effect };
  }

  /** Aplica el efecto a un pet (happiness + energía) y el bonding si está permitido. */
  private async applyEffect(
    petId: string,
    userId: string,
    effect: { happiness?: number; bonding?: number; energy?: number },
    bondingAllowed: boolean,
  ) {
    if (effect.happiness) {
      await this.pets.applyActivityReward(userId, petId, {
        xp: 0,
        happiness: effect.happiness,
        energyCost: 0,
      });
    }
    if (effect.energy) {
      const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
      if (pet) {
        const updated = await this.prisma.pet.update({
          where: { id: petId },
          data: { energy: Math.min(100, pet.energy + effect.energy) },
          include: { species: true, pattern: true },
        });
        this.realtime.emitPetUpdate(userId, updated);
      }
    }
    if (effect.bonding && bondingAllowed) {
      try {
        await this.bonding.recordInteraction(petId, userId, 'buddy');
      } catch {
        /* bonding best-effort: no rompe la interacción si falla */
      }
    }
  }
}
