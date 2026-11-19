// Genera las imágenes sociales (Open Graph / Twitter, 1200×630) y los iconos PNG.
//
// Cada página pública tiene su tarjeta: titular en Bowlby One, entradilla en Inter y una escena
// con los sprites reales del juego (pixel art de shared/assets/sprites), rasterizada con resvg.
// El texto se convierte a trazos con opentype.js (glifo a glifo) para no depender de las fuentes
// del sistema. Los sprites miden 128 u. y se dibujan a 128/192/256/384 px (múltiplos de 64):
// así cada píxel del arte cae en un número entero de píxeles y no se emborrona.
//
// Salida (en public/, la sirve Angular tal cual; postbuild copia og/ a la raíz):
//   og/<página>-v<ogVersion>.png   (home, pockais, arena, lore, contact; en inglés para todos los idiomas)
//   apple-touch-icon.png (180) · icon-512.png
// `ogVersion` (src/app/site.json) va en el nombre: Facebook, LinkedIn y X cachean la imagen por URL,
// así que al cambiar el diseño se sube el número y las tarjetas compartidas se renuevan.
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(web, 'public');
const require = createRequire(import.meta.url);
const site = JSON.parse(readFileSync(join(web, 'src', 'app', 'site.json'), 'utf8'));
const host = new URL(site.url).host;
const OG_VERSION = site.ogVersion;

const W = 1200;
const H = 630;
/** WhatsApp y algunos clientes descartan og:image por encima de ~300 KB. */
const MAX_BYTES = 300 * 1024;

