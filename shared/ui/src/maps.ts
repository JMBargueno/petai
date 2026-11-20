/**
 * Tablas compartidas de presentación (antes copiadas en Raid, Torneo, Entrenamiento, Arena,
 * Misiones, Vínculo…). Iconos = nombres de Ico.svelte; colores = tokens CSS (guía §3.6 y §3.7).
 */

export type Meta = { label: string; icon: string; color: string };

export const ELEMENTS: Record<string, Meta> = {
  fire: { label: 'Fuego', icon: 'flame', color: 'var(--elem-fire)' },
  water: { label: 'Agua', icon: 'water', color: 'var(--elem-water)' },
  plant: { label: 'Planta', icon: 'leaf', color: 'var(--elem-plant)' },
  grass: { label: 'Planta', icon: 'leaf', color: 'var(--elem-plant)' },
  electric: { label: 'Eléctrico', icon: 'energy', color: 'var(--elem-electric)' },
  shadow: { label: 'Sombra', icon: 'moon', color: 'var(--elem-shadow)' },
  dark: { label: 'Sombra', icon: 'moon', color: 'var(--elem-shadow)' },
  light: { label: 'Luz', icon: 'sun', color: 'var(--elem-light)' },
  neutral: { label: 'Neutro', icon: 'circle', color: 'var(--elem-neutral)' },
  normal: { label: 'Neutro', icon: 'circle', color: 'var(--elem-neutral)' },
};

export function elementMeta(el: string | null | undefined): Meta {
  const key = (el ?? '').toLowerCase();
  return ELEMENTS[key] ?? { label: el || '—', icon: 'circle', color: 'var(--elem-neutral)' };
}

export const RARITIES: Record<string, Meta> = {
  common: { label: 'Común', icon: 'circle', color: 'var(--rarity-common)' },
  normal: { label: 'Común', icon: 'circle', color: 'var(--rarity-common)' },
  rare: { label: 'Rara', icon: 'star', color: 'var(--rarity-rare)' },
  super_rare: { label: 'Súper rara', icon: 'xp', color: 'var(--rarity-super-rare)' },
  'super-rare': { label: 'Súper rara', icon: 'xp', color: 'var(--rarity-super-rare)' },
  epic: { label: 'Épica', icon: 'xp', color: 'var(--rarity-super-rare)' },
  legendary: { label: 'Legendaria', icon: 'crown', color: 'var(--rarity-legendary)' },
  mythic: { label: 'Mítica', icon: 'flame', color: 'var(--rarity-mythic)' },
};

export function rarityMeta(r: string | null | undefined): Meta {
  const key = (r ?? '').toLowerCase();
  return RARITIES[key] ?? { label: r || '—', icon: 'circle', color: 'var(--rarity-common)' };
}

/** Motivo de una misión o de un evento de vínculo → icono. */
export const REASON_ICON: Record<string, string> = {
  feed: 'apple',
  battle: 'swords',
  battle_win: 'trophy',
  minigame: 'gamepad',
  chat: 'chat',
  clean: 'bath',
  sleep: 'moon',
  evolve: 'xp',
  hatch: 'egg',
  hatch_rare: 'dice',
  level_up: 'up',
  play: 'gamepad',
  pet: 'hand',
  care: 'heart',
  visit: 'home',
  daily: 'clock',
  decay: 'wait',
};

export function reasonIcon(reason: string | null | undefined): string {
  return REASON_ICON[reason ?? ''] ?? 'target';
}

/** Recompensa (monedas/gemas/xp/objeto) → icono. */
export function rewardIcon(type: string): string {
  return type === 'coins' ? 'coin' : type === 'gems' ? 'gem' : type === 'xp' ? 'xp' : 'gift';
}

/** Color de una barra de vida según el porcentaje restante. */
export function hpColor(pct: number): string {
  if (pct > 60) return 'var(--success)';
  if (pct > 30) return 'var(--warning)';
  return 'var(--danger)';
}

/**
 * Colores de una mascota sin paleta todavía (los de Ignisaur). Son datos de la criatura, no de la
 * interfaz: no cambian con el tema.
 */
export const DEFAULT_PET_PALETTE = { primary: '#E25822', secondary: '#F3C544', accent: '#6D1600' } as const; // color-ok
/** Paleta del huevo genérico (EggSprite). */
export const EGG_PALETTE = { primary: '#fff4d6', secondary: '#ffc94d' } as const; // color-ok
