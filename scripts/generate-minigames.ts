#!/usr/bin/env tsx
/**
 * Comprueba e indexa el arte de los minijuegos (skill pockai-minigame-architect).
 *
 *   pnpm generate:minigames
 *   pnpm generate:minigames --preview [dir]   hoja de contactos (no toca los assets)
 *
 * El arte NO se dibuja aquí. Las piezas las importa scripts/sprites/items/import.mjs (con
 * `--free-ids --out shared/assets/minigames/<juego>`) desde una lámina de Nano Banana, y el fondo,
 * scripts/sprites/minigames/backdrop.mjs. Este script comprueba que cada pieza cumple la norma
 * (lienzo de 32 o 48 px nativos a ×2 exacto, sin transparencias parciales, margen y máximo de
 * colores) y que el fondo mide 680×520, y escribe shared/assets/minigames/manifest.json.
 *
 * La hoja de contactos enseña, por juego, el fondo con sus piezas encima a tamaño de juego y una
 * cría al lado (misma densidad de píxel), y las piezas a ×4 sobre claro y oscuro.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { decodePng } from './lib/png.mjs';
import type { Palette } from './sprites/draw';
import { writeTextKeepEol } from './sprites/io';
import { pose } from './sprites/species';
import { encodePng } from './sprites/pixel/raster';
import { bakeSheet, composeSheet, FRAME } from './sprites/pixel/sheet';
import { drawPockai, PIXEL_SPECIES } from './sprites/pixel/species';

const ROOT = resolve(__dirname, '..');
const DIR = join(ROOT, 'shared', 'assets', 'minigames');
const SIZES = [32, 48]; // lienzos nativos admitidos
const SCALE = 2; // los PNG se guardan a ×2
const MAX_COLORS = 12;
const BACKDROP: [number, number] = [680, 520];
const LIGHT: Rgb = [242, 241, 248];
const DARK: Rgb = [23, 22, 42];

type Rgb = [number, number, number];
interface Piece { name: string; size: number; px: Uint8Array; colors: number; box: [number, number, number, number] }
interface Game { id: string; name: string; pieces: Piece[]; backdrop: Uint8Array | null }

const balance = JSON.parse(readFileSync(join(ROOT, 'shared/game-data/balance.json'), 'utf8')) as { minigames: { games: Record<string, { name: string }> } };
const games = balance.minigames.games;

/** Lee una pieza, la reduce a la rejilla nativa y comprueba la norma. */
function loadPiece(game: string, file: string): Piece {
  const name = file.replace(/\.png$/, '');
  const tag = `${game}/${name}`;
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`${tag}: nombre de pieza inválido (snake_case)`);
  const png = decodePng(readFileSync(join(DIR, game, file)));
  const size = png.width / SCALE;
  if (png.width !== png.height || !SIZES.includes(size)) throw new Error(`${tag}: mide ${png.width}×${png.height}; debe ser ${SIZES.map((s) => `${s * SCALE}×${s * SCALE}`).join(' o ')}`);
  const side = png.width;
  const px = new Uint8Array(size * size * 4);
  const colors = new Set<number>();
  let x0 = size, y0 = size, x1 = -1, y1 = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = (y * SCALE * side + x * SCALE) * 4;
      for (const d of [4, side * 4, side * 4 + 4]) {
        for (let k = 0; k < 4; k++) if (png.pixels[s + k] !== png.pixels[s + d + k]) throw new Error(`${tag}: el píxel nativo (${x}, ${y}) no es un bloque de 2×2 uniforme`);
      }
      const a = png.pixels[s + 3];
      if (a !== 0 && a !== 255) throw new Error(`${tag}: transparencia parcial en (${x}, ${y})`);
      if (a === 0) continue;
      px.set(png.pixels.subarray(s, s + 4), (y * size + x) * 4);
      colors.add((png.pixels[s] << 16) | (png.pixels[s + 1] << 8) | png.pixels[s + 2]);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error(`${tag}: la pieza está vacía`);
  if (x0 < 1 || y0 < 1 || x1 > size - 2 || y1 > size - 2) throw new Error(`${tag}: no deja 1 px de margen en el lienzo`);
  if (colors.size > MAX_COLORS) throw new Error(`${tag}: ${colors.size} colores (máximo ${MAX_COLORS})`);
  return { name, size, px, colors: colors.size, box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1] };
}

async function loadBackdrop(game: string): Promise<Uint8Array | null> {
  const file = join(DIR, game, 'backdrop.webp');
  if (!existsSync(file)) return null;
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== BACKDROP[0] || info.height !== BACKDROP[1]) throw new Error(`${game}/backdrop.webp: mide ${info.width}×${info.height} y debe medir ${BACKDROP.join('×')}`);
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) throw new Error(`${game}/backdrop.webp: el fondo no puede tener transparencia`);
  return new Uint8Array(data);
}

