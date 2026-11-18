/**
 * Presentación del cerebro del Pockai (spec 36): dimensiones de personalidad, memoria por
 * capas y vida autónoma. Funciones puras para que se puedan probar sin DOM.
 */
import type { MemoryLayer, MindDimension, PetMemoryItem } from './api';

export const DIMENSIONS: { id: MindDimension; label: string; icon: string; tint: string }[] = [
  { id: 'curiosity', label: 'Curiosidad', icon: 'search', tint: 'var(--color-electric-blue)' },
  { id: 'sociability', label: 'Sociabilidad', icon: 'users', tint: 'var(--color-mint-pop)' },
  { id: 'bravery', label: 'Valentía', icon: 'shield', tint: 'var(--color-sunburst)' },
  { id: 'affection', label: 'Afectividad', icon: 'heart', tint: 'var(--color-lavender)' },
  { id: 'temper', label: 'Temperamento', icon: 'flame', tint: 'var(--theme-hot)' },
];

export const MEMORY_LAYERS: { id: MemoryLayer; label: string; icon: string; hint: string }[] = [
  { id: 'episodic', label: 'Episódica', icon: 'log', hint: 'Lo que ha vivido: charlas, aventuras y encuentros' },
  { id: 'semantic', label: 'Semántica', icon: 'book', hint: 'Lo que sabe de ti y de tus costumbres' },
  { id: 'emotional', label: 'Emocional', icon: 'heart', hint: 'Cómo le hacen sentir las personas y las cosas' },
];

/** Capa de un recuerdo; los anteriores a la spec 36 se clasifican por `kind` (igual que el backend). */
export function layerOfMemory(m: Pick<PetMemoryItem, 'layer' | 'kind'>): MemoryLayer {
  if (m.layer === 'episodic' || m.layer === 'semantic' || m.layer === 'emotional') return m.layer;
  if (m.kind === 'summary' || m.kind === 'event' || m.kind === 'encounter' || m.kind === 'adventure' || m.kind === 'find') return 'episodic';
  if (m.kind === 'relation') return 'emotional';
  return 'semantic';
}

/** Agrupa los recuerdos por capa, en el orden de MEMORY_LAYERS y conservando el orden recibido. */
export function groupMemoriesByLayer<T extends Pick<PetMemoryItem, 'layer' | 'kind'>>(memories: T[]): Record<MemoryLayer, T[]> {
  const out: Record<MemoryLayer, T[]> = { episodic: [], semantic: [], emotional: [] };
  for (const m of memories) out[layerOfMemory(m)].push(m);
  return out;
}

/** Icono de un recuerdo según su tipo. */
export function memoryIcon(kind: string): string {
  switch (kind) {
    case 'summary':
      return 'note';
    case 'habit':
      return 'monitor';
    case 'event':
      return 'map';
    case 'encounter':
      return 'users';
    case 'adventure':
      return 'mountain';
    case 'relation':
      return 'bond';
    default:
      return 'chat';
  }
}

export interface ValenceView {
  tone: 'pos' | 'neg' | 'neutral';
  label: string;
  /** Valencia redondeada y con signo, p. ej. "+0.6". */
  text: string;
}

/** Valencia emocional (-1…1) en palabras. */
export function valenceView(valence: number | null | undefined): ValenceView {
  const v = typeof valence === 'number' && Number.isFinite(valence) ? Math.max(-1, Math.min(1, valence)) : 0;
  const text = `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
  if (v >= 0.6) return { tone: 'pos', label: 'Le encanta', text };
  if (v >= 0.2) return { tone: 'pos', label: 'Le agrada', text };
  if (v <= -0.6) return { tone: 'neg', label: 'Le duele', text };
  if (v <= -0.2) return { tone: 'neg', label: 'Le incomoda', text };
  return { tone: 'neutral', label: 'Neutral', text };
}

/** Ocupación de una capa (0-100) frente a su capacidad. */
export function layerUsage(count: number, capacity: number | null | undefined): number {
  if (!capacity || capacity <= 0) return 0;
  return Math.max(0, Math.min(100, (count / capacity) * 100));
}

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** Fecha relativa en castellano ("hace 5 minutos", "ayer"…). */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Math.round((t - now.getTime()) / 1000);
  if (Math.abs(diff) < 45) return 'ahora mismo';
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(Math.round(diff / 60), 'minute');
}
