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

export function isSkillUnlocked(skill: DesktopSkillDefinition, petBonding = 0, petIntelligence = 1): boolean {
  return (
    petBonding >= skill.requiredBonding &&
    petIntelligence >= skill.requiredIntelligence
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
