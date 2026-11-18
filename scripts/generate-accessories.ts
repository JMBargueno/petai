#!/usr/bin/env tsx
/**
 * Genera el arte en pixel art de los accesorios (spec 38 §6, GUIA_ARTISTICA §7.6).
 *
 *   pnpm generate:accessories
 *   pnpm generate:accessories --preview [dir]   hoja de contactos (no toca los assets)
 *
 * Salida (determinista, se commitea), por cada prenda de shared/game-data/accessories.json:
 *  - shared/assets/accessories/<id>/{s,m,l}.png   una hoja por talla, a ×2; si la prenda es
 *                                                  animada, sus frames van en horizontal
 *  - shared/assets/accessories/<id>/meta.json     ranura, tamaño y punto de anclaje por talla
 *
 * La hoja de contactos pone cada prenda sobre cada especie y etapa, en su ancla: es la forma de
 * comprobar que ninguna tapa ojos, boca ni rasgo icónico.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Palette } from './sprites/draw';
import { writeTextKeepEol } from './sprites/io';
import { pose, Stage, STAGES } from './sprites/species';
import { ACCESSORY_ART, AccessorySprite, CANVAS, renderAccessory, Size, SIZES } from './sprites/pixel/accessories';
import { encodePng, SCALE } from './sprites/pixel/raster';
import { bakeSheet, composeSheet, FRAME, upscale } from './sprites/pixel/sheet';
import { Anchors, drawPockai, PIXEL_SPECIES, Slot } from './sprites/pixel/species';

const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'shared', 'assets', 'accessories');
const FRAME_MS = 220;

interface CatalogEntry {
  id: string;
  name: string;
  slot: Slot;
  animated?: boolean;
}

function catalog(): CatalogEntry[] {
  return JSON.parse(readFileSync(join(ROOT, 'shared/game-data/accessories.json'), 'utf8')).accessories;
}

/** Comprueba que el catálogo y el arte coinciden: cada prenda tiene dibujo, en su ranura. */
function checkCatalog(entries: CatalogEntry[]): void {
  for (const e of entries) {
    const a = ACCESSORY_ART[e.id];
    if (!a) throw new Error(`La prenda ${e.id} no tiene arte en scripts/sprites/pixel/accessories.ts`);
    if (a.slot !== e.slot) throw new Error(`${e.id}: el arte es de la ranura ${a.slot} y el catálogo dice ${e.slot}`);
    if (!!e.animated !== a.frames > 1) throw new Error(`${e.id}: "animated" del catálogo no coincide con los frames del arte (${a.frames})`);
  }
  for (const id of Object.keys(ACCESSORY_ART)) {
    if (!entries.some((e) => e.id === id)) throw new Error(`Hay arte para ${id}, que no está en accessories.json`);
  }
}

function writeAssets(entries: CatalogEntry[]): void {
  for (const e of entries) {
    const a = ACCESSORY_ART[e.id];
    const dir = join(OUT, e.id);
    mkdirSync(dir, { recursive: true });
    const sizes: Record<string, { w: number; h: number; anchor: [number, number] }> = {};
    for (const size of SIZES) {
      const s = renderAccessory(a, size);
      const [maxW, maxH] = CANVAS[size];
      if (s.w > maxW || s.h > maxH) throw new Error(`${e.id} talla ${size}: ${s.w}×${s.h} no cabe en el lienzo (${maxW}×${maxH})`);
      writeFileSync(join(dir, `${size.toLowerCase()}.png`), encodePng(s.w * SCALE * s.frames, s.h * SCALE, s.rgba));
      sizes[size.toLowerCase()] = { w: s.w, h: s.h, anchor: s.anchor };
    }
    const meta = { slot: a.slot, scale: SCALE, sizes, frames: a.frames, frameMs: FRAME_MS };
    writeTextKeepEol(join(dir, 'meta.json'), JSON.stringify(meta, null, 2).replace(/\[\s*(\d+),\s*(\d+)\s*\]/g, '[$1, $2]') + '\n');
    console.log(`✓ ${e.id}: ${SIZES.map((z) => `${z} ${sizes[z.toLowerCase()].w}×${sizes[z.toLowerCase()].h}`).join(', ')}${a.frames > 1 ? `, ${a.frames} frames` : ''}`);
  }
}

