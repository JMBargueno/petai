#!/usr/bin/env tsx
/**
 * Comprueba e indexa el arte de los objetos consumibles (GUIA_ARTISTICA §7.7).
 *
 *   pnpm generate:items
 *   pnpm generate:items --preview [dir]   hoja de contactos (no toca los assets)
 *
 * El arte NO se dibuja aquí: cada icono lo importa scripts/sprites/items/import.mjs desde una
 * lámina de Nano Banana a shared/assets/items/<id>.png (32×32 nativos, a ×2). Este script
 * comprueba que cada PNG cumple la norma (tamaño, ×2 exacto, sin transparencias parciales, margen
 * y máximo de colores) y escribe shared/assets/items/manifest.json, que es lo que leerán los
 * clientes para saber qué objetos tienen icono.
 *
 * La hoja de contactos enseña cada icono a 32, 64 y 128 px sobre fondo claro y oscuro, y a la
 * escala de la mascota junto a una cría: es la forma de comprobar que se lee y que el tamaño encaja.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodePng } from './lib/png.mjs';
import type { Palette } from './sprites/draw';
import { writeTextKeepEol } from './sprites/io';
import { pose } from './sprites/species';
import { encodePng } from './sprites/pixel/raster';
import { bakeSheet, composeSheet, FRAME } from './sprites/pixel/sheet';
import { drawPockai, PIXEL_SPECIES } from './sprites/pixel/species';

const ROOT = resolve(__dirname, '..');
const DIR = join(ROOT, 'shared', 'assets', 'items');
const SIZE = 32; // lienzo nativo
const SCALE = 2; // el PNG se guarda a ×2
const MAX_COLORS = 12;
const LIGHT: Rgb = [242, 241, 248];
const DARK: Rgb = [23, 22, 42];

type Rgb = [number, number, number];
interface Food { id: string; name: string; kind: string }
interface Icon { id: string; name: string; px: Uint8Array; colors: number; box: [number, number, number, number] }

const foods = JSON.parse(readFileSync(join(ROOT, 'shared/game-data/foods.json'), 'utf8')) as Food[];

/** Lee un icono, lo reduce a la rejilla nativa y comprueba la norma. Lanza con un mensaje claro si no la cumple. */
function load(food: Food): Icon {
  const file = join(DIR, `${food.id}.png`);
  const png = decodePng(readFileSync(file));
  const side = SIZE * SCALE;
  if (png.width !== side || png.height !== side) throw new Error(`${food.id}: mide ${png.width}×${png.height} y debe medir ${side}×${side}`);
  const px = new Uint8Array(SIZE * SIZE * 4);
  const colors = new Set<number>();
  let x0 = SIZE, y0 = SIZE, x1 = -1, y1 = -1;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const s = (y * SCALE * side + x * SCALE) * 4;
      // ×2 exacto: los cuatro píxeles del bloque son iguales
      for (const d of [4, side * 4, side * 4 + 4]) {
        for (let k = 0; k < 4; k++) if (png.pixels[s + k] !== png.pixels[s + d + k]) throw new Error(`${food.id}: el píxel nativo (${x}, ${y}) no es un bloque de 2×2 uniforme`);
      }
      const a = png.pixels[s + 3];
      if (a !== 0 && a !== 255) throw new Error(`${food.id}: transparencia parcial en (${x}, ${y})`);
      if (a === 0) continue;
      px.set(png.pixels.subarray(s, s + 4), (y * SIZE + x) * 4);
      colors.add((png.pixels[s] << 16) | (png.pixels[s + 1] << 8) | png.pixels[s + 2]);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error(`${food.id}: el icono está vacío`);
  if (x0 < 1 || y0 < 1 || x1 > SIZE - 2 || y1 > SIZE - 2) throw new Error(`${food.id}: no deja 1 px de margen en el lienzo`);
  if (colors.size > MAX_COLORS) throw new Error(`${food.id}: ${colors.size} colores (máximo ${MAX_COLORS})`);
  return { id: food.id, name: food.name, px, colors: colors.size, box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1] };
}

function loadAll(): Icon[] {
  if (!existsSync(DIR)) return [];
  for (const f of readdirSync(DIR)) {
    if (f.endsWith('.png') && !foods.some((x) => `${x.id}.png` === f)) throw new Error(`Hay arte para ${f}, que no está en foods.json`);
  }
  return foods.filter((f) => existsSync(join(DIR, `${f.id}.png`))).map(load);
}

