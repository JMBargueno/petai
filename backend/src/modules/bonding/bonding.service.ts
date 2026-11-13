import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MEMORY_UNLOCK } from '../ai/personality';
import {
  BondingConfig,
  clampBonding,
  decayAmount,
  hoursBetween,
  interactionIncrement,
  isBondingTierAtLeast,
  round2,
  tierForValue,
  tierNameForValue,
} from './bonding';

/** Resultado de `recordInteraction` (contrato de la feature 006). */
export interface BondingInteractionResult {
  bonding: number;
  bondingTier: string;
  tierChanged: 'up' | 'down' | null;
}

/** Resultado de `applyDecay` (decaimiento lazy por abandono, integrado en el tick de vitales). */
export interface BondingDecayResult {
  /** `false` si no se aplicó decaimiento (ventana de gracia o sin caída). */
  decayed: boolean;
  bonding: number;
  bondingTier: string;
  /** Variación real aplicada (≤ 0). */
  delta: number;
}

/** Campos mínimos de `Pet` que necesita el decaimiento (lo que devuelve el lazy tick). */
export interface BondingPetLike {
  id: string;
  userId: string;
  bonding: number;
  bondingTier: string;
  lastInteractionAt: Date;
}

/**
 * Bonding Meter (feature 006): orquesta el motor puro (`bonding.ts`) con Prisma, el balance
 * (`GameDataService`) y el realtime (`RealtimeGateway`).
 *
 * - El incremento se resuelve en `recordInteraction` (transacción con bloqueo de fila; FR-014).
 * - El decaimiento se resuelve de forma LAZY en `applyDecay`, invocado por `applyLazyTick`
 *   de `PetsService` (Constitución IV: sin cron/cola por pet).
 * - El estado vive en `Pet` (bonding/bondingTier/lastInteractionAt); la auditoría, en
 *   `BondingEvent` (SC-003: un `BondingEvent` por cada cambio).
 */
