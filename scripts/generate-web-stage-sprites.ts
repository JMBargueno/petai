#!/usr/bin/env tsx
/**
 * Sprites a color de una etapa para la web (las tarjetas de /pockais y /lore).
 *
 *   pnpm generate:web-sprites
 *
 * La web no hornea: muestra <img> estáticos. Este script toma la hoja de la etapa de cada especie
 * (shared/assets/species/<especie>/<etapa>/{base,mask}.png + anim.json), la hornea con la paleta
 * por defecto (`defaultPalette` de species.json) usando el mismo `bakePixels` que los clientes y
 * guarda el primer frame de cada estado que usa la web:
 *
 *   shared/assets/sprites/<especie>_<etapa>_{idle,happy,eat,sleep}.png   (se commitean)
 *
 * Bebé de todas las especies (tarjetas y demo); joven solo de las iniciales (hero de la home).
 *
 * Todos los frames se recortan al mismo cuadrado (la caja que cubre el contenido de todas las
 * especies y estados de la etapa), con el suelo a la misma altura: así salen a la misma escala en
 * las tarjetas y ninguno pierde los pies ni los efectos (las Z de dormir). El recorte cae en la
 * rejilla nativa (múltiplos de 2 px de hoja) para que el pixel art escale limpio.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bakePixels } from '../shared/scene/src/bake/bakePixels';
import { deriveVisualTraits } from '../shared/scene/src/prng';
import { encodePng } from './sprites/pixel/raster';
// @ts-expect-error: módulo JS sin tipos (códec PNG compartido con generate-pattern-previews.mjs)
import { decodePng } from './lib/png.mjs';

const ROOT = resolve(__dirname, '..');
const SPECIES_DIR = join(ROOT, 'shared', 'assets', 'species');
const OUT_DIR = join(ROOT, 'shared', 'assets', 'sprites');
const STAGES = ['baby', 'juvenile'] as const;
/** Etapas que la web solo enseña de las especies iniciales (rareza normal): el joven del hero de la home. */
const STARTERS_ONLY: ReadonlySet<string> = new Set(['juvenile']);
const WEB_STATES = ['idle', 'happy', 'eat', 'sleep'] as const;
/** Píxeles de hoja por píxel nativo: el recorte se alinea a esta rejilla. */
const CELL = 2;
/** Margen (en píxeles de hoja) alrededor del contenido. */
const PAD = 4;

interface SpeciesEntry {
  spriteKey: string;
  defaultPalette: { primary: string; secondary: string; accent?: string };
}
interface AnimJson {
  frames: { frame: { x: number; y: number; w: number; h: number } }[];
  meta: { frameTags: { name: string; from: number }[] };
}
interface Frame {
  out: string;
  w: number;
  h: number;
  data: Uint8Array;
}

/** Semilla cuyo giro de tono es casi nulo: la web enseña la paleta canónica de la especie. */
function neutralSeed(): number {
  let best = 0;
  for (let s = 0; s < 10_000; s++) {
    if (Math.abs(deriveVisualTraits(s).hueShiftDeg) < Math.abs(deriveVisualTraits(best).hueShiftDeg)) best = s;
    if (Math.abs(deriveVisualTraits(best).hueShiftDeg) < 0.05) break;
  }
  return best;
}

function readRgba(file: string): { width: number; height: number; data: Uint8Array } {
  const { width, height, pixels } = decodePng(readFileSync(file));
  return { width, height, data: pixels };
}

/** Copia un rectángulo de un buffer RGBA. */
function crop(src: Uint8Array, srcW: number, x: number, y: number, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) out.set(src.subarray(((y + row) * srcW + x) * 4, ((y + row) * srcW + x + w) * 4), row * w * 4);
  return out;
}

const species = JSON.parse(readFileSync(join(ROOT, 'shared', 'game-data', 'species.json'), 'utf8')) as SpeciesEntry[];
const seed = neutralSeed();

for (const stage of STAGES) {
  const frames: Frame[] = [];
  // Caja de contenido común, en coordenadas de frame (0..frameW).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let frameW = 0;
  let frameH = 0;

  for (const s of species.filter((x) => !STARTERS_ONLY.has(stage) || x.rarity === 'normal')) {
    const dir = join(SPECIES_DIR, s.spriteKey, stage);
    if (!existsSync(join(dir, 'anim.json'))) {
      console.warn(`  ${s.spriteKey}: sin etapa ${stage}, se omite`);
      continue;
    }
    const anim = JSON.parse(readFileSync(join(dir, 'anim.json'), 'utf8')) as AnimJson;
    const base = readRgba(join(dir, 'base.png'));
    const mask = readRgba(join(dir, 'mask.png'));
    const baked = new Uint8Array(bakePixels(base, mask, { palette: s.defaultPalette, visualSeed: seed, pattern: null, pixelSize: CELL }));

    for (const state of WEB_STATES) {
      const tag = anim.meta.frameTags.find((t) => t.name === state);
      if (!tag) throw new Error(`${s.spriteKey}/${stage}: falta la animación ${state}`);
      const { x, y, w, h } = anim.frames[tag.from].frame;
      frameW = w;
      frameH = h;
      const data = crop(baked, base.width, x, y, w, h);
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          if (data[(py * w + px) * 4 + 3] === 0) continue;
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
      }
      frames.push({ out: `${s.spriteKey}_${stage}_${state}.png`, w, h, data });
    }
  }
  if (!frames.length) continue;

  // Cuadrado centrado en horizontal sobre la caja, con el suelo (maxY) abajo y PAD de margen.
  const side = Math.ceil((Math.max(maxX - minX + 1, maxY - minY + 1) + PAD * 2) / CELL) * CELL;
  const bottom = Math.min(frameH, Math.ceil((maxY + 1 + PAD) / CELL) * CELL);
  const top = bottom - side;
  const cx = (minX + maxX + 1) / 2;
  const left = Math.round((cx - side / 2) / CELL) * CELL;

  for (const f of frames) {
    // El cuadrado puede salirse del frame (arriba o a los lados): lo de fuera queda transparente.
    const out = new Uint8Array(side * side * 4);
    for (let row = 0; row < side; row++) {
      const sy = top + row;
      if (sy < 0 || sy >= f.h) continue;
      for (let col = 0; col < side; col++) {
        const sx = left + col;
        if (sx < 0 || sx >= f.w) continue;
        out.set(f.data.subarray((sy * f.w + sx) * 4, (sy * f.w + sx) * 4 + 4), (row * side + col) * 4);
      }
    }
    writeFileSync(join(OUT_DIR, f.out), encodePng(side, side, out));
  }
  console.log(`generate-web-stage-sprites: ${frames.length} sprites de ${stage} (${side}×${side} px, semilla ${seed}) → ${OUT_DIR}`);
  console.log(`  caja de contenido x ${minX}–${maxX}, y ${minY}–${maxY} en frames de ${frameW}×${frameH}`);
}
