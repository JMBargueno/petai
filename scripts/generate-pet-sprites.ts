#!/usr/bin/env tsx
/**
 * Genera las hojas de sprites en pixel art de cada especie y del huevo (GUIA_ARTISTICA §7.5) a
 * partir del catálogo de animaciones.
 *
 *   pnpm generate:sprites
 *   pnpm generate:sprites --preview [dir]   hojas a color para revisarlas (no toca los assets)
 *
 * Salida (determinista, se commitea):
 *  - shared/assets/species/<especie>/{base.png, mask.png, anim.json, anchors.json}       (etapa adult)
 *  - shared/assets/species/<especie>/<baby|juvenile|final>/{base.png, mask.png, anim.json, anchors.json}
 *  - shared/assets/species/egg/{base.png, mask.png, anim.json}
 *  - shared/assets/sprites/<especie>_{idle,happy,eat,sleep}.svg (vista previa a color para el fallback)
 *  - shared/assets/animation-specs.json (estados, frames, fps y transiciones)
 *
 * Cada frame se dibuja en una rejilla nativa de 64×64 y se guarda a ×2: mide 128×128 en la hoja,
 * que se organiza en una cuadrícula de COLS columnas. El formato de `base.png` y `mask.png` es el
 * que hornean los clientes (`shared/scene/src/bake/bakePixels.ts`).
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AnimDef, ANIMATION_ALIASES, EGG_ANIMATIONS, PET_ANIMATIONS } from './sprites/catalog';
import type { Palette } from './sprites/draw';
import { EGG_POSES } from './sprites/egg';
import { POSES } from './sprites/poses';
import { Stage, STAGES } from './sprites/species';
import { writeTextKeepEol } from './sprites/io';
import { drawEggFrame } from './sprites/pixel/egg';
import { Grid, N, SCALE } from './sprites/pixel/raster';
import { bakeSheet, composeSheet, FRAME, frameSvg, pngOf, Sheet, upscale } from './sprites/pixel/sheet';
import { accessorySize, Anchors, drawPockai, PIXEL_SPECIES, PixelSpecies, poseArt, Slot } from './sprites/pixel/species';

/** La etapa adult vive en la raíz de la especie (alias histórico que leen todos los clientes). */
const stageDir = (id: string, stage: Stage) => (stage === 'adult' ? id : `${id}/${stage}`);

const ROOT = resolve(__dirname, '..');
const ASSETS = join(ROOT, 'shared', 'assets');
const COLS = 16;
const SLOTS: Slot[] = ['head', 'face', 'neck', 'back'];

interface Frame {
  anim: AnimDef;
  index: number;
  grid: Grid;
  anchors?: Anchors;
}

function petFrames(sp: PixelSpecies, stage: Stage): Frame[] {
  const art = poseArt(sp, stage);
  const frames: Frame[] = [];
  for (const anim of PET_ANIMATIONS) {
    const poseFn = POSES[anim.name];
    if (!poseFn) throw new Error(`Falta la pose de "${anim.name}"`);
    for (let i = 0; i < anim.frames; i++) {
      const d = drawPockai(sp, stage, poseFn(i, anim.frames, art as never));
      frames.push({ anim, index: i, grid: d.grid, anchors: d.anchors });
    }
  }
  return frames;
}

function eggFrames(): Frame[] {
  const frames: Frame[] = [];
  for (const anim of EGG_ANIMATIONS) {
    const poseFn = EGG_POSES[anim.name];
    if (!poseFn) throw new Error(`Falta la pose del huevo "${anim.name}"`);
    for (let i = 0; i < anim.frames; i++) frames.push({ anim, index: i, grid: drawEggFrame(poseFn(i, anim.frames)) });
  }
  return frames;
}

function animJson(id: string, frames: Frame[], anims: AnimDef[], w: number, h: number) {
  let cursor = 0;
  const frameTags = anims.map((a) => {
    const tag = {
      name: a.name,
      from: cursor,
      to: cursor + a.frames - 1,
      direction: 'forward',
      loop: a.loop,
      repeat: a.repeat ?? 1,
      priority: a.priority,
      group: a.group,
    };
    cursor += a.frames;
    return tag;
  });
  return {
    frames: frames.map((f, k) => ({
      filename: `${id}_${f.anim.name}_${f.index}.png`,
      frame: { x: (k % COLS) * FRAME, y: Math.floor(k / COLS) * FRAME, w: FRAME, h: FRAME },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: FRAME, h: FRAME },
      sourceSize: { w: FRAME, h: FRAME },
      duration: f.anim.ms,
    })),
    meta: {
      app: 'PetAI Sprite Generator',
      version: '3.0',
      image: 'base.png',
      mask: 'mask.png',
      format: 'RGBA8888',
      size: { w, h },
      frameSize: { w: FRAME, h: FRAME },
      scale: '1',
      // Pixel art: la hoja guarda cada píxel nativo como un bloque de `scale`×`scale`. Los clientes
      // deben escalar por enteros y sin suavizado (GUIA_ARTISTICA §7.5).
      pixelArt: { native: N, scale: SCALE },
      aliases: ANIMATION_ALIASES,
      frameTags,
    },
  };
}

