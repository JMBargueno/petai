import { describe, expect, it } from 'vitest';
import { EFFECTS, FLOW_PALETTES, GridSink, fixedDuration, flowPalette, portalNexo, renderFrame } from './index';

function render(phase: string, t: number, opts: { element?: string; reduced?: boolean; elapsedMs?: number } = {}) {
  const sink = new GridSink(portalNexo.width, portalNexo.height);
  renderFrame(portalNexo, sink, { phase, t, elapsedMs: opts.elapsedMs ?? 0 }, flowPalette(opts.element ?? 'fire'), 7, opts.reduced);
  return sink;
}

describe('portal de hebras del Nexo', () => {
  it('está registrado y su anclaje cae dentro de la rejilla', () => {
    expect(EFFECTS['portal-nexo']).toBe(portalNexo);
    expect(portalNexo.anchor.y).toBeLessThan(portalNexo.height);
    expect(portalNexo.points.mouth.y).toBeLessThan(portalNexo.anchor.y);
  });

  it('dura como mucho 2,5 s sin contar la espera', () => {
    expect(fixedDuration(portalNexo.phases)).toBeLessThanOrEqual(2500);
    expect(fixedDuration(portalNexo.reducedPhases)).toBeLessThan(fixedDuration(portalNexo.phases));
  });

  it('crece al aparecer y se vacía al deshilacharse', () => {
    const early = render('appear', 0.2).count();
    const full = render('appear', 1).count();
    expect(full).toBeGreaterThan(early);
    expect(render('vanish', 1).count()).toBeLessThan(full * 0.1);
  });

  it('abierto, la boca muestra el vacío del Éter y no la trama', () => {
    const hold = render('hold', 0);
    const { x, y } = portalNexo.points.mouth;
    expect([FLOW_PALETTES['fire'].glow, FLOW_PALETTES['fire'].light]).toContain(hold.get(x, y));
    expect(hold.colors()).toContain(FLOW_PALETTES['fire'].void0);
  });

  it('cerrado del todo, la boca vuelve a ser transparente', () => {
    const { x, y } = portalNexo.points.mouth;
    expect(render('close', 1).get(x, y)).toBeNull();
  });

  it('usa a lo sumo 12 colores por frame en todos los Flujos', () => {
    for (const el of Object.keys(FLOW_PALETTES)) {
      for (const [phase, t] of [['appear', 0.6], ['open', 0.7], ['hold', 0], ['close', 0.3], ['vanish', 0.4]] as const) {
        expect(render(phase, t, { element: el }).colors().size).toBeLessThanOrEqual(12);
      }
    }
  });

  it('con movimiento reducido el dibujo no cambia con el tiempo', () => {
    const a = render('hold', 0, { reduced: true, elapsedMs: 0 });
    const b = render('hold', 0, { reduced: true, elapsedMs: 900 });
    expect(a.cells).toEqual(b.cells);
    expect(portalNexo.opacity?.({ phase: 'appear', t: 0.5, time: 0, palette: FLOW_PALETTES['fire'], seed: 1, params: {}, reduced: true })).toBe(0.5);
  });

  it('un elemento desconocido usa las hebras neutras del Nexo', () => {
    expect(flowPalette('???')).toBe(FLOW_PALETTES['neutral']);
  });
});
