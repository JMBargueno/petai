/**
 * Reglas puras de los accesorios (spec 38): sin BD, sin reloj y sin azar.
 * Una prenda ocupa una ranura; una mascota lleva como mucho una prenda por ranura.
 */
export const ACCESSORY_SLOTS = ['head', 'face', 'neck', 'back'] as const;
export type AccessorySlot = (typeof ACCESSORY_SLOTS)[number];

/** Prendas equipadas de una mascota: ranura → itemId. Una ranura ausente está vacía. */
export type EquippedAccessories = Partial<Record<AccessorySlot, string>>;

/** Cambio pedido por el cliente: itemId para equipar, `null` para quitar, ausente para no tocar. */
export type EquipChange = Partial<Record<AccessorySlot, string | null>>;

export interface AccessoryDef {
  id: string;
  name: string;
  description: string;
  slot: AccessorySlot;
  rarity: string;
  color: string;
  unlock: { type: 'coins' | 'gems' | 'achievement'; price?: number; achievementId?: string };
  animated?: boolean;
  fx?: string;
}

export type AccessoryState = 'locked' | 'available' | 'owned';

/**
 * Estado de una prenda para un usuario. `locked` solo aplica a las de logro: una prenda de compra
 * que aún no se tiene está `available`, llegue o no el saldo (eso lo decide la compra).
 */
export function accessoryState(def: AccessoryDef, owned: boolean): AccessoryState {
  if (owned) return 'owned';
  return def.unlock.type === 'achievement' ? 'locked' : 'available';
}

/**
 * Limpia lo guardado en `Pet.accessories`: descarta ranuras desconocidas, ids que ya no están en el
 * catálogo y prendas guardadas en una ranura que no es la suya. Nunca lanza: el JSON puede venir de
 * una versión anterior del catálogo.
 */
export function sanitizeEquipped(raw: unknown, catalog: Map<string, AccessoryDef>): EquippedAccessories {
  const out: EquippedAccessories = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const slot of ACCESSORY_SLOTS) {
    const id = (raw as Record<string, unknown>)[slot];
    if (typeof id !== 'string') continue;
    if (catalog.get(id)?.slot === slot) out[slot] = id;
  }
  return out;
}

export type EquipResult = { ok: true; next: EquippedAccessories } | { ok: false; error: string };

/**
 * Aplica un cambio de prendas sobre lo ya equipado. Valida que cada prenda exista, sea de la ranura
 * indicada y esté en propiedad. Si algo falla no se aplica nada (el cambio es todo o nada).
 */
export function resolveEquip(
  current: EquippedAccessories,
  change: EquipChange,
  catalog: Map<string, AccessoryDef>,
  owned: ReadonlySet<string>,
): EquipResult {
  const next: EquippedAccessories = { ...current };
  for (const slot of ACCESSORY_SLOTS) {
    const id = change[slot];
    if (id === undefined) continue;
    if (id === null) {
      delete next[slot];
      continue;
    }
    const def = catalog.get(id);
    if (!def) return { ok: false, error: `La prenda '${id}' no existe` };
    if (def.slot !== slot) return { ok: false, error: `'${def.name}' no va en la ranura ${slot}` };
    if (!owned.has(id)) return { ok: false, error: `No tienes '${def.name}'` };
    next[slot] = id;
  }
  return { ok: true, next };
}
