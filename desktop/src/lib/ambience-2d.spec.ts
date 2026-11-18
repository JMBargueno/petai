import { describe, expect, it } from 'vitest';
import { calmOf, fireflyShare, hash, outsideAt, veilOf } from './ambience-2d';

const clear = { weatherCode: 0, temperature: 18, sunrise: '07:30', sunset: '20:00' };
const rain = { ...clear, weatherCode: 63 };

describe('ambience-2d', () => {
  it('el velo de la hora es transparente a mediodía y oscuro de noche', () => {
    expect(veilOf(outsideAt(clear, 13 * 60)).alpha).toBe(0);
    const night = veilOf(outsideAt(clear, 0));
    expect(night.alpha).toBeGreaterThan(0.35);
    expect(night.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('sin dato de clima usa cielo despejado y sol por defecto', () => {
    const o = outsideAt(null, 13 * 60);
    expect(o.look.rain).toBe(0);
    expect(o.sky.daylight).toBe(1);
  });

  it('los residentes van con calma de noche y con lluvia', () => {
    expect(calmOf(outsideAt(clear, 13 * 60))).toBe(1);
    expect(calmOf(outsideAt(clear, 0))).toBeGreaterThan(1);
    expect(calmOf(outsideAt(rain, 13 * 60))).toBe(2);
  });

  it('las luciérnagas son de noche y se esconden con lluvia', () => {
    expect(fireflyShare(outsideAt(clear, 0))).toBe(1);
    expect(fireflyShare(outsideAt(clear, 13 * 60))).toBeLessThan(0.2);
    expect(fireflyShare(outsideAt(rain, 0))).toBe(0);
  });

  it('el hash es determinista y está en [0, 1)', () => {
    for (let i = 0; i < 50; i++) {
      const h = hash(i, 7);
      expect(h).toBe(hash(i, 7));
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
});
