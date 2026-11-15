// Genera las imágenes sociales (Open Graph / Twitter, 1200×630) y los iconos PNG.
//
// Plantilla SVG con degradado de marca, titular en Bowlby One, entradilla en Inter y la
// mascota real (sprites del juego), rasterizada con resvg. El texto se convierte a trazos
// con opentype.js (glifo a glifo) para no depender de las fuentes del sistema.
//
// Salida (en public/, la sirve Angular tal cual):
//   og/home-es.png · og/home-en.png · og/lore-es.png · og/lore-en.png
//   apple-touch-icon.png (180) · icon-512.png
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(web, 'public');
const require = createRequire(import.meta.url);
const site = JSON.parse(readFileSync(join(web, 'src', 'app', 'site.json'), 'utf8'));
const host = new URL(site.url).host;

const loadFont = (pkgFile) => {
  const buf = readFileSync(require.resolve(pkgFile));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const display = loadFont('@fontsource/bowlby-one/files/bowlby-one-latin-400-normal.woff');
const sans = loadFont('@fontsource/inter/files/inter-latin-700-normal.woff');

/** Texto → <path>, glifo a glifo con kerning (sin GSUB). Devuelve el path y su ancho. */
function textPath(font, text, x, y, size, fill) {
  const scale = size / font.unitsPerEm;
  let cursor = x;
  let d = '';
  let prev = null;
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    if (prev) cursor += font.getKerningValue(prev, glyph) * scale;
    d += glyph.getPath(cursor, y, size).toPathData(2);
    cursor += glyph.advanceWidth * scale;
    prev = glyph;
  }
  return { svg: `<path d="${d}" fill="${fill}"/>`, width: cursor - x };
}

