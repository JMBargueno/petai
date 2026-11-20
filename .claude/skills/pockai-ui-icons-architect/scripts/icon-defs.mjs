// Definiciones del set de iconos de interfaz de PetAI (fuente de verdad).
//
// Cada icono tiene:
//   base: formas de trazo. Las cerradas llevan fill="{F}" (fondo tintable: var(--icon-bg, transparent)).
//   acc:  forma de acento que se pinta solo en la variante duotone, con fill="{A}" fill-opacity="0.18".
//
// `node scripts/build_icons.mjs` escribe <name>.outline.svg y <name>.duo.svg en shared/ui/src/icons/.
// `node scripts/check_icons.mjs` valida la spec sobre esos archivos.

export const F = 'var(--icon-bg, transparent)';
const A_ATTR = 'fill="var(--icon-accent, currentColor)" fill-opacity="0.18" stroke="none"';

const acc = (d) => `<path d="${d}" ${A_ATTR}/>`;
const accCircle = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${A_ATTR}/>`;
const accRect = (x, y, w, h, rx) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${A_ATTR}/>`;

const EGG_BODY = 'M12 4.5c3.9 0 6.5 4.6 6.5 9.2a6.5 6.5 0 0 1-13 0c0-4.6 2.6-9.2 6.5-9.2z';
const CONTROLLER = 'M7 7.5h10a5 5 0 0 1 4.9 6l-.8 3.2a2.5 2.5 0 0 1-4.2 1.2L14.5 15h-5l-2.4 2.9a2.5 2.5 0 0 1-4.2-1.2l-.8-3.2a5 5 0 0 1 4.9-6z';
const HOUSE = 'M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19z';
const EGG = 'M12 3c3.6 0 6 5.6 6 10.2A6 6 0 0 1 6 13.2C6 8.6 8.4 3 12 3z';
const HEART = 'M12 19.5s-7-4.3-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.3c0 4.9-7 9.2-7 9.2z';
const SHIRT = 'M9 4.5 12 7l3-2.5 4 2.5-1.7 3.2-1.8-.8V19.5H7.5V9l-1.8.8L4 6.5z';
const BUBBLE = 'M5 5.5h14A1.5 1.5 0 0 1 20.5 7v8.5a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z';
const PAD = 'M8.2 14.2c0-2.3 1.7-4.4 3.8-4.4s3.8 2.1 3.8 4.4c0 1.9-1.5 3.1-3.8 3.1s-3.8-1.2-3.8-3.1z';
const GAMEPAD = 'M6.5 8h11a4.5 4.5 0 0 1 4.4 5.4l-.7 2.6a2.2 2.2 0 0 1-3.7.9l-2.4-2.4H8.9l-2.4 2.4a2.2 2.2 0 0 1-3.7-.9l-.7-2.6A4.5 4.5 0 0 1 6.5 8z';
const SHIELD = 'M12 3.5 19 6v5.5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z';
const BAG = 'M5 8.5h14l-1 11.5H6z';
const BELL = 'M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14z';
const SPEAKER = 'M4 9.5h3.5L12 6v12l-4.5-3.5H4z';
const SKULL = 'M12 4a7 7 0 0 0-7 7v3.5L7 17.5h10l2-3V11a7 7 0 0 0-7-7z';
const POT = 'M5 11h14v5.5a3.5 3.5 0 0 1-3.5 3.5h-7A3.5 3.5 0 0 1 5 16.5z';
const HEAD = 'M12 4.5a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z';
const BODY = 'M4.5 20a7.5 7.5 0 0 1 15 0z';
const STAR4 = 'M16 3.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z';
const BOWL = 'M3.5 11.5h17a8.5 8.5 0 0 1-17 0z';
const BOLT = 'M13.5 2.5 5.5 13.5h5l-1 8 8-11h-5z';
const DROP = 'M12 3.5c3.2 3.6 5.5 6.7 5.5 9.5a5.5 5.5 0 0 1-11 0c0-2.8 2.3-5.9 5.5-9.5z';
const TUB = 'M3 12.5h18v2.5a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z';
const MOON = 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z';
const VIAL = 'M10.5 9.7 7.2 16a3.2 3.2 0 0 0 2.8 4.8h4a3.2 3.2 0 0 0 2.8-4.8l-3.3-6.3z';
const SPARK_UP = 'M12 2.5l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9z';
const COIN_STAR = 'M12 8l1.1 2.6 2.6 1.1-2.6 1.1L12 15.4l-1.1-2.6-2.6-1.1 2.6-1.1z';
const GEM = 'M7 4h10l4 5.5-9 11-9-11z';
const SPARK4 = 'M16 3.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z';

