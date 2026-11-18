/** Formato de los datos del perfil social (Social › Mi Perfil y perfil de otros jugadores). */

export const TIER_LABELS: Record<string, string> = {
  common: 'Común',
  rare: 'Rara',
  epic: 'Épica',
  legendary: 'Legendaria',
};

/** Orden y nombre de las categorías de logros (constelaciones). */
export const CATEGORY_LABELS: Record<string, string> = {
  special: 'Especial',
  activity: 'Actividad',
  care: 'Cuidado',
  collection: 'Colección',
  battle: 'Batalla',
  ai: 'IA',
  social: 'Social',
};

export const RARITY_LABELS: Record<string, string> = {
  normal: 'Normal',
  common: 'Común',
  rare: 'Raro',
  super_rare: 'Superraro',
  legendary: 'Legendario',
  mythic: 'Mítico',
};

const TIER_ORDER: Record<string, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };

/** "45 min", "3 h 20 min", "120 h". */
export function formatPlayTime(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h >= 100 || rest === 0) return `${h} h`;
  return `${h} h ${rest} min`;
}

/** "nov. 2026" (mes y año de alta). */
export function formatMonthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
}

/** "17 nov. 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Número compacto: 950, 1,2 k, 12 k, 1,5 M. */
export function formatCount(n: number): string {
  const v = Math.max(0, n || 0);
  if (v < 1000) return String(v);
  if (v < 10_000) return `${(v / 1000).toFixed(1).replace('.', ',').replace(',0', '')} k`;
  if (v < 1_000_000) return `${Math.floor(v / 1000)} k`;
  return `${(v / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} M`;
}

/** Progreso 0..1 de un logro. */
export function progressRatio(current: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.min(1, Math.max(0, current / target));
}

/**
 * Texto del progreso de un logro. Los de tiempo de juego se guardan en segundos y se muestran en
 * horas; el resto, como "actual/objetivo".
 */
export function formatProgress(id: string, current: number, target: number): string {
  if (id.startsWith('time_')) {
    const h = (s: number) => Math.floor(s / 3600);
    return `${h(current)}/${h(target)} h`;
  }
  return `${formatCount(current)}/${formatCount(target)}`;
}

/** Insignias ordenadas: primero las de mayor tier y, dentro del tier, las más recientes. */
export function sortBadges<T extends { tier: string; unlockedAt?: string | null }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) ||
      String(b.unlockedAt ?? '').localeCompare(String(a.unlockedAt ?? '')),
  );
}

/** Alterna una insignia en la vitrina (máx. `max`): devuelve la nueva lista o null si está llena. */
export function toggleFeatured(current: string[], id: string, max = 3): string[] | null {
  if (current.includes(id)) return current.filter((x) => x !== id);
  if (current.length >= max) return null;
  return [...current, id];
}