const loadFont = (pkgFile) => {
  const buf = readFileSync(require.resolve(pkgFile));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const display = loadFont('@fontsource/bowlby-one/files/bowlby-one-latin-400-normal.woff');
const sans = loadFont('@fontsource/inter/files/inter-latin-700-normal.woff');

/** Texto → <path>, glifo a glifo con kerning (sin GSUB). Devuelve el path y su ancho. */
function textPath(font, text, x, y, size, fill, extra = '') {
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
  return { svg: `<path d="${d}" fill="${fill}"${extra}/>`, width: cursor - x };
}

const measure = (font, text, size) =>
  [...text].reduce((w, ch) => w + font.charToGlyph(ch).advanceWidth * (size / font.unitsPerEm), 0);

/** Parte un texto en líneas que quepan en `max` píxeles. */
function wrap(font, text, size, max) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (measure(font, next, size) > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Logo de la web: el mismo favicon.svg que la cabecera muestra junto a la palabra «Pockai». */
const LOGO_MARK = `data:image/svg+xml;base64,${readFileSync(join(pub, 'favicon.svg')).toString('base64')}`;

const spriteData = (name) =>
  `data:image/svg+xml;base64,${readFileSync(join(pub, 'sprites', `${name}.svg`)).toString('base64')}`;

/** Sprite a tamaño entero; `flip` lo refleja en horizontal (sigue siendo nítido). */
function sprite(name, x, y, size, { flip = false } = {}) {
  const img = `<image href="${spriteData(name)}" width="${size}" height="${size}" image-rendering="optimizeSpeed"/>`;
  return flip
    ? `<g transform="translate(${x + size} ${y}) scale(-1 1)">${img}</g>`
    : `<g transform="translate(${x} ${y})">${img}</g>`;
}

/** Destello de pixel art (cruz de 4 puntas) con centro en x,y y bloque `p`. */
function sparkle(x, y, p, fill, opacity = 1) {
  const r = (dx, dy) => `<rect x="${x + dx * p - p / 2}" y="${y + dy * p - p / 2}" width="${p}" height="${p}"/>`;
  return `<g fill="${fill}" opacity="${opacity}">${r(0, 0)}${r(0, -1)}${r(0, 1)}${r(-1, 0)}${r(1, 0)}${p >= 6 ? '' : r(0, -2) + r(0, 2) + r(-2, 0) + r(2, 0)}</g>`;
}

/** Generador pseudoaleatorio con semilla: las estrellas salen igual en cada build. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Campo de «píxeles de éter» (cuadraditos) en una caja, evitando la columna de texto. */
function starfield(seed, n, { x0 = 560, x1 = W, y0 = 0, y1 = H, colors }) {
  const rand = rng(seed);
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = Math.round(x0 + rand() * (x1 - x0));
    const y = Math.round(y0 + rand() * (y1 - y0));
    const p = rand() < 0.2 ? 6 : rand() < 0.6 ? 4 : 3;
    const c = colors[Math.floor(rand() * colors.length)];
    out += `<rect x="${x}" y="${y}" width="${p}" height="${p}" fill="${c}" opacity="${(0.35 + rand() * 0.6).toFixed(2)}"/>`;
  }
  return out;
}

const DEFS = `
    <radialGradient id="l1"><stop offset="0" stop-color="#e9ccff"/><stop offset="1" stop-color="#e9ccff" stop-opacity="0"/></radialGradient>
    <radialGradient id="l2"><stop offset="0" stop-color="#c9f3df"/><stop offset="1" stop-color="#c9f3df" stop-opacity="0"/></radialGradient>
    <radialGradient id="l3"><stop offset="0" stop-color="#fff1b3"/><stop offset="1" stop-color="#fff1b3" stop-opacity="0"/></radialGradient>
    <radialGradient id="g1"><stop offset="0" stop-color="#5c4ade" stop-opacity=".8"/><stop offset="1" stop-color="#5c4ade" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2"><stop offset="0" stop-color="#4da2ff" stop-opacity=".55"/><stop offset="1" stop-color="#4da2ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="fire"><stop offset="0" stop-color="#ff6a2a" stop-opacity=".85"/><stop offset=".55" stop-color="#e2381e" stop-opacity=".35"/><stop offset="1" stop-color="#e2381e" stop-opacity="0"/></radialGradient>
    <radialGradient id="water"><stop offset="0" stop-color="#2ec5ff" stop-opacity=".8"/><stop offset=".55" stop-color="#2f6bff" stop-opacity=".35"/><stop offset="1" stop-color="#2f6bff" stop-opacity="0"/></radialGradient>
    <radialGradient id="ether"><stop offset="0" stop-color="#b98cff" stop-opacity=".9"/><stop offset=".5" stop-color="#6d4bff" stop-opacity=".35"/><stop offset="1" stop-color="#6d4bff" stop-opacity="0"/></radialGradient>
    <radialGradient id="floor"><stop offset="0" stop-color="#1d1a3a" stop-opacity=".35"/><stop offset="1" stop-color="#1d1a3a" stop-opacity="0"/></radialGradient>
    <radialGradient id="floorDark"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5bff"/><stop offset=".45" stop-color="#5c4ade"/><stop offset="1" stop-color="#3f8cff"/></linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e9ccff"/><stop offset=".3" stop-color="#4da2ff"/><stop offset=".55" stop-color="#55db9c"/><stop offset=".8" stop-color="#ffd731"/><stop offset="1" stop-color="#fb4903"/>
    </linearGradient>
    <linearGradient id="mythic" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff7ad9"/><stop offset=".33" stop-color="#8f6bff"/><stop offset=".66" stop-color="#3fd0ff"/><stop offset="1" stop-color="#7dffb0"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#f5a623"/></linearGradient>
    <linearGradient id="vs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a6"/><stop offset=".5" stop-color="#ffd731"/><stop offset="1" stop-color="#ff8a00"/></linearGradient>
    <linearGradient id="split" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff6a2a"/><stop offset="1" stop-color="#2ec5ff"/></linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#261e6e" flood-opacity=".28"/></filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#261e6e" flood-opacity=".22"/></filter>`;

const BG = {
  light: `<rect width="${W}" height="${H}" fill="#dceeff"/>
    <circle cx="120" cy="80" r="460" fill="url(#l1)"/>
    <circle cx="1100" cy="40" r="420" fill="url(#l2)"/>
    <circle cx="860" cy="660" r="420" fill="url(#l3)"/>`,
  dark: `<rect width="${W}" height="${H}" fill="#0b0a14"/>
    <circle cx="180" cy="0" r="520" fill="url(#g1)"/>
    <circle cx="1200" cy="630" r="520" fill="url(#g2)"/>`,
};

/**
 * Columna de texto (pastilla, titular, entradilla y firma con el dominio). `maxWidth` limita el
 * titular para no pisar la escena de la derecha.
 */
function textColumn({ eyebrow, title, tagline, dark, maxWidth = 640, tagWidth = 600 }) {
  const ink = dark ? '#f4f2ff' : '#0b0a14';
  const muted = dark ? '#b9b5d8' : '#4b4862';
  const eb = textPath(sans, eyebrow.toUpperCase(), 136, 138, 22, ink);
  const word = textPath(display, 'Pockai', 84, 44, 34, ink);
  const upper = title.toUpperCase();
  // Titular: el mayor tamaño que quepa en dos líneas.
  let titleSize = 128;
  while (wrap(display, upper, titleSize, maxWidth).length > 2 || wrap(display, upper, titleSize, maxWidth).some((l) => measure(display, l, titleSize) > maxWidth)) titleSize -= 4;
  // Con dos líneas, más pequeño para dejar sitio a la entradilla y a la firma.
  if (wrap(display, upper, titleSize, maxWidth).length === 2) titleSize = Math.min(titleSize, 92);
  const titleLines = wrap(display, upper, titleSize, maxWidth);
  let y = 150 + 40 + titleSize * 0.82;
  const titleSvg = titleLines
    .map((line) => {
      const p = textPath(display, line, 96, y, titleSize, ink);
      y += titleSize * 0.92;
      return p.svg;
    })
    .join('');
  y += 16;
  const tagLines = wrap(sans, tagline, 32, tagWidth);
  const tagSvg = tagLines
    .slice(0, 3)
    .map((line) => {
      const p = textPath(sans, line, 100, y, 32, muted);
      y += 42;
      return p.svg;
    })
    .join('');
  // Última línea de la entradilla por encima de la firma (y=520).
  if (y - 42 > 496) throw new Error(`generate-og: «${title}» no cabe (entradilla hasta y=${Math.round(y - 42)})`);

  return `
  <g transform="translate(96 108)">
    <rect width="${eb.width + 64}" height="44" rx="22" fill="#ffffff" fill-opacity="${dark ? 0.08 : 0.75}"/>
    <circle cx="22" cy="22" r="6" fill="url(#accent)"/>
  </g>
  ${eb.svg}
  ${titleSvg}
  ${tagSvg}
  <g transform="translate(96 518)">
    <image href="${LOGO_MARK}" width="64" height="64" transform="rotate(-6 32 32)"/>
    ${word.svg}
    <circle cx="${84 + word.width + 18}" cy="32" r="3" fill="${muted}"/>
    ${textPath(sans, host, 84 + word.width + 36, 41, 24, muted).svg}
  </g>`;
}

const frame = (dark, body) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${DEFS}</defs>
  ${BG[dark ? 'dark' : 'light']}
  ${body}
</svg>`;

/** Pastilla de texto centrada en cx (etiquetas de elemento y rareza). */
function pill(cx, cy, label, { fill, ink = '#ffffff', size = 18, stroke = '' }) {
  const w = measure(sans, label, size) + 36;
  const h = size + 18;
  const t = textPath(sans, label, cx - w / 2 + 18, cy + size * 0.36, size, ink);
  return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"${stroke}/>${t.svg}`;
}

