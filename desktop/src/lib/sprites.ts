// Sistema de Composición y Baking en Memoria para Sprites de PetAI
// Conforme a la especificación técnica en docs/ART_PIPELINE.md

import { deriveVisualTraits, hexToRgb, applyHueShiftRgb } from './prng';

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

// Importación de patrones tileables
import stripesPng from '@shared/assets/patterns/stripes.png';
import spotsPng from '@shared/assets/patterns/spots.png';
import scalesPng from '@shared/assets/patterns/scales.png';
import crystalPng from '@shared/assets/patterns/crystal.png';
import galaxyPng from '@shared/assets/patterns/galaxy.png';
import gradientPng from '@shared/assets/patterns/gradient.png';
import auroraPng from '@shared/assets/patterns/aurora.png';

// Fallback legacy SVG (para compatibilidad)
import ignisaurIdleSvg from '@shared/assets/sprites/ignisaur_idle.svg?raw';
import ignisaurEatSvg from '@shared/assets/sprites/ignisaur_eat.svg?raw';
import ignisaurHappySvg from '@shared/assets/sprites/ignisaur_happy.svg?raw';
import ignisaurSleepSvg from '@shared/assets/sprites/ignisaur_sleep.svg?raw';
import eggClosedSvg from '@shared/assets/sprites/egg_closed.svg?raw';
import eggCrackedSvg from '@shared/assets/sprites/egg_cracked.svg?raw';

export interface FrameTag {
  name: string;
  from: number;
  to: number;
  direction?: string;
  loop?: boolean;
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
  };
}

export interface BakedPetSheet {
  canvas: HTMLCanvasElement;
  anim: AnimMetadata;
  tags: Map<string, FrameTag>;
  getFrame: (tag: string, relativeIndex: number) => { sx: number; sy: number; sw: number; sh: number; totalFrames: number };
}

// Registro de especies raster
const SPECIES_REGISTRY: Record<string, { base: string; mask: string; anim: AnimMetadata }> = {
  ignisaur: { base: ignisaurBase, mask: ignisaurMask, anim: ignisaurAnim as AnimMetadata },
  axolunar: { base: axolunarBase, mask: axolunarMask, anim: axolunarAnim as AnimMetadata },
  florabud: { base: florabudBase, mask: florabudMask, anim: florabudAnim as AnimMetadata },
};

// Registro de patrones
const PATTERN_REGISTRY: Record<string, string> = {
  stripes: stripesPng,
  spots: spotsPng,
  scales: scalesPng,
  crystal: crystalPng,
  galaxy: galaxyPng,
  gradient: gradientPng,
  aurora: auroraPng,
};

