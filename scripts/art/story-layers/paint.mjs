// Pinta de una vez las capas de los escenarios: para cada capa que falte llama a Nano Banana
// (generate.mjs), le quita el croma (import.mjs de habitat-backdrops) y la deja en
// shared/assets/story-layers/<id>.webp. Al final monta la hoja de contactos (sheet.mjs).
//
//   node scripts/art/story-layers/paint.mjs                  (todas las que falten)
//   node scripts/art/story-layers/paint.mjs --only l1-rotura,l2-cristal-roto
//   node scripts/art/story-layers/paint.mjs --force          (repinta también las que ya existen)
//   node scripts/art/story-layers/paint.mjs --import-only    (solo recorta lo ya generado; no cobra)
//
// CADA CAPA ES UNA IMAGEN Y SE COBRA (24 capas en el catálogo completo). Necesita GEMINI_API_KEY.
// Para que todas las capas casen entre sí, cada una se genera con una referencia de estilo: por
// defecto un fondo ya aprobado del hábitat (--ref <img> para usar otra).
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const force = args.includes('--force');
const importOnly = args.includes('--import-only');
const only = opt('only')?.split(',').map((s) => s.trim());
const ref = opt('ref', 'shared/assets/habitat-backdrops/santuario.webp');

const catalog = JSON.parse(fs.readFileSync(path.resolve('shared/game-data/story-locations.json'), 'utf8'));
const outDir = path.resolve('shared/assets/story-layers');
const rawDir = path.resolve('sprite-previews/story-layers');
fs.mkdirSync(outDir, { recursive: true });

const run = (script, scriptArgs) => spawnSync(process.execPath, [script, ...scriptArgs], { stdio: 'inherit' }).status === 0;
const rawOf = (id) => ['png', 'jpg'].map((ext) => path.join(rawDir, `${id}.${ext}`)).find((f) => fs.existsSync(f));

const todo = catalog.layers.filter((l) => (only ? only.includes(l.id) : true)).filter((l) => force || importOnly || !fs.existsSync(path.join(outDir, `${l.id}.webp`)));
if (todo.length === 0) console.log('No falta ninguna capa por pintar.');
else if (!importOnly) console.log(`Se van a generar ${todo.length} imágenes (cada una se cobra): ${todo.map((l) => l.id).join(', ')}`);

const failed = [];
for (const layer of todo) {
  if (!importOnly) {
    const genArgs = [layer.id, ...(ref && fs.existsSync(ref) ? ['--ref', ref] : [])];
    if (!run('scripts/art/story-layers/generate.mjs', genArgs)) {
      failed.push(`${layer.id} (generación)`);
      continue;
    }
  }
  const raw = rawOf(layer.id);
  if (!raw) {
    if (!importOnly) failed.push(`${layer.id} (sin imagen)`);
    continue;
  }
  // El mismo importador que los fondos del hábitat: croma → alfa, desfringe y vista previa día/noche
  if (!run('scripts/art/habitat-backdrops/import.mjs', [raw, path.join(outDir, `${layer.id}.webp`), '--width', '1344'])) failed.push(`${layer.id} (recorte)`);
}

run('scripts/art/story-layers/sheet.mjs', []);
if (failed.length) {
  console.error(`\nCapas con problemas (se quedan con su silueta procedural): ${failed.join(', ')}`);
  process.exit(1);
}
