/**
 * Motor puro del Bonding Meter (feature 006): funciones sin dependencias de Nest (patrón de
 * `personality.ts`), testeables en aislamiento. Toda la matemática del vínculo —tier, cap/floor,
 * decaimiento y redondeo— vive aquí; las constantes salen de `balance.bonding` (Constitución VII).
 */

/** Un rango del vínculo, como se declara en `balance.bonding.tiers[]`. */
export interface BondingTier {
  id: string;
  name: string;
  /** Umbral mínimo de `bonding` para alcanzar este rango. */
  min: number;
}

/** Configuración del vínculo, leída de `balance.json → bonding` (Constitución VII). */
export interface BondingConfig {
  /** Incremento de `bonding` por tipo de interacción (feed, battle, minigame, chat, clean, sleep, evolve). */
  interactions: Record<string, number>;
  /** Puntos de decaimiento por día completo de abandono, una vez superada la ventana de inicio. */
  decayRatePerDay: number;
  /** Horas sin interacción sin decaimiento alguno (ventana de gracia). */
  graceWindowHours: number;
  /** Horas sin interacción a partir de las cuales empieza el decaimiento. */
  decayStartHours: number;
  /** Rangos ordenados por `min` ascendente. */
  tiers: BondingTier[];
}

/**
 * Rango por defecto cuando `balance.bonding` está ausente o mal formado.
 * Es el id de "Acostumbrado": el vínculo nace en el primer rango.
 */
export const DEFAULT_BONDING_TIER = 'acquainted';

/** Orden canónico de los ids de rango (para comparaciones `>=` tipo `isTierAtLeast('ally', ...)`). */
export const BONDING_TIER_ORDER = ['acquainted', 'companion', 'ally', 'soulmate', 'legend'] as const;

/** Tipos de interacción que suben el vínculo (los que existen en `balance.bonding.interactions`). */
export type BondingInteractionType = 'feed' | 'battle' | 'minigame' | 'chat' | 'clean' | 'sleep' | 'evolve';

/**
 * Redondea a 2 decimales (el vínculo y el decaimiento se expresan con 2 decimales como máximo;
 * SC-003 exige coherencia `value − value_prev = delta` dentro de ese redondeo).
 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Acota un valor de vínculo al intervalo `[0, 100]`. */
export function clampBonding(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

/**
 * Devuelve el id del rango del que está un valor de vínculo: el rango con el `min` mayor
 * que no supere `value`. Si `tiers` está vacío o no hay rango aplicable, `DEFAULT_BONDING_TIER`.
 */
export function tierForValue(value: number, tiers: BondingTier[]): string {
  if (!Array.isArray(tiers) || tiers.length === 0) return DEFAULT_BONDING_TIER;
  let current: BondingTier | undefined;
  for (const tier of tiers) {
    if (tier.min <= value) {
      if (!current || tier.min >= current.min) current = tier;
    }
  }
  return current?.id ?? DEFAULT_BONDING_TIER;
}

/** Nombre display (español) del rango de un valor de vínculo; `''` si no hay rango aplicable. */
export function tierNameForValue(value: number, tiers: BondingTier[]): string {
  if (!Array.isArray(tiers) || tiers.length === 0) return '';
  const id = tierForValue(value, tiers);
  return tiers.find((t) => t.id === id)?.name ?? '';
}

/**
 * Decaimiento acumulado tras `hoursIdle` horas sin interacción:
 * - `0` si `hoursIdle <= graceWindowHours` (ventana de gracia, p. ej. 24h);
 * - `0` si `hoursIdle <= decayStartHours` (sin penalización hasta las 48h);
 * - `decayRatePerDay × (hoursIdle − decayStartHours) / 24` si `hoursIdle > decayStartHours`,
 *   redondeado a 2 decimales.
 */
export function decayAmount(
  hoursIdle: number,
  cfg: Pick<BondingConfig, 'decayRatePerDay' | 'graceWindowHours' | 'decayStartHours'>,
): number {
  if (!Number.isFinite(hoursIdle) || hoursIdle <= 0) return 0;
  const grace = cfg.graceWindowHours ?? 24;
  const start = cfg.decayStartHours ?? Math.max(48, grace);
  if (hoursIdle <= grace) return 0;
  if (hoursIdle <= start) return 0;
  return round2((cfg.decayRatePerDay ?? 0) * ((hoursIdle - start) / 24));
}

/** Horas (con decimales) entre dos instantes; nunca negativa. */
export function hoursBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return ms > 0 ? ms / (1000 * 60 * 60) : 0;
}

/**
 * ¿Está `tier` en o por encima de `target`? Comparación por orden canónico de los ids
 * (los ids de `balance.bonding.tiers` son fijos: acquainted → companion → ally → soulmate → legend).
 * `true` si `target` es alcanzable (p. ej. `isBondingTierAtLeast('ally', 'ally') === true`).
 */
export function isBondingTierAtLeast(tier: string | undefined, target: string): boolean {
  const targetIdx = BONDING_TIER_ORDER.indexOf(target as (typeof BONDING_TIER_ORDER)[number]);
  if (targetIdx === -1) return false;
  const tierIdx = BONDING_TIER_ORDER.indexOf((tier ?? DEFAULT_BONDING_TIER) as (typeof BONDING_TIER_ORDER)[number]);
  return tierIdx >= targetIdx;
}

/** Incremento de `bonding` de una interacción según el balance; `null` si el `type` es desconocido. */
export function interactionIncrement(cfg: BondingConfig, type: string): number | null {
  const inc = cfg.interactions?.[type];
  return typeof inc === 'number' && Number.isFinite(inc) && inc >= 0 ? inc : null;
}
