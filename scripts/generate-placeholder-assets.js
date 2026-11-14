// Generador de assets raster y metadatos estándar para PetAI
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Función para crear un PNG válido en Node.js puro usando zlib
function createPngBuffer(width, height, pixelFn) {
  // Cada scanline comienza con un byte de filtro (0 = None)
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r & 0xff;
      rawData[pxOffset + 1] = g & 0xff;
      rawData[pxOffset + 2] = b & 0xff;
      rawData[pxOffset + 3] = a & 0xff;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // Helper CRC32 para chunks PNG
  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const checksum = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(checksum, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // PNG Signature: 89 50 4E 47 0D 0A 1A 0A
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: 6 (RGBA)
  ihdr[10] = 0; // Compression: 0
  ihdr[11] = 0; // Filter: 0
  ihdr[12] = 0; // Interlace: 0

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const sharedDir = path.resolve(__dirname, '..', 'shared', 'assets');
const patternsDir = path.join(sharedDir, 'patterns');
const speciesDir = path.join(sharedDir, 'species');

if (!fs.existsSync(patternsDir)) fs.mkdirSync(patternsDir, { recursive: true });
if (!fs.existsSync(speciesDir)) fs.mkdirSync(speciesDir, { recursive: true });

// --- 1. Generar Patrones Tileables (256x256 px, Blanco con Alfa) ---
const PATTERNS = {
  stripes: (x, y) => {
    // Rayas diagonales a 45 grados (período 32 px)
    const val = (x + y) % 32;
    const isStripe = val < 14;
    return isStripe ? [255, 255, 255, 210] : [0, 0, 0, 0];
  },
  spots: (x, y) => {
    // Lunares / manchas distribuidas
    const cellX = x % 64 - 32;
    const cellY = y % 64 - 32;
    const dist = Math.sqrt(cellX * cellX + cellY * cellY);
    return dist < 16 ? [255, 255, 255, 220] : [0, 0, 0, 0];
  },
  scales: (x, y) => {
    // Escamas imbricadas
    const row = Math.floor(y / 24);
    const offsetX = (row % 2) * 16;
    const cx = (x + offsetX) % 32 - 16;
    const cy = y % 24 - 12;
    const d = Math.sqrt(cx * cx + cy * cy);
    const isEdge = d >= 11 && d <= 15;
    return isEdge ? [255, 255, 255, 230] : [0, 0, 0, 0];
  },
  crystal: (x, y) => {
    // Facetas triangulares de cristal
    const gx = x % 32;
    const gy = y % 32;
    const isLine = gx === gy || (32 - gx) === gy || gx === 0 || gy === 0;
    return isLine ? [255, 255, 255, 240] : [0, 0, 0, 0];
  },
  galaxy: (x, y) => {
    // Polvo estelar y cúmulo cósmico
    const hash = ((x * 127 + y * 311 + (x ^ y)) % 100);
    if (hash > 93) return [255, 255, 255, 255]; // estrellas brillantes
    if (hash > 80) return [255, 255, 255, 120]; // brillo tenue
    return [0, 0, 0, 0];
  },
  gradient: (x, y, w, h) => {
    // Degradado vertical suave
    const alpha = Math.floor((y / h) * 200);
    return [255, 255, 255, alpha];
  },
  aurora: (x, y) => {
    // Ondulaciones luminosas
    const wave = Math.sin((x / 256) * Math.PI * 4 + (y / 64)) * 0.5 + 0.5;
    return [255, 255, 255, Math.floor(wave * 190)];
  }
};

for (const [name, fn] of Object.entries(PATTERNS)) {
  const filePath = path.join(patternsDir, `${name}.png`);
  const buf = createPngBuffer(256, 256, fn);
  fs.writeFileSync(filePath, buf);
  console.log(`✓ Patrón generado: patterns/${name}.png`);
}

// --- 2. Generar Sprite Sheets (22 frames = 2816 x 128 px) y anim.json ---
const FRAME_COUNT = 22;
const FRAME_W = 128;
const FRAME_H = 128;
const SHEET_W = FRAME_COUNT * FRAME_W;
const SHEET_H = FRAME_H;

// Catálogo de animaciones con sus rangos de frames en el sheet horizontal
const ANIM_TAGS = [
  { name: 'idle', from: 0, to: 3, loop: true },
  { name: 'walk', from: 4, to: 7, loop: true },
  { name: 'eat', from: 8, to: 11, loop: false },
  { name: 'happy', from: 12, to: 15, loop: false },
  { name: 'sleep', from: 16, to: 17, loop: true },
  { name: 'attack', from: 18, to: 21, loop: false }
];

function generateAnimJson(speciesId) {
  const frames = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    frames.push({
      filename: `${speciesId}_${i}.png`,
      frame: { x: i * FRAME_W, y: 0, w: FRAME_W, h: FRAME_H },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: FRAME_W, h: FRAME_H },
      sourceSize: { w: FRAME_W, h: FRAME_H },
      duration: 150
    });
  }

  return {
    frames,
    meta: {
      app: 'PetAI Asset Standard',
      version: '1.0',
      image: 'base.png',
      format: 'RGBA8888',
      size: { w: SHEET_W, h: SHEET_H },
      scale: '1',
      frameTags: ANIM_TAGS.map(t => ({
        name: t.name,
        from: t.from,
        to: t.to,
        direction: 'forward'
      }))
    }
  };
}

