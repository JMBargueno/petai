import { isNight, localHour, nightHoursBetween, safeTimeZone } from './sleep-cycle';

describe('sleep-cycle', () => {
  it('convierte a hora local según la zona horaria', () => {
    const d = new Date('2026-06-10T03:00:00Z');
    expect(localHour(d, 'UTC')).toBe(3);
    expect(localHour(d, 'Asia/Tokyo')).toBe(12);
    expect(localHour(d, 'America/New_York')).toBe(23); // verano: UTC-4
  });

  it('una zona inválida cae a UTC', () => {
    expect(safeTimeZone('No/Existe')).toBe('UTC');
    expect(localHour(new Date('2026-06-10T03:00:00Z'), 'No/Existe')).toBe(3);
  });

  it('la ventana nocturna cruza la medianoche', () => {
    const at = (h: number) => new Date(`2026-06-10T${String(h).padStart(2, '0')}:30:00Z`);
    expect(isNight(at(23), 'UTC', 22, 7)).toBe(true);
    expect(isNight(at(2), 'UTC', 22, 7)).toBe(true);
    expect(isNight(at(7), 'UTC', 22, 7)).toBe(false);
    expect(isNight(at(12), 'UTC', 22, 7)).toBe(false);
  });

  it('cuenta solo las horas del intervalo que caen de noche', () => {
    // 20:00 -> 00:00 UTC: noche desde las 22:00 => 2 h
    const h = nightHoursBetween(
      new Date('2026-06-10T20:00:00Z'), new Date('2026-06-11T00:00:00Z'), 'UTC', 22, 7);
    expect(h).toBeCloseTo(2, 5);
  });

  it('un intervalo diurno no cuenta noche y uno de 24 h cuenta 9 h', () => {
    expect(nightHoursBetween(
      new Date('2026-06-10T10:00:00Z'), new Date('2026-06-10T14:00:00Z'), 'UTC', 22, 7)).toBe(0);
    expect(nightHoursBetween(
      new Date('2026-06-10T00:00:00Z'), new Date('2026-06-11T00:00:00Z'), 'UTC', 22, 7)).toBeCloseTo(9, 5);
  });
});
