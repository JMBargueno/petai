import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { feelingLabel, isFeeling, pushFeeling, restingFeeling, settleFeeling, type FeelingBody } from '@pockai/mind/node';
import { GameDataService } from '../game-data/game-data.service';
import { intelligenceTier, moodOf, traitOf } from '../ai/personality';
import { Dims, PersonalityConfig, StoredPersonality, CreatureProfile } from './mind.types';
import {
  buildPersonalityBlock,
  describeDims,
  deriveLegacy,
  isValidDims,
  legacyDims,
  rollBirthDims,
  withDims,
} from './personality.engine';
import { applyEvents } from './evolution.engine';
import { fulfilWish, normalizeWishes, type WishId } from './wishes.engine';

/**
 * Personality Engine + Evolution Engine con estado (spec 36).
 *
 * Construye el perfil único de criatura que comparten todos los motores y persiste los cambios de
 * personalidad en `Pet.personality` (JSON), fusionando siempre con lo que ya hubiera (genes…).
 */
/** Lo que el ánimo necesita saber del cuerpo de la mascota (tolerante con filas incompletas). */
const bodyOf = (pet: any): FeelingBody => ({ happiness: pet?.happiness ?? 60, energy: pet?.energy ?? 60, hunger: pet?.hunger ?? 60, sick: !!pet?.sick });

@Injectable()
export class MindService {
  private readonly logger = new Logger(MindService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
  ) {}

  config(): PersonalityConfig {
    return this.gameData.getBalance().personality as PersonalityConfig;
  }

  private speciesBias(speciesId: string): Partial<Dims> | undefined {
    return this.gameData.getSpecies().find((s: any) => s.id === speciesId)?.personalityBias;
  }

  /** Personalidad inicial al eclosionar: sesgo de especie ± variación determinista. */
  initialPersonality(speciesId: string, visualSeed: number): StoredPersonality {
    return withDims({}, rollBirthDims(this.speciesBias(speciesId), visualSeed, this.config()));
  }

  /**
   * Dimensiones de la mascota. Las mascotas anteriores a la spec 36 las obtienen aquí la primera
   * vez (perezoso, sin script de migración), respetando su rasgo y temperamento antiguos.
   */
  async ensureDims(pet: any): Promise<{ dims: Dims; stored: StoredPersonality }> {
    const stored = (pet.personality ?? {}) as StoredPersonality;
    if (isValidDims(stored.dims)) return { dims: stored.dims, stored };
    const birth = rollBirthDims(this.speciesBias(pet.speciesId), pet.visualSeed ?? 0, this.config());
    const dims = legacyDims(birth, traitOf(pet.visualSeed ?? 0).id, stored.temperament);
    const next = withDims(stored, dims);
    await this.prisma.pet.update({ where: { id: pet.id }, data: { personality: next as any } });
    pet.personality = next;
    return { dims, stored: next };
  }

  async profile(pet: any): Promise<CreatureProfile> {
    const { dims, stored } = await this.ensureDims(pet);
    const cfg = this.config();
    const recent = Array.isArray(stored.recent) ? stored.recent.filter((r): r is string => typeof r === 'string') : [];
    return {
      petId: pet.id,
      userId: pet.userId,
      name: pet.nickname || pet.species?.name || 'Pockai',
      speciesId: pet.speciesId,
      element: pet.species?.element ?? 'unknown',
      dims,
      recent,
      stored,
      traits: describeDims(dims, cfg),
      legacy: deriveLegacy(dims),
      mood: moodOf(pet),
      feeling: this.feelingOf(stored, dims, pet),
      bondingTier: pet.bondingTier ?? 'acquainted',
      intelligenceTier: intelligenceTier(pet.intelligence ?? 0),
      vitals: {
        hunger: pet.hunger,
        happiness: pet.happiness,
        energy: pet.energy,
        hygiene: pet.hygiene,
        health: pet.health,
        sick: !!pet.sick,
        sleeping: !!pet.sleeping,
      },
    };
  }

  /**
   * Ánimo de corto plazo tal como está ahora: lo guardado, asentado hacia su punto de reposo según
   * el tiempo que ha pasado. No escribe nada.
   */
  feelingOf(stored: StoredPersonality, dims: Dims, pet: any, now = new Date()): CreatureProfile['feeling'] {
    const cfg = this.config().feeling;
    if (!cfg) return null;
    const body = bodyOf(pet);
    const rest = restingFeeling(dims, body);
    const f = isFeeling(stored.feeling) ? settleFeeling(stored.feeling, now.getTime(), rest, cfg) : { ...rest, at: now.getTime() };
    return { label: feelingLabel(f, cfg), valence: f.valence, arousal: f.arousal };
  }

