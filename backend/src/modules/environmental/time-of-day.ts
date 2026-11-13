/**
 * Determinación del tramo del día (`TimeOfDay`) a partir de la hora local del usuario y de su
 * zona horaria IANA. Funciones PURAS (sin Nest, sin I/O) para probarlas en aislamiento y, en
 * particular, las transiciones de cambio horario (DST, SC-004), que `Intl` resuelve por la zona.
 */
import type { TimeOfDay } from './environmental.types';

/** Valida un identificador IANA; si no es válido, usa UTC (igual que `sleep-cycle.safeTimeZone`). */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** Hora local (0-23) en la zona horaria indicada. */
export function localHour(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTimeZone(timeZone),
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '0';
  return parseInt(hour, 10) % 24;
}

/**
 * Fecha local (año/mes/día) en la zona horaria indicada. Se usa para la festividad por calendario
 * local del usuario, no para la hora.
 */
export function calendarDayOf(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const tz = safeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return {
    year: year ? parseInt(year, 10) : date.getUTCFullYear(),
    month: month ? parseInt(month, 10) : date.getUTCMonth() + 1,
    day: day ? parseInt(day, 10) : date.getUTCDate(),
  };
}

/**
 * Tramo del día según la hora local. Bandas:
 * - late_night: 00-06
 * - morning:    06-12
 * - afternoon:  12-18
 * - evening:    18-22
 * - night:      22-24
 */
export function timeOfDay(date: Date, timeZone: string): TimeOfDay {
  const h = localHour(date, timeZone);
  if (h < 6) return 'late_night';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  if (h < 22) return 'evening';
  return 'night';
}