// ── Escenas ──────────────────────────────────────────────────────────────────────────────

/** Home: los tres iniciales en un escenario con el anillo arcoíris de marca. */
function homeScene() {
  const cx = 905;
  const cy = 318;
  return `
  <g filter="url(#shadow)">
    <circle cx="${cx}" cy="${cy}" r="228" fill="url(#ring)"/>
    <circle cx="${cx}" cy="${cy}" r="196" fill="#ffffff"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="196" fill="#f3f0ff"/>
  <ellipse cx="${cx}" cy="${cy + 150}" rx="250" ry="38" fill="url(#floor)"/>
  ${sprite('ignisaur_happy', 700, 284, 192)}
  ${sprite('florabud_happy', 918, 284, 192)}
  ${sprite('axolunar_happy', cx - 128, 158, 256)}
  ${sparkle(700, 150, 6, '#ffd731')}
  ${sparkle(1115, 170, 6, '#4da2ff')}
  ${sparkle(1135, 515, 4, '#fb4903')}
  ${sparkle(660, 520, 4, '#55db9c')}`;
}

/** Pockais: colección por rarezas, con la mítica destacada. */
function pockaisScene(labels) {
  const tile = (x, y, w, h, stroke, label, name, size, labelFill, labelInk) => {
    const sx = x + (w - size) / 2;
    const sy = y + (h - size) / 2 - 14;
    return `
    <g filter="url(#soft)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="26" fill="${stroke}"/></g>
    <rect x="${x + 6}" y="${y + 6}" width="${w - 12}" height="${h - 12}" rx="20" fill="#ffffff"/>
    <ellipse cx="${x + w / 2}" cy="${sy + size - 6}" rx="${size * 0.32}" ry="${size * 0.06}" fill="url(#floor)"/>
    ${sprite(name, sx, sy, size)}
    ${pill(x + w / 2, y + h - 26, label, { fill: labelFill, ink: labelInk, size: 14 })}`;
  };
  const x0 = 560;
  const y0 = 92;
  return `
  ${tile(x0, y0, 248, 420, 'url(#mythic)', labels.mythic, 'hebrisigno_happy', 256, 'url(#mythic)', '#ffffff')}
  ${tile(x0 + 264, y0, 158, 202, '#4da2ff', labels.rare, 'livolt_happy', 128, '#4da2ff', '#ffffff')}
  ${tile(x0 + 438, y0, 158, 202, '#b06cff', labels.superRare, 'nubeballena_happy', 128, '#b06cff', '#ffffff')}
  ${tile(x0 + 264, y0 + 218, 158, 202, 'url(#gold)', labels.legendary, 'fenixel_happy', 128, 'url(#gold)', '#3a2500')}
  ${tile(x0 + 438, y0 + 218, 158, 202, 'url(#gold)', labels.legendary, 'kirisol_happy', 128, 'url(#gold)', '#3a2500')}
  ${sparkle(x0 + 20, y0 - 6, 6, '#ff7ad9')}
  ${sparkle(x0 + 600, y0 + 440, 6, '#3fd0ff')}
  ${sparkle(x0 + 240, y0 + 448, 4, '#ffd731')}`;
}

