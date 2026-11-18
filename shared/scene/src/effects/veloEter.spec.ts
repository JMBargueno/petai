import { describe, expect, it } from 'vitest';
import { EFFECTS, FLOW_PALETTES, GridSink, fixedDuration, flowPalette, renderFrame, veloEter } from './index';

// Un viewport de móvil en celdas nativas (×4): no es la rejilla nominal de la hoja de frames
const VW = 100;
const VH = 190;

function render(phase: string, t: number, opts: { element?: string; reduced?: boolean; elapsedMs?: number; w?: number; h?: number } = {}) {
  const sink = new GridSink(opts.w ?? VW, opts.h ?? VH);
  renderFrame(veloEter, sink, { phase, t, elapsedMs: opts.elapsedMs ?? 0 }, flowPalette(opts.element ?? 'water'), 7, opts.reduced);
  return sink;
}

describe('velo de Éter (pantalla)', () => {
  it('está registrado como efecto de pantalla con su espera', () => {
    expect(EFFECTS['velo-eter']).toBe(veloEter);
    expect(veloEter.space).toBe('screen');
    expect(veloEter.phases.map((p) => p.name)).toEqual(['cierre', 'hold', 'apertura']);
    expect(veloEter.reducedPhases.map((p) => p.name)).toEqual(['cierre', 'hold', 'apertura']);
  });

  it('es corto: menos de 1 s sin contar la espera, y más corto aún con movimiento reducido', () => {
    expect(fixedDuration(veloEter.phases)).toBeLessThanOrEqual(1000);
    expect(fixedDuration(veloEter.reducedPhases)).toBeLessThan(fixedDuration(veloEter.phases));
  });

  it('al cerrarse crece desde arriba hasta tapar TODO el viewport, sea del tamaño que sea', () => {
    expect(render('cierre', 0).count()).toBe(0);
    const mid = render('cierre', 0.5).count();
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(VW * VH);
    for (const [w, h] of [[VW, VH], [190, 100], [64, 80], [7, 3]]) {
      expect(render('cierre', 1, { w, h }).count()).toBe(w * h);
      expect(render('hold', 0, { w, h }).count()).toBe(w * h);
    }
    // Lo de arriba cae antes que lo de abajo
    const s = render('cierre', 0.4);
    let top = 0;
    let bottom = 0;
    for (let x = 0; x < VW; x++) {
      if (s.get(x, 5)) top++;
      if (s.get(x, VH - 5)) bottom++;
    }
    expect(top).toBeGreaterThan(bottom);
  });

  it('al abrirse se vacía desde el centro y al final no deja nada', () => {
    const s = render('apertura', 0.35);
    let center = 0;
    let edges = 0;
    for (let y = 0; y < VH; y++) {
      if (s.get(Math.floor(VW / 2), y)) center++;
      if (s.get(0, y)) edges++;
    }
    expect(edges).toBeGreaterThan(center);
    expect(render('apertura', 1).count()).toBe(0);
  });

  it('el hold lleva un pulso de luz que se mueve; con movimiento reducido no cambia', () => {
    expect(render('hold', 0, { elapsedMs: 600 }).cells).not.toEqual(render('hold', 0, { elapsedMs: 1200 }).cells);
    const a = render('hold', 0, { reduced: true, elapsedMs: 0 });
    const b = render('hold', 0, { reduced: true, elapsedMs: 900 });
    expect(a.cells).toEqual(b.cells);
    expect(render('cierre', 0.2, { reduced: true }).cells).toEqual(a.cells);
    const frame = { phase: 'cierre', t: 0.25, time: 0, palette: FLOW_PALETTES['fire'], seed: 1, params: {}, reduced: true };
    expect(veloEter.opacity?.(frame)).toBe(0.25);
    expect(veloEter.opacity?.({ ...frame, phase: 'apertura', t: 0.75 })).toBe(0.25);
    expect(veloEter.opacity?.({ ...frame, reduced: false })).toBe(1);
  });

  it('usa a lo sumo 12 colores por frame en todos los Flujos y siempre el vacío del Éter', () => {
    for (const el of Object.keys(FLOW_PALETTES)) {
      for (const [phase, t] of [['cierre', 0.5], ['hold', 0], ['apertura', 0.4]] as const) {
        const s = render(phase, t, { element: el, elapsedMs: 700 });
        expect(s.colors().size).toBeLessThanOrEqual(12);
      }
      expect(render('hold', 0, { element: el }).colors()).toContain(FLOW_PALETTES[el].void0);
    }
  });
});
