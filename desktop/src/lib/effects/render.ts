import type { EffectDef, FxFrame, FxPalette, PixelSink } from './types';
import { quantize } from './timeline';

/** Rejilla en memoria (para tests y para la hoja de frames en Node). `null` = transparente. */
export class GridSink implements PixelSink {
  readonly cells: (string | null)[];
  constructor(readonly width: number, readonly height: number) {
    this.cells = new Array(width * height).fill(null);
  }
  set(x: number, y: number, color: string): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.cells[y * this.width + x] = color;
  }
  get(x: number, y: number): string | null {
    return this.cells[y * this.width + x] ?? null;
  }
  count(): number {
    return this.cells.reduce((n, c) => n + (c ? 1 : 0), 0);
  }
  colors(): Set<string> {
    return new Set(this.cells.filter((c): c is string => !!c));
  }
}

/** Pinta en un canvas 2D a escala entera (un `fillRect` por píxel nativo). */
export class CanvasSink implements PixelSink {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    readonly width: number,
    readonly height: number,
    private readonly scale: number,
  ) {}
  set(x: number, y: number, color: string): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x * this.scale, y * this.scale, this.scale, this.scale);
  }
}

/**
 * Construye el frame y lo dibuja en `sink`. El tiempo libre (remolino, flujo de la trenza) se
 * cuantiza a la cadencia del efecto; quien anima debe además consultar el reproductor con un
 * `now` cuantizado (ver EffectLayer) para que también el progreso de fase vaya a saltos.
 */
export function renderFrame(
  def: EffectDef,
  sink: PixelSink,
  state: { phase: string; t: number; elapsedMs: number },
  palette: FxPalette,
  seed: number,
  reduced = false,
): FxFrame {
  const frame: FxFrame = {
    phase: state.phase,
    t: Math.max(0, Math.min(1, state.t)),
    time: quantize(state.elapsedMs, def.fps),
    palette,
    seed,
    reduced,
  };
  def.draw(sink, frame);
  return frame;
}