// ───────────────────────── Hoja de contactos ─────────────────────────

/** Pinta el frame 0 de una prenda sobre `dst` (RGBA a ×2) con su ancla en `at` (px nativos). */
function overlay(dst: Uint8Array, dstW: number, ox: number, oy: number, s: AccessorySprite, at: [number, number], under: boolean): void {
  const sheetW = s.w * SCALE * s.frames;
  for (let y = 0; y < s.h * SCALE; y++) {
    for (let x = 0; x < s.w * SCALE; x++) {
      const src = (y * sheetW + x) * 4;
      if (s.rgba[src + 3] === 0) continue;
      const px = ox + (at[0] - s.anchor[0]) * SCALE + x;
      const py = oy + (at[1] - s.anchor[1]) * SCALE + y;
      if (px < ox || py < oy || px >= ox + FRAME || py >= oy + FRAME) continue;
      const o = (py * dstW + px) * 4;
      if (under && dst[o + 3] > 0) continue; // las prendas de espalda van detrás del sprite
      dst[o] = s.rgba[src]; dst[o + 1] = s.rgba[src + 1]; dst[o + 2] = s.rgba[src + 2]; dst[o + 3] = 255;
    }
  }
}

function writeContact(dir: string, entries: CatalogEntry[]): void {
  mkdirSync(dir, { recursive: true });
  const speciesData = JSON.parse(readFileSync(join(ROOT, 'shared/game-data/species.json'), 'utf8')) as { id: string; defaultPalette: Palette }[];
  // Columnas: cada prenda por separado y, al final, un conjunto con las cuatro ranuras.
  const outfit = ['acc_capa_gala', 'acc_bufanda_menta', 'acc_gafas_estudio', 'acc_gorro_lana_azul'];
  const cols: string[][] = [...entries.map((e) => [e.id]), outfit];
  const sizeOf: Record<Stage, Size> = { baby: 'S', juvenile: 'M', adult: 'L', final: 'L' };
  const rowsN = PIXEL_SPECIES.length * STAGES.length;
  const w = cols.length * FRAME;
  const h = rowsN * FRAME;
  const out = new Uint8Array(w * h * 4);
  let row = 0;
  for (const sp of PIXEL_SPECIES) {
    const palette = speciesData.find((s) => s.id === sp.id)!.defaultPalette;
    for (const st of STAGES) {
      const d = drawPockai(sp, st, pose());
      const one = composeSheet([d.grid], 1);
      const baked = bakeSheet(one, palette);
      const anchors: Anchors = d.anchors;
      cols.forEach((ids, c) => {
        const ox = c * FRAME;
        const oy = row * FRAME;
        for (let y = 0; y < FRAME; y++) out.set(baked.subarray(y * FRAME * 4, (y + 1) * FRAME * 4), ((oy + y) * w + ox) * 4);
        // Orden de pintado: espalda (detrás), cuello, cara y cabeza.
        const order: Slot[] = ['back', 'neck', 'face', 'head'];
        for (const slot of order) {
          for (const id of ids) {
            const a = ACCESSORY_ART[id];
            if (a.slot === slot) overlay(out, w, ox, oy, renderAccessory(a, sizeOf[st]), anchors[slot], slot === 'back');
          }
        }
      });
      row++;
    }
  }
  const big = upscale(w, h, out, 1);
  const file = join(dir, 'accessories-contact.png');
  writeFileSync(file, encodePng(big.w, big.h, big.data));
  console.log(`✓ ${file}\n  columnas: ${cols.map((c) => (c.length > 1 ? 'conjunto' : entries.find((e) => e.id === c[0])!.name)).join(' | ')}`);
}

function main() {
  const entries = catalog();
  checkCatalog(entries);
  const previewIdx = process.argv.indexOf('--preview');
  if (previewIdx > -1) {
    const dir = process.argv[previewIdx + 1];
    writeContact(resolve(dir && !dir.startsWith('--') ? dir : join(ROOT, 'sprite-previews')), entries);
    return;
  }
  writeAssets(entries);
}

main();
