/**
 * La mascota del jugador dentro de un minijuego (spec 39 §2.6). Hornea su hoja con el mismo algoritmo
 * que el resto de la app (`@pockai/scene/bake`) y la anima en un `<canvas>` que la vista coloca.
 *
 * Es solo presentación: la lógica del juego no sabe qué mascota juega, así el servidor puede repetir
 * la partida sin ella. De dónde salen las hojas lo decide el anfitrión con un `PetSheetResolver`: el
 * escritorio usa su registro de assets; el embed, la carpeta `shared/assets` que ya va en la app.
 */
import { bakePixels, resolveClip, type AnimMetadata, type ResolvedClip, type RgbaImage } from '@pockai/scene/bake';
import type { MinigamePet } from './protocol';

export interface PetSheetUrls {
  base: string;
  mask: string;
  /** Metadatos de la hoja, o la URL de su `anim.json`. */
  anim: AnimMetadata | string;
  pattern?: string | null;
}

export type PetSheetResolver = (pet: MinigamePet) => PetSheetUrls | Promise<PetSheetUrls>;

/** Lo que una vista puede hacer con la mascota. */
export interface PetActor {
  /** Un frame de la hoja (128×128 px de archivo). El tamaño en pantalla lo pone el CSS de la vista. */
  readonly el: HTMLCanvasElement;
  /** Se cumple cuando la hoja está horneada. No hace falta esperarla para jugar. */
  readonly ready: Promise<void>;
  /** Cambia de clip. Con `once`, al acabar vuelve al clip de fondo. Pedir el que ya suena no lo reinicia. */
  play(clip: string, opts?: { once?: boolean }): void;
  /** Espejo horizontal: -1 mira a la izquierda, 1 a la derecha, 0 no cambia. */
  face(dir: number): void;
}

/** Lo que usa el anfitrión además: avanzar la animación y soltarla. */
export interface PetActorControl extends PetActor {
  advance(ms: number): void;
  dispose(): void;
}

export const DEFAULT_PET: Required<Pick<MinigamePet, 'species' | 'stage' | 'palette' | 'visualSeed'>> = {
  species: 'ignisaur',
  stage: 'baby',
  palette: { primary: '#E25822', secondary: '#F3C544', accent: '#6D1600' },
  visualSeed: 1337,
};

const FRAME = 128;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
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

interface Baked {
  sheet: HTMLCanvasElement;
  anim: AnimMetadata;
}

const bakedCache = new Map<string, Promise<Baked>>();

async function bake(pet: MinigamePet, resolver: PetSheetResolver): Promise<Baked> {
  const urls = await resolver(pet);
  const palette = pet.palette ?? DEFAULT_PET.palette;
  const visualSeed = pet.visualSeed ?? DEFAULT_PET.visualSeed;
  const key = `${urls.base}:${urls.pattern ?? '-'}:${palette.primary}:${palette.secondary}:${palette.accent ?? '-'}:${visualSeed}`;
  let p = bakedCache.get(key);
  if (!p) {
    p = (async () => {
      const [baseImg, maskImg, patImg, anim] = await Promise.all([
        loadImage(urls.base),
        loadImage(urls.mask),
        urls.pattern ? loadImage(urls.pattern).catch(() => null) : Promise.resolve(null),
        typeof urls.anim === 'string' ? fetch(urls.anim).then((r) => r.json() as Promise<AnimMetadata>) : Promise.resolve(urls.anim),
      ]);
      const base = readPixels(baseImg);
      const out = bakePixels(base, readPixels(maskImg), { palette, visualSeed, pattern: patImg ? readPixels(patImg) : null });
      const sheet = document.createElement('canvas');
      sheet.width = base.width;
      sheet.height = base.height;
      sheet.getContext('2d')!.putImageData(new ImageData(out as Uint8ClampedArray<ArrayBuffer>, base.width, base.height), 0, 0);
      return { sheet, anim };
    })();
    bakedCache.set(key, p);
    p.catch(() => bakedCache.delete(key));
  }
  return p;
}

