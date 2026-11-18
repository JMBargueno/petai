/**
 * Mascota activa: la que pasea por el escritorio y a la que se refieren todas las pestañas.
 * La elección se guarda en este equipo; si esa mascota ya no existe, se usa la primera.
 */
export const ACTIVE_PET_KEY = 'pockai_active_pet';

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem' | 'removeItem'>;

function defaultStorage(): Storage | undefined {
  return typeof localStorage !== 'undefined' ? localStorage : undefined;
}

export function loadActivePetId(storage: ReadStorage | undefined = defaultStorage()): string | null {
  try {
    return storage?.getItem(ACTIVE_PET_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveActivePetId(id: string | null, storage: WriteStorage | undefined = defaultStorage()) {
  try {
    if (id) storage?.setItem(ACTIVE_PET_KEY, id);
    else storage?.removeItem(ACTIVE_PET_KEY);
  } catch {
    /* almacenamiento indisponible: la elección vale solo para esta sesión */
  }
}

/** La mascota guardada si sigue existiendo; si no, la primera; `null` si no hay ninguna. */
export function pickActivePet<T extends { id: string }>(pets: T[], savedId: string | null): T | null {
  return pets.find((p) => p.id === savedId) ?? pets[0] ?? null;
}
