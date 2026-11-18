/**
 * Personalidad de la mascota en el escritorio (las cinco dimensiones 0-100 de la spec 36).
 *
 * La calcula y la guarda el servidor (`GET /pets/:id/mind`); aquí se trae para que el cerebro
 * del escritorio se comporte según ella. Orden de resolución: lo último recibido del servidor
 * (guardado en este equipo) y, mientras no llega o si no hay red, el sesgo de su especie con la
 * misma variación determinista con la que nació.
 */
import { writable } from 'svelte/store';
import { DIMENSIONS, isValidDims, neutralDims, rollBirthDims, type Dims } from '@pockai/mind';
// Ruta relativa (no el alias @shared) para que también cargue en Node (tests).
import speciesData from '../../../../shared/game-data/species.json';
import { BIRTH_CONFIG } from './deskConfig';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = (petId: string) => `petai:dims:${petId}`;

const BIAS_BY_SPECIES: Record<string, Partial<Dims>> = Object.fromEntries(
  (speciesData as { id: string; personalityBias?: Partial<Dims> }[]).map((s) => [s.id, s.personalityBias ?? {}]),
);

function browserStorage(): KeyValueStore | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
}

/** Personalidad estimada sin servidor: sesgo de la especie ± la variación de nacimiento. */
export function fallbackDims(pet: { species?: { id?: string } | null; visualSeed?: number | null } | null): Dims {
  if (!pet) return neutralDims();
  const bias = BIAS_BY_SPECIES[pet.species?.id ?? ''];
  if (typeof pet.visualSeed !== 'number') return { ...neutralDims(BIRTH_CONFIG.defaultBias), ...bias };
  return rollBirthDims(bias, pet.visualSeed, BIRTH_CONFIG);
}

/** Extrae las dimensiones de la respuesta de `GET /pets/:id/mind`; `null` si no es válida. */
export function dimsFromMind(mind: unknown): Dims | null {
  const views = (mind as { dimensions?: Record<string, { value?: unknown }> } | null)?.dimensions;
  if (!views) return null;
  const out: Record<string, unknown> = {};
  for (const d of DIMENSIONS) out[d] = views[d]?.value;
  return isValidDims(out) ? out : null;
}

export function loadDims(storage: KeyValueStore | null, petId: string): Dims | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(KEY(petId)) ?? 'null');
    return isValidDims(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDims(storage: KeyValueStore | null, petId: string, dims: Dims) {
  try {
    storage?.setItem(KEY(petId), JSON.stringify(dims));
  } catch {
    // Almacenamiento lleno o bloqueado: la personalidad sigue en memoria
  }
}

/** Personalidad de la mascota activa en el escritorio. */
export const petDims = writable<Dims>(neutralDims());

let activePetId: string | null = null;

/** Guarda lo que el servidor dice de la mente de una mascota (lo llama también la pestaña Mente). */
export function rememberMind(petId: string, mind: unknown) {
  const dims = dimsFromMind(mind);
  if (!dims) return;
  saveDims(browserStorage(), petId, dims);
  if (petId === activePetId) petDims.set(dims);
}

/**
 * Fija la mascota activa: usa enseguida lo guardado (o la estimación por especie) y pide al
 * servidor la personalidad actual. Si la petición falla se queda con lo que tenía.
 */
export async function usePersonalityOf(
  pet: { id?: string; species?: { id?: string } | null; visualSeed?: number | null } | null,
  fetchMind: (petId: string) => Promise<unknown>,
) {
  const petId = pet?.id ?? null;
  activePetId = petId;
  petDims.set((petId && loadDims(browserStorage(), petId)) || fallbackDims(pet));
  if (!petId) return;
  try {
    rememberMind(petId, await fetchMind(petId));
  } catch {
    // Sin red o sin sesión: vale la estimación
  }
}
