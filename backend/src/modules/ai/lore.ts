/**
 * Lore de Pockai para la IA (funciones puras). El contenido vive en `shared/game-data/lore.json`,
 * una versión por temas de `docs/LORE.md` escrita para el jugador.
 *
 * Dos usos: la herramienta `get_lore` (mascotas con herramientas) y `matchLore`, que elige el tema
 * del que habla el mensaje para añadirlo al prompt cuando la mascota no tiene herramientas.
 */
import { normalizeForMatch } from './memory';

export interface LoreTopic {
  id: string;
  title: string;
  keywords: string[];
  text: string;
}

export interface Lore {
  intro?: string;
  topics: LoreTopic[];
}

/** Tope del texto de un tema en el prompt o en el resultado de la herramienta. */
export const MAX_LORE_CHARS = 1200;

function topicsOf(lore: Lore | null | undefined): LoreTopic[] {
  return Array.isArray(lore?.topics)
    ? lore!.topics.filter((t) => t && typeof t.id === 'string' && typeof t.text === 'string' && t.text.trim())
    : [];
}

export function loreTopics(lore: Lore | null | undefined): { id: string; title: string }[] {
  return topicsOf(lore).map((t) => ({ id: t.id, title: t.title }));
}

function score(topic: LoreTopic, normalized: string): number {
  const padded = ` ${normalized} `;
  let hits = 0;
  for (const k of topic.keywords ?? []) {
    const key = normalizeForMatch(k);
    if (key && padded.includes(` ${key} `)) hits += key.split(' ').length;
  }
  return hits;
}

/** Tema del que habla el texto, o `null` si no menciona nada del lore. */
export function matchLore(lore: Lore | null | undefined, message: string): LoreTopic | null {
  const normalized = normalizeForMatch(message ?? '');
  if (!normalized) return null;
  let best: LoreTopic | null = null;
  let bestScore = 0;
  for (const t of topicsOf(lore)) {
    const s = score(t, normalized);
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  }
  return best;
}

/** Tema por id, por título o por lo que el modelo haya escrito como `topic`. */
export function findLore(lore: Lore | null | undefined, topic: string): LoreTopic | null {
  const q = normalizeForMatch(topic ?? '');
  if (!q) return null;
  const all = topicsOf(lore);
  return (
    all.find((t) => normalizeForMatch(t.id) === q) ??
    all.find((t) => normalizeForMatch(t.title) === q) ??
    matchLore(lore, topic)
  );
}

/** Bloque para el prompt de sistema cuando el mensaje toca un tema del lore. Vacío si no hay tema. */
export function buildLoreBlock(lore: Lore | null | undefined, message: string): string {
  const topic = matchLore(lore, message);
  if (!topic) return '';
  return [
    'Lo que sabes de tu mundo (cuéntalo a tu manera y con tus palabras, sin recitarlo; no inventes más de lo que pone):',
    `${topic.title}: ${topic.text.slice(0, MAX_LORE_CHARS)}`,
  ].join('\n');
}