const SPECIES_LIST = ['ignisaur', 'axolunar', 'florabud'];

for (const speciesId of SPECIES_LIST) {
  const targetDir = path.join(speciesDir, speciesId);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  // 1. anim.json
  const animJson = generateAnimJson(speciesId);
  fs.writeFileSync(path.join(targetDir, 'anim.json'), JSON.stringify(animJson, null, 2), 'utf8');

  // 2. base.png (Líneas negras, ojos, boca y sombreado neutro gris en Multiply)
  const baseBuf = createPngBuffer(SHEET_W, SHEET_H, (x, y) => {
    const frameIdx = Math.floor(x / FRAME_W);
    const fx = x % FRAME_W;
    const fy = y;

    // Centro del personaje con animación sutil por frame
    const bob = Math.sin(frameIdx * 0.8) * 3;
    const cx = 64;
    const cy = 68 + bob;

    // Cuerpo elíptico (radio X: 38, radio Y: 32)
    const dx = (fx - cx) / 38;
    const dy = (fy - cy) / 32;
    const distSq = dx * dx + dy * dy;

    // Ojos (izquierdo y derecho)
    const eyeY = cy - 8;
    const isEyeL = Math.hypot(fx - (cx - 14), fy - eyeY) < 5;
    const isEyeR = Math.hypot(fx - (cx + 14), fy - eyeY) < 5;
    const isPupilWhiteL = Math.hypot(fx - (cx - 15), fy - (eyeY - 2)) < 2;
    const isPupilWhiteR = Math.hypot(fx - (cx + 13), fy - (eyeY - 2)) < 2;

    // Boca
    const isMouth = fy > (cy + 4) && fy < (cy + 7) && Math.abs(fx - cx) < 6;

    // Si está fuera de la silueta
    if (distSq > 1.0) {
      // Fuera del cuerpo: transparente
      return [0, 0, 0, 0];
    }

    // Borde negro exterior (lineart de 3 px)
    if (distSq > 0.82) {
      return [20, 20, 20, 255]; // Contorno oscuro
    }

    // Reflejo pupila blanca
    if (isPupilWhiteL || isPupilWhiteR) {
      return [255, 255, 255, 255];
    }

    // Ojo negro
    if (isEyeL || isEyeR || isMouth) {
      return [15, 15, 15, 255];
    }

    // Sombra inferior neutra en escala de grises (actúa como Multiply)
    if (dy > 0.3) {
      const shadeFactor = Math.min(220, Math.floor(180 + (1 - dy) * 75));
      return [shadeFactor, shadeFactor, shadeFactor, 255];
    }

    // Zona plana iluminada neutral
    return [255, 255, 255, 255];
  });
  fs.writeFileSync(path.join(targetDir, 'base.png'), baseBuf);

  // 3. mask.png (Canal R: Primario, G: Secundario, B: Patrón, A: Silueta)
  const maskBuf = createPngBuffer(SHEET_W, SHEET_H, (x, y) => {
    const frameIdx = Math.floor(x / FRAME_W);
    const fx = x % FRAME_W;
    const fy = y;

    const bob = Math.sin(frameIdx * 0.8) * 3;
    const cx = 64;
    const cy = 68 + bob;

    const dx = (fx - cx) / 38;
    const dy = (fy - cy) / 32;
    const distSq = dx * dx + dy * dy;

    if (distSq > 0.88) {
      // Fuera de la silueta
      return [0, 0, 0, 0];
    }

    // Canal A: 255 (silueta sólida)
    const a = 255;

    // Canal G: Secundario (vientre inferior central)
    const isBelly = (dy > 0.1 && Math.abs(dx) < 0.55);
    const g = isBelly ? 255 : 0;

    // Canal R: Primario (donde no es vientre)
    const r = isBelly ? 0 : 255;

    // Canal B: Proyección del Patrón (en el lomo superior, respetando vientre y cara central)
    const isFace = (Math.abs(dx) < 0.45 && dy < 0.1 && dy > -0.5);
    const b = (!isBelly && !isFace && dy < 0.4) ? 255 : 0;

    return [r, g, b, a];
  });
  fs.writeFileSync(path.join(targetDir, 'mask.png'), maskBuf);

  console.log(`✓ Especie generada: species/${speciesId}/ (base.png, mask.png, anim.json)`);
}

console.log('\n--- Generación de assets de placeholder completada exitosamente ---');
