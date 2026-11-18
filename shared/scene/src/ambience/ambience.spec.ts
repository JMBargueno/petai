import { describe, expect, it } from 'vitest';
import { DEFAULT_SUNRISE, DEFAULT_SUNSET, mix, parseClock, skyAt, toHexString } from './sunClock';
import { applyWeather, blendLook, CLEAR, isWet, lookFromWmo } from './weather';

const R = 7 * 60;
const S = 19 * 60;

describe('skyAt', () => {
  it('recorre las seis fases en orden a lo largo del día', () => {
    const at = (m: number) => skyAt(m, R, S).phase;
    expect(at(3 * 60)).toBe('night');
    expect(at(R)).toBe('dawn');
    expect(at(12 * 60)).toBe('day');
    expect(at(S - 120)).toBe('afternoon');
    expect(at(S - 30)).toBe('sunset');
    expect(at(S + 30)).toBe('dusk');
    expect(at(23 * 60)).toBe('night');
  });

  it('de noche hay estrellas y luna; de día, sol y nada de velo', () => {
    const night = skyAt(2 * 60, R, S);
    expect(night.starAlpha).toBe(1);
    expect(night.sunT).toBeNull();
    expect(night.moonT).toBeGreaterThan(0);
    expect(night.daylight).toBe(0);

    const noon = skyAt(13 * 60, R, S);
    expect(noon.starAlpha).toBe(0);
    expect(noon.moonT).toBeNull();
    expect(noon.sunT).toBeCloseTo(0.5, 5);
    expect(noon.tintAlpha).toBe(0);
    expect(noon.daylight).toBe(1);
  });

  it('cambia poco a poco: dos minutos seguidos casi no se distinguen', () => {
    for (let m = 0; m < 1440; m += 7) {
      const a = skyAt(m, R, S);
      const b = skyAt(m + 1, R, S);
      expect(Math.abs(a.tintAlpha - b.tintAlpha)).toBeLessThan(0.02);
      expect(Math.abs(a.daylight - b.daylight)).toBeLessThan(0.03);
      expect(Math.abs(((a.skyTop >> 16) & 255) - ((b.skyTop >> 16) & 255))).toBeLessThan(8);
    }
  });

  it('sigue al sol real: en invierno anochece antes', () => {
    const winter = skyAt(18 * 60 + 30, 8 * 60, 17 * 60 + 50);
    const summer = skyAt(18 * 60 + 30, 6 * 60 + 45, 21 * 60 + 40);
    expect(winter.daylight).toBeLessThan(0.3);
    expect(summer.daylight).toBeGreaterThan(0.9);
  });

  it('sin sol válido usa las horas de defecto y admite minutos fuera de rango', () => {
    expect(skyAt(600, null, null)).toEqual(skyAt(600, DEFAULT_SUNRISE, DEFAULT_SUNSET));
    expect(skyAt(600, 900, 800)).toEqual(skyAt(600));
    expect(skyAt(600 + 1440, R, S)).toEqual(skyAt(600, R, S));
    expect(skyAt(-60, R, S).phase).toBe('night');
  });
});

describe('utilidades de color y hora', () => {
  it('mezcla colores y los pasa a texto', () => {
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mix(0x112233, 0xffffff, 0)).toBe(0x112233);
    expect(toHexString(0x0b1030)).toBe('#0b1030');
  });

  it('lee horas "HH:MM" y minutos', () => {
    expect(parseClock('07:58')).toBe(478);
    expect(parseClock('2026-11-18T17:54'.slice(11))).toBe(1074);
    expect(parseClock(600)).toBe(600);
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock(1440)).toBeNull();
    expect(parseClock(null)).toBeNull();
  });
});

describe('lookFromWmo', () => {
  it('traduce los códigos WMO a nubes, lluvia, nieve, niebla y tormenta', () => {
    expect(lookFromWmo(0)).toEqual(CLEAR);
    expect(lookFromWmo(3).cover).toBeGreaterThan(0.8);
    expect(lookFromWmo(63).rain).toBeGreaterThan(0.5);
    expect(lookFromWmo(73).snow).toBeGreaterThan(0.5);
    expect(lookFromWmo(45).fog).toBeGreaterThan(0.5);
    expect(lookFromWmo(95).storm).toBe(true);
    expect(isWet(lookFromWmo(63))).toBe(true);
    expect(isWet(lookFromWmo(3))).toBe(false);
  });

  it('sin dato o con un código raro, despejado', () => {
    expect(lookFromWmo(null)).toEqual(CLEAR);
    expect(lookFromWmo(1234)).toEqual(CLEAR);
  });

  it('la temperatura marca calor o frío sin tapar la lluvia', () => {
    expect(lookFromWmo(0, 34).feel).toBe('hot');
    const coldRain = lookFromWmo(63, 2);
    expect(coldRain.feel).toBe('cold');
    expect(coldRain.rain).toBeGreaterThan(0);
  });
});

describe('applyWeather y blendLook', () => {
  it('las nubes apagan el sol, esconden las estrellas y oscurecen la sala', () => {
    const noon = skyAt(13 * 60, R, S);
    const overcast = applyWeather(noon, lookFromWmo(65));
    expect(overcast.orbAlpha).toBeLessThan(0.2);
    expect(overcast.tintAlpha).toBeGreaterThan(noon.tintAlpha);
    expect(applyWeather(skyAt(2 * 60, R, S), lookFromWmo(3)).starAlpha).toBeLessThan(0.2);
    expect(applyWeather(noon, CLEAR)).toEqual(noon);
  });

  it('funde de un clima a otro', () => {
    const rain = lookFromWmo(65);
    expect(blendLook(CLEAR, rain, 0.5).rain).toBeCloseTo(0.5, 5);
    expect(blendLook(CLEAR, rain, 0)).toMatchObject({ cover: 0, rain: 0 });
    expect(blendLook(CLEAR, rain, 3)).toEqual(rain);
  });
});