/**
 * Anclas de accesorio (spec 38 §5): posición base de cada ranura (frame 0 de idle) y, por
 * animación, el desplazamiento de cada frame respecto a esa base, en px nativos.
 */
function anchorsJson(sp: PixelSpecies, stage: Stage, frames: Frame[]) {
  const s = sp.stages[stage];
  const base = frames.find((f) => f.anim.name === 'idle' && f.index === 0)!.anchors!;
  const out: Record<string, unknown> = {};
  for (const anim of PET_ANIMATIONS) {
    const fs = frames.filter((f) => f.anim.name === anim.name);
    const per = Object.fromEntries(SLOTS.map((slot) => [slot, fs.map((f) => [f.anchors![slot][0] - base[slot][0], f.anchors![slot][1] - base[slot][1]])])) as Record<Slot, number[][]>;
    const same = SLOTS.every((slot) => JSON.stringify(per[slot]) === JSON.stringify(per.head));
    const zero = SLOTS.every((slot) => per[slot].every(([x, y]) => x === 0 && y === 0));
    if (zero) continue; // sin entrada = [0, 0] en todos los frames
    out[anim.name] = same ? per.head : per;
  }
  return { size: accessorySize(sp, stage), base, eyeGap: s.eye.x2 - (s.eye.x1 + s.eye.w1), frames: out };
}

/** JSON con las listas de números en una línea (las anclas serían ilegibles con una por línea). */
const compactJson = (v: unknown) =>
  JSON.stringify(v, null, 2).replace(/\[\s*(-?\d+),\s*(-?\d+)\s*\]/g, '[$1, $2]').replace(/\[\s*((?:\[-?\d+, -?\d+\],?\s*)+)\]/g, (_m, inner: string) => `[${inner.trim().replace(/\s+/g, ' ')}]`);

function writeSheet(id: string, frames: Frame[], anims: AnimDef[]): Sheet {
  const dir = join(ASSETS, 'species', id);
  mkdirSync(dir, { recursive: true });
  const sheet = composeSheet(frames.map((f) => f.grid), COLS);
  writeFileSync(join(dir, 'base.png'), pngOf(sheet.w, sheet.h, sheet.base));
  writeFileSync(join(dir, 'mask.png'), pngOf(sheet.w, sheet.h, sheet.mask));
  writeTextKeepEol(join(dir, 'anim.json'), JSON.stringify(animJson(id.replace('/', '_'), frames, anims, sheet.w, sheet.h), null, 2) + '\n');
  return sheet;
}

/**
 * SVG a color de los 4 estados que usan la web (`pockai-sprite.ts`, 404) y el fallback de los
 * clientes: idle (frame 0) y el frame central de happy, eat y sleep. Etapa adult.
 */
const PREVIEW_STATES: [state: string, frame: 'first' | 'mid'][] = [
  ['idle', 'first'],
  ['happy', 'mid'],
  ['eat', 'mid'],
  ['sleep', 'mid'],
];

function writePreviewSvg(id: string, frames: Frame[], sheet: Sheet, palette: Palette) {
  const color = bakeSheet(sheet, palette);
  for (const [state, which] of PREVIEW_STATES) {
    const anim = PET_ANIMATIONS.find((a) => a.name === state)!;
    const i = which === 'first' ? 0 : Math.floor(anim.frames / 2);
    const k = frames.findIndex((f) => f.anim.name === state && f.index === i);
    writeTextKeepEol(join(ASSETS, 'sprites', `${id}_${state}.svg`), frameSvg(color, sheet.w, (k % COLS) * FRAME, Math.floor(k / COLS) * FRAME));
  }
}

