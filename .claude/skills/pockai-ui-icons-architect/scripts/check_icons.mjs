// Valida la spec de iconos de interfaz sobre shared/ui/src/icons/*.svg.
//
//   node .claude/skills/pockai-ui-icons-architect/scripts/check_icons.mjs [dir]
//
// Sale con código 1 si algún archivo incumple la spec. Reglas:
//  - viewBox "0 0 24 24" y trazo raíz 1.75, round/round, fill none, stroke currentColor.
//  - sin hex, sin rgb(), sin nombres de color fijos.
//  - colores solo: currentColor, none, transparent o var(--icon-…, …).
//  - sin <g>, transform, metadatos, comentarios, <style>, <defs>, clases ni estilos en línea.
//  - solo elementos de forma sencilla (path, circle, rect, ellipse, line, polyline, polygon).
//  - la variante duotone (*.duo.svg) lleva fill-opacity="0.18" en su acento.
//  - cada par outline/duo existe.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const dir = path.resolve(process.argv[2] ?? path.join(root, 'shared/ui/src/icons'));

const ALLOWED_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon']);
const ALLOWED_PAINT = /^(currentColor|none|transparent|var\(--icon-[a-z-]+,\s*(currentColor|transparent)\))$/;
const COLOR_WORDS = /\b(black|white|red|green|blue|gray|grey|yellow|orange|purple|pink|brown)\b/i;

const errors = [];
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg'));
const names = new Set(files.map((f) => f.replace(/\.(outline|duo)\.svg$/, '')));

for (const f of files) {
  const file = path.join(dir, f);
  const src = fs.readFileSync(file, 'utf8');
  const bad = (msg) => errors.push(`${f}: ${msg}`);

  if (/#[0-9a-fA-F]{3,8}\b/.test(src)) bad('color hexadecimal');
  if (/rgba?\(|hsla?\(/i.test(src)) bad('color rgb/hsl');
  if (COLOR_WORDS.test(src.replace(/<!--[\s\S]*?-->/g, ''))) bad('nombre de color fijo');
  if (/<!--/.test(src)) bad('comentario');
  if (/<(g|defs|style|metadata|title|desc|use|mask|clipPath)\b/.test(src)) bad('grupo o elemento no permitido');
  if (/\btransform=/.test(src)) bad('transform');
  if (/\bclass=|\bstyle=/.test(src)) bad('clase o estilo en línea');
  if (!/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(src.trim())) bad('raíz svg sin xmlns');

  const root0 = src.match(/<svg\b[^>]*>/)?.[0] ?? '';
  for (const [attr, value] of [
    ['viewBox', '0 0 24 24'],
    ['fill', 'none'],
    ['stroke', 'currentColor'],
    ['stroke-width', '1.75'],
    ['stroke-linecap', 'round'],
    ['stroke-linejoin', 'round'],
  ]) {
    if (!root0.includes(`${attr}="${value}"`)) bad(`raíz sin ${attr}="${value}"`);
  }

  const tags = [...src.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)];
  for (const [, tag, attrs] of tags) {
    if (!ALLOWED_TAGS.has(tag)) bad(`elemento no permitido <${tag}>`);
    for (const [, k, v] of attrs.matchAll(/([\w:-]+)="([^"]*)"/g)) {
      if (/^(fill|stroke)$/.test(k) && !ALLOWED_PAINT.test(v)) bad(`${k}="${v}" fuera de la paleta`);
    }
  }

  const isDuo = f.endsWith('.duo.svg');
  if (isDuo && !/fill-opacity="0\.18"/.test(src)) bad('duotone sin fill-opacity="0.18"');
  if (!isDuo && /fill-opacity="0\.18"/.test(src)) bad('outline con acento duotone');
  if (/fill="var\(--icon-accent/.test(src) && !isDuo) bad('acento fuera de la variante duo');

  const elements = tags.filter(([, t]) => t !== 'svg').length;
  if (elements === 0) bad('sin formas');
  if (elements > 12) bad(`demasiadas formas (${elements}); simplifica`);
}

for (const n of names) {
  for (const v of ['outline', 'duo']) {
    if (!files.includes(`${n}.${v}.svg`)) errors.push(`${n}: falta la variante ${v}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n✗ ${errors.length} problema(s) en ${files.length} archivo(s)`);
  process.exit(1);
}
console.log(`✓ ${files.length} archivos, ${names.size} iconos, spec OK`);
