/**
 * Claves de estadísticas de usuario (`UserStat`). Son la fuente única del progreso de los logros de
 * tipo `stat`/`all_stats` y de los datos que muestra el perfil.
 *
 * - Almacenadas: se incrementan/fijan desde los listeners de `StatsListener`.
 * - Derivadas (`DERIVED_STAT_KEYS`): no se guardan; se calculan al leerlas a partir de otras tablas
 *   (suscripciones, amistades) para que nunca se desincronicen.
 */
export const STORED_STAT_KEYS = [
  'feeds',
  'cleans',
  'sleeps',
  'play_seconds',
  'habitat_visits',
  'eggs_hatched',
  'hatched_shiny',
  'coins_spent',
  'gems_spent',
  'streak_current',
  'streak_best',
  'last_play_day',
] as const;

export const DERIVED_STAT_KEYS = ['pro_days', 'friends'] as const;

/** Prefijos de claves dinámicas: `hatched_<rarity>` y `hatched_el_<element>`. */
export const STAT_KEY_PREFIXES = ['hatched_', 'hatched_el_'] as const;

export type StatKey = string;

/** ¿Es una clave de estadística reconocida (fija, derivada o con prefijo dinámico)? */
export function isKnownStatKey(key: string): boolean {
  return (
    (STORED_STAT_KEYS as readonly string[]).includes(key) ||
    (DERIVED_STAT_KEYS as readonly string[]).includes(key) ||
    STAT_KEY_PREFIXES.some((p) => key.startsWith(p) && key.length > p.length)
  );
}

export function isDerivedStatKey(key: string): boolean {
  return (DERIVED_STAT_KEYS as readonly string[]).includes(key);
}
