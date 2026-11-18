import { describe, expect, it } from 'vitest';
import { EffectPlayer, fixedDuration, quantize } from './timeline';
import type { FxPhase } from './types';

const PHASES: FxPhase[] = [
  { name: 'appear', ms: 100 },
  { name: 'open', ms: 200 },
  { name: 'hold', ms: 'hold' },
  { name: 'close', ms: 100 },
];

describe('EffectPlayer', () => {
  it('recorre las fases con su progreso', () => {
    const p = new EffectPlayer(PHASES);
    p.start(1000);
    expect(p.tick(1050)).toEqual({ phase: 'appear', t: 0.5, done: false });
    expect(p.tick(1200)).toEqual({ phase: 'open', t: 0.5, done: false });
  });

  it('se queda en la fase hold hasta que se suelta', () => {
    const p = new EffectPlayer(PHASES);
    p.start(0);
    expect(p.tick(5000).phase).toBe('hold');
    p.release(5000);
    expect(p.tick(5050)).toEqual({ phase: 'close', t: 0.5, done: false });
    expect(p.tick(5100).done).toBe(true);
  });

  it('si se suelta antes de llegar al hold, pasa de largo', () => {
    const p = new EffectPlayer(PHASES);
    p.start(0);
    p.release(10);
    expect(p.tick(350)).toEqual({ phase: 'close', t: 0.5, done: false });
  });

  it('avisa de cada fase una vez y en orden, aunque un tick se las salte', () => {
    const seen: string[] = [];
    const p = new EffectPlayer(PHASES, (n) => seen.push(n));
    p.start(0);
    p.release(0);
    p.tick(10);
    p.tick(1000);
    p.tick(2000);
    expect(seen).toEqual(['appear', 'open', 'hold', 'close', 'done']);
  });

  it('las fases de 0 ms no se quedan atascadas', () => {
    const p = new EffectPlayer([{ name: 'a', ms: 0 }, { name: 'hold', ms: 'hold' }]);
    p.start(0);
    expect(p.tick(0).phase).toBe('hold');
  });
});

describe('utilidades', () => {
  it('fixedDuration ignora las esperas', () => {
    expect(fixedDuration(PHASES)).toBe(400);
  });
  it('quantize va a saltos de la cadencia', () => {
    expect(quantize(90, 12)).toBeCloseTo(83.333, 2);
    expect(quantize(10, 12)).toBe(0);
  });
});
