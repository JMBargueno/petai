import { calendarDayOf, localHour, safeTimeZone, timeOfDay } from './time-of-day';

describe('time-of-day', () => {
  describe('bandas de hora (UTC)', () => {
    const utc = (h: number) => new Date(`2026-06-15T${String(h).padStart(2, '0')}:30:00Z`);

    it('00-05 → late_night (bostezo a las 3 AM)', () => {
      expect(timeOfDay(utc(3), 'UTC')).toBe('late_night');
    });
    it('06-11 → morning', () => {
      expect(timeOfDay(utc(7), 'UTC')).toBe('morning');
    });
    it('12-17 → afternoon (escenario US1: 15:00)', () => {
      expect(timeOfDay(utc(15), 'UTC')).toBe('afternoon');
    });
    it('18-21 → evening', () => {
      expect(timeOfDay(utc(21), 'UTC')).toBe('evening');
    });
    it('22-23 → night', () => {
      expect(timeOfDay(utc(23), 'UTC')).toBe('night');
    });
    it('6:00 exacto → morning', () => {
      expect(timeOfDay(new Date('2026-06-15T06:00:00Z'), 'UTC')).toBe('morning');
    });
  });

  describe('zona horaria del usuario', () => {
    it('15:00 local en America/Mexico_City → afternoon', () => {
      // America/Mexico_City está en UTC-6 todo el año (sin DST desde 2022): 21:00 UTC = 15:00 local.
      const instant = new Date('2026-06-15T21:00:00Z');
      expect(localHour(instant, 'America/Mexico_City')).toBe(15);
      expect(timeOfDay(instant, 'America/Mexico_City')).toBe('afternoon');
    });

    it('zona inválida cae a UTC', () => {
      expect(safeTimeZone('Nope/Nowhere')).toBe('UTC');
      expect(timeOfDay(new Date('2026-06-15T15:00:00Z'), 'Nope/Nowhere')).toBe('afternoon');
    });
  });

  describe('cambio horario (DST, SC-004)', () => {
    it('el mismo instante UTC cae en bandas distintas según verano/invierno en Europe/Madrid', () => {
      // Europe/Madrid: verano UTC+2, invierno UTC+1.
      const verano = new Date('2026-07-01T20:00:00Z'); // 22:00 local → night
      const invierno = new Date('2026-01-01T20:00:00Z'); // 21:00 local → evening
      expect(timeOfDay(verano, 'Europe/Madrid')).toBe('night');
      expect(timeOfDay(invierno, 'Europe/Madrid')).toBe('evening');
    });

    it('localHour refleja el offset de verano (UTC+2) en Europe/Berlin', () => {
      expect(localHour(new Date('2026-07-01T12:00:00Z'), 'Europe/Berlin')).toBe(14);
    });
  });

  describe('calendarDayOf', () => {
    it('extrae la fecha local por zona', () => {
      // 2026-12-31T23:30:00Z en UTC+1 → 31 dic; en UTC-5 → 31 dic; en Asia/Tokyo (UTC+9) → 1 ene.
      const instant = new Date('2026-12-31T23:30:00Z');
      expect(calendarDayOf(instant, 'UTC')).toEqual({ year: 2026, month: 12, day: 31 });
      expect(calendarDayOf(instant, 'Asia/Tokyo')).toEqual({ year: 2027, month: 1, day: 1 });
    });
  });
});
