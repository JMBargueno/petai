import balance from '../../../../shared/game-data/balance.json';
import patternData from '../../../../shared/game-data/patterns.json';
import skillsData from '../../../../shared/game-data/skills.json';
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
  description: $localize`:@@meta.description:Pockai es una mascota virtual que eclosionas, cuidas y haces crecer. Vive en tu escritorio y en tu móvil, combate en la Arena y conversa contigo con IA.`,
  imageAlt: $localize`:@@meta.imageAlt:Pockai, la mascota virtual con IA, junto a sus primeras especies`,
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
  {
    q: $localize`:@@faq.6.q:¿Tiene algún coste o suscripción mensual?`,
    a: $localize`:@@faq.6.a:No, jugar es 100 % gratis. Todo el contenido principal (cuidado, minijuegos, combates y misiones) se desbloquea jugando sin muros de pago.`,
  },
  {
    q: $localize`:@@faq.7.q:¿Cómo se protegen mis datos y conversaciones de IA?`,
    a: $localize`:@@faq.7.a:Tus claves de API se cifran con AES en reposo. Tus conversaciones no se venden a terceros ni se usan para entrenar modelos. Tienes control total para ver y borrar recuerdos.`,
  },
  {
    q: $localize`:@@faq.8.q:¿Funciona sin conexión a internet?`,
    a: $localize`:@@faq.8.a:Sí. Puedes cuidar de tu pockai y jugar a minijuegos en local. La Arena, las misiones y la sincronización entre dispositivos se sincronizan en cuanto recuperas conexión.`,
  },
  {
    q: $localize`:@@faq.9.q:¿Qué pasa con mi mascota si cambio de móvil?`,
    a: $localize`:@@faq.9.a:Tu pockai está asociada a tu perfil. Al iniciar sesión o vincular tu nuevo dispositivo con tu código, recuperas tu mascota, nivel, inventario y progreso intactos.`,
  },
  {
    q: $localize`:@@faq.10.q:¿Cuáles son los requisitos del sistema?`,
    a: $localize`:@@faq.10.a:En PC funciona en Windows 10 y 11 con mínimo consumo de recursos. En móvil requiere Android 8.0 o superior.`,
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

export const RARITY_COLORS: Record<string, StickerColor> = {
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

/* ─────────────────────────────────────────────────────────────
 * Arena a fondo (datos compartidos de balance.json y skills.json)
 * ───────────────────────────────────────────────────────────── */

export interface ElementRelation {
  id: string;
  name: string;
  color: StickerColor;
  advantage: string | null;
  disadvantage: string | null;
  multiplierText: string;
}

export const ELEMENT_RELATIONS: ElementRelation[] = [
  {
    id: 'fire',
    name: $localize`:@@el.fire:Fuego`,
    color: 'ember',
    advantage: $localize`:@@el.plant:Planta`,
    disadvantage: $localize`:@@el.water:Agua`,
    multiplierText: $localize`:@@arena.fire.multi:Daño x1,5 contra Planta, x0,67 contra Agua.`,
  },
  {
    id: 'water',
    name: $localize`:@@el.water:Agua`,
    color: 'electric-blue',
    advantage: $localize`:@@el.fire:Fuego`,
    disadvantage: $localize`:@@el.plant:Planta`,
    multiplierText: $localize`:@@arena.water.multi:Daño x1,5 contra Fuego, x0,67 contra Planta.`,
  },
  {
    id: 'plant',
    name: $localize`:@@el.plant:Planta`,
    color: 'mint-pop',
    advantage: $localize`:@@el.water:Agua`,
    disadvantage: $localize`:@@el.fire:Fuego`,
    multiplierText: $localize`:@@arena.plant.multi:Daño x1,5 contra Agua, x0,67 contra Fuego.`,
  },
  {
    id: 'neutral',
    name: $localize`:@@el.neutral:Neutro`,
    color: 'lavender',
    advantage: null,
    disadvantage: null,
    multiplierText: $localize`:@@arena.neutral.multi:Equilibrado, sin multiplicadores elementales.`,
  },
];

export const COMBAT_STRATEGIES = [
  {
    id: 'aggressive',
    title: $localize`:@@arena.strat.agg.title:Agresiva`,
    icon: 'bolt' as StickerIcon,
    color: 'ember' as StickerColor,
    desc: $localize`:@@arena.strat.agg.desc:Prioriza habilidades de daño directo para finalizar el combate lo antes posible.`,
  },
  {
    id: 'balanced',
    title: $localize`:@@arena.strat.bal.title:Equilibrada`,
    icon: 'star' as StickerIcon,
    color: 'sunburst' as StickerColor,
    desc: $localize`:@@arena.strat.bal.desc:Adapta ataque y defensa según la vida y el estado del rival.`,
  },
  {
    id: 'defensive',
    title: $localize`:@@arena.strat.def.title:Defensiva`,
    icon: 'shield' as StickerIcon,
    color: 'mint-pop' as StickerColor,
    desc: $localize`:@@arena.strat.def.desc:Usa guardias y curaciones para aguantar y desgastar al oponente.`,
  },
];

const LEAGUE_NAMES: Record<string, string> = {
  bronze: $localize`:@@league.bronze:Bronce`,
  silver: $localize`:@@league.silver:Plata`,
  gold: $localize`:@@league.gold:Oro`,
  platinum: $localize`:@@league.platinum:Platino`,
  diamond: $localize`:@@league.diamond:Diamante`,
  mythic: $localize`:@@league.mythic:Mítica`,
};

export const ARENA_LEAGUES = balance.combats.leagues.map((l) => ({
  id: l.id,
  name: LEAGUE_NAMES[l.id] ?? l.name,
  minElo: l.minElo,
}));

export interface SkillItem {
  id: string;
  name: string;
  element: string;
  elementName: string;
  kind: 'attack' | 'guard' | 'heal';
  kindName: string;
  power: number;
  accuracy: number;
  unlockLevel: number;
  description: string;
  color: StickerColor;
}

const KIND_NAMES: Record<string, string> = {
  attack: $localize`:@@skill.kind.attack:Ataque`,
  guard: $localize`:@@skill.kind.guard:Guardia`,
  heal: $localize`:@@skill.kind.heal:Curación`,
};

const ELEMENT_COLORS: Record<string, StickerColor> = {
  fire: 'ember',
  water: 'electric-blue',
  plant: 'mint-pop',
  neutral: 'lavender',
};

export const SKILLS_CATALOG: SkillItem[] = skillsData.map((s) => ({
  id: s.id,
  name: s.name,
  element: s.element,
  elementName: ELEMENTS[s.element] ?? (s.element === 'neutral' ? $localize`:@@el.neutral:Neutro` : s.element),
  kind: s.kind as 'attack' | 'guard' | 'heal',
  kindName: KIND_NAMES[s.kind] ?? s.kind,
  power: s.power,
  accuracy: s.accuracy,
  unlockLevel: s.unlockLevel,
  description: s.description,
  color: ELEMENT_COLORS[s.element] ?? 'sunburst',
}));

/* ─────────────────────────────────────────────────────────────
 * Precios y Economía Transparente
 * ───────────────────────────────────────────────────────────── */

export interface PricingCard {
  title: string;
  badge: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  color: StickerColor;
  icon: StickerIcon;
  ctaText: string;
  ctaLink: string;
  filled: boolean;
}

export const PRICING_CARDS: PricingCard[] = [
  {
    title: $localize`:@@price.free.title:Juego Completo`,
    badge: $localize`:@@price.free.badge:Sin costes`,
    price: '0 €',
    period: $localize`:@@price.free.period:Gratis para siempre`,
    description: $localize`:@@price.free.desc:Todo el núcleo del juego sin muros de pago ni compras obligatorias.`,
    features: [
      $localize`:@@price.free.f1:Eclosión y cuidados diarios sin límites de tiempo`,
      $localize`:@@price.free.f2:Los 3 minijuegos para ganar experiencia y monedas`,
      $localize`:@@price.free.f3:10 combates diarios en la Arena con repetición animada`,
      $localize`:@@price.free.f4:Sincronización instantánea entre PC y móvil`,
    ],
    color: 'mint-pop',
    icon: 'heart',
    ctaText: $localize`:@@price.free.cta:Empezar a jugar`,
    ctaLink: '#descargar',
    filled: false,
  },
  {
    title: $localize`:@@price.pass.title:Pase de Temporada`,
    badge: $localize`:@@price.pass.badge:100% Cosmético`,
    price: '300',
    period: $localize`:@@price.pass.period:Gemas del juego`,
    description: $localize`:@@price.pass.desc:Apoya el proyecto y personaliza a tu pockai con recompensas exclusivas.`,
    features: [
      $localize`:@@price.pass.f1:50 niveles con skins, fondos y marcos únicos`,
      $localize`:@@price.pass.f2:Gemas conseguibles gratis en misiones y logros`,
      $localize`:@@price.pass.f3:Cero ventajas competitivas en combate`,
      $localize`:@@price.pass.f4:Conserva todas tus recompensas de por vida`,
    ],
    color: 'sunburst',
    icon: 'star',
    ctaText: $localize`:@@price.pass.cta:Ver recompensas`,
    ctaLink: '#funciones',
    filled: true,
  },
  {
    title: $localize`:@@price.ai.title:IA Abierta (BYOK)`,
    badge: $localize`:@@price.ai.badge:Tú eliges`,
    price: '0 €',
    period: $localize`:@@price.ai.period:Sin suscripción fija`,
    description: $localize`:@@price.ai.desc:Conecta tu propia API key de Google Gemini u OpenAI sin intermediarios.`,
    features: [
      $localize`:@@price.ai.f1:Usa los niveles gratuitos oficiales de los proveedores`,
      $localize`:@@price.ai.f2:Cero comisión o recargo sobre el coste del token`,
      $localize`:@@price.ai.f3:Cifrado seguro AES-GCM de tus claves en el servidor`,
      $localize`:@@price.ai.f4:Memoria privada: borra recuerdos cuando quieras`,
    ],
    color: 'lavender',
    icon: 'chat',
    ctaText: $localize`:@@price.ai.cta:Saber más`,
    ctaLink: '#faq',
    filled: false,
  },
];

