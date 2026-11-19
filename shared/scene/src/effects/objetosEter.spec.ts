import { describe, expect, it } from 'vitest';
import {
  EFFECTS,
  FLOW_PALETTES,
  GridSink,
  fixedDuration,
  flowPalette,
  grietaObjeto,
  hebraToque,
  parpadeoEter,
  renderFrame,
  type EffectDef,
} from './index';

function render(
  def: EffectDef,
  phase: string,
  t: number,
  opts: { element?: string; reduced?: boolean; elapsedMs?: number; params?: Record<string, number | string>; w?: number; h?: number } = {},
) {
  const sink = new GridSink(opts.w ?? def.width, opts.h ?? def.height);
  renderFrame(def, sink, { phase, t, elapsedMs: opts.elapsedMs ?? 0 }, flowPalette(opts.element ?? 'water'), 11, opts.reduced, opts.params ?? {});
  return sink;
}

const ALL = [grietaObjeto, hebraToque, parpadeoEter];

describe('efectos de los objetos del Éter', () => {
  it('están registrados, a 12 fps, cortos y con variante reducida más corta', () => {
    for (const def of ALL) {
      expect(EFFECTS[def.id]).toBe(def);
      expect(def.fps).toBe(12);
      expect(def.lore.length).toBeGreaterThan(20);
      expect(fixedDuration(def.phases)).toBeLessThanOrEqual(2500);
      expect(fixedDuration(def.reducedPhases)).toBeLessThan(fixedDuration(def.phases));
      expect(def.reducedPhases.map((p) => p.name)).toEqual(def.phases.map((p) => p.name));
    }
    expect(fixedDuration(parpadeoEter.phases)).toBeLessThanOrEqual(250);
  });

  it('no pasan de 12 colores en ningún Flujo', () => {
    for (const el of Object.keys(FLOW_PALETTES)) {
      for (const def of ALL) {
        for (const p of def.phases) {
          for (const t of [0.1, 0.5, 0.9]) {
            for (const dir of ['in', 'out']) {
              expect(render(def, p.name, t, { element: el, elapsedMs: 500, params: { dir } }).colors().size).toBeLessThanOrEqual(12);
            }
          }
        }
      }
    }
  });

  it('con movimiento reducido el dibujo no se mueve', () => {
    for (const def of ALL) {
      const a = render(def, def.phases[0].name, 0.2, { reduced: true, elapsedMs: 0 });
      const b = render(def, def.phases[0].name, 0.8, { reduced: true, elapsedMs: 900 });
      expect(a.cells).toEqual(b.cells);
      expect(a.count()).toBeGreaterThan(0);
    }
  });

  it('grieta: empieza cerrada, se abre con vacío del Éter dentro y se cierra', () => {
    expect(render(grietaObjeto, 'apertura', 0).count()).toBe(0);
    const open = render(grietaObjeto, 'hold', 0, { elapsedMs: 300 });
    expect(open.colors()).toContain(FLOW_PALETTES['water'].void0);
    expect(open.get(grietaObjeto.anchor.x, grietaObjeto.anchor.y)).not.toBeNull();
    expect(render(grietaObjeto, 'cierre', 0.5).count()).toBeLessThan(open.count());
    // Las motas salen o entran según `dir`
    expect(render(grietaObjeto, 'hold', 0, { elapsedMs: 300, params: { dir: 'in' } }).cells).not.toEqual(
      render(grietaObjeto, 'hold', 0, { elapsedMs: 300, params: { dir: 'out' } }).cells,
    );
  });

  it('hebra: va del Pockai al objeto, toca la punta en el hold y se recoge del todo', () => {
    const params = { x0: 20, y0: 150, x1: 160, y1: 30 };
    const big = { w: 200, h: 180, params };
    expect(render(hebraToque, 'lanzar', 0, big).count()).toBeLessThan(10);
    const hold = render(hebraToque, 'hold', 0, { ...big, elapsedMs: 400 });
    // Toca el objeto: hay chispa en su punto
    expect(hold.get(160, 30)).not.toBeNull();
    expect([FLOW_PALETTES['water'].glow, FLOW_PALETTES['water'].light]).toContain(hold.get(160, 30));
    expect(hold.get(20, 150)).not.toBeNull();
    const half = render(hebraToque, 'recoger', 0.5, big);
    expect(half.count()).toBeLessThan(hold.count());
    expect(half.get(160, 30)).toBeNull();
    expect(render(hebraToque, 'recoger', 1, big).count()).toBeLessThan(10);
    // Sigue al objeto si se mueve
    const moved = render(hebraToque, 'hold', 0, { w: 200, h: 180, params: { ...params, x1: 100, y1: 20 }, elapsedMs: 400 });
    expect(moved.get(100, 20)).not.toBeNull();
  });

  it('parpadeo: chispas que convergen (in) o se abren (out), y termina casi vacío al tragar', () => {
    const start = render(parpadeoEter, 'parpadeo', 0.05, { params: { dir: 'in' } });
    const end = render(parpadeoEter, 'parpadeo', 0.95, { params: { dir: 'in' } });
    expect(end.count()).toBeLessThan(start.count());
    expect(render(parpadeoEter, 'parpadeo', 0.5, { params: { dir: 'out' } }).cells).not.toEqual(
      render(parpadeoEter, 'parpadeo', 0.5, { params: { dir: 'in' } }).cells,
    );
  });
});
