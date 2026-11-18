#!/usr/bin/env tsx
/**
 * Hoja de frames de un efecto del escritorio, para revisarlo a simple vista antes de cablearlo.
 *
 *   npx tsx .claude/skills/pockai-effect-architect/scripts/effect_contact.ts <id> [--scale 3] [--reduced]
 *
 * Escribe `sprite-previews/effects/<id>-contact.png`: una fila por Flujo del Éter (fuego, agua,
 * planta, eléctrico, sombra, luz, neutral) y una columna por instante muestreado de cada fase. Los
 * fondos alternan oscuro y claro por columna para comprobar que se lee sobre cualquier escritorio.
 * Al final imprime la leyenda de columnas y avisos (colores por frame, píxeles fuera de la rejilla).
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { EFFECTS, FLOW_PALETTES, GridSink, renderFrame } from '../../../../desktop/src/lib/effects/index';

const root = resolve(__dirname, '../../../..');
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--')) ?? 'portal-nexo';
const scaleArg = args.indexOf('--scale');
const SCALE = scaleArg >= 0 ? Number(args[scaleArg + 1]) : 3;
const reduced = args.includes('--reduced');

const def = EFFECTS[id];
if (!def) {
  console.error(`Efecto desconocido: ${id}. Registrados: ${Object.keys(EFFECTS).join(', ')}`);
  process.exit(1);
}

/** Instantes a muestrear por fase (t). Las fases `hold` se muestrean en el tiempo (2 frames). */
const SAMPLES: Record<string, number[]> = { default: [0.2, 0.45, 0.7, 1] };
type Col = { phase: string; t: number; elapsedMs: number };
const cols: Col[] = [];
const phases = reduced ? def.reducedPhases : def.phases;
let cursor = 0;
for (const p of phases) {
  if (p.ms === 'hold') {
    for (const k of [0, 1]) cols.push({ phase: p.name, t: 0, elapsedMs: cursor + k * (1000 / def.fps) * 2 });
    continue;
  }
  if (p.ms === 0) continue;
  for (const t of SAMPLES[p.name] ?? SAMPLES.default) cols.push({ phase: p.name, t, elapsedMs: cursor + t * p.ms });
  cursor += p.ms;
}

const elements = Object.keys(FLOW_PALETTES);
const PAD = 4;
const cellW = def.width * SCALE;
const cellH = def.height * SCALE;
const W = cols.length * (cellW + PAD) + PAD;
const H = elements.length * (cellH + PAD) + PAD;
const img = Buffer.alloc(W * H * 4);

function fill(x0: number, y0: number, w: number, h: number, rgb: [number, number, number]) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * W + x) * 4;
      img[i] = rgb[0];
      img[i + 1] = rgb[1];
      img[i + 2] = rgb[2];
      img[i + 3] = 255;
    }
}
const hex = (c: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];

fill(0, 0, W, H, [90, 90, 100]);
const warnings: string[] = [];
elements.forEach((el, row) => {
  cols.forEach((col, ci) => {
    const x0 = PAD + ci * (cellW + PAD);
    const y0 = PAD + row * (cellH + PAD);
    fill(x0, y0, cellW, cellH, ci % 2 === 0 ? [30, 30, 46] : [232, 232, 238]);
    const sink = new GridSink(def.width, def.height);
    renderFrame(def, sink, col, FLOW_PALETTES[el], 7, reduced);
    const n = sink.colors().size;
    if (n > 12) warnings.push(`${el} ${col.phase}@${col.t}: ${n} colores (máx. 12)`);
    for (let y = 0; y < def.height; y++)
      for (let x = 0; x < def.width; x++) {
        const c = sink.get(x, y);
        if (c) fill(x0 + x * SCALE, y0 + y * SCALE, SCALE, SCALE, hex(c));
      }
  });
});

const out = resolve(root, `sprite-previews/effects/${id}${reduced ? '-reduced' : ''}-contact.png`);
mkdirSync(dirname(out), { recursive: true });
sharp(img, { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toFile(out)
  .then(() => report())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

function report() {
  console.log(`Hoja: ${out}`);
  console.log(`Filas: ${elements.join(', ')}`);
  console.log(`Columnas: ${cols.map((c) => `${c.phase}${c.phase === 'hold' ? '' : '@' + c.t}`).join(' | ')}`);
  if (warnings.length) console.log(`Avisos:\n- ${warnings.join('\n- ')}`);
  else console.log('Sin avisos.');
}
