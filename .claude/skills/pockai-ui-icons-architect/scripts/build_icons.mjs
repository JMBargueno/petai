// Genera los SVG del set de interfaz desde icon-defs.mjs.
//
//   node .claude/skills/pockai-ui-icons-architect/scripts/build_icons.mjs
//
// Escribe shared/ui/src/icons/<nombre>.outline.svg y <nombre>.duo.svg, y el índice index.ts.
// No edites los SVG a mano: cambia icon-defs.mjs y vuelve a generar.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ICONS, UI_ICON_NAMES } from './icon-defs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const outDir = path.join(root, 'shared/ui/src/icons');

const HEAD =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">';


function outline(def) {
  return `${HEAD}${def.base}</svg>\n`;
}
function duo(def) {
  return `${HEAD}${def.acc}${def.base}</svg>\n`;
}

fs.mkdirSync(outDir, { recursive: true });
for (const name of UI_ICON_NAMES) {
  const def = ICONS[name];
  fs.writeFileSync(path.join(outDir, `${name}.outline.svg`), outline(def));
  fs.writeFileSync(path.join(outDir, `${name}.duo.svg`), duo(def));
}

const imports = UI_ICON_NAMES.flatMap((n) => [
  `import ${camel(n)}Outline from './${n}.outline.svg?raw';`,
  `import ${camel(n)}Duo from './${n}.duo.svg?raw';`,
]).join('\n');
const entries = UI_ICON_NAMES.map((n) => `  '${n}': { outline: ${camel(n)}Outline, duo: ${camel(n)}Duo },`).join('\n');

const index = `// GENERADO por .claude/skills/pockai-ui-icons-architect/scripts/build_icons.mjs. No editar a mano.
${imports}

export interface UiIconPair { outline: string; duo: string }

/** Set de iconos de interfaz: outline (inactivo) y duotone (activo). Nombres: ver icon-defs.mjs. */
export const UI_ICONS: Record<string, UiIconPair> = {
${entries}
};

/** SVG de un icono en la variante pedida, o undefined si el set no lo tiene. */
export function uiIconSvg(name: string, active = false): string | undefined {
  const pair = UI_ICONS[name];
  return pair ? (active ? pair.duo : pair.outline) : undefined;
}
`;
fs.writeFileSync(path.join(outDir, 'index.ts'), index);

// Declaración para `import x from '*.svg?raw'` en TypeScript (Vite lo resuelve en el bundle).
fs.writeFileSync(
  path.join(outDir, 'raw.d.ts'),
  "declare module '*.svg?raw' {\n  const src: string;\n  export default src;\n}\n",
);

console.log(`✓ ${UI_ICON_NAMES.length} iconos × 2 variantes en ${path.relative(root, outDir)}`);

function camel(n) {
  return n.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
