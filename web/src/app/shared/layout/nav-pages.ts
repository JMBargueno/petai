import type { NavLink } from './site-header';

export type PageId = 'home' | 'pockais' | 'arena' | 'lore';

/**
 * Páginas del sitio para el grupo "Páginas" de la cabecera, en el mismo orden en todas.
 * `current` marca la página en la que estamos (aria-current="page").
 */
export function navPages(locale: string, current?: PageId): NavLink[] {
  const base = `/${locale}/`;
  const pages: (NavLink & { id: PageId })[] = [
    { id: 'home', href: base, label: $localize`:@@lore.nav.back:Inicio` },
    { id: 'pockais', href: `${base}pockais`, label: $localize`:@@nav.species:Pockais` },
    { id: 'arena', href: `${base}arena`, label: $localize`:@@nav.arena:Arena` },
    { id: 'lore', href: `${base}lore`, label: $localize`:@@nav.lore:Mundo` },
  ];
  return pages.map(({ id, ...link }) => ({ ...link, current: id === current }));
}
