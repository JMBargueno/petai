// Hoja base de UNA etapa para el pase de concepto: las 10 poses clave en 2 filas de 5, a ×4,
// centradas en un lienzo 16:9. Sale de la hoja de contactos del generador.
//   node scripts/sprites/concept/base-sheet.mjs <id> <etapa 0-3>
import sharp from 'sharp';

const [id, stageArg] = process.argv.slice(2);
const stage = Number(stageArg);
const CELL = 256; // la hoja de contactos va a ×4 (64 px nativos → 256)
const sheet = sharp(`sprite-previews/${id}-pixel-contact.png`);
const cells = [];
for (let i = 0; i < 10; i++) {
  cells.push({
    input: await sheet.clone().extract({ left: i * CELL, top: stage * CELL, width: CELL, height: CELL }).png().toBuffer(),
    left: 160 + (i % 5) * CELL,
    top: 104 + Math.floor(i / 5) * CELL,
  });
}
const out = `sprite-previews/nano/${id}-${['baby', 'juvenile', 'adult', 'final'][stage]}-base.png`;
await sharp({ create: { width: 1600, height: 720, channels: 3, background: { r: 242, g: 241, b: 248 } } }).composite(cells).png().toFile(out);
console.log('✓', out);
