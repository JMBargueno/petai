import { describe, expect, it } from 'vitest';
import { FLOW_PALETTES, GridSink } from '@pockai/scene/effects';
import { CLOCK_H, CLOCK_W, drawClock } from './clockArt';

function draw(progress: number, opts: { paused?: boolean; phase?: 'work' | 'break'; element?: string } = {}) {
  const sink = new GridSink(CLOCK_W, CLOCK_H);
  drawClock(sink, { palette: FLOW_PALETTES[opts.element ?? 'fire'], progress, phase: opts.phase ?? 'work', paused: !!opts.paused, seed: 3 });
  return sink;
}

describe('reloj del Éter', () => {
  it('cabe en su rejilla con pocos colores en todos los Flujos', () => {
    for (const el of Object.keys(FLOW_PALETTES)) {
      const s = draw(0.4, { element: el });
      expect(s.count()).toBeGreaterThan(600);
      expect(s.colors().size).toBeLessThanOrEqual(12);
    }
  });

  it('el anillo se enciende con el progreso, y en pausa se apaga a un tono medio', () => {
    const fire = FLOW_PALETTES['fire'];
    const lit = (s: GridSink, c: string) => s.cells.filter((x) => x === c).length;
    expect(lit(draw(0.8), fire.light)).toBeGreaterThan(lit(draw(0.1), fire.light));
    expect(draw(0.5, { paused: true }).cells).not.toEqual(draw(0.5).cells);
    expect(draw(0.5, { phase: 'break' }).colors()).toContain(fire.glow);
  });
});
