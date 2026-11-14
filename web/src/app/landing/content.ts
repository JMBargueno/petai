import balance from '../../../../shared/game-data/balance.json';
import patternData from '../../../../shared/game-data/patterns.json';
import speciesData from '../../../../shared/game-data/species.json';
import { DOWNLOADS } from '../site.config';
import type { StickerColor, StickerIcon } from '../shared/ui/sticker';

/**
 * Textos de la landing que viven en listas. Cada cadena lleva un id fijo (`@@id`)
 * que debe existir también en src/locale/messages.en.json.
 */

export const MARQUEE = $localize`:@@marquee.text:Pockai · Tu yokai de bolsillo con IA · Eclosiona · Cuida · Combate · Conversa ·`;

export const META = {
  title: $localize`:@@meta.title:Pockai — Tu yokai de bolsillo con IA`,
  description: $localize`:@@meta.description:Pockai es una mascota virtual que eclosionas, cuidas y haces crecer. Vive en tu escritorio y en tu móvil, combate en la Arena y conversa contigo gracias a la IA.`,
};

export interface Feature {
  icon: StickerIcon;
  color: StickerColor;
  title: string;
  body: string;
}

export const FEATURES: Feature[] = [
  {
    icon: 'egg',
    color: 'sunburst',
    title: $localize`:@@feat.hatch.title:Eclosión`,
    body: $localize`:@@feat.hatch.body:Cada huevo esconde una criatura con rareza, patrón y paleta propios, de normal a mítica. Con suerte, incluso una variante shiny.`,
  },
  {
    icon: 'heart',
    color: 'ember',
    title: $localize`:@@feat.care.title:Cuidado`,
    body: $localize`:@@feat.care.body:Hambre, felicidad, energía, higiene y salud. Si la descuidas puede enfermar o ponerse triste; si la cuidas, crece hasta su forma final.`,
  },
  {
    icon: 'star',
    color: 'mint-pop',
    title: $localize`:@@feat.games.title:Minijuegos`,
    body: $localize`:@@feat.games.body:Atrapa la comida, Parejas de memoria y Reflejos. Jugar da experiencia y monedas para la tienda.`,
  },
  {
    icon: 'shield',
    color: 'electric-blue',
    title: $localize`:@@feat.arena.title:Arena`,
    body: $localize`:@@feat.arena.body:Combates asíncronos contra las mascotas de otros jugadores, con elementos, habilidades, repeticiones animadas y ligas de Bronce a Mítica.`,
  },
  {
    icon: 'chat',
    color: 'lavender',
    title: $localize`:@@feat.ai.title:Inteligencia`,
    body: $localize`:@@feat.ai.body:Conecta tu propio modelo de lenguaje y tu pockai conversa, recuerda lo que le cuentas y actúa como un pequeño agente personal.`,
  },
  {
    icon: 'phone',
    color: 'voltage-violet',
    title: $localize`:@@feat.sync.title:Sincronización`,
    body: $localize`:@@feat.sync.body:La misma mascota en el escritorio y en el móvil. Vinculas los dispositivos con un código y los cambios llegan al momento.`,
  },
];

const ELEMENTS: Record<string, string> = {
  fire: $localize`:@@el.fire:Fuego`,
  water: $localize`:@@el.water:Agua`,
  plant: $localize`:@@el.plant:Planta`,
  electric: $localize`:@@el.electric:Eléctrico`,
  shadow: $localize`:@@el.shadow:Sombra`,
  light: $localize`:@@el.light:Luz`,
};

export const RARITIES: Record<string, string> = {
  normal: $localize`:@@rar.normal:Normal`,
  rare: $localize`:@@rar.rare:Raro`,
  super_rare: $localize`:@@rar.super_rare:Super-raro`,
  legendary: $localize`:@@rar.legendary:Legendario`,
  mythic: $localize`:@@rar.mythic:Mítico`,
};

const CARD_COLORS: StickerColor[] = ['sunburst', 'lavender', 'mint-pop', 'electric-blue'];

/** Especies reales del juego, leídas del catálogo compartido del monorepo. */
export const SPECIES = speciesData.map((s, i) => ({
  id: s.id,
  name: s.name,
  spriteKey: s.spriteKey,
  element: ELEMENTS[s.element] ?? s.element,
  rarity: RARITIES[s.rarity] ?? s.rarity,
  color: CARD_COLORS[i % CARD_COLORS.length],
}));

const READY = $localize`:@@plat.status.ready:Disponible`;
const IN_PROGRESS = $localize`:@@plat.status.wip:En desarrollo`;

export const PLATFORMS = [
  {
    name: 'Windows',
    status: READY,
    url: DOWNLOADS.windows,
    body: $localize`:@@plat.windows.body:Tu pockai vive sobre el escritorio: camina, duerme y come en una ventana transparente, con chat flotante y avisos nativos.`,
  },
  {
    name: 'Android',
    status: READY,
    url: DOWNLOADS.android,
    body: $localize`:@@plat.android.body:Eclosión, cuidados, tienda, Arena, minijuegos y chat. Con widget para la pantalla de inicio.`,
  },
  {
    name: 'iOS',
    status: IN_PROGRESS,
    url: DOWNLOADS.ios,
    body: $localize`:@@plat.ios.body:La versión para iPhone está en camino.`,
  },
];