/** Arena: duelo de fuego contra agua sobre el ring, con el «VS» en el centro. */
function arenaScene(labels) {
  const vsX = 880;
  const vs = textPath(display, 'VS', 0, 0, 84, 'url(#vs)');
  return `
  <circle cx="720" cy="330" r="320" fill="url(#fire)"/>
  <circle cx="1060" cy="330" r="320" fill="url(#water)"/>
  ${starfield(7, 46, { x0: 560, colors: ['#ffd731', '#ff8a5c', '#7fe3ff', '#ffffff'] })}
  <ellipse cx="${vsX}" cy="492" rx="330" ry="58" fill="none" stroke="url(#split)" stroke-width="6" opacity=".9"/>
  <ellipse cx="${vsX}" cy="492" rx="292" ry="44" fill="#ffffff" fill-opacity=".05" stroke="#ffffff" stroke-opacity=".25" stroke-width="2"/>
  <ellipse cx="740" cy="500" rx="130" ry="22" fill="url(#floorDark)"/>
  <ellipse cx="1030" cy="500" rx="130" ry="22" fill="url(#floorDark)"/>
  ${sprite('fenixel_idle', 600, 228, 256)}
  ${sprite('leviatin_idle', 904, 228, 256, { flip: true })}
  <g transform="translate(${vsX - vs.width / 2} 300) rotate(-8 ${vs.width / 2} -30)">
    ${textPath(display, 'VS', 4, 6, 84, '#000000', ' opacity=".45"').svg}
    ${textPath(display, 'VS', 0, 0, 84, 'url(#vs)', ' stroke="#3a1500" stroke-width="3" paint-order="stroke"').svg}
  </g>
  ${pill(728, 580, labels.fire, { fill: '#e2381e', size: 18 })}
  ${pill(1032, 580, labels.water, { fill: '#1f7ae0', size: 18 })}`;
}

