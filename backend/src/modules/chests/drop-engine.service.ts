import * as crypto from 'crypto';

/**
 * Tiers de drop de los cofres (independientes de los tiers de rareza de pet en balance.json → rarity).
 * El orden canónico es de menor a mayor rareza; la garantía de pity compara por posición (rank).
 */
export type DropTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const DROP_TIERS: DropTier[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const TIER_RANK: Record<DropTier, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

/** Posición (0-4) de un tier; útil para comparar rareza (`>= minTier`). */
export function tierRank(tier: DropTier): number {
  return TIER_RANK[tier] ?? 0;
}

/**
 * Generador de un entero aleatorio en `[0, maxExclusive)` (exclusivo), idéntico al contrato de
 * `crypto.randomInt(0, max)`. Por defecto el motor usa `cryptoRng` (criptográficamente seguro).
 * Inyectar otro `rng` permite tests deterministas sin tocar el resto del motor.
 */
export type BoundedRng = (maxExclusive: number) => number;

export const cryptoRng: BoundedRng = (maxExclusive) => {
  if (maxExclusive <= 1) return 0;
  return crypto.randomInt(0, maxExclusive);
};

/** Una entrada de la tabla de drops de un tipo de cofre (data-driven desde balance.json → chests). */
export interface DropEntry {
  itemId: string;
  tier: DropTier;
  qtyMin: number;
  qtyMax: number;
}

/** Tabla de drops de un tipo de cofre. */
export interface ChestDropTable {
  dropTable: DropEntry[];
}

/** Pesos por tier (valores relativos, no necesariamente normalizados). */
export interface ChestTierWeights {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  legendary: number;
}

/** Estado de pity que decide la garantía de rareza mínima. */
export interface PityState {
  count: number;
  threshold: number;
  minTier: DropTier;
}

/** Resuelve el rango `[qtyMin, qtyMax]` de una entrada de drop. */
export type QtyRangeResolver = (entry: DropEntry) => [number, number];

export interface DropResult {
  itemId: string;
  tier: DropTier;
  qty: number;
  /** `true` si la garantía de pity forzó un tier >= minTier. */
  guaranteed: boolean;
  /** `true` si el tier resultante es >= minTier (solo con `pityState`). El servicio lo usa para resetear el pity. */
  meetsMinTier: boolean;
}

/**
 * Motor de drops puro: weighted roll sobre la tabla de drops de un cofre. NO tiene `@Injectable` ni
 * acceso a base de datos — sigue el patrón de `modules/battles/combat/engine.ts` (motor testable en
 * aislamiento). La aleatoriedad es criptográficamente segura por defecto (`crypto.randomInt`); puede
 * sustituirse por un `rng` inyectado en tests.
 *
 * Orden de resolución (fijo, para tests):
 *  1. Seleccionar tier con weighted roll: se acumula peso en orden canónico con un solo
 *     `crypto.randomInt(0, totalWeight)`.
 *  2. Seleccionar item dentro del tier: `crypto.randomInt(0, itemsInTier.length)`.
 *  3. Resolver qty: `crypto.randomInt(qtyMin, qtyMax + 1)`.
 *  4. Pity: si `count >= threshold` y el tier resultante < minTier, se re-roll forzando tier >= minTier.
 */
export class DropEngineService {
  resolveDrop(
    dropTable: ChestDropTable,
    tierWeights: ChestTierWeights,
    qtyRange: QtyRangeResolver,
    pityState?: PityState,
    rng: BoundedRng = cryptoRng,
  ): DropResult {
    const entries = (dropTable?.dropTable ?? []).filter((e) => e && e.itemId);
    if (entries.length === 0) {
      throw new Error('La tabla de drops está vacía');
    }

    const availableTiers = this.collectAvailableTiers(entries, tierWeights);
    if (availableTiers.length === 0) {
      throw new Error('No hay tiers disponibles en la tabla de drops');
    }

    let result = this.rollForTier(availableTiers, entries, tierWeights, qtyRange, rng);

    // Garantía de pity: si el contador alcanzó el umbral y el tier resultante es inferior a minTier,
    // se repite el roll restringido a tiers >= minTier (normalizando los pesos sobre ese subconjunto).
    let guaranteed = false;
    if (
      pityState &&
      pityState.count >= pityState.threshold &&
      tierRank(result.tier) < tierRank(pityState.minTier)
    ) {
      const forcedTiers = this.collectForcedTiers(entries, tierWeights, pityState.minTier);
      if (forcedTiers.length > 0) {
        result = this.rollForTier(forcedTiers, entries, tierWeights, qtyRange, rng);
        guaranteed = true;
      }
    }

    const meetsMinTier = pityState ? tierRank(result.tier) >= tierRank(pityState.minTier) : false;
    return { ...result, guaranteed, meetsMinTier };
  }

  private collectAvailableTiers(entries: DropEntry[], weights: ChestTierWeights): DropTier[] {
    return DROP_TIERS.filter(
      (t) => (weights?.[t] ?? 0) > 0 && entries.some((e) => e.tier === t),
    );
  }

  private collectForcedTiers(
    entries: DropEntry[],
    weights: ChestTierWeights,
    minTier: DropTier,
  ): DropTier[] {
    const minRank = tierRank(minTier);
    const present = DROP_TIERS.filter((t) => tierRank(t) >= minRank && entries.some((e) => e.tier === t));
    const weighted = present.filter((t) => (weights?.[t] ?? 0) > 0);
    return weighted.length > 0 ? weighted : present;
  }

  private rollForTier(
    tiers: DropTier[],
    entries: DropEntry[],
    weights: ChestTierWeights,
    qtyRange: QtyRangeResolver,
    rng: BoundedRng,
  ): { itemId: string; tier: DropTier; qty: number } {
    if (tiers.length === 0) {
      throw new Error('No hay tiers disponibles para el roll');
    }

    // 1) Selección de tier por peso (normalizado sobre el subconjunto pasado).
    const totalWeight = tiers.reduce((sum, t) => sum + (weights?.[t] ?? 0), 0);
    let tier: DropTier;
    if (totalWeight <= 0) {
      tier = tiers[rng(tiers.length)];
    } else {
      const roll = rng(totalWeight);
      let acc = 0;
      tier = tiers[tiers.length - 1];
      for (const t of tiers) {
        acc += weights?.[t] ?? 0;
        if (roll < acc) {
          tier = t;
          break;
        }
      }
    }

    // 2) Item dentro del tier (con respaldo a toda la tabla si el tier no tuviera entradas).
    const inTier = entries.filter((e) => e.tier === tier);
    const pool = inTier.length > 0 ? inTier : entries;
    const entry = pool[rng(pool.length)];

    // 3) Cantidad en `[qtyMin, qtyMax]` (siempre >= 1).
    const [qMin, qMax] = qtyRange(entry);
    const lo = Math.max(1, Math.min(qMin, qMax));
    const hi = Math.max(lo, Math.max(qMin, qMax));
    const qty = rng(hi - lo + 1) + lo;

    return { itemId: entry.itemId, tier, qty };
  }
}