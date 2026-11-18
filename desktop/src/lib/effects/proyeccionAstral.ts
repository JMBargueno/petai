import type { EffectDef, FxFrame, PixelSink } from './types';
import { Canvas2, easeIn, easeOut, hash } from './fxMath';

/**
 * Proyección astral: el resultado de la arena (LORE §7: en el Coliseo de Resonancia combate una
 * proyección astral del Pockai, su Avatar; la Sombra Guardiana defiende su puesto).
 *
 * La proyección —una silueta translúcida, tramada en los tonos del Flujo— vuelve volando desde el
 * Coliseo y se funde con la mascota. `params.outcome`: `won` estalla en estrella, `lost` llega rota
 * en franjas de interferencia (y PetView suma el golpe), `draw` deja dos medias lunas.
 *
 * Rejilla 64×80 ×2; pies en la fila 76. Va DETRÁS de la mascota.
 */

const W = 64;
const H = 80;
const CX = 32;
const FEET = 76;
const BODY = { x: CX, y: 52 };

/** Silueta genérica de Pockai (cuerpo, orejas y cola), tramada para que se lea translúcida. */
function paintGhost(c: Canvas2, f: FxFrame, cx: number, cy: number, scale: number, glitch: number) {
  const { palette } = f;
  const rx = 11 * scale;
  const ry = 10 * scale;
  for (let y = Math.floor(cy - ry - 5 * scale); y <= cy + ry; y++) {
    // Interferencia: las filas se desplazan a trozos
    const shift = glitch > 0 && hash(y >> 1, Math.floor(f.time / 83), f.seed) < glitch ? (hash(y, 3, f.seed) < 0.5 ? -3 : 3) : 0;
    for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const body = dx * dx + dy * dy <= 1;
      const ear = y < cy - ry * 0.6 && (Math.abs(x + 0.5 - (cx - rx * 0.55)) < 2 * scale || Math.abs(x + 0.5 - (cx + rx * 0.55)) < 2 * scale) && y > cy - ry - 5 * scale;
      if (!body && !ear) continue;
      if ((x + y) % 2 === 0) continue; // trama: deja ver lo de detrás
      const edge = dx * dx + dy * dy > 0.7;
      c.set(x + shift, y, edge ? palette.light : palette.deep);
    }
  }
  // Ojos de luz
  c.set(cx - rx * 0.35, cy - ry * 0.2, palette.glow);
  c.set(cx + rx * 0.35, cy - ry * 0.2, palette.glow);
}

function draw(sink: PixelSink, f: FxFrame): void {
  const c = new Canvas2(W, H);
  const outcome = String(f.params.outcome ?? 'won');
  const lost = outcome === 'lost';
  const from = hash(1, 1, f.seed) < 0.5 ? -1 : 1;

  if (f.reduced) {
    paintGhost(c, f, BODY.x, BODY.y, 1, 0);
    c.flush(sink, f.palette.outline);
    return;
  }

  switch (f.phase) {
    case 'approach': {
      // Llega en curva desde arriba, de un lado, dejando estela
      const e = easeOut(f.t);
      for (let k = 3; k >= 0; k--) {
        const tt = Math.max(0, e - k * 0.06);
        const x = BODY.x + from * (30 - tt * 30);
        const y = 12 + tt * (BODY.y - 12) - Math.sin(tt * Math.PI) * 6;
        if (k === 0) paintGhost(c, f, x, y, 0.6 + tt * 0.4, lost ? 0.5 : 0);
        else c.set(x, y, k === 1 ? f.palette.light : f.palette.mid);
      }
      break;
    }
    case 'merge': {
      // Se encoge hasta fundirse con la mascota; un anillo marca el regreso
      const s = 1 - easeIn(f.t) * 0.8;
      paintGhost(c, f, BODY.x, BODY.y, s, lost ? 0.6 : 0);
      const r = 6 + easeOut(f.t) * 16;
      for (let a = 0; a < Math.PI * 2; a += 0.08) c.set(BODY.x - 0.5 + Math.cos(a) * r, BODY.y + Math.sin(a) * r * 0.9, f.t > 0.6 ? f.palette.mid : f.palette.light);
      break;
    }
    case 'result': {
      if (outcome === 'won') {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
          const len = 4 + easeOut(f.t) * 14;
          for (let i = 0; i < len; i++) {
            if (i < easeOut(f.t) * 6) continue;
            c.set(BODY.x - 0.5 + Math.cos(a) * i, BODY.y + Math.sin(a) * i, i > len - 2 ? f.palette.glow : f.palette.light);
          }
        }
      } else if (lost) {
        // Restos de la proyección rota: franjas que caen
        for (let k = 0; k < 7; k++) {
          const y = BODY.y - 12 + k * 4 + easeIn(f.t) * 10;
          const x0 = BODY.x - 10 + hash(k, 2, f.seed) * 6 + (k % 2 ? 3 : -3);
          if (hash(k, 4, f.seed) < f.t) continue;
          for (let i = 0; i < 6; i++) c.set(x0 + i, y, i % 2 ? f.palette.deep : f.palette.mid);
        }
      } else {
        // Empate: dos medias lunas que se separan
        const off = 6 + easeOut(f.t) * 10;
        for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.12) {
          c.set(BODY.x - 0.5 + off + Math.cos(a) * 6, BODY.y + Math.sin(a) * 8, f.palette.light);
          c.set(BODY.x - 0.5 - off - Math.cos(a) * 6, BODY.y + Math.sin(a) * 8, f.palette.light);
        }
      }
      break;
    }
    case 'fade':
      for (let k = 0; k < 8; k++) {
        if (hash(k, 6, f.seed) < f.t) continue;
        c.set(BODY.x - 14 + hash(k, 7, f.seed) * 28, BODY.y - 16 + hash(k, 8, f.seed) * 24 - f.t * 6, f.palette.light);
      }
      break;
  }
  c.flush(sink, f.palette.outline);
}

export const proyeccionAstral: EffectDef = {
  id: 'proyeccion-astral',
  lore: 'La proyección astral que combatió en el Coliseo de Resonancia vuelve y se funde con el Pockai (LORE §7).',
  width: W,
  height: H,
  scale: 2,
  anchor: { x: CX, y: FEET },
  points: { body: BODY },
  layer: 'behind',
  priority: 2,
  phases: [
    { name: 'approach', ms: 600 },
    { name: 'merge', ms: 380 },
    { name: 'result', ms: 520 },
    { name: 'fade', ms: 300 },
  ],
  reducedPhases: [
    { name: 'approach', ms: 0 },
    { name: 'merge', ms: 600 },
    { name: 'result', ms: 0 },
    { name: 'fade', ms: 200 },
  ],
  fps: 12,
  draw,
  opacity(f) {
    if (!f.reduced) return 1;
    if (f.phase === 'fade') return 1 - f.t;
    return 1;
  },
};
