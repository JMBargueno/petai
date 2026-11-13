import { CombatConfig, Element, SkillDef, STAT_KEYS, StatKey, Stats } from './types';

export const MAX_EQUIPPED_SKILLS = 4;
export const LEVEL_STAT_BONUS = 0.05;

/**
 * Estadística efectiva (GAME_DESIGN §4.1):
 *   round(Base · RarityMultiplier · (1 + 0.05 · Level) + AllocatedPoints)
 * `combatStats` guarda Base·Rareza (se calcula al eclosionar) y `allocated` los puntos repartidos.
 */
export function effectiveStats(pet: {
  level: number;
  combatStats: any;
}): Stats {
  const base = pet.combatStats ?? {};
  const allocated = base.allocated ?? {};
  const out = {} as Stats;
  for (const k of STAT_KEYS) {
    const b = Number(base[k]) || 1;
    const a = Math.max(0, Math.floor(Number(allocated[k]) || 0));
    out[k] = Math.round(b * (1 + LEVEL_STAT_BONUS * pet.level) + a);
  }
  return out;
}

export function allocatedPoints(pet: { combatStats: any }): Stats {
  const allocated = pet.combatStats?.allocated ?? {};
  const out = {} as Stats;
  for (const k of STAT_KEYS) out[k] = Math.max(0, Math.floor(Number(allocated[k]) || 0));
  return out;
}

/**
 * Multiplicador de rendimiento por cuidado: felicidad y salud altas rinden al 100 %;
 * con ambas a 0 se rinde al `minMultiplier`. Estar enfermo penaliza un poco más.
 */
export function moodMultiplier(
  pet: { happiness: number; health: number; sick?: boolean },
  cfg: Pick<CombatConfig, 'mood'>,
): number {
  const care = (Math.min(100, Math.max(0, pet.happiness)) + Math.min(100, Math.max(0, pet.health))) / 200;
  let m = cfg.mood.minMultiplier + (1 - cfg.mood.minMultiplier) * care;
  if (pet.sick) m *= cfg.mood.sickMultiplier;
  return Math.round(m * 1000) / 1000;
}

export function unlockedSkills(skills: SkillDef[], element: Element, level: number): SkillDef[] {
  return skills.filter((s) => s.unlockLevel <= level && (s.element === 'neutral' || s.element === element));
}

function skillRating(s: SkillDef): number {
  if (s.kind === 'attack') return s.power * (s.accuracy / 100);
  return 45; // curar/guardia: valor medio para que entren en el reparto por defecto
}

/**
 * Habilidades equipadas: las elegidas por el jugador (si siguen siendo válidas) o, por defecto,
 * las mejores desbloqueadas (siempre incluye un ataque básico).
 */
export function equippedSkills(
  pet: { level: number; skills: unknown },
  element: Element,
  catalog: SkillDef[],
): SkillDef[] {
  const unlocked = unlockedSkills(catalog, element, pet.level);
  const chosen = Array.isArray(pet.skills) ? (pet.skills as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const picked = chosen
    .map((id) => unlocked.find((s) => s.id === id))
    .filter((s): s is SkillDef => !!s)
    .slice(0, MAX_EQUIPPED_SKILLS);
  const unique = [...new Map(picked.map((s) => [s.id, s])).values()];
  if (unique.length > 0 && unique.some((s) => s.kind === 'attack')) return unique;

  const ranked = [...unlocked].sort((a, b) => skillRating(b) - skillRating(a) || a.id.localeCompare(b.id));
  const loadout: SkillDef[] = [];
  const tackle = unlocked.find((s) => s.id === 'tackle');
  if (tackle) loadout.push(tackle);
  for (const s of ranked) {
    if (loadout.length >= MAX_EQUIPPED_SKILLS) break;
    if (!loadout.some((x) => x.id === s.id)) loadout.push(s);
  }
  return loadout;
}

export type AllocationResult = { ok: true; points: Partial<Stats>; total: number } | { ok: false; error: string };

/** Valida un reparto de puntos: enteros ≥ 0, solo estadísticas conocidas y sin superar los disponibles. */
export function validateAllocation(raw: unknown, available: number): AllocationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Se espera un objeto { hp, atk, def, vel, esp }' };
  const points: Partial<Stats> = {};
  let total = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!STAT_KEYS.includes(key as StatKey)) return { ok: false, error: `Estadística desconocida: ${key}` };
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1000) {
      return { ok: false, error: `${key} debe ser un entero entre 0 y 1000` };
    }
    if (value > 0) {
      points[key as StatKey] = value;
      total += value;
    }
  }
  if (total === 0) return { ok: false, error: 'Reparte al menos 1 punto' };
  if (total > available) return { ok: false, error: `Solo tienes ${available} puntos disponibles` };
  return { ok: true, points, total };
}

export type EquipResult = { ok: true; ids: string[] } | { ok: false; error: string };

/** Valida el equipamiento: ≤ 4 habilidades únicas, desbloqueadas, de su elemento o neutras, con al menos un ataque. */
export function validateEquip(raw: unknown, element: Element, level: number, catalog: SkillDef[]): EquipResult {
  if (!Array.isArray(raw)) return { ok: false, error: 'skills debe ser una lista de ids' };
  if (raw.length === 0 || raw.length > MAX_EQUIPPED_SKILLS) {
    return { ok: false, error: `Equipa entre 1 y ${MAX_EQUIPPED_SKILLS} habilidades` };
  }
  const ids: string[] = [];
  const unlocked = unlockedSkills(catalog, element, level);
  for (const id of raw) {
    if (typeof id !== 'string') return { ok: false, error: 'Los ids deben ser texto' };
    if (ids.includes(id)) return { ok: false, error: `Habilidad repetida: ${id}` };
    const skill = catalog.find((s) => s.id === id);
    if (!skill) return { ok: false, error: `Habilidad desconocida: ${id}` };
    if (!unlocked.some((s) => s.id === id)) {
      return { ok: false, error: `${skill.name} no está disponible (nivel ${skill.unlockLevel} o de otro elemento)` };
    }
    ids.push(id);
  }
  if (!ids.some((id) => catalog.find((s) => s.id === id)?.kind === 'attack')) {
    return { ok: false, error: 'Equipa al menos un ataque' };
  }
  return { ok: true, ids };
}
