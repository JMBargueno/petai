#!/usr/bin/env node
// Genera los SVG placeholder shared/assets/sprites/<id>_{idle,eat,happy,sleep}.svg
// con la plantilla de docs/GUIA_ARTISTICA.md §7.1 y la paleta de la especie en species.json.
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

const eyesOpen = `<circle cx="48" cy="56" r="6" fill="#1A1A1A"/>
    <circle cx="46" cy="54" r="2" fill="#FFFFFF"/>
    <circle cx="80" cy="56" r="6" fill="#1A1A1A"/>
    <circle cx="78" cy="54" r="2" fill="#FFFFFF"/>`;
const eyesHappy = `<path d="M 42 58 Q 48 50 54 58" stroke="#1A1A1A" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M 74 58 Q 80 50 86 58" stroke="#1A1A1A" stroke-width="3" fill="none" stroke-linecap="round"/>`;
const eyesClosed = `<path d="M 42 58 Q 48 64 54 58" stroke="#1A1A1A" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M 74 58 Q 80 64 86 58" stroke="#1A1A1A" stroke-width="3" fill="none" stroke-linecap="round"/>`;

const POSES = {
  idle: { dy: 0, eyes: eyesOpen, mouth: `<path d="M 58 72 Q 64 77 70 72" stroke="#1A1A1A" stroke-width="2" fill="none" stroke-linecap="round"/>`, extra: '' },
  happy: { dy: -4, eyes: eyesHappy, mouth: `<path d="M 54 68 Q 64 82 74 68 Z" fill="#8B0000" stroke="#1A1A1A" stroke-width="2"/>`, extra: '' },
  eat: { dy: 2, eyes: eyesOpen, mouth: `<ellipse cx="64" cy="72" rx="7" ry="5" fill="#8B0000"/>`, extra: '' },
  sleep: {
    dy: 0,
    eyes: eyesClosed,
    mouth: `<line x1="60" y1="72" x2="68" y2="72" stroke="#1A1A1A" stroke-width="2" stroke-linecap="round"/>`,
    extra: `<text x="92" y="35" font-family="sans-serif" font-weight="bold" font-size="14" fill="#3B82F6">Zzz</text>`,
  },
};

const svg = (p) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <!-- Placeholder de ${sp.name} (${key}). Sustituir por el SpeciesArt real: scripts/sprites/species.ts -->
  <g transform="translate(0, ${p.dy})">
    <ellipse cx="64" cy="116" rx="36" ry="8" fill="#000000" opacity="0.2"/>
    <polygon points="64,15 54,35 74,35" fill="${secondary}" stroke="${accent}" stroke-width="2"/>
    <circle cx="64" cy="68" r="42" fill="${primary}" stroke="#1A1A1A" stroke-width="3"/>
    <ellipse cx="64" cy="80" rx="26" ry="20" fill="#FFFFFF" opacity="0.35"/>
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
