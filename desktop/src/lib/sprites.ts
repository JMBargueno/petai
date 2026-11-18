// Sistema de Composición y Baking en Memoria para Sprites de PetAI
// Conforme a la especificación técnica en docs/ART_PIPELINE.md

import { bakePixels, bakeFxMap, isLightPrimary, renderFx, PATTERN_FX, type RgbaImage } from '@pockai/scene/bake';
import { AssetLoader } from './asset-loader';
import { createMemoryAssetCache } from './asset-cache';
import type { AnimLibrary } from './animation/AnimationController';

// Importación de assets raster y metadatos JSON
import ignisaurBase from '@shared/assets/species/ignisaur/base.png';
import ignisaurMask from '@shared/assets/species/ignisaur/mask.png';
import ignisaurAnim from '@shared/assets/species/ignisaur/anim.json';

import axolunarBase from '@shared/assets/species/axolunar/base.png';
import axolunarMask from '@shared/assets/species/axolunar/mask.png';
import axolunarAnim from '@shared/assets/species/axolunar/anim.json';

import florabudBase from '@shared/assets/species/florabud/base.png';
import florabudMask from '@shared/assets/species/florabud/mask.png';
import florabudAnim from '@shared/assets/species/florabud/anim.json';

import eggBase from '@shared/assets/species/egg/base.png';
import eggMask from '@shared/assets/species/egg/mask.png';
import eggAnim from '@shared/assets/species/egg/anim.json';