export const FAQ = [
  {
    q: $localize`:@@faq.1.q:¿En qué plataformas está Pockai?`,
    a: $localize`:@@faq.1.a:En Windows y Android. La versión para iOS está en desarrollo.`,
  },
  {
    q: $localize`:@@faq.2.q:¿Necesito una API key para jugar?`,
    a: $localize`:@@faq.2.a:No. La parte de IA es opcional: si quieres que tu pockai converse, conectas tu propia API key o un Hermes Agent. Las claves se cifran en el servidor y la app solo muestra una máscara.`,
  },
  {
    q: $localize`:@@faq.3.q:¿Cómo vinculo el escritorio con el móvil?`,
    a: $localize`:@@faq.3.a:La app de escritorio muestra un código de seis dígitos que confirmas desde el móvil. A partir de ahí ambos muestran la misma mascota.`,
  },
  {
    q: $localize`:@@faq.4.q:¿Los combates son en tiempo real?`,
    a: $localize`:@@faq.4.a:No, son asíncronos. Eliges una estrategia, el servidor busca un rival de tu nivel y simula el combate; después puedes ver la repetición animada.`,
  },
  {
    q: $localize`:@@faq.5.q:¿Qué pasa si no cuido a mi pockai?`,
    a: $localize`:@@faq.5.a:Si una estadística se queda baja mucho tiempo puede enfermar y habrá que curarla, o ponerse triste y rendir menos en combate.`,
  },
];

export const STEPS: { icon: StickerIcon; color: StickerColor; motion: string; title: string; body: string }[] = [
  {
    icon: 'egg',
    color: 'sunburst',
    motion: 'wiggle',
    title: $localize`:@@how.1.title:Eclosiona`,
    body: $localize`:@@how.1.body:Consigue un huevo, espera a que incube y descubre qué criatura te ha tocado.`,
  },
  {
    icon: 'heart',
    color: 'ember',
    motion: 'beat',
    title: $localize`:@@how.2.title:Cuida`,
    body: $localize`:@@how.2.body:Dale de comer, juega con ella y déjala dormir. Crece contigo, de bebé a forma final.`,
  },
  {
    icon: 'shield',
    color: 'electric-blue',
    motion: 'clash',
    title: $localize`:@@how.3.title:Combate`,
    body: $localize`:@@how.3.body:Llévala a la Arena, elige estrategia y sube de liga contra las mascotas de otros jugadores.`,
  },
];

const RARITY_COLORS: Record<string, StickerColor> = {
  normal: 'mint-pop',
  rare: 'electric-blue',
  super_rare: 'lavender',
  legendary: 'sunburst',
  mythic: 'ember',
};

const percent = (p: number) => Math.round(p * 1000) / 10;

/** Probabilidades reales de eclosión (shared/game-data/balance.json). */
export const RARITY_ODDS = Object.entries(balance.rarity).map(([id, r]) => ({
  id,
  name: RARITIES[id] ?? id,
  probability: r.probability,
  percent: percent(r.probability),
  color: RARITY_COLORS[id] ?? 'sunburst',
}));

export const SHINY_PROBABILITY = balance.shinyProbability;
export const SHINY_NOTE = $localize`:@@rar.shiny:Y además, un ${percent(balance.shinyProbability)}:PERCENT: % de las eclosiones sale en variante shiny.`;

const PATTERN_NAMES: Record<string, string> = {
  plain: $localize`:@@pat.plain:Liso`,
  spots: $localize`:@@pat.spots:Manchas`,
  stripes: $localize`:@@pat.stripes:Rayas`,
  gradient: $localize`:@@pat.gradient:Degradado`,
  scales: $localize`:@@pat.scales:Escamas`,
  crystal: $localize`:@@pat.crystal:Cristal`,
  galaxy: $localize`:@@pat.galaxy:Galaxia`,
  aurora: $localize`:@@pat.aurora:Aurora`,
};
const PATTERN_SPRITES = new Set(['spots', 'stripes', 'gradient', 'scales']);

export const PATTERNS = patternData.map((p) => ({
  id: p.id,
  name: PATTERN_NAMES[p.id] ?? p.name,
  minRarity: RARITIES[p.minRarity] ?? p.minRarity,
  sprite: PATTERN_SPRITES.has(p.id) ? `sprites/pattern_${p.id}.svg` : null,
  color: RARITY_COLORS[p.minRarity] ?? 'sunburst',
}));

export const DESKTOP_POINTS = [
  $localize`:@@desk.1:Vive en una ventana transparente, por encima de lo que estés haciendo.`,
  $localize`:@@desk.2:Los clics la atraviesan: no te estorba para trabajar.`,
  $localize`:@@desk.3:Chat flotante y avisos nativos cuando necesita algo.`,
];
