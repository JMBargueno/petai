/**
 * Bake en navegador: carga base/mask/patrón, ejecuta `bakePixels` una vez por mascota y devuelve un
 * canvas listo para subir como textura. Cachea por clave (especie/etapa, paleta, patrón y semilla).
 *
 * Se hace en CPU a propósito: es exactamente el mismo algoritmo en todas las plataformas (sin
 * diferencias de precisión entre GPUs) y solo corre una vez por mascota (~50–150 ms para una hoja de
 * 2048×1408). Si el perfilado en gama baja lo pide, se puede mover a un filtro WebGL con
 * `bakePixels` como referencia de test.
 */
import { bakePixels, type RgbaImage } from './bakePixels';

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      img.src = src;
    });
    imageCache.set(src, p);
    p.catch(() => imageCache.delete(src));
  }
  return p;
}

export function readPixels(img: HTMLImageElement): RgbaImage {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

export interface BakeRequest {
  key: string;
  base: string;
  mask: string;
  pattern?: string | null;
  palette: { primary: string; secondary: string };
  visualSeed: number;
}

const bakedCache = new Map<string, Promise<HTMLCanvasElement>>();

export function bakeToCanvas(req: BakeRequest): Promise<HTMLCanvasElement> {
  const cacheKey = `${req.key}:${req.pattern ?? '-'}:${req.palette.primary}:${req.palette.secondary}:${req.visualSeed}`;
  let p = bakedCache.get(cacheKey);
  if (!p) {
    p = (async () => {
      const [baseImg, maskImg, patImg] = await Promise.all([
        loadImage(req.base),
        loadImage(req.mask),
        req.pattern ? loadImage(req.pattern).catch(() => null) : Promise.resolve(null),
      ]);
      const base = readPixels(baseImg);
      const mask = readPixels(maskImg);
      const pattern = patImg ? readPixels(patImg) : null;
      const out = bakePixels(base, mask, { palette: req.palette, visualSeed: req.visualSeed, pattern });
      const canvas = document.createElement('canvas');
      canvas.width = base.width;
      canvas.height = base.height;
      canvas.getContext('2d')!.putImageData(new ImageData(out as Uint8ClampedArray<ArrayBuffer>, base.width, base.height), 0, 0);
      return canvas;
    })();
    bakedCache.set(cacheKey, p);
    p.catch(() => bakedCache.delete(cacheKey));
  }
  return p;
}
