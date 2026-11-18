// Prepara y lanza una etapa: hoja base (disposición), recorte de la hoja objetivo (diseño) y prompt.
//   node scripts/sprites/concept/stage.mjs <id> <etapa 0-3> <objetivo> "<descripción de la criatura en esa etapa>"
import fs from 'fs';
import { execFileSync } from 'child_process';
import sharp from 'sharp';
const [id, stageArg, golden, desc] = process.argv.slice(2);
const stage = Number(stageArg);
const name = ['baby', 'juvenile', 'adult', 'final'][stage];
execFileSync('node', ['scripts/sprites/concept/base-sheet.mjs', id, String(stage)], { stdio: 'inherit' });
const m = await sharp(golden).metadata();
const rowH = Math.round((m.height * (1024 / 1104)) / 4);
const ref = `sprite-previews/nano/${id}-${name}-diseno.png`;
await sharp(golden).extract({ left: 0, top: rowH * stage, width: Math.round(m.width * 0.5), height: rowH }).png().toFile(ref);
const prompt = fs.readFileSync('scripts/sprites/concept/plantilla.txt', 'utf8').replace('{{CRIATURA}}', desc);
const pf = `sprite-previews/nano/${id}-${name}.txt`;
fs.writeFileSync(pf, prompt);
execFileSync('node', ['scripts/sprites/concept/generate.mjs', `sprite-previews/nano/${id}-${name}.jpg`, '--ref', `sprite-previews/nano/${id}-${name}-base.png`, '--ref', ref, '--prompt', pf], { stdio: 'inherit' });
