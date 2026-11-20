// Hoja de contactos del set de iconos: la revisión a simple vista que pide SKILL.md §5.
//
//   node .claude/skills/pockai-ui-icons-architect/scripts/contact_sheet.mjs <salida.png> [nombres…]
//
// Sin nombres saca el set entero. Cada icono aparece ocho veces: claro y oscuro × 16 y 20 px ×
// contorno y duotone, que es donde se ve si una forma se pierde o se confunde con su vecina.
//
// Los SVG del set usan `currentColor` y variables CSS, que ningún rasterizador entiende: aquí se
// aplanan igual que en `scripts/generate-watch-assets.ts`, para que lo que se revisa sea lo mismo
// que se verá.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { UI_ICON_NAMES } from './icon-defs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const DIR = join(ROOT, 'shared/ui/src/icons');
const TEMAS = [
  { bg: '#ffffff', fg: '#111118' },
  { bg: '#111118', fg: '#f2f0ff' },
];
const TAMANOS = [16, 20];
const VARIANTES = ['outline', 'duo'];
/** Píxeles por píxel lógico, para poder mirar la hoja sin lupa. */
const ZOOM = 3;
const PAD = 6;

const [salida, ...pedidos] = process.argv.slice(2);
if (!salida) {
  console.error('uso: contact_sheet.mjs <salida.png> [nombres…]');
  process.exit(1);
}
const nombres = pedidos.length ? pedidos : UI_ICON_NAMES;

/** Quita `currentColor` y las variables CSS, que resvg no resuelve. */
export function flatten(svg, color) {
  return svg
    .replace(/var\(--icon-accent,\s*currentColor\)/g, color)
    .replace(/var\(--icon-bg,\s*transparent\)/g, 'none')
    .replace(/currentColor/g, color);
}

const celda = Math.max(...TAMANOS) * ZOOM + PAD * 2;
const filas = TEMAS.length * TAMANOS.length * VARIANTES.length;
const piezas = [];
let fila = 0;
for (const tema of TEMAS) {
  for (const px of TAMANOS) {
    for (const variante of VARIANTES) {
      for (const [col, n] of nombres.entries()) {
        const svg = flatten(readFileSync(join(DIR, `${n}.${variante}.svg`), 'utf8'), tema.fg);
        const png = new Resvg(svg, { fitTo: { mode: 'width', value: px * ZOOM }, background: tema.bg }).render().asPng();
        piezas.push({
          input: await sharp(png)
            .resize(celda, celda, { fit: 'contain', background: tema.bg })
            .toBuffer(),
          left: col * celda,
          top: fila * celda,
        });
      }
      fila += 1;
    }
  }
}

const hoja = sharp({
  create: { width: nombres.length * celda, height: filas * celda, channels: 3, background: '#7a7a8a' },
});
writeFileSync(salida, await hoja.composite(piezas).png().toBuffer());

console.log(`✓ ${salida}`);
console.log(`filas: claro/oscuro × ${TAMANOS.join('/')} px × contorno/duotone`);
console.log(`columnas: ${nombres.join(' ')}`);