/** Lore: un portal del Éter Digital del que emerge una criatura mítica. */
function loreScene() {
  const cx = 905;
  const cy = 300;
  const rings = [250, 205, 162, 122]
    .map((r, i) => `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${Math.round(r * 0.96)}" fill="none" stroke="url(#ring)" stroke-width="${6 - i}" stroke-dasharray="${i % 2 ? '2 14' : '28 10'}" opacity="${(0.85 - i * 0.15).toFixed(2)}"/>`)
    .join('');
  return `
  <circle cx="${cx}" cy="${cy}" r="300" fill="url(#ether)"/>
  ${starfield(42, 90, { x0: 600, colors: ['#e9ccff', '#4da2ff', '#55db9c', '#ffd731', '#ffffff'] })}
  ${rings}
  <circle cx="${cx}" cy="${cy}" r="112" fill="#120f26" opacity=".85"/>
  <ellipse cx="${cx}" cy="${cy + 190}" rx="150" ry="24" fill="url(#floorDark)"/>
  ${sprite('yggdrito_idle', 905 - 192, 108, 384)}
  ${sparkle(660, 120, 6, '#ffd731')}
  ${sparkle(1150, 110, 6, '#55db9c')}
  ${sparkle(1130, 540, 4, '#e9ccff')}`;
}

/** Contacto: Axolunar saluda con un bocadillo y un sobre. */
function contactScene(labels) {
  const bubble = textPath(display, labels.hello, 0, 0, 56, '#0b0a14');
  const bw = bubble.width + 64;
  const bx = 640;
  const by = 120;
  return `
  <g filter="url(#shadow)">
    <circle cx="935" cy="360" r="200" fill="url(#ring)"/>
    <circle cx="935" cy="360" r="170" fill="#ffffff"/>
  </g>
  <ellipse cx="935" cy="500" rx="170" ry="28" fill="url(#floor)"/>
  ${sprite('axolunar_happy', 935 - 128, 228, 256)}
  <g filter="url(#soft)">
    <rect x="${bx}" y="${by}" width="${bw}" height="96" rx="30" fill="#ffffff"/>
    <path d="M${bx + bw - 70} ${by + 90} l40 52 l-6 -56 z" fill="#ffffff"/>
  </g>
  <g transform="translate(${bx + 32} ${by + 70})">${bubble.svg}</g>
  <g transform="translate(1040 150) rotate(10)" filter="url(#soft)">
    <rect width="112" height="78" rx="12" fill="url(#accent)"/>
    <path d="M6 10 L56 46 L106 10" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  ${sparkle(1170, 120, 6, '#ffd731')}
  ${sparkle(1150, 560, 4, '#55db9c')}`;
}

// ── Textos ───────────────────────────────────────────────────────────────────────────────

