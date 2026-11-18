/**
 * Buffs del hábitat (spec 10, §Buffs): cálculo puro, sin Prisma, compartido por la API
 * (`GET /v1/habitat/buffs`) y por la lógica de juego (lazy tick de vitales y combate), de modo
 * que ambas usan por construcción el MISMO valor ya recortado al tope de `buffCaps`.
 */

/** Buffs activos de una mascota, ya recortados a su tope. Clave ausente = 0. */
export type ActiveBuffs = Partial<Record<HabitatBuffKey, number>> & Record<string, number>;

export type HabitatBuffKey =
  | 'hygiene_decay_reduction'
  | 'happiness_decay_reduction'
  | 'energy_recovery_boost'
  | 'combat_mood_bonus';

interface BuffCatalog {
  furniture: { id: string; buffs?: Record<string, number> }[];
  buffCaps?: Record<string, number>;
}

/**
 * Suma los buffs de los muebles colocados y recorta cada uno a su tope. Las claves de
 * `buffCaps` llevan el sufijo `_max` (p. ej. `hygiene_decay_reduction_max`); se acepta
 * también la clave cruda por compatibilidad.
 */
export function computeActiveBuffs(furnitureIds: string[], catalog: BuffCatalog): ActiveBuffs {
  const byId = new Map(catalog.furniture.map((f) => [f.id, f]));
  const caps = catalog.buffCaps ?? {};
  const aggregated: Record<string, number> = {};
  for (const id of furnitureIds) {
    const buffs = byId.get(id)?.buffs;
    if (!buffs) continue;
    for (const [k, v] of Object.entries(buffs)) aggregated[k] = (aggregated[k] || 0) + v;
  }
  const capped: ActiveBuffs = {};
  for (const [k, v] of Object.entries(aggregated)) {
    const cap = caps[k] ?? caps[`${k}_max`];
    capped[k] = typeof cap === 'number' ? Math.min(v, cap) : v;
  }
  return capped;
}

/** Lee un buff acotado a [0, 1] (defensa ante datos corruptos: nunca invierte el efecto). */
export function buffValue(buffs: ActiveBuffs | undefined, key: HabitatBuffKey): number {
  const v = buffs?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** Decaimiento reducido: `rate · (1 − reducción)`. */
export function reducedDecay(rate: number, buffs: ActiveBuffs | undefined, key: HabitatBuffKey): number {
  return rate * (1 - buffValue(buffs, key));
}

/** Recuperación aumentada: `rate · (1 + boost)`. */
export function boostedRecovery(rate: number, buffs: ActiveBuffs | undefined, key: HabitatBuffKey): number {
  return rate * (1 + buffValue(buffs, key));
}