/**
 * Crea la mascota de una partida. Sin `resolver` (un anfitrión que no sabe dónde están las hojas) el
 * canvas se queda vacío y el juego funciona igual.
 */
export function createPetActor(doc: Document, pet: MinigamePet | undefined, resolver: PetSheetResolver | undefined): PetActorControl {
  const el = doc.createElement('canvas');
  el.width = FRAME;
  el.height = FRAME;
  el.className = 'pmg-pet';
  el.setAttribute('aria-hidden', 'true');
  const g = el.getContext('2d');

  let baked: Baked | null = null;
  let disposed = false;
  let baseName = 'idle';
  let onceName: string | null = null;
  let clip: ResolvedClip | null = null;
  let frame = 0;
  let elapsed = 0;
  let loops = 0;

  const draw = () => {
    if (!baked || !clip || !g) return;
    const f = clip.frames[Math.min(frame, clip.frames.length - 1)].frame;
    if (el.width !== f.w || el.height !== f.h) {
      el.width = f.w;
      el.height = f.h;
    }
    g.clearRect(0, 0, el.width, el.height);
    g.drawImage(baked.sheet, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  };
  const start = (name: string) => {
    if (!baked) return;
    clip = resolveClip(baked.anim, name);
    frame = 0;
    elapsed = 0;
    loops = 0;
    draw();
  };

  const ready = resolver
    ? bake({ ...DEFAULT_PET, ...pet }, resolver)
        .then((b) => {
          if (disposed) return;
          baked = b;
          start(onceName ?? baseName);
        })
        .catch((err) => console.warn('[minigames] No se pudo pintar la mascota:', err))
    : Promise.resolve();

  return {
    el,
    ready,
    play(name, opts) {
      if (opts?.once) {
        onceName = name;
        start(name);
      } else if (name !== baseName) {
        baseName = name;
        if (!onceName) start(name);
      }
    },
    face(dir) {
      if (dir) el.style.setProperty('--pmg-flip', dir < 0 ? '-1' : '1');
    },
    advance(ms) {
      if (!clip) return;
      elapsed += ms;
      let changed = false;
      // Un salto largo (volver de una pausa) no recorre la animación entera.
      for (let guard = 0; guard < 8; guard++) {
        const dur = clip.frames[frame]?.duration ?? 150;
        if (elapsed < dur) break;
        elapsed -= dur;
        changed = true;
        if (frame + 1 < clip.frames.length) {
          frame += 1;
          continue;
        }
        loops += 1;
        if (onceName && loops >= clip.repeat) {
          onceName = null;
          start(baseName);
          return;
        }
        frame = 0;
      }
      if (changed) draw();
    },
    dispose() {
      disposed = true;
      el.remove();
    },
  };
}

/**
 * Resuelve las hojas por la convención de carpetas de `shared/assets` a partir de una URL base
 * (`species/<id>/` para adult, `species/<id>/<etapa>/` para el resto, `patterns/<id>.png`). Si la
 * etapa o la especie no existen cae a la hoja adult y luego a la especie por defecto.
 */
export function sheetFromAssetBase(assetBase: string): PetSheetResolver {
  const root = assetBase.endsWith('/') ? assetBase : `${assetBase}/`;
  return async (pet) => {
    const stage = pet.stage && pet.stage !== 'adult' ? `${pet.stage}/` : '';
    const dirs = [`${root}species/${pet.species}/${stage}`, `${root}species/${pet.species}/`, `${root}species/${DEFAULT_PET.species}/${DEFAULT_PET.stage}/`];
    for (const dir of dirs) {
      try {
        const res = await fetch(`${dir}anim.json`);
        if (!res.ok) continue;
        const anim = (await res.json()) as AnimMetadata;
        return { base: `${dir}base.png`, mask: `${dir}mask.png`, anim, pattern: pet.pattern && pet.pattern !== 'plain' ? `${root}patterns/${pet.pattern}.png` : null };
      } catch {
        /* siguiente carpeta */
      }
    }
    throw new Error(`Sin hoja para ${pet.species}`);
  };
}
