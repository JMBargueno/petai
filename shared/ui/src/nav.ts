/**
 * El modelo de navegación de Pockai, compartido por escritorio y móvil: qué destinos existen, qué
 * sub-secciones tiene cada uno y qué va en la barra de cada plataforma. Es el único contrato: las dos
 * apps validan sus rutas contra estos tipos y no llevan listas propias de claves.
 *
 * Las etiquetas de los destinos y las sub-secciones son las del escritorio. El móvil puede usar
 * otras en su configuración, pero no otras claves.
 */

/** Destinos de primer nivel. `shop` y `settings` no van en la barra móvil: están en la cabecera. */
export const NAV_SUBS = {
  pet: {
    home: 'Inicio',
    backpack: 'Mochila',
    hatch: 'Eclosión',
    bonding: 'Vínculo',
    mind: 'Mente',
    habitat: 'Hábitat',
    wardrobe: 'Armario',
    skills: 'Habilidades',
  },
  play: {
    games: 'Minijuegos',
    arena: 'Arena',
    raid: 'Raid',
    tournament: 'Torneo',
    training: 'Entrenamiento',
    cooking: 'Cocina',
    adventure: 'Aventura',
  },
  chat: {},
  social: {
    profile: 'Mi Perfil',
    friends: 'Amigos',
    clans: 'Clanes',
    visits: 'Visitas',
  },
  progress: {
    missions: 'Misiones',
    seasons: 'Temporada',
  },
  shop: {
    store: 'Tienda',
    chests: 'Cofres',
  },
  settings: {
    account: 'Cuenta',
    notifications: 'Avisos',
    sound: 'Sonido',
    desktop: 'Escritorio',
    about: 'Acerca de',
  },
} as const;

export type NavDest = keyof typeof NAV_SUBS;
export type NavSub<D extends NavDest> = keyof (typeof NAV_SUBS)[D] & string;
/** Cualquier sub-sección válida, sea de qué destino sea. */
export type AnyNavSub = { [D in NavDest]: NavSub<D> }[NavDest];

export const NAV_LABELS: Record<NavDest, string> = {
  pet: 'Mascota',
  play: 'Jugar',
  chat: 'Chat',
  social: 'Social',
  progress: 'Progreso',
  shop: 'Tienda',
  settings: 'Ajustes',
};

/** Qué va en la barra superior del escritorio, en orden. Ajustes va aparte (engranaje). */
export const DESKTOP_NAV_BAR = ['pet', 'play', 'chat', 'social', 'progress', 'shop'] as const satisfies readonly NavDest[];

/** Qué va en la barra inferior del móvil, en orden. La tienda y los ajustes van en la cabecera. */
export const MOBILE_NAV_BAR = ['pet', 'play', 'chat', 'social', 'progress'] as const satisfies readonly NavDest[];
export type MobileBarDest = (typeof MOBILE_NAV_BAR)[number];

export const NAV_DESTS = Object.keys(NAV_SUBS) as NavDest[];

export function isNavDest(value: string): value is NavDest {
  return Object.prototype.hasOwnProperty.call(NAV_SUBS, value);
}

export function isNavSub<D extends NavDest>(dest: D, value: string): value is NavSub<D> {
  return Object.prototype.hasOwnProperty.call(NAV_SUBS[dest], value);
}

/** Las sub-secciones de un destino, en el orden en que se definen. */
export function navSubs<D extends NavDest>(dest: D): NavSub<D>[] {
  return Object.keys(NAV_SUBS[dest]) as NavSub<D>[];
}

/**
 * La sub-sección con la que se abre un destino. Exhaustivo: si se añade un destino, TypeScript
 * obliga a decidir aquí cuál es su primera sección.
 */
export function defaultSub(dest: NavDest): AnyNavSub | undefined {
  switch (dest) {
    case 'pet':
      return 'home';
    case 'play':
      return 'games';
    case 'chat':
      return undefined;
    case 'social':
      return 'profile';
    case 'progress':
      return 'missions';
    case 'shop':
      return 'store';
    case 'settings':
      return 'account';
    default: {
      const unhandled: never = dest;
      return unhandled;
    }
  }
}

/** Alias que se aceptan en `resolveNav` y apuntan a una ruta real. Hoy: «Cuenta» vive en Ajustes. */
const NAV_ALIASES: Record<string, { dest: NavDest; sub: AnyNavSub }> = {
  account: { dest: 'settings', sub: 'account' },
};

export interface NavTarget {
  dest: NavDest;
  sub?: AnyNavSub;
}

/**
 * Traduce un «ir a…» (destino y sección opcional, en texto libre) a una ruta válida. Devuelve `null`
 * si el destino o la sección no existen: quien llama decide qué hacer, sin caer en silencio.
 */
export function resolveNav(dest: string, sub?: string): NavTarget | null {
  const alias = NAV_ALIASES[dest];
  if (alias) return resolveNav(alias.dest, sub ?? alias.sub);
  if (!isNavDest(dest)) return null;
  if (sub === undefined || sub === '') return { dest, sub: defaultSub(dest) };
  if (!isNavSub(dest, sub)) return null;
  return { dest, sub };
}
