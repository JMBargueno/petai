/**
 * Colocación de accesorios sobre el Pockai (spec 38, GUIA_ARTISTICA §7.6), como funciones puras.
 *
 * Es la única implementación: la escena de PixiJS y el canvas del escritorio la usan para saber
 * dónde va cada prenda en cada frame. Todo va en píxeles nativos del frame de 64×64; quien pinta
 * multiplica por la escala de la hoja (×2).
 */
export const ACCESSORY_SLOTS = ['head', 'face', 'neck', 'back'] as const;
export type AccessorySlot = (typeof ACCESSORY_SLOTS)[number];
export type AccessorySize = 'S' | 'M' | 'L';

/** Prendas equipadas: ranura → id de `accessories.json`. */
export type EquippedAccessories = Partial<Record<AccessorySlot, string>>;

type Offsets = [number, number][];

/** `anchors.json` de una especie y etapa (lo escribe `pnpm generate:sprites`). */
export interface AnchorsFile {
  size: AccessorySize;
  /** Ancla de cada ranura en el frame 0 de `idle`. */
  base: Record<AccessorySlot, [number, number]>;
  eyeGap: number;
  /** Por animación, desplazamiento de cada frame: una lista común o una por ranura. Sin entrada = 0. */
  frames: Record<string, Offsets | Partial<Record<AccessorySlot, Offsets>>>;
}

/** `meta.json` de una prenda (lo escribe `pnpm generate:accessories`). */
export interface AccessoryMeta {
  slot: AccessorySlot;
  /** Píxeles de la hoja por píxel nativo. */
  scale: number;
  sizes: Record<'s' | 'm' | 'l', { w: number; h: number; anchor: [number, number] }>;
  /** Frames de la animación propia, en horizontal. */
  frames: number;
  frameMs: number;
}

/**
 * Orden de pintado: las prendas de espalda van detrás del sprite; el resto, delante, de dentro
 * afuera (cuello, cara, cabeza).
 */
export const BEHIND_SLOTS: AccessorySlot[] = ['back'];
export const FRONT_SLOTS: AccessorySlot[] = ['neck', 'face', 'head'];

/** Ancla de una ranura en un frame de una animación. Un frame fuera de rango usa el último. */
export function anchorAt(anchors: AnchorsFile, slot: AccessorySlot, clip: string, frame: number): [number, number] {
  const [bx, by] = anchors.base[slot];
  const entry = anchors.frames[clip];
  const list = Array.isArray(entry) ? entry : entry?.[slot];
  if (!list || list.length === 0) return [bx, by];
  const [dx, dy] = list[Math.max(0, Math.min(frame, list.length - 1))];
  return [bx + dx, by + dy];
}

export interface AccessoryPlacement {
  /** Esquina superior izquierda de la prenda dentro del frame nativo del Pockai. */
  x: number;
  y: number;
  /** Tamaño de un frame de la prenda, en px nativos. */
  w: number;
  h: number;
  /** Frame de la animación propia de la prenda. */
  frame: number;
}

/**
 * Dónde se pinta una prenda: su punto de anclaje se coloca sobre el ancla de la ranura. `timeMs` es
 * el tiempo de la animación propia (0 = quieta, por ejemplo con movimiento reducido).
 */
export function placeAccessory(anchors: AnchorsFile, meta: AccessoryMeta, clip: string, frame: number, timeMs = 0): AccessoryPlacement {
  const size = meta.sizes[anchors.size.toLowerCase() as 's' | 'm' | 'l'];
  const [ax, ay] = anchorAt(anchors, meta.slot, clip, frame);
  const own = meta.frames > 1 && meta.frameMs > 0 ? Math.floor(Math.max(0, timeMs) / meta.frameMs) % meta.frames : 0;
  return { x: ax - size.anchor[0], y: ay - size.anchor[1], w: size.w, h: size.h, frame: own };
}

/** Limpia lo que llega del servidor: solo las cuatro ranuras, con un id de texto razonable. */
export function parseEquipped(raw: unknown): EquippedAccessories {
  const out: EquippedAccessories = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const slot of ACCESSORY_SLOTS) {
    const id = (raw as Record<string, unknown>)[slot];
    if (typeof id === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(id)) out[slot] = id;
  }
  return out;
}