/** Parte un texto en líneas que quepan en `max` píxeles. */
function wrap(font, text, size, max) {
  const scale = size / font.unitsPerEm;
  const width = (s) => [...s].reduce((w, ch) => w + font.charToGlyph(ch).advanceWidth * scale, 0);
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (width(next) > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const sprite = (name) =>
  `data:image/svg+xml;base64,${readFileSync(join(pub, 'sprites', `${name}.svg`)).toString('base64')}`;

function ogCard({ eyebrow, title, tagline, pet, dark }) {
  const W = 1200;
  const H = 630;
  const ink = dark ? '#f4f2ff' : '#0b0a14';
  const muted = dark ? '#b9b5d8' : '#4b4862';
  const bg = dark
    ? `<rect width="${W}" height="${H}" fill="#0b0a14"/>
       <circle cx="180" cy="0" r="520" fill="url(#g1)"/>
       <circle cx="1200" cy="630" r="520" fill="url(#g2)"/>`
    : `<rect width="${W}" height="${H}" fill="#dceeff"/>
       <circle cx="120" cy="80" r="460" fill="url(#l1)"/>
       <circle cx="1100" cy="40" r="420" fill="url(#l2)"/>
       <circle cx="860" cy="660" r="420" fill="url(#l3)"/>`;

  const eb = textPath(sans, eyebrow.toUpperCase(), 136, 138, 22, ink);
  // Titular: el mayor tamaño que quepa en dos líneas de 640px.
  let titleSize = 128;
  while (wrap(display, title.toUpperCase(), titleSize, 640).length > 2) titleSize -= 8;
  // Con dos líneas, más pequeño para dejar sitio a la entradilla y a la firma.
  if (wrap(display, title.toUpperCase(), titleSize, 640).length === 2) titleSize = Math.min(titleSize, 92);
  const titleLines = wrap(display, title.toUpperCase(), titleSize, 640);
  let y = 150 + 40 + titleSize * 0.82;
  const titleSvg = titleLines
    .map((line) => {
      const p = textPath(display, line, 96, y, titleSize, ink);
      y += titleSize * 0.92;
      return p.svg;
    })
    .join('');
  y += 16;
  const tagSvg = wrap(sans, tagline, 34, 600)
    .map((line) => {
      const p = textPath(sans, line, 100, y, 34, muted);
      y += 44;
      return p.svg;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="l1"><stop offset="0" stop-color="#e9ccff"/><stop offset="1" stop-color="#e9ccff" stop-opacity="0"/></radialGradient>
    <radialGradient id="l2"><stop offset="0" stop-color="#c9f3df"/><stop offset="1" stop-color="#c9f3df" stop-opacity="0"/></radialGradient>
    <radialGradient id="l3"><stop offset="0" stop-color="#fff1b3"/><stop offset="1" stop-color="#fff1b3" stop-opacity="0"/></radialGradient>
    <radialGradient id="g1"><stop offset="0" stop-color="#5c4ade" stop-opacity=".75"/><stop offset="1" stop-color="#5c4ade" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2"><stop offset="0" stop-color="#4da2ff" stop-opacity=".5"/><stop offset="1" stop-color="#4da2ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5bff"/><stop offset=".45" stop-color="#5c4ade"/><stop offset="1" stop-color="#3f8cff"/></linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e9ccff"/><stop offset=".3" stop-color="#4da2ff"/><stop offset=".55" stop-color="#55db9c"/><stop offset=".8" stop-color="#ffd731"/><stop offset="1" stop-color="#fb4903"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#261e6e" flood-opacity=".28"/></filter>
  </defs>
  ${bg}
  <g filter="url(#shadow)">
    <circle cx="935" cy="330" r="215" fill="url(#ring)"/>
    <circle cx="935" cy="330" r="182" fill="${dark ? '#17162a' : '#ffffff'}"/>
  </g>
  <image href="${sprite(pet)}" x="785" y="170" width="300" height="300"/>
  <g transform="translate(96 108)">
    <rect width="${eb.width + 64}" height="44" rx="22" fill="${dark ? '#ffffff' : '#ffffff'}" fill-opacity="${dark ? 0.08 : 0.75}"/>
    <circle cx="22" cy="22" r="6" fill="url(#accent)"/>
  </g>
  ${eb.svg}
  ${titleSvg}
  ${tagSvg}
  <g transform="translate(96 520)">
    <rect width="64" height="64" rx="20" fill="url(#accent)" transform="rotate(-6 32 32)"/>
    ${textPath(display, 'P', 17, 47, 36, '#ffffff').svg}
    ${textPath(sans, host, 84, 42, 24, muted).svg}
  </g>
</svg>`;
}

function icon(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5bff"/><stop offset=".45" stop-color="#5c4ade"/><stop offset="1" stop-color="#3f8cff"/></linearGradient></defs>
  <rect width="512" height="512" rx="112" fill="url(#a)"/>
  <image href="${sprite('egg_closed')}" x="56" y="56" width="400" height="400"/>
</svg>`;
}

const render = (svg, width) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } }).render().asPng();

const CARDS = {
  es: {
    home: { eyebrow: 'Mascota virtual con IA', title: 'Pockai', tagline: 'Tu yokai de bolsillo. Eclosiona, cuida, combate y conversa.', pet: 'axolunar_happy' },
    lore: { eyebrow: 'El mundo de Pockai', title: 'El Éter Digital', tagline: 'De dónde nacen los huevos, las rarezas y los seis elementos.', pet: 'florabud_idle', dark: true },
  },
  en: {
    home: { eyebrow: 'AI virtual pet', title: 'Pockai', tagline: 'Your pocket yokai. Hatch, care, battle and chat.', pet: 'axolunar_happy' },
    lore: { eyebrow: 'The world of Pockai', title: 'The Digital Aether', tagline: 'Where the eggs are born, the rarities and the six elements.', pet: 'florabud_idle', dark: true },
  },
};

mkdirSync(join(pub, 'og'), { recursive: true });
let count = 0;
for (const [locale, pages] of Object.entries(CARDS)) {
  for (const [page, card] of Object.entries(pages)) {
    writeFileSync(join(pub, 'og', `${page}-${locale}.png`), render(ogCard(card), 1200));
    count++;
  }
}
writeFileSync(join(pub, 'apple-touch-icon.png'), render(icon(180), 180));
writeFileSync(join(pub, 'icon-512.png'), render(icon(512), 512));
if (!existsSync(join(pub, 'og'))) throw new Error('generate-og: no se ha creado public/og');
console.log(`generate-og: ${count} imágenes sociales y 2 iconos en public/`);
