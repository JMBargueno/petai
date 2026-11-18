// Prendas equipadas sobre la mascota flotante (spec 38, GUIA_ARTISTICA §7.6).
// La colocación es la de @pockai/scene (la misma que usa la sala); aquí solo se cargan los assets
// y se pintan en el canvas 2D, detrás o delante del cuerpo.
import {
  ACCESSORY_SLOTS,
  BEHIND_SLOTS,
  FRONT_SLOTS,
  placeAccessory,
  type AccessoryMeta,
  type AccessorySlot,
  type AnchorsFile,
  type EquippedAccessories,
} from '@pockai/scene/bake';
import { sheetKey } from './sprites';

const ANCHORS = import.meta.glob('@shared/assets/species/**/anchors.json', { eager: true, import: 'default' }) as Record<string, AnchorsFile>;
const PNGS = import.meta.glob('@shared/assets/accessories/*/{s,m,l}.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const METAS = import.meta.glob('@shared/assets/accessories/*/meta.json', { eager: true, import: 'default' }) as Record<string, AccessoryMeta>;

/** Anclas por clave de hoja: `ignisaur` (adult) o `ignisaur/baby`. */
const ANCHORS_BY_KEY: Record<string, AnchorsFile> = {};
for (const [file, anchors] of Object.entries(ANCHORS)) {
  const m = file.match(/species\/(.+)\/anchors\.json$/);
  if (m) ANCHORS_BY_KEY[m[1]] = anchors;
}

const ART: Record<string, { meta: AccessoryMeta; urls: Record<string, string> }> = {};
for (const [file, meta] of Object.entries(METAS)) {
  const m = file.match(/accessories\/([^/]+)\/meta\.json$/);
  if (!m) continue;
  const dir = file.slice(0, -'meta.json'.length);
  ART[m[1]] = { meta, urls: { S: PNGS[`${dir}s.png`], M: PNGS[`${dir}m.png`], L: PNGS[`${dir}l.png`] } };
}

/**
 * Miniatura de una prenda para listas: su hoja de talla L y el tamaño de un frame en px nativos
 * (una prenda animada trae varios frames en horizontal y solo se enseña el primero).
 * `null` si este cliente no tiene su arte.
 */
export function accessoryPreview(id: string): { url: string; w: number; h: number; frames: number } | null {
  const art = ART[id];
  const url = art?.urls.L;
  return art && url ? { url, w: art.meta.sizes.l.w, h: art.meta.sizes.l.h, frames: art.meta.frames } : null;
}

export interface WornAccessory {
  slot: AccessorySlot;
  image: HTMLImageElement;
  meta: AccessoryMeta;
}

export interface WornSet {
  anchors: AnchorsFile;
  layers: WornAccessory[];
}

const images = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  let p = images.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      img.src = src;
    });
    images.set(src, p);
    p.catch(() => images.delete(src));
  }
  return p;
}

/**
 * Carga las prendas equipadas para una especie y etapa. Devuelve `null` si la hoja no tiene anclas
 * (huevo, especie sin arte) o no hay nada equipado. Una prenda sin arte en este cliente se omite.
 */
export async function loadWornSet(speciesId: string, stage: string | null | undefined, equipped: EquippedAccessories): Promise<WornSet | null> {
  if (stage === 'egg') return null;
  const anchors = ANCHORS_BY_KEY[sheetKey(speciesId, stage)];
  if (!anchors) return null;
  const layers: WornAccessory[] = [];
  for (const slot of ACCESSORY_SLOTS) {
    const id = equipped[slot];
    const art = id ? ART[id] : undefined;
    const url = art?.urls[anchors.size];
    if (!art || !url || art.meta.slot !== slot) continue;
    try {
      layers.push({ slot, image: await loadImage(url), meta: art.meta });
    } catch {
      // Sin la imagen la prenda simplemente no se pinta.
    }
  }
  return layers.length ? { anchors, layers } : null;
}

/**
 * Pinta las prendas de una fase (`behind` antes del cuerpo, `front` después) en el frame actual.
 * `scale` es el tamaño en pantalla de un píxel nativo (2 en la mascota de 128 px).
 */
export function drawWorn(
  ctx: CanvasRenderingContext2D,
  set: WornSet | null,
  phase: 'behind' | 'front',
  clip: string,
  frame: number,
  timeMs: number,
  scale = 2,
): void {
  if (!set) return;
  const order = phase === 'behind' ? BEHIND_SLOTS : FRONT_SLOTS;
  ctx.imageSmoothingEnabled = false;
  for (const slot of order) {
    for (const layer of set.layers) {
      if (layer.slot !== slot) continue;
      const p = placeAccessory(set.anchors, layer.meta, clip, frame, timeMs);
      const k = layer.meta.scale;
      ctx.drawImage(layer.image, p.frame * p.w * k, 0, p.w * k, p.h * k, p.x * scale, p.y * scale, p.w * scale, p.h * scale);
    }
  }
}
