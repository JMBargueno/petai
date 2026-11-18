// Pone en species.json la paleta que propone nano-roles para una especie.
import fs from 'fs';
const id = process.argv[2];
const pal = JSON.parse(fs.readFileSync(`sprite-previews/nano/${id}-paleta.json`, 'utf8'));
const f = 'shared/game-data/species.json';
let s = fs.readFileSync(f, 'utf8');
const at = s.indexOf(`"id": "${id}"`);
const p = s.indexOf('"defaultPalette"', at);
const end = s.indexOf('}', p);
const block = s.slice(p, end).replace(/"primary": "#[0-9A-Fa-f]{6}"/, `"primary": "${pal.primary.toUpperCase()}"`).replace(/"secondary": "#[0-9A-Fa-f]{6}"/, `"secondary": "${pal.secondary.toUpperCase()}"`).replace(/"accent": "#[0-9A-Fa-f]{6}"/, `"accent": "${pal.accent.toUpperCase()}"`);
fs.writeFileSync(f, s.slice(0, p) + block + s.slice(end));
console.log(id, pal);
