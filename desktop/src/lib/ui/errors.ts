/**
 * Convierte un error de una petición en un texto que se pueda enseñar al jugador.
 *
 * El servidor ya manda mensajes de negocio en castellano («No tienes suficientes monedas»);
 * esos se respetan. Lo que se sustituye son los fallos técnicos: sin red, errores de JavaScript
 * y respuestas genéricas del servidor.
 */
const NETWORK = 'Sin conexión con el servidor. Inténtalo de nuevo en un momento.';

/** Patrones de mensajes técnicos que no deben llegar a la interfaz. */
const TECHNICAL = [
  /^failed to fetch/i,
  /networkerror/i,
  /load failed/i,
  /cannot (read|convert|set)/i,
  /is not (a function|defined|iterable)/i,
  /unexpected (token|end)/i,
  /^internal server error/i,
  /^bad gateway/i,
  /^request failed/i,
  /^\d{3}\b/,
  /undefined|null|\[object /i,
];

export function friendlyError(err: unknown, fallback = 'Algo ha fallado. Inténtalo de nuevo.'): string {
  if (err instanceof TypeError) return NETWORK;
  const message = typeof err === 'string' ? err : err instanceof Error ? err.message : '';
  const text = message.trim();
  if (!text) return fallback;
  if (/failed to fetch|networkerror|load failed/i.test(text)) return NETWORK;
  if (TECHNICAL.some((re) => re.test(text))) return fallback;
  return text;
}