@Injectable()
export class BondingService {
  private readonly logger = new Logger(BondingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Configuración vigente del vínculo desde `balance.json → bonding` (Constitución VII). */
  private get bondCfg(): BondingConfig {
    const balance = this.gameData.getBalance();
    const cfg = balance?.bonding as BondingConfig | undefined;
    if (!cfg?.interactions || !Array.isArray(cfg.tiers) || cfg.tiers.length === 0) {
      this.logger.warn('balance.bonding ausente o inválido; usando configuración por defecto');
      return FALLBACK_BONDING;
    }
    return cfg;
  }

  /**
   * Registra una interacción exitosa y sube el vínculo: `clamp(bonding + inc, 0, 100)`,
   * recalcula el tier, fija `lastInteractionAt = now` y crea el `BondingEvent`, todo dentro de
   * una transacción con bloqueo de fila para que dos peticiones concurrentes no dupliquen el
   * incremento (FR-014). Si el tier sube, emite `bonding:tier_up` (una sola vez por cruce).
   *
   * `type` se valida contra `balance.bonding.interactions` (Constitución I): cualquier otro
   * `type` es un `BadRequestException`.
   */
  async recordInteraction(petId: string, userId: string, type: string): Promise<BondingInteractionResult> {
    const cfg = this.bondCfg;
    const increment = interactionIncrement(cfg, type);
    if (increment === null) {
      throw new BadRequestException('Tipo de interacción inválido');
    }

    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, userId },
      select: { id: true },
    });
    if (!pet) {
      throw new NotFoundException('Mascota no encontrada');
    }

    const { oldTier, newTier, newBonding } = await this.prisma.$transaction(async (tx) => {
      // Bloqueo de fila (SELECT ... FOR UPDATE): ninguna interacción concurrente puede leer un
      // vínculo anticuado y aplicar un incremento duplicado sobre el mismo pet (FR-014, SC-005).
      const rows = await tx.$queryRaw<{ id: string; bonding: number; bondingTier: string }[]>(
        Prisma.sql`SELECT "id", "bonding", "bondingTier" FROM "Pet" WHERE "id" = ${petId} FOR UPDATE`,
      );
      if (rows.length === 0) {
        throw new NotFoundException('Mascota no encontrada');
      }
      const row = rows[0];
      const newBonding = round2(clampBonding(row.bonding + increment));
      const oldTier = tierForValue(row.bonding, cfg.tiers);
      const newTier = tierForValue(newBonding, cfg.tiers);
      const now = new Date();
      await tx.pet.update({
        where: { id: petId },
        data: { bonding: newBonding, bondingTier: newTier, lastInteractionAt: now },
      });
      await tx.bondingEvent.create({
        data: {
          petId,
          delta: round2(newBonding - row.bonding),
          reason: type,
          value: newBonding,
        },
      });
      return { oldTier, newTier, newBonding };
    });

    const tierChanged: BondingInteractionResult['tierChanged'] = oldTier !== newTier ? 'up' : null;
    if (tierChanged) {
      // SC-005: exactamente un `bonding:tier_up` por cruce de umbral
      this.realtime.emitToUser(userId, 'bonding:tier_up', { petId, oldTier, newTier, bonding: newBonding });
    }

    // Refuerzo del estado al cliente: `pet:update` con los campos de vínculo ya aplicados
    const updated = await this.prisma.pet.findUnique({
      where: { id: petId },
      include: { species: true, pattern: true },
    });
    if (updated) {
      this.realtime.emitPetUpdate(userId, updated);
    }

    return { bonding: newBonding, bondingTier: newTier, tierChanged };
  }

  /**
   * Decaimiento LAZY por abandono (Constitución IV): lo invoca `applyLazyTick` de `PetsService`
   * en la misma pasada que el decaimiento de vitales. Si `now − lastInteractionAt > 48h`
   * (balance.bonding.decayStartHours) aplica `decayRatePerDay × (hoursIdle − 48)/24`; dentro de
   * la ventana de gracia (24h) no decae.
   *
   * Es idempotente: al aplicar, re-fija `lastInteractionAt = now` para que la siguiente lectura
   * no vuelva a aplicar el mismo tramo (SC-004). Emite `bonding:tier_down` si el decaimiento
   * cruza rango y `bonding:decay` solo si la caída supera 1 punto (para no spamian a la UI).
   */
  async applyDecay(pet: BondingPetLike, now: Date = new Date()): Promise<BondingDecayResult> {
    const cfg = this.bondCfg;
    const hoursIdle = hoursBetween(pet.lastInteractionAt, now);
    const amount = decayAmount(hoursIdle, cfg);

    if (amount <= 0 || (pet.bonding ?? 0) <= 0) {
      return { decayed: false, bonding: pet.bonding, bondingTier: pet.bondingTier, delta: 0 };
    }

    const newBonding = round2(clampBonding(pet.bonding - amount));
    const delta = round2(newBonding - pet.bonding);
    if (delta === 0) {
      return { decayed: false, bonding: pet.bonding, bondingTier: pet.bondingTier, delta: 0 };
    }

    const oldTier = tierForValue(pet.bonding, cfg.tiers);
    const newTier = tierForValue(newBonding, cfg.tiers);

    // Re-fija la base de referencia (idempotencia): la próxima lectura parte de `now`
    await this.prisma.pet.update({
      where: { id: pet.id },
      data: { bonding: newBonding, bondingTier: newTier, lastInteractionAt: now },
    });
    // Auditoría: exactamente un `BondingEvent` por decaimiento aplicado (SC-003)
    await this.prisma.bondingEvent.create({
      data: { petId: pet.id, delta, reason: 'decay', value: newBonding },
    });

    if (oldTier !== newTier) {
      this.realtime.emitToUser(pet.userId, 'bonding:tier_down', {
        petId: pet.id,
        oldTier,
        newTier,
        bonding: newBonding,
      });
    }
    // `bonding:decay` solo con caída > 1 punto (regla de emisión del contrato)
    if (Math.abs(delta) > 1) {
      this.realtime.emitToUser(pet.userId, 'bonding:decay', {
        petId: pet.id,
        bonding: newBonding,
        delta,
      });
    }

    return { decayed: true, bonding: newBonding, bondingTier: newTier, delta };
  }

  /**
   * Detalle completo de `GET /pets/:id/bonding` (contrato de la feature 006): valor/tier
   * actuales, historial paginado de `BondingEvent`, `decayInfo` y `unlocks`.
   *
   * `limit` ∈ [1,100] (default 20); `cursor` es el `createdAt` ISO-8601 de la última fila de la
   * página previa. La identidad sale de `userId` (la sesión), nunca del body (Constitución I).
   */
  async getBondingDetail(petId: string, userId: string, limit?: number, cursor?: string) {
    const cfg = this.bondCfg;

    // La validación de parámetros precede a la búsqueda (un 400 no depende del pet)
    const take = limit ?? 20;
    if (!Number.isInteger(take) || take < 1 || take > 100) {
      throw new BadRequestException('limit fuera de rango');
    }

    const cursorDate = cursor ? new Date(cursor) : null;
    if (cursor && Number.isNaN(cursorDate?.getTime())) {
      throw new BadRequestException('cursor inválido');
    }

    const pet = await this.prisma.pet.findFirst({ where: { id: petId, userId } });
    if (!pet) {
      throw new NotFoundException('Mascota no encontrada');
    }

    const now = new Date();
    const rows = await this.prisma.bondingEvent.findMany({
      where: {
        petId,
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const items = rows.slice(0, take).map((r) => ({
      id: r.id,
      delta: r.delta,
      reason: r.reason,
      value: r.value,
      createdAt: r.createdAt.toISOString(),
    }));

    const value = round2(pet.bonding);
    const tier = tierForValue(value, cfg.tiers);
    const hoursSinceInteraction = round2(hoursBetween(pet.lastInteractionAt, now));
    const acumulatedDecay = decayAmount(hoursSinceInteraction, cfg);

    // Umbrales de los desbloqueos (FR-011/FR-012): el tier ya resume el umbral de `balance.bonding.tiers`
    const unlocks = {
      greeting: isBondingTierAtLeast(tier, 'companion'),
      memoryRecall: isBondingTierAtLeast(tier, 'ally') || (pet.intelligence ?? 0) >= MEMORY_UNLOCK,
      emotionalReactions: isBondingTierAtLeast(tier, 'soulmate'),
      patternUnlocked: isBondingTierAtLeast(tier, 'legend'),
      sleepNearCursor: isBondingTierAtLeast(tier, 'legend'),
    };

    return {
      value,
      tier,
      tierName: tierNameForValue(value, cfg.tiers),
      lastInteractionAt: pet.lastInteractionAt.toISOString(),
      history: {
        items,
        nextCursor: hasMore ? rows[take - 1].createdAt.toISOString() : null,
      },
      decayInfo: {
        decayRatePerDay: cfg.decayRatePerDay,
        isDecaying: acumulatedDecay > 0,
        graceWindowHours: cfg.graceWindowHours,
        decayStartHours: cfg.decayStartHours,
        hoursSinceInteraction,
        acumulatedDecay,
      },
      unlocks,
    };
  }

  /**
   * Campos de vínculo para la respuesta de `GET /pets/:id` / `GET /pets` (T012): valor, tier
   * (ya calculado y persistido), nombre display y última interacción. El cliente no calcula nada.
   */
  bondingFields(pet: BondingPetLike) {
    const cfg = this.bondCfg;
    const value = round2(pet.bonding);
    const tier = tierForValue(value, cfg.tiers);
    return {
      bonding: value,
      bondingTier: tier,
      bondingTierName: tierNameForValue(value, cfg.tiers),
      lastInteractionAt: pet.lastInteractionAt.toISOString(),
    };
  }
}

/**
 * Configuración de emergencia si `balance.bonding` está ausente (no debería ocurrir: el schema
 * Zod de `balance.json` la valida y el archivo de la feature la incluye).
 */
const FALLBACK_BONDING: BondingConfig = {
  interactions: { feed: 2, battle: 3, minigame: 2, chat: 1, clean: 1, sleep: 0.5, evolve: 5 },
  decayRatePerDay: 0.5,
  graceWindowHours: 24,
  decayStartHours: 48,
  tiers: [
    { id: 'acquainted', name: 'Acostumbrado', min: 0 },
    { id: 'companion', name: 'Compañero', min: 30 },
    { id: 'ally', name: 'Aliado', min: 60 },
    { id: 'soulmate', name: 'Alma gemela', min: 80 },
    { id: 'legend', name: 'Leyenda', min: 100 },
  ],
};