/** Las tarjetas van en inglés para todos los idiomas: se comparten igual en cualquier red. */
const CARDS = {
  en: {
    home: { eyebrow: 'AI virtual pet', title: 'Pockai', tagline: 'Your pocket yokai. Hatch, care, battle and chat.', tagWidth: 550, scene: homeScene },
    pockais: {
      eyebrow: '16 species · 5 rarities',
      title: 'The pockais',
      tagline: 'Rare, legendary or mythic? See what hatches.',
      maxWidth: 440,
      tagWidth: 430,
      scene: () => pockaisScene({ rare: 'RARE', superRare: 'SUPER RARE', legendary: 'LEGENDARY', mythic: 'MYTHIC' }),
    },
    arena: {
      eyebrow: 'Turn-based battles',
      title: 'The Arena',
      tagline: 'Elements, strategy and leagues up to Mythic.',
      dark: true,
      maxWidth: 470,
      tagWidth: 440,
      scene: () => arenaScene({ fire: 'FIRE', water: 'WATER' }),
    },
    lore: { eyebrow: 'The world of Pockai', title: 'The Digital Aether', tagline: 'Where the eggs are born, the rarities and the six elements.', dark: true, maxWidth: 530, tagWidth: 500, scene: loreScene },
    contact: {
      eyebrow: 'Talk to the team',
      title: 'Contact',
      tagline: 'Questions, ideas or collaborations: we reply by email.',
      maxWidth: 520,
      tagWidth: 590,
      scene: () => contactScene({ hello: 'HELLO!' }),
    },
  },
};

/** Icono de la app (favicon.svg: el mismo del escritorio) a toda la caja. */
function icon(size) {
  const appIcon = `data:image/svg+xml;base64,${readFileSync(join(pub, 'favicon.svg')).toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <image href="${appIcon}" x="0" y="0" width="512" height="512"/>
</svg>`;
}

const render = (svg, width) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } }).render().asPng();

/**
 * Tarjeta → PNG compacto. resvg comprime rápido y en RGBA; las tarjetas son opacas, así que se
 * re-codifican en RGB con el filtro por fila que menos pesa y zlib al máximo (~35 % menos).
 */
function renderCard(svg) {
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: false } }).render();
  const { width, height, pixels } = img;
  const stride = width * 3;
  const rgb = Buffer.alloc(stride * height);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
    rgb[j] = pixels[i];
    rgb[j + 1] = pixels[i + 1];
    rgb[j + 2] = pixels[i + 2];
  }
  const raw = Buffer.alloc((stride + 1) * height);
  const cand = Array.from({ length: 5 }, () => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    const row = rgb.subarray(y * stride, (y + 1) * stride);
    const up = y ? rgb.subarray((y - 1) * stride, y * stride) : null;
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = cand[f];
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 3 ? row[x - 3] : 0;
        const b = up ? up[x] : 0;
        const c = up && x >= 3 ? up[x - 3] : 0;
        let pred = 0;
        if (f === 1) pred = a;
        else if (f === 2) pred = b;
        else if (f === 3) pred = (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (row[x] - pred) & 0xff;
        out[x] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    raw[y * (stride + 1)] = best;
    cand[best].copy(raw, y * (stride + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9, memLevel: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const ogDir = join(pub, 'og');
rmSync(ogDir, { recursive: true, force: true });
mkdirSync(ogDir, { recursive: true });
let count = 0;
{
  for (const [page, card] of Object.entries(CARDS.en)) {
    // La escena va antes que el texto: los resplandores quedan detrás del titular.
    const svg = frame(card.dark, `${card.scene()}${textColumn(card)}`);
    const file = join(ogDir, `${page}-v${OG_VERSION}.png`);
    writeFileSync(file, renderCard(svg));
    const bytes = statSync(file).size;
    if (bytes > MAX_BYTES) throw new Error(`generate-og: ${page} pesa ${Math.round(bytes / 1024)} KB (máx. ${MAX_BYTES / 1024})`);
    count++;
  }
}
writeFileSync(join(pub, 'apple-touch-icon.png'), render(icon(180), 180));
writeFileSync(join(pub, 'icon-512.png'), render(icon(512), 512));
console.log(`generate-og: ${count} imágenes sociales (v${OG_VERSION}) y 2 iconos en public/`);