  personalityBlock(dims: Dims): string {
    return buildPersonalityBlock(dims, this.config());
  }

  /**
   * Bloquea la fila de la mascota hasta el final de la transacción. `Pet.personality` es un JSON
   * que se lee, se modifica y se reescribe entero: sin bloqueo, dos escrituras simultáneas (pasa en
   * cada turno de chat) se pisan y una de las dos se pierde.
   */
  private lockPet(tx: Prisma.TransactionClient, petId: string) {
    return tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Pet" WHERE "id" = ${petId} FOR UPDATE`);
  }

  /**
   * Evolution Engine: aplica experiencias a la personalidad, fusionando con lo que ya hubiera
   * (genes…). `patch` permite guardar en la misma escritura otras claves del JSON (contadores de
   * la vida autónoma), para no hacer dos lecturas y dos escrituras seguidas.
   */
  async applyExperience(
    petId: string,
    events: string[],
    now = new Date(),
    patch?: Partial<StoredPersonality>,
  ): Promise<Dims | null> {
    if (!events.length && !patch) return null;
    const cfg = this.config();
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockPet(tx, petId);
        const pet = await tx.pet.findUnique({
          where: { id: petId },
          select: { id: true, personality: true, speciesId: true, visualSeed: true, happiness: true, energy: true, hunger: true, sick: true },
        });
        if (!pet) return null;
        const stored = (pet.personality ?? {}) as StoredPersonality;
        const base = isValidDims(stored.dims)
          ? stored.dims
          : legacyDims(rollBirthDims(this.speciesBias(pet.speciesId), pet.visualSeed ?? 0, cfg), traitOf(pet.visualSeed ?? 0).id, stored.temperament);
        const res = applyEvents(base, events, stored.drift, now, cfg);
        // Lo que acaba de pasar también mueve su ánimo de corto plazo, en la misma escritura
        const felt = cfg.feeling && events.some((e) => cfg.feeling!.events[e]);
        const feeling = felt ? pushFeeling(stored.feeling, events, now.getTime(), res.dims, bodyOf(pet), cfg.feeling!) : undefined;
        if (!res.changed && isValidDims(stored.dims) && !patch && !feeling) return base;
        const next = { ...withDims(stored, res.dims), drift: res.drift, ...(feeling ? { feeling } : {}), ...(patch ?? {}) };
        await tx.pet.update({ where: { id: petId }, data: { personality: next as any } });
        return res.dims;
      });
    } catch (e: any) {
      this.logger.warn(`No se pudo aplicar la experiencia ${events.join(',')} a ${petId}: ${e?.message}`);
      return null;
    }
  }

  /**
   * Un deseo se ha cumplido fuera del chat (fue de aventura, vio a un amigo). Solo cuenta si la
   * mascota lo había expresado: entonces entra en enfriamiento, gana algo de felicidad (acotada)
   * y devuelve `true` para que quien llama deje el recuerdo.
   */
  async fulfilWish(petId: string, id: WishId, now = new Date()): Promise<boolean> {
    const cfg = this.config();
    try {
      const done = await this.prisma.$transaction(async (tx) => {
        await this.lockPet(tx, petId);
        const pet = await tx.pet.findUnique({ where: { id: petId }, select: { personality: true } });
        if (!pet) return false;
        const stored = (pet.personality ?? {}) as StoredPersonality;
        const state = normalizeWishes(stored.wishes);
        if (state.shownId !== id) return false;
        const next = fulfilWish(state, id, now, cfg.wishes);
        if (!next) return false;
        await tx.pet.update({ where: { id: petId }, data: { personality: { ...stored, wishes: next } as any } });
        return true;
      });
      if (done && cfg.wishes.happinessOnFulfil > 0) {
        const n = cfg.wishes.happinessOnFulfil;
        const bumped = await this.prisma.pet.updateMany({ where: { id: petId, happiness: { lte: 100 - n } }, data: { happiness: { increment: n } } });
        if (bumped.count === 0) await this.prisma.pet.updateMany({ where: { id: petId }, data: { happiness: 100 } });
      }
      return done;
    } catch (e: any) {
      this.logger.warn(`No se pudo marcar el deseo ${id} de ${petId}: ${e?.message}`);
      return false;
    }
  }

  /** Guarda claves auxiliares del JSON de personalidad (contadores de autonomía…) sin pisar el resto. */
  async patchStored(petId: string, patch: Partial<StoredPersonality>) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockPet(tx, petId);
      const pet = await tx.pet.findUnique({ where: { id: petId }, select: { personality: true } });
      if (!pet) return;
      await tx.pet.update({ where: { id: petId }, data: { personality: { ...((pet.personality as any) ?? {}), ...patch } } });
    });
  }
}
