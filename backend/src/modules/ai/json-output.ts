/**
 * Extrae el objeto JSON de la salida de un LLM de forma tolerante: puede venir envuelto en ```json
 * o con texto alrededor. Devuelve `null` si no hay un objeto válido.
 */
export function extractJsonObject(output: string): Record<string, unknown> | null {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let json: unknown;
  try {
    json = JSON.parse(output.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  return json as Record<string, unknown>;
}
