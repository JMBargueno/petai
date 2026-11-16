import { writable } from 'svelte/store';
import { DESKTOP_SKILLS, type DesktopSkillDefinition } from '../types/desktopSkills';
import { api } from '../api';

const STORAGE_KEY = 'petai:desktop_skills_authorization';

function loadAuthorizations(): Record<string, boolean> {
  if (typeof window === 'undefined' || !window.localStorage) {
    const defaults: Record<string, boolean> = {};
    for (const s of DESKTOP_SKILLS) defaults[s.id] = s.defaultEnabled;
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const defaults: Record<string, boolean> = {};
      for (const s of DESKTOP_SKILLS) defaults[s.id] = s.defaultEnabled;
      return defaults;
    }
    return JSON.parse(raw);
  } catch {
    const defaults: Record<string, boolean> = {};
    for (const s of DESKTOP_SKILLS) defaults[s.id] = s.defaultEnabled;
    return defaults;
  }
}

function saveAuthorizations(auth: Record<string, boolean>) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  } catch (err) {
    console.warn('[desktopSkillsStore] Error guardando autorizaciones:', err);
  }
}

export const skillAuthorizations = writable<Record<string, boolean>>(loadAuthorizations());

skillAuthorizations.subscribe((val) => {
  saveAuthorizations(val);
});

export function syncSkillsFromBackend(backendSkills?: Record<string, boolean> | null) {
  if (!backendSkills || typeof backendSkills !== 'object') return;
  skillAuthorizations.update((current) => ({
    ...current,
    ...backendSkills,
  }));
}

export function toggleSkillAuthorization(skillId: string, petId?: string) {
  skillAuthorizations.update((current) => {
    const nextVal = !current[skillId];
    const updated = { ...current, [skillId]: nextVal };

    // Sincronizar de forma asíncrona con el backend si hay una mascota activa
    if (petId) {
      api.updateDesktopSkills(petId, updated).catch((err) => {
        console.warn('[desktopSkillsStore] Error sincronizando habilidades con backend:', err);
      });
    }

    return updated;
  });
}

export function setSkillAuthorization(skillId: string, enabled: boolean, petId?: string) {
  skillAuthorizations.update((current) => {
    const updated = {
      ...current,
      [skillId]: enabled,
    };

    if (petId) {
      api.updateDesktopSkills(petId, updated).catch((err) => {
        console.warn('[desktopSkillsStore] Error sincronizando habilidades con backend:', err);
      });
    }

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