export const ICONS = {
  // ── Destinos de primer nivel ─────────────────────────────────────────
  pet: {
    acc: acc(EGG_BODY),
    base: `<path d="${EGG_BODY}" fill="${F}"/><circle cx="9.5" cy="12.6" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12.6" r="1.2" fill="currentColor" stroke="none"/><path d="M10.2 15.8c.5.5 1.1.8 1.8.8s1.3-.3 1.8-.8"/><path d="M12 4.5V2.5"/><path d="M12 3.4c.9-1.3 2.2-1.6 3.4-1.1-.8 1.3-2.1 1.6-3.4 1.1z"/>`,
  },
  play: {
    acc: acc(CONTROLLER),
    base: `<path d="${CONTROLLER}" fill="${F}"/><path d="M7.5 10.5v3.5M5.75 12.25h3.5"/><circle cx="15.5" cy="11.2" r=".9" fill="currentColor" stroke="none"/><circle cx="17.6" cy="13.3" r=".9" fill="currentColor" stroke="none"/>`,
  },
  chat: {
    acc: acc(BUBBLE),
    base: `<path d="${BUBBLE}" fill="${F}"/><path d="M12 8.5v4M10 10.5h4"/>`,
  },
  social: {
    acc: accCircle(9, 8.5, 3.3),
    base: `<circle cx="9" cy="8.5" r="3.3" fill="${F}"/><path d="M3 19.5a6 6 0 0 1 12 0z" fill="${F}"/><path d="M16 4.8a3 3 0 0 1 0 5.8"/><path d="M19.5 19.5a6 6 0 0 0-3.5-5.4"/>`,
  },
  progress: {
    acc: accRect(16, 4.5, 3.5, 15, 1),
    base: `<rect x="4.5" y="12" width="3.5" height="7.5" rx="1" fill="${F}"/><rect x="10.25" y="8" width="3.5" height="11.5" rx="1" fill="${F}"/><rect x="16" y="4.5" width="3.5" height="15" rx="1" fill="${F}"/>`,
  },
  shop: {
    acc: acc(BAG),
    base: `<path d="${BAG}" fill="${F}"/><path d="M9 8.5V6.5a3 3 0 0 1 6 0v2"/>`,
  },
  settings: {
    acc: accCircle(16, 7, 2),
    base: `<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2" fill="${F}"/><circle cx="8" cy="17" r="2" fill="${F}"/>`,
  },

  // ── Mascota ──────────────────────────────────────────────────────────
  home: {
    acc: acc(HOUSE),
    base: `<path d="${HOUSE}" fill="${F}"/><path d="M9.5 20.5v-5.5h5v5.5"/>`,
  },
  backpack: {
    acc: accRect(5.5, 6.5, 13, 14, 3.5),
    base: `<rect x="5.5" y="6.5" width="13" height="14" rx="3.5" fill="${F}"/><path d="M9 6.5V5a3 3 0 0 1 6 0v1.5"/><path d="M9 13.5h6"/>`,
  },
  hatch: {
    acc: acc(EGG),
    base: `<path d="${EGG}" fill="${F}"/><path d="M7.5 13.5 10 11.5l2 2 2-1.5 2.5 2"/>`,
  },
  bonding: {
    acc: acc(HEART),
    base: `<path d="${HEART}" fill="${F}"/><path d="M3.5 4.5 5 6M20.5 4.5 19 6"/>`,
  },
  mind: {
    acc: accRect(7, 7, 10, 10, 2.5),
    base: `<rect x="7" y="7" width="10" height="10" rx="2.5" fill="${F}"/><circle cx="12" cy="12" r="1.8"/><path d="M9.5 3.5v3.5M14.5 3.5v3.5M9.5 17v3.5M14.5 17v3.5M3.5 9.5h3.5M3.5 14.5h3.5M17 9.5h3.5M17 14.5h3.5"/>`,
  },
  habitat: {
    acc: accCircle(12, 8.5, 4.5),
    base: `<path d="M7 15h10l-1.2 4.8a1 1 0 0 1-1 .7H9.2a1 1 0 0 1-1-.7z" fill="${F}"/><path d="M12 15v-3"/><circle cx="12" cy="8.5" r="4.5" fill="${F}"/>`,
  },
  wardrobe: {
    acc: accRect(4.5, 3.5, 15, 17, 2.5),
    base: `<rect x="4.5" y="3.5" width="15" height="17" rx="2.5" fill="${F}"/><path d="M12 3.5v17"/><path d="M10 11v2M14 11v2"/>`,
  },
  skills: {
    acc: acc(SPARK4),
    base: `<path d="${STAR4}" fill="${F}"/><path d="M4.5 19.5 12 12"/><path d="M7.5 3.5v2M6.5 4.5h2"/>`,
  },
  agent: {
    acc: acc('M3 12c0-2.2 4-4 9-4s9 1.8 9 4-4 4-9 4-9-1.8-9-4z'),
    base: `<path d="M3 12c0-2.2 4-4 9-4s9 1.8 9 4-4 4-9 4-9-1.8-9-4z" fill="${F}"/><path d="M13.5 8.5 10.5 12.5h3.5l-2.5 3.5"/><circle cx="19.5" cy="8.5" r="1.2" fill="${F}"/>`,
  },
  feed: {
    acc: accRect(3, 8, 18, 8.5, 4.25),
    base: `<rect x="3" y="8" width="18" height="8.5" rx="4.25" fill="${F}"/><path d="M12 8v8.5"/>`,
  },

  // ── Jugar ────────────────────────────────────────────────────────────
  games: {
    acc: accRect(4, 4, 16, 16, 3.5),
    base: `<rect x="4" y="4" width="16" height="16" rx="3.5" fill="${F}"/><circle cx="8.5" cy="8.5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="15.5" cy="15.5" r="1"/>`,
  },
  arena: {
    acc: accCircle(12, 12, 9),
    base: `<circle cx="12" cy="12" r="9" fill="${F}"/><path d="M5 5l10.5 10.5M19 5 8.5 15.5M4.5 14.5l5 5M14.5 19.5l5-5"/>`,
  },
  raid: {
    acc: acc(SKULL),
    base: `<path d="${SKULL}" fill="${F}"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/><path d="M9.5 17.5v2M12 17.5v2M14.5 17.5v2"/>`,
  },
  tournament: {
    acc: accRect(7.5, 4.5, 9, 9, 4),
    base: `<path d="M7.5 4.5h9v4.5a4.5 4.5 0 0 1-9 0z" fill="${F}"/><path d="M7.5 6.5H5a2.5 2.5 0 0 0 2.5 3.5M16.5 6.5H19a2.5 2.5 0 0 1-2.5 3.5"/><path d="M12 13.5V16"/><path d="M8.5 19.5h7v-2.5h-7z" fill="${F}"/>`,
  },
  training: {
    acc: accRect(3.5, 9, 3, 6, 1),
    base: `<rect x="3.5" y="9" width="3" height="6" rx="1" fill="${F}"/><rect x="17.5" y="9" width="3" height="6" rx="1" fill="${F}"/><rect x="6.5" y="7" width="2.5" height="10" rx="1" fill="${F}"/><rect x="15" y="7" width="2.5" height="10" rx="1" fill="${F}"/><path d="M9 12h6"/>`,
  },
  cooking: {
    acc: acc(POT),
    base: `<path d="${POT}" fill="${F}"/><path d="M3.5 11h17"/><path d="M9 7.5c-.5-1 .5-1.8 0-3M13 7.5c-.5-1 .5-1.8 0-3"/>`,
  },
  adventure: {
    acc: accCircle(12, 12, 8.5),
    base: `<circle cx="12" cy="12" r="8.5" fill="${F}"/><path d="M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5z"/>`,
  },

  // ── Social ───────────────────────────────────────────────────────────
  profile: {
    acc: accCircle(12, 8.5, 3.8),
    base: `<circle cx="12" cy="8.5" r="3.8" fill="${F}"/><path d="${BODY}" fill="${F}"/>`,
  },
  friends: {
    acc: accCircle(9, 8.5, 3.3),
    base: `<circle cx="9" cy="8.5" r="3.3" fill="${F}"/><path d="M3 19.5a6 6 0 0 1 12 0z" fill="${F}"/><path d="M16 4.8a3 3 0 0 1 0 5.8"/><path d="M19.5 19.5a6 6 0 0 0-3.5-5.4"/>`,
  },
  clans: {
    acc: acc(SHIELD),
    base: `<path d="${SHIELD}" fill="${F}"/><path d="M12 8.5v6M9.5 11h5"/>`,
  },
  visits: {
    acc: accRect(7, 4.5, 10, 16, 1.5),
    base: `<path d="M5.5 20.5V5A1.5 1.5 0 0 1 7 3.5h10A1.5 1.5 0 0 1 18.5 5v15.5"/><path d="M3.5 20.5h17"/><path d="M9 12h6M12.5 9.5 15 12l-2.5 2.5"/>`,
  },

  // ── Progreso ─────────────────────────────────────────────────────────
  missions: {
    acc: accCircle(12, 12, 8),
    base: `<circle cx="12" cy="12" r="8" fill="${F}"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>`,
  },
  seasons: {
    acc: accRect(3.5, 5, 17, 15.5, 3),
    base: `<rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="${F}"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M12 12.8l.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2z"/>`,
  },

  // ── Tienda ───────────────────────────────────────────────────────────
  store: {
    acc: acc(BAG),
    base: `<path d="${BAG}" fill="${F}"/><path d="M9 8.5V6.5a3 3 0 0 1 6 0v2"/>`,
  },
  chests: {
    acc: accRect(3.5, 10, 17, 10.5, 2),
    base: `<rect x="3.5" y="10" width="17" height="10.5" rx="2" fill="${F}"/><path d="M3.5 13.5h17"/><path d="M3.5 10V7.5A2.5 2.5 0 0 1 6 5h12a2.5 2.5 0 0 1 2.5 2.5V10"/><path d="M10.5 13.5h3v2.5h-3z"/>`,
  },

  // ── Ajustes ──────────────────────────────────────────────────────────
  account: {
    acc: accCircle(12, 12, 8.5),
    base: `<circle cx="12" cy="12" r="8.5" fill="${F}"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.2a6.5 6.5 0 0 1 11 0"/>`,
  },
  notifications: {
    acc: acc(BELL),
    base: `<path d="${BELL}" fill="${F}"/><path d="M10 20.5a2 2 0 0 0 4 0"/>`,
  },
  sound: {
    acc: acc(SPEAKER),
    base: `<path d="${SPEAKER}" fill="${F}"/><path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>`,
  },
  desktop: {
    acc: accRect(3.5, 4.5, 17, 11.5, 2.5),
    base: `<rect x="3.5" y="4.5" width="17" height="11.5" rx="2.5" fill="${F}"/><path d="M9 20h6M12 16v4"/>`,
  },
  about: {
    acc: accCircle(12, 12, 8.5),
    base: `<circle cx="12" cy="12" r="8.5" fill="${F}"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6"/>`,
  },

  // ── Constantes vitales y cuidados (la app de reloj, spec 44) ─────────
  // El reloj no tiene Lucide, así que estos destinos necesitan icono propio. Se eligen formas que
  // no choquen con las que ya hay: el corazón es de `bonding`, el huevo de `hatch` (que el reloj
  // reutiliza para la cuenta atrás de la eclosión) y la estrella de `skills`.
  hunger: {
    acc: acc(BOWL),
    base: `<path d="${BOWL}" fill="${F}"/><path d="M2.5 11.5h19"/><path d="M12 10.5c-1.8 0-2.9-1.1-2.9-2.5S10.2 5.5 12 5.5s2.9 1.1 2.9 2.5S13.8 10.5 12 10.5z" fill="${F}"/><path d="M12 5.5V4"/>`,
  },
  happiness: {
    acc: accCircle(12, 12, 8.5),
    base: `<circle cx="12" cy="12" r="8.5" fill="${F}"/><circle cx="9.3" cy="10.2" r=".9" fill="currentColor" stroke="none"/><circle cx="14.7" cy="10.2" r=".9" fill="currentColor" stroke="none"/><path d="M8.3 14c.9 1.4 2.2 2.1 3.7 2.1s2.8-.7 3.7-2.1"/>`,
  },
  energy: {
    acc: acc(BOLT),
    base: `<path d="${BOLT}" fill="${F}"/>`,
  },
  hygiene: {
    acc: acc(DROP),
    base: `<path d="${DROP}" fill="${F}"/><path d="M9.5 14.2a2.6 2.6 0 0 0 2.5 2.6"/>`,
  },
  health: {
    acc: accRect(3.5, 6, 17, 13, 3),
    base: `<rect x="3.5" y="6" width="17" height="13" rx="3" fill="${F}"/><path d="M9 6V4.5h6V6"/><path d="M12 9.8v5.4M9.3 12.5h5.4"/>`,
  },
  clean: {
    acc: acc(TUB),
    base: `<path d="${TUB}" fill="${F}"/><path d="M6 12.5V6.5a2 2 0 0 1 4 0"/><path d="M7 19.5 6 21M17 19.5l1 1.5"/><circle cx="15.5" cy="6.5" r="1.5"/><circle cx="18.5" cy="9" r="1"/>`,
  },
  sleep: {
    acc: acc(MOON),
    base: `<path d="${MOON}" fill="${F}"/>`,
  },
  wake: {
    acc: accCircle(12, 12, 4.5),
    base: `<circle cx="12" cy="12" r="4.5" fill="${F}"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.2 5.2 7 7M17 17l1.8 1.8M18.8 5.2 17 7M7 17l-1.8 1.8"/>`,
  },
  heal: {
    acc: acc(VIAL),
    base: `<path d="M9 3.5h6M10.5 3.5v6.2L7.2 16a3.2 3.2 0 0 0 2.8 4.8h4a3.2 3.2 0 0 0 2.8-4.8l-3.3-6.3V3.5" fill="${F}"/><path d="M7.8 14.5h8.4"/><path d="M12 11.5v3M10.5 13h3"/>`,
  },
  evolve: {
    acc: acc(SPARK_UP),
    base: `<path d="M6.5 13.5 12 8l5.5 5.5"/><path d="M6.5 19.5 12 14l5.5 5.5"/><path d="${SPARK_UP}" fill="${F}"/>`,
  },

  // ── Monedas y gemas ──────────────────────────────────────────────────
  // El resto de clientes las sigue pintando con Lucide (GUIA_ARTISTICA §6); estas dos entran al set
  // porque el reloj no tiene de dónde sacarlas. El cableado de web y escritorio no cambia.
  coin: {
    acc: accCircle(12, 12, 8.5),
    base: `<circle cx="12" cy="12" r="8.5" fill="${F}"/><path d="${COIN_STAR}" fill="${F}"/>`,
  },
  gem: {
    acc: acc(GEM),
    base: `<path d="${GEM}" fill="${F}"/><path d="M3 9.5h18"/><path d="M7 4 9.5 9.5 12 20.5 14.5 9.5 17 4"/>`,
  },
};

export const UI_ICON_NAMES = Object.keys(ICONS);
