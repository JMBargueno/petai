#!/usr/bin/env tsx
/**
 * Hoja de contactos en pixel art para revisar una especie (o todas) a simple vista.
 *
 *   npx tsx scripts/sprites/pixel/contact.ts [especie] [--out dir]
 *
 * Por especie escribe `<dir>/<id>-pixel-contact.png` (por defecto en `sprite-previews/`, ignorado
 * por git): una fila por etapa con poses clave, a ×4 sobre el color de escenario, y debajo las
 * cuatro siluetas en negro a ×1 (la prueba de la guía: tienen que distinguirse sin color).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PET_ANIMATIONS } from '../catalog';
import type { Palette } from '../draw';
import { POSES } from '../poses';
import { STAGES } from '../species';
import type { Stage } from '../species';
import { drawPockai, PIXEL_SPECIES, poseArt } from './species';
import { bakeSheet, composeSheet, FRAME, pngOf, upscale } from './sheet';

const ROOT = resolve(__dirname, '../../..');
const KEY_POSES: [string, number][] = [['idle', 0], ['idle', 2], ['walk', 1], ['eat', 3], ['happy', 2], ['sleep', 1], ['attack', 3], ['sad', 1], ['celebrate', 3], ['hit', 1]];

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const out = resolve(outIdx > -1 ? args[outIdx + 1] : join(ROOT, 'sprite-previews'));
  const only = args.find((a, i) => !a.startsWith('--') && i !== outIdx + 1);
  const speciesData = JSON.parse(readFileSync(join(ROOT, 'shared/game-data/species.json'), 'utf8')) as { id: string; defaultPalette: Palette }[];
  mkdirSync(out, { recursive: true });

  for (const sp of PIXEL_SPECIES) {
    if (only && sp.id !== only) continue;
    const palette = speciesData.find((s) => s.id === sp.id)!.defaultPalette;
    const grids = [];
    const heights: string[] = [];
    for (const st of STAGES as Stage[]) {
      for (const [name, i] of KEY_POSES) {
        const anim = PET_ANIMATIONS.find((a) => a.name === name)!;
        const d = drawPockai(sp, st, POSES[name](i, anim.frames, poseArt(sp, st) as never));
        grids.push(d.grid);
        if (name === 'idle' && i === 0) heights.push(`${st} ${d.height}px`);
      }
    }
    const sheet = composeSheet(grids, KEY_POSES.length);
    const color = bakeSheet(sheet, palette);
    // Fila de siluetas: el frame idle de cada etapa, en negro y a tamaño nativo (×1 = 64 px).
    const big = upscale(sheet.w, sheet.h, color, 2);
    const silH = 80;
    const full = new Uint8Array(big.w * (big.h + silH) * 4).fill(255);
    full.set(big.data);
    (STAGES as Stage[]).forEach((_st, r) => {
      const ox = r * 80 + 16;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const s = ((r * FRAME + y * 2) * sheet.w + x * 2) * 4;
        if (sheet.mask[s + 3] === 0) continue;
        const o = ((big.h + 8 + y) * big.w + ox + x) * 4;
        full[o] = full[o + 1] = full[o + 2] = 11;
      }
    });
    const file = join(out, `${sp.id}-pixel-contact.png`);
    writeFileSync(file, pngOf(big.w, big.h + silH, full));
    console.log(`✓ ${file}  (${heights.join(', ')})`);
  }
}

main();
