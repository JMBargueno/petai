// Importa el fondo de arena de un minijuego generado con Nano Banana: lo recorta a 4:3, lo reduce a
// 680×520 (el doble de la arena lógica de 340×260) y lo guarda como .webp sin transparencia.
//
//   node scripts/sprites/minigames/backdrop.mjs <entrada.png> <juego> [--dim 0.15] [--focus top|center|bottom]
//        [--preview <png>]
//
// --dim oscurece el fondo (0 a 0,6) cuando compite con las piezas. --focus elige qué parte se queda
// si la imagen no es 4:3. Deja una vista previa con la zona de juego marcada en
// sprite-previews/minigames/<juego>-backdrop.preview.png. Ver pockai-minigame-architect.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : d;
};
const [input, game] = args;
if (!input || !game || input.startsWith('--') || !/^[a-z][a-z0-9_]*$/.test(game)) {
  console.error('Uso: backdrop.mjs <entrada.png> <juego> [--dim 0.15] [--focus top|center|bottom] [--preview <png>]');
  process.exit(2);
}
const balance = JSON.parse(fs.readFileSync('shared/game-data/balance.json', 'utf8'));
if (!balance.minigames?.games?.[game]) {
  console.error(`'${game}' no es un minijuego de balance.json`);
  process.exit(2);
}
const W = 680;
const H = 520;
const dim = Math.min(0.6, Math.max(0, Number(opt('dim', 0))));
const focus = { top: 'north', center: 'centre', bottom: 'south' }[opt('focus', 'center')] ?? 'centre';

let img = sharp(input).removeAlpha().resize({ width: W, height: H, fit: 'cover', position: focus, kernel: 'lanczos3' });
if (dim > 0) img = img.modulate({ brightness: 1 - dim });
const out = path.join('shared/assets/minigames', game, 'backdrop.webp');
fs.mkdirSync(path.dirname(out), { recursive: true });
await img.webp({ quality: 88, smartSubsample: true }).toFile(out);

// Vista previa: el fondo con la franja donde pisa la mascota (y = 232 de 260) marcada.
const preview = opt('preview', path.join('sprite-previews', 'minigames', `${game}-backdrop.preview.png`));
fs.mkdirSync(path.dirname(preview), { recursive: true });
const line = Buffer.from(`<svg width="${W}" height="${H}"><line x1="0" y1="464" x2="${W}" y2="464" stroke="#7cf5e6" stroke-width="2" stroke-dasharray="8 8"/></svg>`);
await sharp(out).composite([{ input: line }]).png().toFile(preview);

const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`✓ ${out} · ${W}×${H} · ${kb} KB${dim ? ` · oscurecido ${dim}` : ''} · vista previa en ${preview}`);