async function loadAll(): Promise<Game[]> {
  if (!existsSync(DIR)) return [];
  const out: Game[] = [];
  for (const id of readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
    if (!games[id]) throw new Error(`Hay arte en shared/assets/minigames/${id}, que no es un minijuego de balance.json`);
    const files = readdirSync(join(DIR, id));
    for (const f of files) if (!f.endsWith('.png') && f !== 'backdrop.webp') throw new Error(`${id}/${f}: solo se admiten piezas .png y backdrop.webp`);
    out.push({ id, name: games[id].name, pieces: files.filter((f) => f.endsWith('.png')).sort().map((f) => loadPiece(id, f)), backdrop: await loadBackdrop(id) });
  }
  // En el orden de balance.json
  const order = Object.keys(games);
  return out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

function writeManifest(list: Game[]): void {
  mkdirSync(DIR, { recursive: true });
  const body = Object.fromEntries(
    list.map((g) => [g.id, { backdrop: !!g.backdrop, pieces: Object.fromEntries(g.pieces.map((p) => [p.name, { size: p.size, colors: p.colors, box: p.box }])) }]),
  );
  const text = JSON.stringify({ scale: SCALE, backdrop: BACKDROP, games: body }, null, 2).replace(/\[\s*(\d+),\s*(\d+)(?:,\s*(\d+),\s*(\d+))?\s*\]/g, (_m, a, b, c, d) => (c ? `[${a}, ${b}, ${c}, ${d}]` : `[${a}, ${b}]`));
  writeTextKeepEol(join(DIR, 'manifest.json'), text + '\n');
  for (const g of list) console.log(`✓ ${g.id}: ${g.backdrop ? 'fondo' : 'sin fondo'}, ${g.pieces.length} piezas${g.pieces.length ? ` (${g.pieces.map((p) => `${p.name} ${p.size} px ${p.colors} col.`).join(', ')})` : ''}`);
  const missing = Object.keys(games).filter((id) => !list.some((g) => g.id === id));
  console.log(`✓ manifest.json: ${list.length} de ${Object.keys(games).length} minijuegos con arte${missing.length ? `\n  sin arte: ${missing.join(', ')}` : ''}`);
}

// ───────────────────────── Hoja de contactos ─────────────────────────

/** Pinta `px` (RGBA de w×h, alfa 0 o 255) en `dst` ampliado ×k con su esquina en (ox, oy). */
function blit(dst: Uint8Array, dstW: number, dstH: number, px: Uint8Array, w: number, h: number, ox: number, oy: number, k: number): void {
  for (let y = 0; y < h * k; y++) {
    for (let x = 0; x < w * k; x++) {
      const s = (Math.floor(y / k) * w + Math.floor(x / k)) * 4;
      if (px[s + 3] === 0) continue;
      const dx = ox + x, dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= dstW || dy >= dstH) continue;
      const o = (dy * dstW + dx) * 4;
      dst[o] = px[s]; dst[o + 1] = px[s + 1]; dst[o + 2] = px[s + 2]; dst[o + 3] = 255;
    }
  }
}

function writeContact(dir: string, list: Game[]): void {
  if (list.length === 0) throw new Error('No hay arte en shared/assets/minigames: importa las piezas o el fondo de un juego');
  mkdirSync(dir, { recursive: true });
  const sp = PIXEL_SPECIES[0];
  const species = JSON.parse(readFileSync(join(ROOT, 'shared/game-data/species.json'), 'utf8')) as { id: string; defaultPalette: Palette }[];
  const baby = bakeSheet(composeSheet([drawPockai(sp, 'baby', pose()).grid], 1), species.find((s) => s.id === sp.id)!.defaultPalette);

  const [BW, BH] = BACKDROP;
  const PAD = 8;
  const ZOOM = 4;
  const side = (48 * ZOOM + PAD) * 2 + PAD; // dos columnas de piezas a ×4
  const w = BW + side * 2;
  const h = BH * list.length;
  const out = new Uint8Array(w * h * 4);
  const fill = (x0: number, y0: number, x1: number, y1: number, c: Rgb) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
  };
  list.forEach((g, n) => {
    const top = n * BH;
    // El juego: fondo, piezas a tamaño de juego en una fila y la cría en la línea del suelo (y = 232 de 260).
    if (g.backdrop) for (let y = 0; y < BH; y++) out.set(g.backdrop.subarray(y * BW * 4, (y + 1) * BW * 4), ((top + y) * w) * 4);
    else fill(0, top, BW, top + BH, [107, 100, 133]);
    let x = 40;
    for (const p of g.pieces) {
      blit(out, w, h, p.px, p.size, p.size, x, top + 150 - p.size, SCALE);
      x += p.size * SCALE + 24;
    }
    const floor = top + 232 * SCALE;
    blit(out, w, h, baby, FRAME, FRAME, BW / 2 - FRAME / 2, floor - 120, 1);
    // Las piezas a ×4 sobre claro y sobre oscuro
    [LIGHT, DARK].forEach((bg, k) => {
      const x0 = BW + k * side;
      fill(x0, top, x0 + side, top + BH, bg);
      g.pieces.slice(0, 4).forEach((p, i) => {
        const cx = x0 + PAD + (i % 2) * (48 * ZOOM + PAD);
        const cy = top + PAD + Math.floor(i / 2) * (48 * ZOOM + PAD);
        blit(out, w, h, p.px, p.size, p.size, cx, cy, ZOOM);
      });
    });
  });
  const file = join(dir, 'minigames-contact.png');
  writeFileSync(file, encodePng(w, h, out));
  console.log(`✓ ${file}\n  filas: ${list.map((g) => `${g.name} (${g.pieces.map((p) => p.name).join(', ') || 'sin piezas'})`).join(' | ')}\n  columnas: fondo con las piezas a tamaño de juego y una cría de ${sp.id} | piezas a ×4 sobre claro | sobre oscuro`);
}

async function main() {
  const list = await loadAll();
  const previewIdx = process.argv.indexOf('--preview');
  if (previewIdx > -1) {
    const dir = process.argv[previewIdx + 1];
    writeContact(resolve(dir && !dir.startsWith('--') ? dir : join(ROOT, 'sprite-previews')), list);
    return;
  }
  writeManifest(list);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