// Importación de patrones tileables
const PATTERN_PNGS = import.meta.glob('@shared/assets/patterns/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

// Vista previa SVG por especie (generada) mientras se hornea la hoja
import ignisaurIdleSvg from '@shared/assets/sprites/ignisaur_idle.svg?raw';
import axolunarIdleSvg from '@shared/assets/sprites/axolunar_idle.svg?raw';
import florabudIdleSvg from '@shared/assets/sprites/florabud_idle.svg?raw';
import eggClosedSvg from '@shared/assets/sprites/egg_closed.svg?raw';
import eggCrackedSvg from '@shared/assets/sprites/egg_cracked.svg?raw';

export interface FrameTag {
  name: string;
  from: number;
  to: number;
  direction?: string;
  loop?: boolean;
  repeat?: number;
  priority?: number;
  group?: 'base' | 'motion' | 'action';
}

export interface FrameData {
  frame: { x: number; y: number; w: number; h: number };
  duration: number;
}

export interface AnimMetadata {
  frames: FrameData[];
  meta: {
    frameTags: FrameTag[];
    size: { w: number; h: number };
    aliases?: Record<string, string>;
  };
}

export interface BakedPetSheet {
  canvas: HTMLCanvasElement;
  /** Capa de efectos del frame (patrón del Éter y shiny) en el instante `time`; `null` si no lleva. */
  fxFrame: (frame: { sx: number; sy: number; sw: number; sh: number }, time: number) => HTMLCanvasElement | null;
  anim: AnimMetadata;
  tags: Map<string, FrameTag>;
  getFrame: (tag: string, relativeIndex: number) => { sx: number; sy: number; sw: number; sh: number; totalFrames: number };
}

// Registro de especies raster (etapa adult = raíz de la especie)
const SPECIES_REGISTRY: Record<string, { base: string; mask: string; anim: AnimMetadata }> = {
  ignisaur: { base: ignisaurBase, mask: ignisaurMask, anim: ignisaurAnim as AnimMetadata },
  axolunar: { base: axolunarBase, mask: axolunarMask, anim: axolunarAnim as AnimMetadata },
  florabud: { base: florabudBase, mask: florabudMask, anim: florabudAnim as AnimMetadata },
  egg: { base: eggBase, mask: eggMask, anim: eggAnim as AnimMetadata },
};

// Hojas adult del resto de especies: se descubren solas, así que una especie nueva no requiere
// tocar este archivo (las cuatro de arriba se importan a mano por compatibilidad).
const ADULT_PNGS = import.meta.glob('@shared/assets/species/*/{base,mask}.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const ADULT_ANIMS = import.meta.glob('@shared/assets/species/*/anim.json', { eager: true, import: 'default' }) as Record<string, AnimMetadata>;
for (const [file, anim] of Object.entries(ADULT_ANIMS)) {
  const m = file.match(/species\/([^/]+)\/anim\.json$/);
  const dir = file.slice(0, -'anim.json'.length);
  const base = ADULT_PNGS[`${dir}base.png`];
  const mask = ADULT_PNGS[`${dir}mask.png`];
  if (m && base && mask && !SPECIES_REGISTRY[m[1]]) SPECIES_REGISTRY[m[1]] = { base, mask, anim };
}

// Hojas por etapa (GUIA_ARTISTICA §7.4): species/<id>/<baby|juvenile|final>/. Se descubren solas.
const STAGE_PNGS = import.meta.glob('@shared/assets/species/*/{baby,juvenile,final}/{base,mask}.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const STAGE_ANIMS = import.meta.glob('@shared/assets/species/*/{baby,juvenile,final}/anim.json', {
  eager: true,
  import: 'default',
}) as Record<string, AnimMetadata>;
for (const [file, anim] of Object.entries(STAGE_ANIMS)) {
  const m = file.match(/species\/([^/]+)\/([^/]+)\/anim\.json$/);
  const dir = file.slice(0, -'anim.json'.length);
  const base = STAGE_PNGS[`${dir}base.png`];
  const mask = STAGE_PNGS[`${dir}mask.png`];
  if (m && base && mask) SPECIES_REGISTRY[`${m[1]}/${m[2]}`] = { base, mask, anim };
}

/** Clave de hoja para `(especie, etapa)`: la etapa si existe; si no, la hoja adult de la especie. */
export function sheetKey(speciesId: string, stage?: string | null): string {
  const id = normalizeSpecies(speciesId);
  return stage && SPECIES_REGISTRY[`${id}/${stage}`] ? `${id}/${stage}` : id;
}

const PREVIEW_SVG: Record<string, string> = {
  ignisaur: ignisaurIdleSvg,
  axolunar: axolunarIdleSvg,
  florabud: florabudIdleSvg,
};

// Vistas previas del resto de especies (sprites/<id>_idle.svg): también se descubren solas.
const IDLE_SVGS = import.meta.glob('@shared/assets/sprites/*_idle.svg', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
for (const [file, svg] of Object.entries(IDLE_SVGS)) {
  const m = file.match(/sprites\/([^/]+)_idle\.svg$/);
  if (m && !PREVIEW_SVG[m[1]]) PREVIEW_SVG[m[1]] = svg;
}

export function normalizeSpecies(speciesId: string): string {
  return SPECIES_REGISTRY[speciesId] && !speciesId.includes('/') ? speciesId : 'ignisaur';
}

/** ¿La clave es una especie raster conocida en este cliente? (para resolver sprites de terceros). */
export function isKnownSpecies(speciesId: string): boolean {
  return !!SPECIES_REGISTRY[speciesId];
}

/**
 * Clips de animación de una hoja (duración de cada frame, bucle, prioridad y grupo), listos para
 * el `AnimationController`. No necesita que la hoja esté horneada.
 */
export function getAnimLibrary(speciesId: string): { library: AnimLibrary; aliases: Record<string, string> } {
  const anim = SPECIES_REGISTRY[normalizeSpecies(speciesId)].anim;
  const library: AnimLibrary = {};
  for (const tag of anim.meta.frameTags) {
    const durations: number[] = [];
    for (let i = tag.from; i <= tag.to; i++) durations.push(anim.frames[i]?.duration ?? 150);
    library[tag.name] = {
      name: tag.name,
      durations,
      loop: tag.loop ?? tag.group !== 'action',
      priority: tag.priority ?? 0,
      group: tag.group ?? 'base',
      repeat: tag.repeat ?? 1,
    };
  }
  return { library, aliases: { ...ANIM_FALLBACKS, ...(anim.meta.aliases ?? {}) } };
}

// Registro de patrones
const PATTERN_REGISTRY: Record<string, string> = Object.fromEntries(
  Object.entries(PATTERN_PNGS).map(([path, url]) => [path.split('/').pop()!.replace('.png', ''), url]),
);

// Fallbacks: nombres antiguos o que no existan en una hoja → animación existente
export const ANIM_FALLBACKS: Record<string, string> = {
  sit: 'perch',
  hurt: 'hit',
  faint: 'defeat',
  cast: 'attack',
};

// Caché de imágenes decodificadas para no recargar de red/disco
const imageCache = new Map<string, HTMLImageElement>();
function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached && cached.complete) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

function readPixels(img: HTMLImageElement): RgbaImage {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

// Caché de hojas de sprites horneadas en memoria (In-Memory Baking)
const bakedSheetCache = new Map<string, BakedPetSheet>();

/**
 * Realiza la composición por capas en tiempo real y hornea el sprite sheet en memoria (In-Memory Baking).
 * Como el color y el patrón no cambian durante la sesión, se calcula 1 sola vez por mascota.
 */
export async function bakePetSpriteSheet(
  speciesId: string,
  patternId: string,
  palette: { primary: string; secondary: string; accent?: string },
  visualSeed: number = 1337,
  shiny: boolean = false,
  stage?: string | null
): Promise<BakedPetSheet> {
  const normalizedSpecies = sheetKey(speciesId, stage);
  const cacheKey = `${normalizedSpecies}:${patternId}:${palette.primary}:${palette.secondary}:${palette.accent ?? '-'}:${visualSeed}:${shiny}`;

  if (bakedSheetCache.has(cacheKey)) {
    return bakedSheetCache.get(cacheKey)!;
  }

  const spec = SPECIES_REGISTRY[normalizedSpecies];
  const [baseImg, maskImg] = await Promise.all([
    loadImage(spec.base),
    loadImage(spec.mask),
  ]);

  const patternUrl = PATTERN_REGISTRY[patternId] || null;
  const patternImg = patternUrl ? await loadImage(patternUrl).catch(() => null) : null;

  const width = baseImg.naturalWidth || baseImg.width;
  const height = baseImg.naturalHeight || baseImg.height;

  // Algoritmo único compartido con la escena de PixiJS (Android/iOS): @pockai/scene/bake.
  const maskPixels = readPixels(maskImg);
  const patternPixels = patternImg ? readPixels(patternImg) : null;
  const out = bakePixels(readPixels(baseImg), maskPixels, {
    palette: { primary: palette.primary, secondary: palette.secondary, accent: palette.accent },
    visualSeed,
    pattern: patternPixels,
  });

  // Efectos animados (patrones de la Textura del Éter y shiny): la misma función que la escena.
  const fxKind = PATTERN_FX[patternId] ?? null;
  const isEgg = normalizedSpecies === 'egg';
  const fxMap = !isEgg && (fxKind || shiny) ? bakeFxMap(maskPixels, { pattern: patternPixels, visualSeed }) : null;
  let fxCanvas: HTMLCanvasElement | null = null;
  let fxBuf: Uint8ClampedArray | undefined;

  const bakedCanvas = document.createElement('canvas');
  bakedCanvas.width = width;
  bakedCanvas.height = height;
  const bakedCtx = bakedCanvas.getContext('2d')!;
  const outImgData = new ImageData(out as Uint8ClampedArray<ArrayBuffer>, width, height);
  bakedCtx.putImageData(outImgData, 0, 0);

  // Mapa de tags de animación
  const tagsMap = new Map<string, FrameTag>();
  const animJson = spec.anim;
  if (animJson.meta?.frameTags) {
    for (const tag of animJson.meta.frameTags) {
      tagsMap.set(tag.name, tag);
    }
  }

  const bakedSheet: BakedPetSheet = {
    canvas: bakedCanvas,
    fxFrame: (frame, time) => {
      if (!fxMap) return null;
      if (!fxCanvas) fxCanvas = document.createElement('canvas');
      if (fxCanvas.width !== frame.sw || fxCanvas.height !== frame.sh) {
        fxCanvas.width = frame.sw;
        fxCanvas.height = frame.sh;
      }
      fxBuf = renderFx(fxMap, width, { x: frame.sx, y: frame.sy, w: frame.sw, h: frame.sh }, { fx: fxKind, shiny, time, light: isLightPrimary(palette.primary) }, fxBuf);
      fxCanvas.getContext('2d')!.putImageData(new ImageData(fxBuf as Uint8ClampedArray<ArrayBuffer>, frame.sw, frame.sh), 0, 0);
      return fxCanvas;
    },
    anim: animJson,
    tags: tagsMap,
    getFrame: (requestedTag: string, relativeIndex: number) => {
      // Aplicar tabla de fallback automático si el tag no existe
      let tag = tagsMap.get(requestedTag);
      if (!tag) {
        const fallbackName = ANIM_FALLBACKS[requestedTag] || 'idle';
        tag = tagsMap.get(fallbackName) || tagsMap.get('idle');
      }

      if (!tag) {
        // Fallback defensivo
        return { sx: 0, sy: 0, sw: 128, sh: 128, totalFrames: 1 };
      }

      const totalFrames = (tag.to - tag.from) + 1;
      const actualFrameIndex = tag.from + (relativeIndex % totalFrames);
      const frameInfo = animJson.frames[actualFrameIndex];

      if (frameInfo?.frame) {
        return {
          sx: frameInfo.frame.x,
          sy: frameInfo.frame.y,
          sw: frameInfo.frame.w,
          sh: frameInfo.frame.h,
          totalFrames,
        };
      }

      return {
        sx: actualFrameIndex * 128,
        sy: 0,
        sw: 128,
        sh: 128,
        totalFrames,
      };
    },
  };

  bakedSheetCache.set(cacheKey, bakedSheet);
  return bakedSheet;
}

// --- Soporte Legacy SVG (Retrocompatibilidad) ---
export const eggLibrary = {
  closed: eggClosedSvg,
  cracked: eggCrackedSvg,
};

/**
 * Integración con el `AssetLoader` (feature 009-edge-cdn, T013).
 *
 * El render debería preferir `loadSpriteSvg(...)`/`loadPatternSvg(...)` (CDN → cache local → origin
 * → embebido). Los imports `?raw` se conservan como **last-resort**: si el CDN/origin caen, la app
 * no se rompe (la retrocompatibilidad se elimina en v2).
 */
let spriteAssetLoader: AssetLoader | null = null;

/** Configura el `AssetLoader` del sistema de sprites (idempotente). */
export function initSpriteAssetLoader(
  opts: { cdnManifestUrl?: string; originManifestUrl?: string; originBaseUrl?: string } = {},
): AssetLoader {
  if (!spriteAssetLoader) {
    // La app de producción puede pasar un `AssetCache` backed por Tauri; por defecto, memoria.
    spriteAssetLoader = new AssetLoader(createMemoryAssetCache(), {
      cdnManifestUrl: opts.cdnManifestUrl,
      originManifestUrl: opts.originManifestUrl,
      originBaseUrl: opts.originBaseUrl,
    });
    void spriteAssetLoader.init();
  }
  return spriteAssetLoader;
}

/**
 * Carga el SVG de un sprite por `key` (p. ej. `sprites/ignisaur_idle`) desde el CDN cacheándolo.
 * Si no está disponible (CDN/origin caídos o `AssetNotFound`), devuelve `rawFallback` (el import
 * `?raw` embebido) como last resort.
 */
export async function loadSpriteSvg(key: string, rawFallback = ''): Promise<string> {
  const loader = initSpriteAssetLoader();
  try {
    const blob = await loader.loadAsset(key);
    return await blob.text();
  } catch {
    return rawFallback;
  }
}

/** Carga el SVG de un patrón por `key` (p. ej. `patterns/scales`) con fallback embebido. */
export async function loadPatternSvg(key: string, rawFallback: string | null = null): Promise<string | null> {
  const loader = initSpriteAssetLoader();
  try {
    const blob = await loader.loadAsset(key);
    return await blob.text();
  } catch {
    return rawFallback;
  }
}

/**
 * Sincrono/retrocompatibilidad: devuelve el fallback embebido (`?raw`). Para la carga real desde el
 * CDN usa `loadSpriteSvg(...)`.
 */
export function getPetSvg(speciesKey: string, _animation?: string): string {
  return PREVIEW_SVG[speciesKey] ?? ignisaurIdleSvg;
}

export function getPatternSvg(_patternKey: string): string | null {
  return null;
}
