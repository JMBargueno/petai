/**
 * Ciclo de sueño sincronizado con la zona horaria del usuario.
 * Funciones puras (sin acceso a BD) para poder probarlas de forma aislada.
 */

const STEP_MS = 10 * 60 * 1000; // resolución de 10 minutos
const MAX_SPAN_MS = 72 * 60 * 60 * 1000; // se acota el cálculo a 72 h

/** ¿Es un identificador IANA válido (p. ej. Europe/Madrid)? */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Valida un identificador IANA; si no es válido, usa UTC. */
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

/** ¿Es de noche (ventana puede cruzar la medianoche, p. ej. 22→7)? */
export function isNight(
  date: Date,
  timeZone: string,
  startHour: number,
  endHour: number,
): boolean {
  const h = localHour(date, timeZone);
  return startHour <= endHour
    ? h >= startHour && h < endHour
    : h >= startHour || h < endHour;
}

/** Horas del intervalo [from, to] que caen dentro de la ventana nocturna local. */
export function nightHoursBetween(
  from: Date,
  to: Date,
  timeZone: string,
  startHour: number,
  endHour: number,
): number {
  const end = to.getTime();
  const start = Math.max(from.getTime(), end - MAX_SPAN_MS);
  if (end <= start) return 0;

  let nightMs = 0;
  for (let t = start; t < end; t += STEP_MS) {
    const slice = Math.min(STEP_MS, end - t);
    // Se evalúa en el punto medio del tramo para reducir el sesgo
    if (isNight(new Date(t + slice / 2), timeZone, startHour, endHour)) {
      nightMs += slice;
    }
  }
  return nightMs / 3_600_000;
}
