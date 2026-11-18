import { describe, expect, it } from 'vitest';
import {
  capulloTelar,
  FLOW_PALETTES,
  fixedDuration,
  GridSink,
  hebraInvocacion,
  portalNexo,
  renderFrame,
  resonancia,
  speciesElement,
  type EffectDef,
} from './index';
import { admitMoment } from './momentQueue';

const MOMENTS: EffectDef[] = [capulloTelar, resonancia, hebraInvocacion];

function render(def: EffectDef, phase: string, t: number, opts: { el?: string; reduced?: boolean; ms?: number; params?: Record<string, string | number> } = {}) {
  const sink = new GridSink(def.width, def.height);
  renderFrame(def, sink, { phase, t, elapsedMs: opts.ms ?? 0 }, FLOW_PALETTES[opts.el ?? 'water'], 11, opts.reduced, opts.params);
  return sink;
}

describe.each(MOMENTS.map((d) => [d.id, d] as const))('efecto %s', (_id, def) => {
  it('cumple las reglas de la skill (rejilla, duración, fases reducidas)', () => {
    expect(def.width).toBeLessThanOrEqual(64);
    expect(def.height).toBeLessThanOrEqual(80);
    expect(Number.isInteger(def.scale)).toBe(true);
    expect(fixedDuration(def.phases)).toBeLessThanOrEqual(2500);
    expect(def.reducedPhases.map((p) => p.name)).toEqual(def.phases.map((p) => p.name));
    expect(fixedDuration(def.reducedPhases)).toBeLessThan(fixedDuration(def.phases));
  });

  it('usa como mucho 12 colores por frame en todos los Flujos', () => {
    for (const el of Object.keys(FLOW_PALETTES)) {
      for (const p of def.phases) {
        for (const t of [0.3, 0.7]) expect(render(def, p.name, t, { el }).colors().size).toBeLessThanOrEqual(12);
      }
    }
  });

  it('se queda quieto con movimiento reducido', () => {
    const hold = def.phases.find((p) => p.ms === 'hold')?.name ?? def.phases[1].name;
    expect(render(def, hold, 0, { reduced: true, ms: 0 }).cells).toEqual(render(def, hold, 0, { reduced: true, ms: 900 }).cells);
  });

  it('termina sin dejar casi nada pintado', () => {
    const last = def.phases[def.phases.length - 1].name;
    const full = Math.max(...def.phases.map((p) => render(def, p.name, 0.5).count()));
    expect(render(def, last, 1).count()).toBeLessThan(full * 0.15);
  });
});

describe('capullo del Telar', () => {
  it('en la espera tapa por completo el centro de la mascota', () => {
    const { x, y } = capulloTelar.points.center;
    const hold = render(capulloTelar, 'hold', 0);
    for (const [dx, dy] of [[0, 0], [-10, 0], [10, 0], [0, -18], [0, 18]]) expect(hold.get(x + dx, y + dy)).not.toBeNull();
  });
  it('la forma final lleva corona', () => {
    const plain = render(capulloTelar, 'hold', 0).count();
    expect(render(capulloTelar, 'hold', 0, { params: { stage: 'final' } }).count()).toBeGreaterThan(plain);
  });
});

describe('cola de momentos', () => {
  it('la evolución sustituye a la subida de nivel en curso', () => {
    expect(admitMoment([{ def: resonancia }], capulloTelar)).toEqual({ play: true, replace: [0] });
  });
  it('la subida de nivel no corta la evolución ni se repite', () => {
    expect(admitMoment([{ def: capulloTelar }], resonancia).play).toBe(false);
    expect(admitMoment([{ def: resonancia }], resonancia).play).toBe(false);
  });
  it('sin nada en curso, se reproduce', () => {
    expect(admitMoment([], portalNexo)).toEqual({ play: true, replace: [] });
  });
});

describe('speciesElement', () => {
  it('conoce el elemento de las especies del catálogo', () => {
    expect(speciesElement('ignisaur')).toBe('fire');
    expect(speciesElement('axolunar')).toBe('water');
    expect(speciesElement('no-existe')).toBe('neutral');
    expect(speciesElement(undefined)).toBe('neutral');
  });
});
