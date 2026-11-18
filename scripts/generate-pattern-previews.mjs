// Genera previews PNG de los patrones tileables (shared/assets/patterns/*.png) para la web.
// La landing (web/src/app/landing) muestra los patrones con un swatch: antes usaba las máscaras
// vectoriales de shared/assets/sprites (dibujadas con currentColor para el canvas del juego), que
// en un <img> quedan negras y casi invisibles. Aquí se compone la textura real — la misma que el
// escritorio pinta sobre la mascota — sobre un color base neutro, para que cada patrón se vea
// tal cual en el juego. `plain` (Liso) no tiene textura: la web lo muestra con su color sólido.
//
// Sin dependencias: el códec PNG mínimo vive en scripts/lib/png.mjs (solo RGBA de 8 bits, que es
// lo que valida scripts/validate-assets.js).
//
// Uso: node scripts/generate-pattern-previews.mjs
import { decodePng, encodePng } from './lib/png.mjs';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const patternsDir = join(root, 'shared', 'assets', 'patterns');
const spritesDir = join(root, 'shared', 'assets', 'sprites');
const SIZE = 128; // preview cuadrada que el swatch de la landing recorta a círculo
const BASE = { r: 0x9c, g: 0xa2, b: 0xab }; // gris neutro: se lee la textura, no el tono de rareza

/* ───── Composición: textura tileable sobre color base, recorte central ───── */

function makePreview(pattern) {
  const { width, height, pixels } = pattern;
  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const px = ((y + (height - SIZE) >> 1) * width + (x + (width - SIZE) >> 1)) * 4;
      const o = (y * SIZE + x) * 4;
      const a = pixels[px + 3] / 255;
      out[o] = Math.round(BASE.r * (1 - a) + pixels[px] * a);
      out[o + 1] = Math.round(BASE.g * (1 - a) + pixels[px + 1] * a);
      out[o + 2] = Math.round(BASE.b * (1 - a) + pixels[px + 2] * a);
      out[o + 3] = 255;
    }
  }
  return encodePng(SIZE, SIZE, out);
}

const generated = [];
for (const file of readdirSync(patternsDir).filter((f) => f.endsWith('.png')).sort()) {
  const id = file.slice(0, -4);
  const preview = makePreview(decodePng(readFileSync(join(patternsDir, file))));
  const target = join(spritesDir, `pattern_${id}_preview.png`);
  writeFileSync(target, preview);
  generated.push(`pattern_${id}_preview.png (${preview.length} B)`);
}
console.log(`generate-pattern-previews: ${generated.length} previews → ${spritesDir}`);
for (const file of generated) console.log(`  ${file}`);