// Fallbacks de animaciones recomendadas a críticas
export const ANIM_FALLBACKS: Record<string, string> = {
  cast: 'attack',
  sit: 'idle',
  idle_alt: 'idle',
  clean: 'happy',
  talk: 'happy',
  sad: 'idle',
  sick: 'idle',
  hurt: 'idle',
  faint: 'sleep',
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
  shiny: boolean = false
): Promise<BakedPetSheet> {
  const normalizedSpecies = SPECIES_REGISTRY[speciesId] ? speciesId : 'ignisaur';
  const cacheKey = `${normalizedSpecies}:${patternId}:${palette.primary}:${palette.secondary}:${visualSeed}:${shiny}`;

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

  // Derivación determinista mediante Mulberry32
  const traits = deriveVisualTraits(visualSeed);

  // Colores primario y secundario con hueShift sutil (±8 grados)
  const basePrimaryRgb = hexToRgb(palette.primary || '#E25822');
  const baseSecondaryRgb = hexToRgb(palette.secondary || '#F3C544');
  const primaryRgb = applyHueShiftRgb(basePrimaryRgb, traits.hueShiftDeg);
  const secondaryRgb = applyHueShiftRgb(baseSecondaryRgb, traits.hueShiftDeg);

  // Canvas auxiliar para leer píxeles de mask.png
  const offCanvas = document.createElement('canvas');
  offCanvas.width = width;
  offCanvas.height = height;
  const offCtx = offCanvas.getContext('2d', { willReadFrequently: true })!;

  offCtx.drawImage(maskImg, 0, 0);
  const maskData = offCtx.getImageData(0, 0, width, height);
  const maskPixels = maskData.data;

  // Canvas auxiliar para leer píxeles de base.png
  offCtx.clearRect(0, 0, width, height);
  offCtx.drawImage(baseImg, 0, 0);
  const baseData = offCtx.getImageData(0, 0, width, height);
  const basePixels = baseData.data;

  // Preparar píxeles del patrón tileable si existe
  let patternPixels: Uint8ClampedArray | null = null;
  let patW = 256;
  let patH = 256;
  if (patternImg) {
    const patCanvas = document.createElement('canvas');
    patW = patternImg.naturalWidth || 256;
    patH = patternImg.naturalHeight || 256;
    patCanvas.width = patW;
    patCanvas.height = patH;
    const patCtx = patCanvas.getContext('2d', { willReadFrequently: true })!;
    patCtx.drawImage(patternImg, 0, 0);
    patternPixels = patCtx.getImageData(0, 0, patW, patH).data;
  }

  // Canvas final horneado
  const bakedCanvas = document.createElement('canvas');
  bakedCanvas.width = width;
  bakedCanvas.height = height;
  const bakedCtx = bakedCanvas.getContext('2d')!;
  const outImgData = bakedCtx.createImageData(width, height);
  const out = outImgData.data;

  const totalPixels = width * height;
  const offX = traits.patternOffsetX;
  const offY = traits.patternOffsetY;

  for (let i = 0; i < totalPixels; i++) {
    const px = i * 4;
    const maskA = maskPixels[px + 3];

    // Si está fuera de la silueta total
    if (maskA === 0) {
      out[px] = 0;
      out[px + 1] = 0;
      out[px + 2] = 0;
      out[px + 3] = 0;
      continue;
    }

    const maskR = maskPixels[px] / 255; // Primario
    const maskG = maskPixels[px + 1] / 255; // Secundario
    const maskB = maskPixels[px + 2] / 255; // Zona patrón

    // 1. Capa Base de Color (Interpolación R / G)
    let colorR = primaryRgb[0] * maskR + secondaryRgb[0] * maskG;
    let colorG = primaryRgb[1] * maskR + secondaryRgb[1] * maskG;
    let colorB = primaryRgb[2] * maskR + secondaryRgb[2] * maskG;

    // 2. Proyección de Patrón (multiplicado por Canal B)
    if (patternPixels && maskB > 0.05) {
      const x = i % width;
      const y = Math.floor(i / width);
      // Muestreo tileable con offset derivado de visualSeed
      const u = (x + offX) % patW;
      const v = (y + offY) % patH;
      const patIdx = (v * patW + u) * 4;
      const patAlpha = (patternPixels[patIdx + 3] / 255) * maskB;

      if (patAlpha > 0) {
        // El patrón es blanco/luz sobre la base
        colorR = colorR * (1 - patAlpha) + 255 * patAlpha;
        colorG = colorG * (1 - patAlpha) + 255 * patAlpha;
        colorB = colorB * (1 - patAlpha) + 255 * patAlpha;
      }
    }

    // 3. Sombreado y Lineart (base.png)
    const baseR = basePixels[px];
    const baseG = basePixels[px + 1];
    const baseB = basePixels[px + 2];
    const baseA = basePixels[px + 3] / 255;

    if (baseA > 0) {
      // Si es un contorno negro u ojo puro (< 40), dibujar directamente
      if (baseR < 40 && baseG < 40 && baseB < 40) {
        colorR = baseR;
        colorG = baseG;
        colorB = baseB;
      } else if (baseR > 240 && baseG > 240 && baseB > 240) {
        // Reflejo blanco puro de ojos
        colorR = baseR;
        colorG = baseG;
        colorB = baseB;
      } else {
        // Sombra neutra en escala de grises: modo de fusión Multiply
        colorR = (colorR * baseR) / 255;
        colorG = (colorG * baseG) / 255;
        colorB = (colorB * baseB) / 255;
      }
    }

    out[px] = Math.min(255, Math.max(0, Math.round(colorR)));
    out[px + 1] = Math.min(255, Math.max(0, Math.round(colorG)));
    out[px + 2] = Math.min(255, Math.max(0, Math.round(colorB)));
    out[px + 3] = maskA;
  }

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

export function getPetSvg(speciesKey: string, animation: string): string {
  return ignisaurIdleSvg;
}

export function getPatternSvg(patternKey: string): string | null {
  return null;
}