function writeAnimationSpecs(species: { id: string; element: string }[]) {
  const toFrames = (from: number, a: AnimDef) => Array.from({ length: a.frames }, (_, k) => from + k);
  const triggersFor = (a: AnimDef) => {
    if (a.name === 'idle') {
      return [
        { on: 'input=move', to: 'walk' },
        { on: 'vitals=sleep', to: 'sleep' },
        { on: 'vitals=sick', to: 'sick' },
        { on: 'vitals=hunger', to: 'hungry' },
        { on: 'vitals=energy', to: 'tired' },
        { on: 'mood=sad', to: 'sad' },
      ];
    }
    if (a.group === 'base') return [{ on: 'vitals=ok', to: 'idle' }];
    if (a.group === 'motion') return [{ on: 'input=stop', to: 'idle' }];
    return [{ on: 'finish', to: 'idle' }];
  };
  const specs = species.map((sp) => {
    let cursor = 0;
    const states: Record<string, unknown> = {};
    for (const a of PET_ANIMATIONS) {
      states[a.name] = {
        frames: toFrames(cursor, a),
        fps: Math.round(1000 / a.ms),
        easing: a.easing ?? 'linear',
        loop: a.loop,
        triggers: triggersFor(a),
      };
      cursor += a.frames;
    }
    return {
      species: sp.id,
      element: sp.element,
      sheet: { frames: cursor, columns: COLS, frameSize: FRAME, source: `shared/assets/species/${sp.id}/anim.json` },
      defaultFps: 8,
      states,
    };
  });
  const file = {
    version: 1,
    notes:
      'Generado por scripts/generate-pet-sprites.ts a partir de scripts/sprites/catalog.ts — no editar a mano. Cada estado define frames (índices de la hoja), fps, easing, loop y triggers.',
    validEasings: ['linear', 'easeInQuad', 'easeOutCubic', 'easeInOutSine', 'elastic'],
    specs,
  };
  writeTextKeepEol(join(ASSETS, 'animation-specs.json'), JSON.stringify(file, null, 2) + '\n');
}

/** `--preview <dir>`: escribe hojas a color con la paleta por defecto (solo para revisarlas). */
function writePreviews(dir: string, speciesData: { id: string; defaultPalette: Palette }[]) {
  mkdirSync(dir, { recursive: true });
  const write = (name: string, frames: Frame[], palette: Palette) => {
    const sheet = composeSheet(frames.map((f) => f.grid), COLS);
    const big = upscale(sheet.w, sheet.h, bakeSheet(sheet, palette), 1);
    writeFileSync(join(dir, name), pngOf(big.w, big.h, big.data));
  };
  for (const sp of PIXEL_SPECIES) {
    const palette = speciesData.find((s) => s.id === sp.id)!.defaultPalette;
    for (const stage of STAGES) write(`${sp.id}-${stage}-preview.png`, petFrames(sp, stage), palette);
  }
  write('egg-preview.png', eggFrames(), { primary: '#fff', secondary: '#fff' });
  console.log(`✓ vistas previas en ${dir}`);
}

function main() {
  const speciesData = JSON.parse(readFileSync(join(ROOT, 'shared', 'game-data', 'species.json'), 'utf8')) as {
    id: string;
    element: string;
    defaultPalette: Palette;
  }[];

  const previewIdx = process.argv.indexOf('--preview');
  if (previewIdx > -1) {
    writePreviews(resolve(process.argv[previewIdx + 1] ?? 'sprite-previews'), speciesData);
    return;
  }

  for (const sp of PIXEL_SPECIES) {
    const data = speciesData.find((s) => s.id === sp.id);
    if (!data) throw new Error(`Especie ${sp.id} no está en species.json`);
    let count = 0;
    for (const stage of STAGES) {
      const frames = petFrames(sp, stage);
      const sheet = writeSheet(stageDir(sp.id, stage), frames, PET_ANIMATIONS);
      writeTextKeepEol(join(ASSETS, 'species', stageDir(sp.id, stage), 'anchors.json'), compactJson(anchorsJson(sp, stage, frames)) + '\n');
      if (stage === 'adult') writePreviewSvg(sp.id, frames, sheet, data.defaultPalette);
      count = frames.length;
    }
    console.log(`✓ ${sp.id}: ${count} frames × ${STAGES.length} etapas (${STAGES.join(', ')})`);
  }

  const egg = eggFrames();
  writeSheet('egg', egg, EGG_ANIMATIONS);
  console.log(`✓ egg: ${egg.length} frames en ${EGG_ANIMATIONS.length} animaciones`);

  writeAnimationSpecs(speciesData.filter((s) => PIXEL_SPECIES.some((sp) => sp.id === s.id)));
  console.log('✓ animation-specs.json regenerado');
}

main();
