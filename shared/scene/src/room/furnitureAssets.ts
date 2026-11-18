/**
 * Arte de muebles generado por `pnpm generate:furniture` (shared/assets/furniture). Vite resuelve
 * las URLs en build, así que el bundle embed los lleva consigo (Android/iOS sin red).
 */
import { Assets, Texture } from 'pixi.js';
import manifest from '../../../assets/furniture/furniture.json';

const SVGS = import.meta.glob('../../../assets/furniture/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export type Orientation = 'a' | 'b';

interface OrientationMeta {
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

interface FurnitureMeta {
  footprint: [number, number];
  wall: boolean;
  a: OrientationMeta;
  b: OrientationMeta;
}

const META = manifest as unknown as Record<string, FurnitureMeta>;

/** URL del SVG de un mueble (útil también como icono en las listas de los clientes). */
export function furnitureUrl(id: string, o: Orientation = 'a'): string | null {
  const hit = Object.entries(SVGS).find(([file]) => file.endsWith(`/${id}_${o}.svg`));
  return hit ? hit[1] : null;
}

export function furnitureMeta(id: string): FurnitureMeta | null {
  return META[id] ?? null;
}

/** Resolución a la que se rasteriza el SVG (nitidez al escalar la sala). */
const RESOLUTION = 3;
const cache = new Map<string, Promise<Texture | null>>();

/** Textura del mueble en una orientación (cacheada). `null` si no hay arte. */
export function loadFurnitureTexture(id: string, o: Orientation): Promise<Texture | null> {
  const key = `${id}_${o}`;
  let p = cache.get(key);
  if (!p) {
    const url = furnitureUrl(id, o);
    p = url
      ? Assets.load<Texture>({ src: url, data: { resolution: RESOLUTION } }).catch(() => null)
      : Promise.resolve(null);
    cache.set(key, p);
  }
  return p;
}
