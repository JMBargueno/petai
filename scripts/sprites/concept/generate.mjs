// Pase de concepto con Nano Banana (API de Gemini): manda una hoja base y un prompt, guarda la imagen.
//
//   node scripts/sprites/concept/generate.mjs --list                      modelos de imagen disponibles con tu clave
//   node scripts/sprites/concept/generate.mjs <salida.png> --ref <base.png> [--ref <otra.png>] --prompt <prompt.txt>
//        [--model gemini-nano-banana-2.1] [--size 2K] [--ratio 16:9]
//
// La clave NO va en el repo ni en la línea de comandos: se lee de la variable de entorno
// GEMINI_API_KEY o de un archivo .env.local en la raíz (ignorado por git) con una línea
// GEMINI_API_KEY=…
import fs from 'fs';

function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (fs.existsSync('.env.local')) {
    const m = fs.readFileSync('.env.local', 'utf8').match(/^\s*GEMINI_API_KEY\s*=\s*"?([^"\r\n]+)"?\s*$/m);
    if (m) return m[1].trim();
  }
  console.error('Falta la clave: define GEMINI_API_KEY o crea .env.local con GEMINI_API_KEY=…');
  process.exit(2);
}

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const all = (name) => args.flatMap((a, i) => (a === '--' + name ? [args[i + 1]] : []));
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const headers = { 'x-goog-api-key': apiKey(), 'Content-Type': 'application/json', 'Api-Revision': '2026-05-20' };

if (args.includes('--list')) {
  const r = await fetch(`${BASE}/models?pageSize=200`, { headers });
  const j = await r.json();
  if (!r.ok) { console.error(r.status, JSON.stringify(j).slice(0, 400)); process.exit(1); }
  for (const m of j.models ?? []) if (/image|banana/i.test(m.name + (m.displayName ?? ''))) console.log(m.name.replace('models/', ''), '—', m.displayName ?? '');
  process.exit(0);
}

const out = args[0];
const refs = all('ref');
const prompt = fs.readFileSync(opt('prompt'), 'utf8').trim();
const mime = (f) => (/\.jpe?g$/i.test(f) ? 'image/jpeg' : /\.webp$/i.test(f) ? 'image/webp' : 'image/png');
const body = {
  model: opt('model', 'gemini-nano-banana-2.1'),
  input: [{ type: 'text', text: prompt }, ...refs.map((f) => ({ type: 'image', mime_type: mime(f), data: fs.readFileSync(f).toString('base64') }))],
  response_format: { type: 'image', aspect_ratio: opt('ratio', '16:9'), image_size: opt('size', '2K') },
};

const res = await fetch(`${BASE}/interactions`, { method: 'POST', headers, body: JSON.stringify(body) });
const json = await res.json();
if (!res.ok) { console.error(res.status, JSON.stringify(json).slice(0, 600)); process.exit(1); }

/** La imagen puede venir en varios sitios según la versión de la API: se busca el primer bloque de imagen. */
function findImage(node) {
  if (!node || typeof node !== 'object') return null;
  if (typeof node.data === 'string' && node.data.length > 500 && (node.type === 'image' || node.mime_type || node.mimeType)) return node;
  for (const v of Object.values(node)) { const hit = findImage(v); if (hit) return hit; }
  return null;
}
const img = findImage(json);
if (!img) {
  fs.writeFileSync(out + '.respuesta.json', JSON.stringify(json, null, 2).slice(0, 20000));
  console.error('La respuesta no trae imagen; guardada en', out + '.respuesta.json');
  process.exit(1);
}
fs.writeFileSync(out, Buffer.from(img.data, 'base64'));
console.log('✓', out, `(${img.mime_type ?? img.mimeType ?? 'imagen'})`);
