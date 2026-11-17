#!/usr/bin/env tsx
/**
 * Genera las hojas de sprites de cada especie y del huevo a partir del catálogo de animaciones.
 *
 *   pnpm generate:sprites
 *
 * Salida (determinista, se commitea):
 *  - shared/assets/species/<especie>/{base.png, mask.png, anim.json}            (etapa adult)
 *  - shared/assets/species/<especie>/<baby|juvenile|final>/{base.png, mask.png, anim.json}
 *  - shared/assets/species/egg/{base.png, mask.png, anim.json}
 *  - shared/assets/sprites/<especie>_idle.svg (vista previa a color para el fallback)
 *  - shared/assets/animation-specs.json (estados, frames, fps y transiciones)
 *
 * Cada frame mide 128×128 y la hoja se organiza en una cuadrícula de COLS columnas.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { AnimDef, ANIMATION_ALIASES, EGG_ANIMATIONS, PET_ANIMATIONS } from './sprites/catalog';
import { Ctx, fx, Mode, Palette } from './sprites/draw';
import { EGG_POSES, drawEgg } from './sprites/egg';
import { POSES } from './sprites/poses';
import { SPECIES, SpeciesArt, Stage, STAGES } from './sprites/species';

/** La etapa adult vive en la raíz de la especie (alias histórico que leen todos los clientes). */
const stageDir = (id: string, stage: Stage) => (stage === 'adult' ? id : `${id}/${stage}`);

const ROOT = resolve(__dirname, '..');
const ASSETS = join(ROOT, 'shared', 'assets');
const FRAME = 128;
const COLS = 16;

type FrameDrawer = (ctx: Ctx, i: number, n: number) => string;

function ctxFor(mode: Mode, palette: Palette, frame: number): Ctx {
  let n = 0;
  return { mode, palette, uid: () => `f${frame}c${n++}` };
}

function characterFrame(sp: SpeciesArt, anim: AnimDef, stage: Stage = 'adult'): FrameDrawer {
  const poseFn = POSES[anim.name];
  if (!poseFn) throw new Error(`Falta la pose de "${anim.name}"`);
  return (ctx, i, n) => {
    const p = poseFn(i, n, sp);
    const t = `translate(${64 + p.dx} ${120 + p.dy}) rotate(${p.rot}) scale(${p.sx} ${p.sy}) translate(-64 -120)`;
    const behind = p.fx.filter((f) => f.b).map((f) => fx(ctx, f)).join('');
    const front = p.fx.filter((f) => !f.b).map((f) => fx(ctx, f)).join('');
    return behind + `<g transform="${t}">${sp.draw(ctx, p, stage)}</g>` + front;
  };
}

function eggFrame(anim: AnimDef): FrameDrawer {
  const poseFn = EGG_POSES[anim.name];
  if (!poseFn) throw new Error(`Falta la pose del huevo "${anim.name}"`);
  return (ctx, i, n) => drawEgg(ctx, poseFn(i, n));
}

interface SheetFrame {
  anim: AnimDef;
  index: number;
  draw: FrameDrawer;
}

function layout(anims: AnimDef[], drawerFor: (a: AnimDef) => FrameDrawer): SheetFrame[] {
  const frames: SheetFrame[] = [];
  for (const anim of anims) {
    const draw = drawerFor(anim);
    for (let i = 0; i < anim.frames; i++) frames.push({ anim, index: i, draw });
  }
  return frames;
}

