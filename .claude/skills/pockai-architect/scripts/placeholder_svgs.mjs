#!/usr/bin/env node
// Genera los SVG placeholder shared/assets/sprites/<id>_{idle,eat,happy,sleep}.svg
// con la plantilla 3/4 de docs/GUIA_ARTISTICA.md §7.4 (mira abajo-derecha) y la paleta de la especie.
// No sobrescribe archivos existentes salvo con --force.
// Uso: node .claude/skills/pockai-architect/scripts/placeholder_svgs.mjs <id> [--force]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const id = process.argv[2];
const force = process.argv.includes('--force');
if (!id || id.startsWith('-')) {
  console.error('Uso: placeholder_svgs.mjs <id> [--force]');
  process.exit(1);
}

const species = JSON.parse(fs.readFileSync(path.join(root, 'shared/game-data/species.json'), 'utf8'));
const sp = species.find((s) => s.id === id);
if (!sp) {
  console.error(`La especie "${id}" no está en species.json; añádela primero.`);
  process.exit(1);
}
const { primary, secondary, accent } = sp.defaultPalette;
const key = sp.spriteKey ?? id;

// 3/4: el ojo cercano (izquierda) a tamaño completo y el lejano (derecha, junto al contorno) estrecho.
const eyesOpen = `<circle cx="64" cy="60" r="6" fill="#1A1A1A"/>
    <circle cx="66" cy="58" r="2" fill="#FFFFFF"/>
    <ellipse cx="85" cy="59" rx="4.5" ry="6" fill="#1A1A1A"/>
    <circle cx="86" cy="57" r="1.6" fill="#FFFFFF"/>`;
const eyesHappy = `<path d="M 58 60 Q 62 53 66 60" stroke="#1A1A1A" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M 78 62 Q 84 54 90 62" stroke="#1A1A1A" stroke-width="3" fill="none" stroke-linecap="round"/>`;
const eyesClosed = `<path d="M 58 60 Q 62 65 66 60" stroke="#1A1A1A" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M 78 62 Q 84 68 90 62" stroke="#1A1A1A" stroke-width="3" fill="none" stroke-linecap="round"/>`;

const POSES = {
  idle: { dy: 0, eyes: eyesOpen, mouth: `<path d="M 68 74 Q 74 79 80 74" stroke="#1A1A1A" stroke-width="2" fill="none" stroke-linecap="round"/>`, extra: '' },
  happy: { dy: -4, eyes: eyesHappy, mouth: `<path d="M 64 70 Q 74 84 84 70 Z" fill="#8B0000" stroke="#1A1A1A" stroke-width="2"/>`, extra: '' },
  eat: { dy: 2, eyes: eyesOpen, mouth: `<ellipse cx="74" cy="74" rx="7" ry="5" fill="#8B0000"/>`, extra: '' },
  sleep: {
    dy: 0,
    eyes: eyesClosed,
    mouth: `<line x1="70" y1="74" x2="78" y2="74" stroke="#1A1A1A" stroke-width="2" stroke-linecap="round"/>`,
    extra: `<text x="92" y="35" font-family="sans-serif" font-weight="bold" font-size="14" fill="#3B82F6">Zzz</text>`,
  },
};

const svg = (p) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <!-- Placeholder 3/4 de ${sp.name} (${key}). Sustituir por el SpeciesArt real: scripts/sprites/species.ts -->
  <ellipse cx="64" cy="114" rx="24" ry="12" fill="#000000" opacity="0.2"/>
  <g transform="translate(0, ${p.dy})">
    <ellipse cx="44" cy="106" rx="9" ry="6" fill="${primary}" stroke="#1A1A1A" stroke-width="2.6"/>
    <polygon points="58,18 50,38 70,36" fill="${secondary}" stroke="${accent}" stroke-width="2"/>
    <ellipse cx="66" cy="70" rx="40" ry="42" fill="${primary}" stroke="#1A1A1A" stroke-width="3"/>
    <ellipse cx="76" cy="84" rx="22" ry="18" fill="#FFFFFF" opacity="0.35"/>
    <ellipse cx="82" cy="110" rx="11" ry="7" fill="${primary}" stroke="#1A1A1A" stroke-width="2.6"/>
    ${p.eyes}
    ${p.mouth}
    ${p.extra}
  </g>
</svg>
`;

const dir = path.join(root, 'shared/assets/sprites');
for (const [pose, def] of Object.entries(POSES)) {
  const file = path.join(dir, `${key}_${pose}.svg`);
  if (fs.existsSync(file) && !force) {
    console.log(`= ${path.relative(root, file)} ya existe (usa --force para sobrescribir)`);
    continue;
  }
  fs.writeFileSync(file, svg(def), 'utf8');
  console.log(`✓ ${path.relative(root, file)}`);
}
