// Guarda de colores de la UI: los componentes pintan con tokens (shared/ui/styles/tokens.css y los
// temas de shared/ui/styles/themes), no con colores fijos. Así un tema nuevo cambia toda la interfaz.
//
// Funciona como trinquete: scripts/ui-colors-baseline.json guarda cuántos colores fijos quedan por
// fichero. Falla si un fichero sube o aparece uno nuevo con colores; si baja, pide actualizar la base.
//
//   node scripts/validate-ui-colors.js            → comprueba
//   node scripts/validate-ui-colors.js --update   → reescribe la base con los recuentos actuales
//
// Se permite: las definiciones de tokens y temas, las máscaras (`mask-image: … #000 …`) y las líneas
// marcadas con `color-ok` (arte de píxel, logo, paletas de criatura: datos, no interfaz).
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const baselinePath = path.join(__dirname, 'ui-colors-baseline.json');

const ROOTS = ['shared/ui/src', 'shared/ui/styles', 'desktop/src', 'apps/android/src'];
const EXTENSIONS = new Set(['.svelte', '.css']);
/** Ficheros que definen la paleta: aquí los colores fijos son el punto. */
const EXEMPT = [
  /^shared\/ui\/styles\/tokens\.css$/,
  /^shared\/ui\/styles\/scene\.css$/,
  /^shared\/ui\/styles\/themes\//,
  /^shared\/ui\/styles\/fonts\.css$/,
];
/** Los ficheros de plataforma solo cambian geometría y movimiento: ningún color, ni siquiera de token. */
const PLATFORM_DIR = /^shared\/ui\/styles\/platform\//;

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const FUNC = /\b(?:rgba?|hsla?)\(\s*[\d.]/g;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(full, out);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/** Cuenta las líneas con algún color fijo, quitando lo permitido. */
function countColors(text) {
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    if (/color-ok/.test(line) || /mask(-image)?\s*:/.test(line)) continue;
    // Anclas de enlaces e ids en atributos (`href="#main"`) no son colores.
    const clean = line.replace(/href="#[^"]*"/g, '').replace(/url\(#[^)]*\)/g, '');
    HEX.lastIndex = 0;
    FUNC.lastIndex = 0;
    if (HEX.test(clean) || FUNC.test(clean)) count++;
  }
  return count;
}

const rel = (f) => path.relative(rootDir, f).split(path.sep).join('/');
const files = ROOTS.flatMap((r) => walk(path.join(rootDir, r), [])).map((f) => ({ abs: f, rel: rel(f) }));

let errors = 0;
const counts = {};
for (const f of files) {
  const text = fs.readFileSync(f.abs, 'utf8');
  if (PLATFORM_DIR.test(f.rel)) {
    const n = countColors(text);
    // Tokens de color por segmento completo (`--line-soft`, `--accent`), no por subcadena (`--outline`).
    const colorTokens =
      text.match(/--(?:[a-z0-9]+-)*(?:color|bg|surface|ink|line|accent|tint)(?:-[a-z0-9]+)*\s*:/g) ?? [];
    if (n || colorTokens.length) {
      console.error(`❌ ${f.rel}: los estilos de plataforma no pueden fijar colores (eso es del tema).`);
      errors++;
    }
    continue;
  }
  if (EXEMPT.some((re) => re.test(f.rel))) continue;
  const n = countColors(text);
  if (n) counts[f.rel] = n;
}

const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
if (process.argv.includes('--update')) {
  fs.writeFileSync(baselinePath, JSON.stringify(sorted, null, 2) + '\n');
  const total = Object.values(sorted).reduce((a, b) => a + b, 0);
  console.log(`✓ Base actualizada: ${Object.keys(sorted).length} ficheros, ${total} líneas con color fijo.`);
  process.exit(errors ? 1 : 0);
}

const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : {};
let lowered = 0;
for (const [file, n] of Object.entries(sorted)) {
  const allowed = baseline[file] ?? 0;
  if (n > allowed) {
    console.error(`❌ ${file}: ${n} líneas con color fijo (máximo ${allowed}). Usa un token de shared/ui/styles/tokens.css.`);
    errors++;
  } else if (n < allowed) {
    lowered++;
  }
}
for (const file of Object.keys(baseline)) if (!(file in sorted)) lowered++;

if (errors) {
  console.error(`\n${errors} problema(s). Si el color es arte o dato (no interfaz), marca la línea con /* color-ok */.`);
  process.exit(1);
}
if (lowered) {
  console.error(`❌ Hay ${lowered} fichero(s) con menos colores fijos que la base: ejecuta "pnpm validate:colors --update" y sube scripts/ui-colors-baseline.json.`);
  process.exit(1);
}
console.log(`✓ Colores de la UI: ${Object.keys(sorted).length} ficheros dentro de la base, ningún color nuevo.`);
