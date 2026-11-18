import { writable } from 'svelte/store';
import { DESKTOP_SKILLS, type DesktopSkillDefinition } from '../types/desktopSkills';
import { api } from '../api';

/** Clave antigua, común a todas las mascotas. Solo se lee para migrar. */
const LEGACY_KEY = 'petai:desktop_skills_authorization';

type Authorizations = Record<string, boolean>;
type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): KeyValueStore | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
}

export function skillsStorageKey(petId: string | null | undefined): string {
  return petId ? `${LEGACY_KEY}:${petId}` : LEGACY_KEY;
}

export function defaultAuthorizations(): Authorizations {
  const defaults: Authorizations = {};
  for (const s of DESKTOP_SKILLS) defaults[s.id] = s.defaultEnabled;
  return defaults;
}

function readKey(storage: KeyValueStore | null, key: string): Authorizations | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Autorizaciones guardadas de una mascota. Si aún no tiene las suyas hereda las de la clave
 * antigua (migración: antes eran comunes a todas) y, si tampoco hay, los valores por defecto.
 * Las habilidades nuevas que no estén guardadas toman su valor por defecto.
 */
export function loadAuthorizationsFor(
  storage: KeyValueStore | null,
  petId: string | null | undefined,
): Authorizations {
  const saved = (petId ? readKey(storage, skillsStorageKey(petId)) : null) ?? readKey(storage, LEGACY_KEY);
  return { ...defaultAuthorizations(), ...(saved ?? {}) };
}

function saveAuthorizations(auth: Authorizations) {
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.setItem(skillsStorageKey(activePetId), JSON.stringify(auth));
  } catch (err) {
    console.warn('[desktopSkillsStore] Error guardando autorizaciones:', err);
  }
}

/** Mascota a la que pertenecen las autorizaciones cargadas en el store. */
let activePetId: string | null = null;

export const skillAuthorizations = writable<Authorizations>(loadAuthorizationsFor(browserStorage(), null));

skillAuthorizations.subscribe((val) => {
  saveAuthorizations(val);
});

/** true si el último cambio no se pudo guardar en el servidor (en este equipo sí queda guardado). */
export const skillSyncFailed = writable(false);

function onlyBooleans(raw: unknown): Authorizations {
  const out: Authorizations = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/**
 * Carga en el store las autorizaciones de la mascota activa: lo guardado en este equipo para
 * ella y, encima, lo que diga el servidor. Se llama al cambiar de mascota, no solo al abrir el
 * panel de Habilidades, para que cada Pockai use las suyas desde el primer momento.
 */
export function setActiveSkillsPet(petId: string | null | undefined, backendSkills?: unknown) {
  activePetId = petId ?? null;
  skillAuthorizations.set({
    ...loadAuthorizationsFor(browserStorage(), activePetId),
    ...onlyBooleans(backendSkills),
  });
}

export function syncSkillsFromBackend(backendSkills?: Record<string, boolean> | null) {
  if (!backendSkills || typeof backendSkills !== 'object') return;
  skillAuthorizations.update((current) => ({
    ...current,
    ...onlyBooleans(backendSkills),
  }));
}

function pushToBackend(petId: string | undefined, updated: Authorizations) {
  if (!petId) return;
  api
    .updateDesktopSkills(petId, updated)
    .then(() => skillSyncFailed.set(false))
    .catch((err) => {
      console.warn('[desktopSkillsStore] Error sincronizando habilidades con backend:', err);
      skillSyncFailed.set(true);
    });
}

export function toggleSkillAuthorization(skillId: string, petId?: string) {
  skillAuthorizations.update((current) => {
    const updated = { ...current, [skillId]: !current[skillId] };
    pushToBackend(petId, updated);
    return updated;
  });
}

export function setSkillAuthorization(skillId: string, enabled: boolean, petId?: string) {
  skillAuthorizations.update((current) => {
    const updated = { ...current, [skillId]: enabled };
    pushToBackend(petId, updated);
    return updated;
  });
}

/** Extrae el valor numérico de vínculo (0..100) desde cualquier variante del objeto pet */
export function getPetBonding(pet: any): number {
  if (!pet) return 0;
  if (typeof pet.bonding === 'number') return Math.round(pet.bonding);
  if (typeof pet.bonding?.value === 'number') return Math.round(pet.bonding.value);
  if (typeof pet.bonding?.level === 'number') return Math.round(pet.bonding.level);
  if (typeof pet.bondingLevel === 'number') return Math.round(pet.bondingLevel);
  return 0;
}

/** Convierte puntos de inteligencia (0..1000) o nivel directo (1..3) al nivel de IA (1: Charla, 2: Memoria, 3: Agente) */
export function getPetIntelligenceLevel(pointsOrLevel = 0): number {
  if (pointsOrLevel >= 500 || pointsOrLevel === 3) return 3;
  if (pointsOrLevel >= 200 || pointsOrLevel === 2) return 2;
  return 1;
}

/** Nombre legible del tier de IA según el nivel (1: Charla, 2: Memoria, 3: Agente) */
export function getPetIntelligenceTierName(level: number): string {
  if (level >= 3) return 'Agente';
  if (level === 2) return 'Memoria';
  return 'Charla';
}

/** Puntos mínimos de inteligencia recomendados para alcanzar un nivel (1 -> 0, 2 -> 200, 3 -> 500) */
export function getPetIntelligenceRequiredPoints(level: number): number {
  if (level >= 3) return 500;
  if (level === 2) return 200;
  return 0;
}

export function isSkillUnlocked(
  skill: DesktopSkillDefinition,
  petBonding = 0,
  petIntelligence = 1
): boolean {
  const intLevel = getPetIntelligenceLevel(petIntelligence);
  return (
    petBonding >= skill.requiredBonding &&
    intLevel >= skill.requiredIntelligence
  );
}

export function isSkillActive(
  skillId: string,
  authorizations: Record<string, boolean>,
  petBonding = 0,
  petIntelligence = 1
): boolean {
  const skill = DESKTOP_SKILLS.find((s) => s.id === skillId);
  if (!skill) return false;
  if (!isSkillUnlocked(skill, petBonding, petIntelligence)) return false;
  return authorizations[skillId] ?? skill.defaultEnabled;
}
