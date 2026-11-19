import { describe, expect, it } from 'vitest';
import { EFFECTS, FLOW_PALETTES, GridSink, fixedDuration, renderFrame, rewardRamp, selloEter } from './index';

const REWARDS: Record<string, string | number>[] = [
  { reward: 'coins' },
  { reward: 'gems' },
  { reward: 'pro' },
  { reward: 'accessory' },
  ...['bronze', 'silver', 'gold', 'diamond', 'mythic'].map((tier) => ({ reward: 'chest', tier })),
];

function render(phase: string, t: number, opts: { el?: string; reduced?: boolean; ms?: number; params?: Record<string, string | number> } = {}) {
  const sink = new GridSink(selloEter.width, selloEter.height);
  renderFrame(selloEter, sink, { phase, t, elapsedMs: opts.ms ?? 0 }, FLOW_PALETTES[opts.el ?? 'water'], 5, opts.reduced, opts.params ?? { reward: 'coins' });
  return sink;
}

describe('sello del Éter (recompensas de vouchers y del equipo)', () => {
  it('está registrado, delante de la mascota y dura como mucho 2,5 s', () => {
    expect(EFFECTS['sello-eter']).toBe(selloEter);
    expect(selloEter.layer).toBe('front');
    expect(fixedDuration(selloEter.phases)).toBeLessThanOrEqual(2500);
    expect(fixedDuration(selloEter.reducedPhases)).toBeLessThan(fixedDuration(selloEter.phases));
  });

  it('usa como mucho 12 colores por frame con cualquier recompensa y Flujo', () => {
    for (const params of REWARDS) {
      for (const el of Object.keys(FLOW_PALETTES)) {
        for (const p of selloEter.phases) {
          for (const t of [0.3, 0.7]) expect(render(p.name, t, { el, params }).colors().size, `${JSON.stringify(params)} ${el} ${p.name}`).toBeLessThanOrEqual(12);
        }
      }
    }
  });

  it('el estallido lleva el color de lo recibido', () => {
    for (const params of REWARDS) {
      const ramp = rewardRamp(params['reward'], params['tier']);
      expect(render('estallido', 0.5, { params }).colors(), JSON.stringify(params)).toContain(ramp.mid);
    }
    // Cada tipo se ve distinto
    const looks = new Set(REWARDS.map((params) => render('estallido', 0.5, { params }).cells.join()));
    expect(looks.size).toBe(REWARDS.length);
  });

  it('el cofre toma el metal de su tipo y lo desconocido cae en monedas', () => {
    expect(rewardRamp('chest', 'gold').mid).not.toBe(rewardRamp('chest', 'diamond').mid);
    expect(rewardRamp('chest', 'inventado')).toEqual(rewardRamp('chest', 'bronze'));
    expect(rewardRamp('raro', undefined)).toEqual(rewardRamp('coins', undefined));
  });

  it('el sello sale de la grieta del vacío y la grieta se cierra', () => {
    expect(render('grieta', 1).colors()).toContain(FLOW_PALETTES['water'].void0);
    expect(render('caida', 1).colors()).not.toContain(FLOW_PALETTES['water'].void0);
    const { x, y } = selloEter.points.seal;
    expect(render('grietas', 0.5).get(x, y)).not.toBeNull();
  });

  it('con movimiento reducido es el mismo dibujo quieto en todas las fases', () => {
    const a = render('estallido', 0.1, { reduced: true, ms: 0, params: { reward: 'pro' } }).cells;
    expect(render('estallido', 0.9, { reduced: true, ms: 900, params: { reward: 'pro' } }).cells).toEqual(a);
    expect(render('fundido', 0.5, { reduced: true, ms: 1300, params: { reward: 'pro' } }).cells).toEqual(a);
  });

  it('al terminar no deja nada pintado', () => {
    for (const params of REWARDS) expect(render('fundido', 1, { params }).count()).toBe(0);
  });
});
