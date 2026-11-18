#!/usr/bin/env tsx
/**
 * Hoja de contactos para revisar el arte de una especie: clips clave × etapas, a color con la
 * paleta por defecto, más una fila a escala de sala (≈72 px) y una de máscara para ver la zona de
 * patrón (azul) y comprobar que no pisa la cara.
 *
 *   npx tsx .claude/skills/pockai-architect/scripts/contact_sheet.ts <id> [--stage baby] [--out <png>] [--clips idle,walk,…]
 *
 * `--stage` elige la etapa de las filas de sala (~72 px), espejo y máscara (por defecto adult): úsalo
 * al retocar una etapa concreta, para ver su máscara y su lectura a tamaño de sala.
 *
 * Por defecto escribe `sprite-previews/<id>-contact.png` (está en .gitignore; no se commitea).
 * Ábrelo con la herramienta de leer imágenes y revísalo con la checklist de references/art-brief.md.
 *
 * Si `SpeciesArt.draw` aún no acepta `stage` (arte de perfil), las 4 filas de etapa salen iguales
 * y se avisa por consola.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { PET_ANIMATIONS } from '../../../../scripts/sprites/catalog';
import { Ctx, fx, Mode, Palette } from '../../../../scripts/sprites/draw';
import { POSES } from '../../../../scripts/sprites/poses';
import { SPECIES, SpeciesArt } from '../../../../scripts/sprites/species';

const ROOT = resolve(__dirname, '../../../..');
const STAGES = ['baby', 'juvenile', 'adult', 'final'] as const;
const DEFAULT_CLIPS = ['idle', 'walk', 'eat', 'happy', 'sleep', 'attack', 'sad', 'evolution'];
const CELL = 128;
const LABEL_W = 96;
const HEAD_H = 22;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const id = process.argv[2];
if (!id || id.startsWith('-')) {
  console.error('Uso: contact_sheet.ts <id> [--stage baby|juvenile|adult|final] [--out <png>] [--clips idle,walk,…]');
  process.exit(1);
}
const sp = SPECIES.find((s) => s.id === id) as SpeciesArt | undefined;
if (!sp) {
  console.error(`"${id}" no tiene SpeciesArt en scripts/sprites/species.ts (hay: ${SPECIES.map((s) => s.id).join(', ')})`);
  process.exit(1);
}
const speciesData = JSON.parse(readFileSync(join(ROOT, 'shared/game-data/species.json'), 'utf8')) as {
  id: string;
  defaultPalette: Palette;
}[];
const palette = speciesData.find((s) => s.id === id)?.defaultPalette;
if (!palette) {
  console.error(`"${id}" no está en species.json`);
  process.exit(1);
}

const clips = (arg('--clips')?.split(',') ?? DEFAULT_CLIPS).filter((c) => {
  const ok = PET_ANIMATIONS.some((a) => a.name === c) && POSES[c];
  if (!ok) console.warn(`⚠ clip desconocido: ${c}`);
  return ok;
});
const stageAware = /stage/.test(sp.draw.toString());
if (!stageAware) console.warn('⚠ draw(ctx, pose) no recibe `stage`: las filas de etapa saldrán iguales.');

let uidN = 0;
const ctxFor = (mode: Mode): Ctx => ({ mode, palette, uid: () => `cs${uidN++}` });

/** Frame representativo de un clip: el del medio (la pose más "vendida"). */
function frameSvg(clip: string, stage: string, mode: Mode): string {
  const anim = PET_ANIMATIONS.find((a) => a.name === clip)!;
  const i = Math.floor(anim.frames / 2);
  const p = POSES[clip](i, anim.frames, sp!);
  const ctx = ctxFor(mode);
  const t = `translate(${64 + p.dx} ${120 + p.dy}) rotate(${p.rot}) scale(${p.sx} ${p.sy}) translate(-64 -120)`;
  const draw = sp!.draw as (c: Ctx, p: unknown, s?: string) => string;
  const fxs = (b: boolean) => p.fx.filter((f) => !!f.b === b).map((f) => fx(ctx, f)).join('');
  return fxs(true) + `<g transform="${t}">${draw(ctx, p, stage)}</g>` + fxs(false);
}

const cell = (x: number, y: number, inner: string, size = CELL) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 128 128" overflow="hidden">${inner}</svg>`;
const text = (x: number, y: number, s: string, size = 12, weight = 700) =>
  `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${size}" font-weight="${weight}" fill="#0b0a14">${s}</text>`;

type Row = { label: string; render: (clip: string) => string; size?: number };
const focus = (arg('--stage') ?? 'adult') as (typeof STAGES)[number];
if (!(STAGES as readonly string[]).includes(focus)) {
  console.error(`--stage debe ser una de: ${STAGES.join(', ')}`);
  process.exit(1);
}
const rows: Row[] = [
  ...STAGES.map((st) => ({ label: st, render: (c: string) => frameSvg(c, st, 'color') })),
  { label: `sala ~72px (${focus})`, render: (c: string) => frameSvg(c, focus, 'color'), size: 72 },
  { label: `espejo (${focus})`, render: (c: string) => `<g transform="translate(128 0) scale(-1 1)">${frameSvg(c, focus, 'color')}</g>` },
  { label: `máscara (${focus})`, render: (c: string) => frameSvg(c, focus, 'mask') },
];

const W = LABEL_W + clips.length * CELL;
let y = HEAD_H;
let body = `<rect width="100%" height="100%" fill="#fbfaff"/>`;
body += clips.map((c, k) => text(LABEL_W + k * CELL + 6, 15, c)).join('');
for (const row of rows) {
  const size = row.size ?? CELL;
  const h = Math.max(size, 28);
  body += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#d6d4e0"/>`;
  body += text(6, y + 18, row.label, 11);
  clips.forEach((c, k) => {
    const x = LABEL_W + k * CELL + (CELL - size) / 2;
    // Rejilla de suelo isométrica de referencia (una celda de 32×16 bajo los pies)
    if (size === CELL) body += cell(x, y, `<path d="M64 112 L80 120 L64 128 L48 120 Z" fill="none" stroke="#d6d4e0"/>`);
    body += cell(x, y + (h - size), row.render(c), size);
  });
  y += h;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}">${body}</svg>`;
const png = new Resvg(svg, { fitTo: { mode: 'original' }, shapeRendering: 2 }).render().asPng();
const out = resolve(arg('--out') ?? join(ROOT, 'sprite-previews', `${id}-contact.png`));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`✓ hoja de contactos: ${out} (${clips.length} clips × ${rows.length} filas)`);
