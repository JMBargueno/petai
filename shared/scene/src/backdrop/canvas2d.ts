/**
 * Pintor Canvas 2D de los fondos por capas: ligero, sin Pixi ni WebGL. Lo usan los fondos animados
 * de Arena, Raid, Torneo, Entrenamiento y Cocina (un banner decorativo no merece un contexto WebGL
 * por pestaña). Mismo catálogo y mismas imágenes que la escena de la aventura.
 *
 * Un solo bucle por lienzo, a ~30 fps, que se detiene cuando el lienzo no se ve. Con movimiento
 * reducido se pinta un único fotograma.
 */
import { localMinute, skyAt } from '../ambience/sunClock';
import { layerUrl } from './layerUrls';
import { FLOW_GLOW, SLOTS, layerMargin, layerOffset, lifeParticles, particleAt, silhouette, type Composition, type LayerDef, type Prim } from './model';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Traza una lista de primitivas en el rectángulo (x, y, w, h) de un contexto 2D. */
export function paintPrims(ctx: CanvasRenderingContext2D, prims: Prim[], x: number, y: number, w: number, h: number): void {
  for (const p of prims) {
    ctx.globalAlpha = p.alpha ?? 1;
    if (p.k === 'rect') {
      ctx.fillStyle = p.fill;
      ctx.fillRect(x + p.x * w, y + p.y * h, p.w * w, p.h * h);
    } else if (p.k === 'circle') {
      ctx.fillStyle = p.fill;
      ctx.beginPath();
      ctx.arc(x + p.x * w, y + p.y * h, p.r * h, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      for (let i = 0; i < p.pts.length; i += 2) {
        const px = x + p.pts[i] * w;
        const py = y + p.pts[i + 1] * h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      if (p.k === 'poly') {
        ctx.closePath();
        ctx.fillStyle = p.fill;
        ctx.fill();
      } else {
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = Math.max(1, p.width * h);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

export interface BackdropOptions {
  reducedMotion?: boolean;
  /** Posición de la cámara (0-1). Por defecto 0,5: centrada. */
  travel?: number;
  /** Recorta las partículas (0-1). Por defecto 1. */
  lifeBudget?: number;
  /** Minuto del día forzado (pruebas); por defecto, el reloj del dispositivo. */
  clock?: number | null;
}

export interface BackdropHandle {
  /** Cambia de escenario sin recrear el lienzo. */
  set(comp: Composition): void;
  /** Vuelve a pintar (p. ej. tras cambiar el tamaño del lienzo). */
  redraw(): void;
  destroy(): void;
}

interface LayerArt {
  layer: LayerDef;
  /** Imagen pintada, si existe y ya cargó. */
  image: HTMLImageElement | null;
  /** Silueta procedural rasterizada una vez por tamaño. */
  raster: HTMLCanvasElement | null;
}

const FRAME_MS = 1000 / 30;
/** Qué parte del alto sobrante se recorta por arriba (1 = todo: anclado abajo). */
const BANNER_ANCHOR = 0.62;

/**
 * Monta un fondo por capas en un `<canvas>`. El lienzo toma el tamaño CSS de su caja (con la
 * densidad de píxeles del dispositivo, tope 2).
 */
export function mountBackdrop(canvas: HTMLCanvasElement, comp: Composition, opts: BackdropOptions = {}): BackdropHandle {
  const ctx = canvas.getContext('2d');
  const reduced = opts.reducedMotion ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let current = comp;
  let art: LayerArt[] = [];
  let particles = lifeParticles(current, opts.lifeBudget);
  let w = 0;
  let h = 0;
  let raf = 0;
  let last = 0;
  let visible = true;
  let dead = false;
  const start = performance.now();

  const load = () => {
    art = SLOTS.map((slot) => {
      const layer = current.layers[slot];
      const entry: LayerArt = { layer, image: null, raster: null };
      const url = layerUrl(layer.id);
      if (url) {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          if (dead) return;
          entry.image = img;
          if (reduced || !raf) draw(performance.now());
        };
        img.src = url;
      }
      return entry;
    });
    particles = lifeParticles(current, opts.lifeBudget);
  };

  const measure = (): boolean => {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const cw = Math.round(canvas.clientWidth * dpr);
    const ch = Math.round(canvas.clientHeight * dpr);
    if (cw === w && ch === h) return false;
    w = cw;
    h = ch;
    canvas.width = w;
    canvas.height = h;
    for (const a of art) a.raster = null;
    return true;
  };

  /** Rectángulo de una capa: el lienzo más el margen que necesita para moverse sin enseñar el borde. */
  const rectOf = (layer: LayerDef) => {
    const m = layerMargin(layer);
    return { x: -m.x * w, y: -m.y * h, w: w * (1 + m.x * 2), h: h * (1 + m.y * 2) };
  };

  const rasterOf = (a: LayerArt): HTMLCanvasElement => {
    if (a.raster) return a.raster;
    const r = rectOf(a.layer);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(r.w));
    c.height = Math.max(1, Math.round(r.h));
    const cctx = c.getContext('2d');
    if (cctx) paintPrims(cctx, silhouette(a.layer, r.w / r.h), 0, 0, c.width, c.height);
    a.raster = c;
    return c;
  };

  function draw(now: number): void {
    if (!ctx || dead) return;
    measure();
    if (!w || !h) return;
    const t = (now - start) / 1000;
    const travel = opts.travel ?? 0.5;

    // Cielo de la hora real, como el de las salas
    const sky = skyAt(opts.clock ?? localMinute());
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, hex(sky.skyTop));
    grad.addColorStop(1, hex(sky.skyBottom));
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const glow = FLOW_GLOW[current.flow];
    art.forEach((a, i) => {
      const r = rectOf(a.layer);
      const off = layerOffset(a.layer, t, travel, reduced);
      const x = r.x + off.x * w;
      const y = r.y + off.y * h;
      if (a.image) {
        // Encaje «cover». En un lienzo muy apaisado (los banners) sobra alto: se recorta más de arriba
        // que de abajo, pero no todo, para que se vea el motivo del plano medio y no solo el suelo.
        // Todas las capas usan la misma regla, así que siguen casando entre sí.
        const s = Math.max(r.w / a.image.naturalWidth, r.h / a.image.naturalHeight);
        const iw = a.image.naturalWidth * s;
        const ih = a.image.naturalHeight * s;
        ctx.drawImage(a.image, x + (r.w - iw) / 2, y + (r.h - ih) * BANNER_ANCHOR, iw, ih);
      } else {
        ctx.drawImage(rasterOf(a), x, y);
      }
      // Tras el suelo (l2) y antes del primer plano: la luz de la hora y las partículas
      if (i === 2) {
        if (sky.tintAlpha > 0.005) {
          ctx.globalAlpha = sky.tintAlpha;
          ctx.fillStyle = hex(sky.tint);
          ctx.fillRect(0, 0, w, h);
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = glow;
        for (const p of particles) {
          const f = particleAt(p, current.life, t, reduced);
          if (f.alpha <= 0.01) continue;
          ctx.globalAlpha = f.alpha;
          ctx.beginPath();
          ctx.arc(f.x * w, f.y * h, Math.max(1, f.r * h), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    });
  }

  const loop = (now: number) => {
    raf = 0;
    if (dead || !visible) return;
    if (now - last >= FRAME_MS) {
      last = now;
      draw(now);
    }
    raf = requestAnimationFrame(loop);
  };
  const run = () => {
    if (dead) return;
    if (reduced) draw(performance.now());
    else if (!raf && visible) raf = requestAnimationFrame(loop);
  };

  const io =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
          visible = entries.some((e) => e.isIntersecting) && document.visibilityState !== 'hidden';
          run();
        })
      : null;
  io?.observe(canvas);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => draw(performance.now())) : null;
  ro?.observe(canvas);
  const onVisibility = () => {
    visible = document.visibilityState !== 'hidden';
    run();
  };
  document.addEventListener('visibilitychange', onVisibility);

  load();
  draw(performance.now());
  run();

  return {
    set(next) {
      current = next;
      load();
      draw(performance.now());
    },
    redraw() {
      draw(performance.now());
    },
    destroy() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      ro?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
