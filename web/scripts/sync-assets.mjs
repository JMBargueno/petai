// Copia a public/sprites los sprites del monorepo que usa la landing.
// Angular no admite assets fuera del workspace, así que se sincronizan antes de servir o compilar.
// public/sprites está en .gitignore: la fuente de verdad sigue siendo shared/assets/sprites.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(web, '..');
const source = join(repo, 'shared', 'assets', 'sprites');
const target = join(web, 'public', 'sprites');

// Previews de patrones (composición de las texturas reales de shared/assets/patterns):
// scripts/generate-pattern-previews.mjs las genera en shared/assets/sprites antes de copiarlas.
const previews = spawnSync(process.execPath, [join(repo, 'scripts', 'generate-pattern-previews.mjs')], {
  stdio: 'inherit',
});
if (previews.status !== 0) {
  throw new Error('generate-pattern-previews falló; no se puede sincronizar public/sprites');
}

// Estados de cada especie (idle, happy, eat, sleep), huevos y previews de patrones.
const wanted = (name) => name.endsWith('.svg') || name.includes('pattern_') && name.endsWith('.png');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
const files = readdirSync(source).filter(wanted);
for (const file of files) cpSync(join(source, file), join(target, file));
console.log(`sync-assets: ${files.length} sprites → public/sprites`);