function sheetSvg(frames: SheetFrame[], mode: Mode, palette: Palette): { svg: string; w: number; h: number } {
  const rows = Math.ceil(frames.length / COLS);
  const w = Math.min(COLS, frames.length) * FRAME;
  const h = rows * FRAME;
  let body = '';
  frames.forEach((f, k) => {
    const x = (k % COLS) * FRAME;
    const y = Math.floor(k / COLS) * FRAME;
    const ctx = ctxFor(mode, palette, k);
    body += `<svg x="${x}" y="${y}" width="${FRAME}" height="${FRAME}" viewBox="0 0 ${FRAME} ${FRAME}" overflow="hidden">${f.draw(ctx, f.index, f.anim.frames)}</svg>`;
  });
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`, w, h };
}

function renderPng(svg: string): Buffer {
  return new Resvg(svg, { fitTo: { mode: 'original' }, shapeRendering: 2 }).render().asPng();
}

function animJson(id: string, frames: SheetFrame[], anims: AnimDef[], w: number, h: number) {
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
      version: '2.0',
      image: 'base.png',
      mask: 'mask.png',
      format: 'RGBA8888',
      size: { w, h },
      frameSize: { w: FRAME, h: FRAME },
      scale: '1',
      aliases: ANIMATION_ALIASES,
      frameTags,
    },
  };
}

function writeSheet(id: string, anims: AnimDef[], drawerFor: (a: AnimDef) => FrameDrawer, palette: Palette) {
  const dir = join(ASSETS, 'species', id);
  mkdirSync(dir, { recursive: true });
  const frames = layout(anims, drawerFor);
  const base = sheetSvg(frames, 'base', palette);
  const mask = sheetSvg(frames, 'mask', palette);
  writeFileSync(join(dir, 'base.png'), renderPng(base.svg));
  writeFileSync(join(dir, 'mask.png'), renderPng(mask.svg));
  writeFileSync(join(dir, 'anim.json'), JSON.stringify(animJson(id.replace('/', '_'), frames, anims, base.w, base.h), null, 2) + '\n');
  return frames.length;
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

function writePreviewSvg(sp: SpeciesArt, palette: Palette) {
  for (const [state, which] of PREVIEW_STATES) {
    const anim = PET_ANIMATIONS.find((a) => a.name === state)!;
    const i = which === 'first' ? 0 : Math.floor(anim.frames / 2);
    const ctx = ctxFor('color', palette, 0);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">${characterFrame(sp, anim)(ctx, i, anim.frames)}</svg>\n`;
    writeFileSync(join(ASSETS, 'sprites', `${sp.id}_${state}.svg`), svg);
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
  writeFileSync(join(ASSETS, 'animation-specs.json'), JSON.stringify(file, null, 2) + '\n');
}

/** `--preview <dir>`: escribe hojas a color con la paleta por defecto (solo para revisarlas). */
function writePreviews(dir: string, speciesData: { id: string; defaultPalette: Palette }[]) {
  mkdirSync(dir, { recursive: true });
  for (const sp of SPECIES) {
    const palette = speciesData.find((s) => s.id === sp.id)!.defaultPalette;
    for (const stage of STAGES) {
      const frames = layout(PET_ANIMATIONS, (a) => characterFrame(sp, a, stage));
      writeFileSync(join(dir, `${sp.id}-${stage}-preview.png`), renderPng(sheetSvg(frames, 'color', palette).svg));
    }
  }
  const eggFrames = layout(EGG_ANIMATIONS, eggFrame);
  writeFileSync(join(dir, 'egg-preview.png'), renderPng(sheetSvg(eggFrames, 'color', { primary: '#fff', secondary: '#fff' }).svg));
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

  for (const sp of SPECIES) {
    const data = speciesData.find((s) => s.id === sp.id);
    if (!data) throw new Error(`Especie ${sp.id} no está en species.json`);
    let count = 0;
    for (const stage of STAGES) {
      count = writeSheet(stageDir(sp.id, stage), PET_ANIMATIONS, (a) => characterFrame(sp, a, stage), data.defaultPalette);
    }
    writePreviewSvg(sp, data.defaultPalette);
    console.log(`✓ ${sp.id}: ${count} frames × ${STAGES.length} etapas (${STAGES.join(', ')})`);
  }

  const eggCount = writeSheet('egg', EGG_ANIMATIONS, eggFrame, { primary: '#fff4d6', secondary: '#ffc94d' });
  console.log(`✓ egg: ${eggCount} frames en ${EGG_ANIMATIONS.length} animaciones`);

  writeAnimationSpecs(speciesData.filter((s) => SPECIES.some((sp) => sp.id === s.id)));
  console.log('✓ animation-specs.json regenerado');
}

main();
