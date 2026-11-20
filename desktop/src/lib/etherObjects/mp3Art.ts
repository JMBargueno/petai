import { Canvas2, hash, type FxPalette, type PixelSink } from '@pockai/scene/effects';

/**
 * Reproductor MP3 del Éter (spec 42) en pixel art: un reproductor de bolsillo con pantalla, rueda
 * de control y unos auriculares enganchados arriba. La pantalla es una ventana al vacío del Éter;
 * mientras suena, un ecualizador de cinco barras (las cinco capas de ambiente) baila con `beat`.
 * Se tiñe con el Flujo del Pockai, como el reloj del pomodoro.
 *
 * Rejilla 36×50 (concepto frontal de Nano Banana, pasado a mano), se pinta ×2.
 */
export const MP3_W = 36;
export const MP3_H = 50;
export const MP3_SCALE = 2;

const BODY = { x: 5, y: 12, w: 26, h: 37 };
const SCREEN = { x: 9, y: 16, w: 18, h: 13 };
const WHEEL = { cx: 18, cy: 39, r: 7, rIn: 2.6 };

export interface Mp3Look {
  palette: FxPalette;
  playing: boolean;
  /** Paso de la animación del ecualizador (sube cada ~150 ms mientras suena). */
  beat: number;
  /** Barras encendidas en el ecualizador: el tema más las capas (0–5). */
  bars: number;
  seed: number;
}

export function drawMp3(sink: PixelSink, look: Mp3Look): void {
  const p = look.palette;
  const c = new Canvas2(MP3_W, MP3_H);

  // Auriculares (concepto de Nano Banana): diadema en arco por detrás, por encima del reproductor
  for (let t = 0; t <= 64; t++) {
    const ang = Math.PI + (t / 64) * Math.PI;
    const x = Math.round(17.5 + Math.cos(ang) * 13.5);
    const y = Math.round(15 + Math.sin(ang) * 12);
    c.set(x, y, Math.abs(x - 17.5) < 5 ? p.light : p.mid);
    c.set(x, y + 1, p.deep);
  }

  // Cuerpo redondeado con brillo en el canto izquierdo
  const { x: bx, y: by, w: bw, h: bh } = BODY;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const corner = (x < 2 || x > bw - 3) && (y < 2 || y > bh - 3);
      if (corner && (x === 0 || x === bw - 1) && (y === 0 || y === bh - 1)) continue;
      const edge = x === 0 || y === 0 || x === bw - 1 || y === bh - 1;
      c.set(bx + x, by + y, edge ? p.deep : x < 3 ? p.light : x > bw - 4 ? p.deep : p.mid);
    }
  }

  // Almohadillas a los lados del cuerpo, encendidas mientras suena
  for (const ex of [4, 31]) {
    for (let y = -4; y <= 4; y++) {
      for (let x = -2; x <= 2; x++) {
        if (x * x * 1.6 + y * y * 0.9 > 15) continue;
        const outer = ex < 18 ? x < 0 : x > 0;
        c.set(ex + x, 17 + y, outer ? p.deep : look.playing ? p.glow : p.mid);
      }
    }
  }

  // Pantalla: vacío del Éter, con el ecualizador si suena o una nota dormida si no
  const s = SCREEN;
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const frame = x === 0 || y === 0 || x === s.w - 1 || y === s.h - 1;
      c.set(s.x + x, s.y + y, frame ? p.outline : hash(x + 7, y + 3, look.seed) < 0.06 ? p.void1 : p.void0);
    }
  }
  if (look.playing) {
    const bars = Math.max(1, Math.min(5, look.bars));
    for (let i = 0; i < 5; i++) {
      const on = i < bars;
      const h = on ? 2 + Math.floor(hash(i * 13 + 1, look.beat, look.seed) * (s.h - 4)) : 1;
      for (let k = 0; k < h; k++) {
        const top = k === h - 1;
        c.set(s.x + 2 + i * 3, s.y + s.h - 2 - k, on ? (top ? p.glow : p.light) : p.deep);
        c.set(s.x + 3 + i * 3, s.y + s.h - 2 - k, on ? (top ? p.glow : p.light) : p.deep);
      }
    }
  } else {
    // Corchea apagada en el centro de la pantalla
    const nx = s.x + 8;
    const ny = s.y + 4;
    for (let y = 0; y < 5; y++) c.set(nx + 2, ny + y, p.mid);
    c.set(nx + 3, ny, p.mid);
    c.set(nx + 4, ny + 1, p.mid);
    for (const [x, y] of [[0, 5], [1, 5], [0, 6], [1, 6], [2, 5]]) c.set(nx + x, ny + y, p.mid);
  }

  // Rueda de control con su botón central (encendido si suena)
  for (let y = -WHEEL.r; y <= WHEEL.r; y++) {
    for (let x = -WHEEL.r; x <= WHEEL.r; x++) {
      const d = Math.hypot(x, y);
      if (d > WHEEL.r + 0.3) continue;
      let color = d > WHEEL.r - 1 ? p.deep : x + y < -3 ? p.light : p.mid;
      if (d <= WHEEL.rIn) color = look.playing ? p.glow : p.deep;
      c.set(WHEEL.cx + x, WHEEL.cy + y, color);
    }
  }
  // Marcas de la rueda: siguiente (derecha), anterior (izquierda), menú (arriba), play (abajo)
  c.set(WHEEL.cx + 5, WHEEL.cy, p.outline);
  c.set(WHEEL.cx - 5, WHEEL.cy, p.outline);
  c.set(WHEEL.cx, WHEEL.cy - 5, p.outline);
  c.set(WHEEL.cx, WHEEL.cy + 5, p.outline);

  c.flush(sink, p.outline);
}

/** Centro de la pantalla en px del lienzo (por si se pinta algo en DOM encima). */
export const MP3_SCREEN = { x: (SCREEN.x + SCREEN.w / 2) * MP3_SCALE, y: (SCREEN.y + SCREEN.h / 2) * MP3_SCALE };