function writeManifest(icons: Icon[]): void {
  mkdirSync(DIR, { recursive: true });
  const items = Object.fromEntries(icons.map((i) => [i.id, { colors: i.colors, box: i.box }]));
  const text = JSON.stringify({ size: SIZE, scale: SCALE, items }, null, 2).replace(/\[\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*\]/g, '[$1, $2, $3, $4]');
  writeTextKeepEol(join(DIR, 'manifest.json'), text + '\n');
  for (const i of icons) console.log(`✓ ${i.id}: ${i.box[2]}×${i.box[3]} px, ${i.colors} colores`);
  const missing = foods.filter((f) => !icons.some((i) => i.id === f.id));
  console.log(`✓ manifest.json: ${icons.length} de ${foods.length} objetos con arte${missing.length ? `\n  sin arte: ${missing.map((f) => f.id).join(', ')}` : ''}`);
}

// ───────────────────────── Hoja de contactos ─────────────────────────

/** Pinta `px` (RGBA de w×h, alfa 0 o 255) en `dst` ampliado ×k con su esquina en (ox, oy). */
function blit(dst: Uint8Array, dstW: number, px: Uint8Array, w: number, h: number, ox: number, oy: number, k: number): void {
  for (let y = 0; y < h * k; y++) {
    for (let x = 0; x < w * k; x++) {
      const s = (Math.floor(y / k) * w + Math.floor(x / k)) * 4;
      if (px[s + 3] === 0) continue;
      const o = ((oy + y) * dstW + ox + x) * 4;
      dst[o] = px[s]; dst[o + 1] = px[s + 1]; dst[o + 2] = px[s + 2]; dst[o + 3] = 255;
    }
  }
}

function writeContact(dir: string, icons: Icon[]): void {
  if (icons.length === 0) throw new Error('No hay ningún icono en shared/assets/items: importa uno con scripts/sprites/items/import.mjs');
  mkdirSync(dir, { recursive: true });
  // Una cría de referencia, a la escala del juego (frame de 64 nativos a ×2)
  const sp = PIXEL_SPECIES[0];
  const species = JSON.parse(readFileSync(join(ROOT, 'shared/game-data/species.json'), 'utf8')) as { id: string; defaultPalette: Palette }[];
  const baby = bakeSheet(composeSheet([drawPockai(sp, 'baby', pose()).grid], 1), species.find((s) => s.id === sp.id)!.defaultPalette);

  const PAD = 8;
  const ROW = FRAME + PAD * 2; // 144
  const panel = PAD * 4 + SIZE * (1 + 2 + 4); // 32, 64 y 128 px con sus márgenes
  const scene = FRAME + SIZE * SCALE + PAD * 3;
  const w = panel * 2 + scene;
  const h = ROW * icons.length;
  const out = new Uint8Array(w * h * 4);
  const fill = (x0: number, y0: number, x1: number, y1: number, c: Rgb) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
  };
  icons.forEach((icon, n) => {
    const top = n * ROW;
    [LIGHT, DARK].forEach((bg, side) => {
      const x0 = side * panel;
      fill(x0, top, x0 + panel, top + ROW, bg);
      let x = x0 + PAD;
      for (const k of [1, 2, 4]) {
        blit(out, w, icon.px, SIZE, SIZE, x, top + ROW - PAD - SIZE * k, k); // apoyados en la misma línea
        x += SIZE * k + PAD;
      }
    });
    // A la escala de la mascota: la cría y el objeto a su derecha, sobre el mismo suelo (fila 60 nativa)
    const x0 = panel * 2;
    fill(x0, top, x0 + scene, top + ROW, LIGHT);
    blit(out, w, baby, FRAME, FRAME, x0 + PAD, top + PAD, 1);
    const floor = top + PAD + 60 * SCALE;
    blit(out, w, icon.px, SIZE, SIZE, x0 + PAD * 2 + FRAME, floor - (icon.box[1] + icon.box[3]) * SCALE, SCALE);
  });
  const file = join(dir, 'items-contact.png');
  writeFileSync(file, encodePng(w, h, out));
  console.log(`✓ ${file}\n  filas: ${icons.map((i) => i.name).join(' | ')}\n  columnas: 32, 64 y 128 px sobre claro | lo mismo sobre oscuro | junto a una cría de ${sp.id}`);
}

function main() {
  const icons = loadAll();
  const previewIdx = process.argv.indexOf('--preview');
  if (previewIdx > -1) {
    const dir = process.argv[previewIdx + 1];
    writeContact(resolve(dir && !dir.startsWith('--') ? dir : join(ROOT, 'sprite-previews')), icons);
    return;
  }
  writeManifest(icons);
}

main();
