import { mapWeather, wmoToSkyCondition } from './weather.mapper';

const base = { hotTemp: 30, coldTemp: 5 };

describe('weather.mapper', () => {
  describe('mapWeather: cielo por código WMO', () => {
    it('despejado (0) → clear', () => {
      expect(mapWeather({ weatherCode: 0, temperature: 20, ...base })).toBe('clear');
    });

    it('nublado (1-3) → cloud', () => {
      for (const code of [1, 2, 3]) {
        expect(mapWeather({ weatherCode: code, temperature: 18, ...base })).toBe('cloud');
      }
    });

    it('lluvia (51-67, 80-82) → rain', () => {
      for (const code of [51, 61, 67, 80, 81, 82]) {
        expect(mapWeather({ weatherCode: code, temperature: 15, ...base })).toBe('rain');
      }
    });

    it('nieve (71-77, 85, 86) → snow', () => {
      for (const code of [71, 73, 77, 85, 86]) {
        expect(mapWeather({ weatherCode: code, temperature: 8, ...base })).toBe('snow');
      }
    });
  });

  describe('mapWeather: la temperatura domina sobre el cielo', () => {
    it('hace 32° y despejado → hot (escenario US1-1)', () => {
      expect(mapWeather({ weatherCode: 0, temperature: 32, ...base })).toBe('hot');
    });

    it('temperatura ≥ hotTemp → hot aunque llueva', () => {
      expect(mapWeather({ weatherCode: 61, temperature: 30, ...base })).toBe('hot');
    });

    it('temperatura ≤ coldTemp → cold aunque esté nublado', () => {
      expect(mapWeather({ weatherCode: 2, temperature: 5, ...base })).toBe('cold');
    });

    it('temperatura moderada → usa el cielo', () => {
      expect(mapWeather({ weatherCode: 2, temperature: 22, ...base })).toBe('cloud');
    });
  });

  describe('mapWeather: degradación', () => {
    it('sin código y sin temperatura → unknown', () => {
      expect(mapWeather({ weatherCode: null, temperature: null, ...base })).toBe('unknown');
    });

    it('código desconocido y temperatura nula → unknown', () => {
      expect(mapWeather({ weatherCode: 99, temperature: null, ...base })).toBe('unknown');
    });

    it('código nulo con temperatura moderada → unknown', () => {
      expect(mapWeather({ weatherCode: null, temperature: 20, ...base })).toBe('unknown');
    });
  });

  describe('wmoToSkyCondition', () => {
    it('null / no finito → null', () => {
      expect(wmoToSkyCondition(null)).toBeNull();
      expect(wmoToSkyCondition(NaN)).toBeNull();
    });
    it('99 (fuera de rango) → null', () => {
      expect(wmoToSkyCondition(99)).toBeNull();
    });
  });
});
