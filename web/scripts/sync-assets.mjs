// Copia a public/sprites los sprites del monorepo que usa la landing.
// Angular no admite assets fuera del workspace, así que se sincronizan antes de servir o compilar.
// public/sprites está en .gitignore: la fuente de verdad sigue siendo shared/assets/sprites.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(web, '..', 'shared', 'assets', 'sprites');
const target = join(web, 'public', 'sprites');

const wanted = (name) => name.endsWith('_idle.svg') || name === 'egg_closed.svg';

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
const files = readdirSync(source).filter(wanted);
for (const file of files) cpSync(join(source, file), join(target, file));
console.log(`sync-assets: ${files.length} sprites → public/sprites`);
