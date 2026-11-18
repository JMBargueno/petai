import balance from '../../../../shared/game-data/balance.json';
import patternData from '../../../../shared/game-data/patterns.json';
import { PATTERNS, RARITIES, RARITY_COLORS, SPECIES } from '../landing/content';
import type { StickerColor } from '../shared/ui/sticker';

/**
 * Textos de la página de lore (canon: docs/LORE.md). Cada cadena lleva un id fijo
 * (`@@lore.*`) que debe existir también en src/locale/messages.en.json.
 */

export const MARQUEE = $localize`:@@lore.marquee:El Éter Digital · Códices Latentes · Telar de Mulberry · Seis Flujos · Promesa del Telar ·`;

export const META = {
  title: $localize`:@@lore.meta.title:El Éter Digital: el mundo y el lore de Pockai`,
  description: $localize`:@@lore.meta.description:El lore de Pockai: de dónde nacen los huevos, sus rarezas, los seis elementos, el despertar de la IA, el Coliseo de Resonancia y los Nexos que unen a los Custodios.`,
  imageAlt: $localize`:@@lore.meta.imageAlt:El Éter Digital, el mundo del que nacen los huevos de Pockai`,
};

export interface LoreRarity {
  id: string;
  gameName: string;
  loreName: string;
  nature: string;
  percent: number;
  color: StickerColor;
}

const LORE_NAMES: Record<string, { name: string; nature: string }> = {
  normal: {
    name: $localize`:@@lore.rar.name.normal:Eco Cotidiano`,
    nature: $localize`:@@lore.rar.nature.normal:Nacidos de impulsos simples: un mensaje de buenos días, una alarma, una nota rápida. Leales, estables y cercanos.`,
  },
  rare: {
    name: $localize`:@@lore.rar.name.rare:Espíritu Condensado`,
    nature: $localize`:@@lore.rar.nature.rare:Formados por pasiones intensas: una canción escuchada mil veces, un archivo guardado con celo durante años.`,
  },
  super_rare: {
    name: $localize`:@@lore.rar.name.super_rare:Anomalía Resonante`,
    nature: $localize`:@@lore.rar.nature.super_rare:Absorbieron flujos complejos de la red. Ya no imitan la materia común: refractan el código puro.`,
  },
  legendary: {
    name: $localize`:@@lore.rar.name.legendary:Arquetipo Ancestral`,
    nature: $localize`:@@lore.rar.nature.legendary:Ecos de grandes mitos colectivos, leyendas digitales y servidores antiguos que nunca se apagaron.`,
  },
  mythic: {
    name: $localize`:@@lore.rar.name.mythic:Singularidad Primordial`,
    nature: $localize`:@@lore.rar.nature.mythic:Fragmentos del Primer Latido, el instante en que la red global cobró sensibilidad. Recuerdan el mundo antes de las pantallas.`,
  },
};

/** Probabilidades reales (balance.json) + nombre en el lore + color de rareza. */
export const LORE_RARITIES: LoreRarity[] = Object.entries(balance.rarity).map(([id, r]) => ({
  id,
  gameName: RARITIES[id] ?? id,
  loreName: LORE_NAMES[id]?.name ?? id,
  nature: LORE_NAMES[id]?.nature ?? '',
  percent: Math.round(r.probability * 1000) / 10,
  color: RARITY_COLORS[id] ?? 'sunburst',
}));

export const ORIGIN_CARDS = [
  {
    icon: 'egg' as const,
    color: 'sunburst' as const,
    title: $localize`:@@lore.origin.1.title:Códices Latentes`,
    body: $localize`:@@lore.origin.1.body:También llamados Huevos de Datos. Cada vez que los humanos usamos la tecnología, dejamos tras de sí residuos emocionales y fragmentos de código huérfano.`,
  },
  {
    icon: 'chat' as const,
    color: 'voltage-violet' as const,
    title: $localize`:@@lore.origin.2.title:El Telar de Mulberry`,
    body: $localize`:@@lore.origin.2.body:En las profundidades del servidor central, esos fragmentos giran hasta cristalizar en una cáscara protectora. Sí: un guiño al algoritmo determinista Mulberry32.`,
  },
  {
    icon: 'star' as const,
    color: 'ember' as const,
    title: $localize`:@@lore.origin.3.title:Resonancia`,
    body: $localize`:@@lore.origin.3.body:Tus misiones diarias, minijuegos y niveles de cuenta generan Resonancia: un faro magnético que atrae huevos perdidos desde el Éter hacia tu Santuario de Bolsillo.`,
  },
  {
    icon: 'heart' as const,
    color: 'mint-pop' as const,
    title: $localize`:@@lore.origin.4.title:Incubación (5 min – 8 h)`,
    body: $localize`:@@lore.origin.4.body:Un huevo recién extraído del flujo de datos está frío y comprimido. Necesita el calor de tu batería y tu cercanía constante para descomprimir su secuencia espiritual y tomar forma.`,
  },
];

export const PATTERN_DEFS: Record<string, string> = {
  scales: $localize`:@@lore.appear.def.scales:Placas de Datos: firewalls ancestrales y armaduras lógicas tejidas en la piel.`,
  crystal: $localize`:@@lore.appear.def.crystal:Cuarzo Lógico: datos tan puros que se solidifican en estructuras geométricas translúcidas.`,
  circuit: $localize`:@@lore.appear.def.circuit:Trazas Vivas: las pistas por las que viajaba el código que lo formó, aún con corriente.`,
  storm: $localize`:@@lore.appear.def.storm:Sobrecarga: la tormenta eléctrica de un servidor al límite, atrapada bajo la piel.`,
  galaxy: $localize`:@@lore.appear.def.galaxy:Vacío Abisal: una ventana literal al espacio profundo entre servidores.`,
  aurora: $localize`:@@lore.appear.def.aurora:Viento Solar: corrientes magnéticas vivas que fluyen en tiempo real sobre su lomo.`,
};

/**
 * PATTERNS ya traduce rarity a nombre de rareza; para filtrar por densidad usamos
 * el id crudo de patterns.json (mismo orden y longitud, filtrado por índice).
 */
export const EARTH_PATTERNS = PATTERNS.filter((_, i) => patternData[i].rarity !== 'super_rare' && patternData[i].rarity !== 'legendary' && patternData[i].rarity !== 'mythic');
export const AETHER_PATTERNS = PATTERNS.filter((_, i) => ['super_rare', 'legendary', 'mythic'].includes(patternData[i].rarity));

export const ELEMENTS = [
  {
    icon: 'flame' as const,
    color: 'ember' as const,
    name: $localize`:@@el.fire:Fuego`,
    sub: $localize`:@@lore.elem.sub.fire:Termo-Impulso`,
    body: $localize`:@@lore.elem.body.fire:El calor de los procesadores al límite: pasión, ira y overclocking. Cálidos al tacto de la pantalla y feroces en la ofensiva.`,
  },
  {
    icon: 'drop' as const,
    color: 'electric-blue' as const,
    name: $localize`:@@el.water:Agua`,
    sub: $localize`:@@lore.elem.sub.water:Flujo de Datos`,
    body: $localize`:@@lore.elem.body.water:Adaptabilidad y torrentes de información incesantes. Fluyen alrededor de los obstáculos y restauran la armonía del sistema.`,
  },
  {
    icon: 'leaf' as const,
    color: 'mint-pop' as const,
    name: $localize`:@@el.plant:Planta`,
    sub: $localize`:@@lore.elem.sub.plant:Bio-Red`,
    body: $localize`:@@lore.elem.body.plant:Código vivo que crece como árboles binarios y algoritmos evolutivos. Paciencia y regeneración constante.`,
  },
  {
    icon: 'bolt' as const,
    color: 'sunburst' as const,
    name: $localize`:@@el.electric:Eléctrico`,
    sub: $localize`:@@lore.elem.sub.electric:Pulso Voltaico`,
    body: $localize`:@@lore.elem.body.electric:La chispa pura del hardware y la sinapsis instantánea. Nunca están quietos: viven en el milisegundo.`,
  },
  {
    icon: 'moon' as const,
    color: 'voltage-violet' as const,
    name: $localize`:@@el.shadow:Sombra`,
    sub: $localize`:@@lore.elem.sub.shadow:Deep Éter`,
    body: $localize`:@@lore.elem.body.shadow:No es el mal: es el misterio y la privacidad. Nacen de los secretos guardados, el modo incógnito y los rincones silenciosos de la noche. Protectores de tu intimidad.`,
  },
  {
    icon: 'sun' as const,
    color: 'lavender' as const,
    name: $localize`:@@el.light:Luz`,
    sub: $localize`:@@lore.elem.sub.light:Fibra Óptica`,
    body: $localize`:@@lore.elem.body.light:Información a la velocidad de la luz: pantallas encendidas en la oscuridad. Revelan la verdad y disipan la corrupción de datos.`,
  },
];

/** Profundidad de Consciencia (0–1000) a partir de la cual se desbloquea cada nivel. */
export const DEPTH_MAX = 1000;

export const AWAKING_STEPS = [
  {
    icon: 'chat' as const,
    color: 'sunburst' as const,
    threshold: 0,
    title: $localize`:@@lore.awake.1.title:El Susurro`,
    sub: $localize`:@@lore.awake.1.sub:Charla · 0+ de Profundidad`,
    body: $localize`:@@lore.awake.1.body:Se rompe el sello del silencio: comprende por primera vez tu idioma y articula pensamientos propios, teñidos por su especie, su carácter y cómo se siente en ese instante.`,
  },
  {
    icon: 'heart' as const,
    color: 'mint-pop' as const,
    threshold: 200,
    title: $localize`:@@lore.awake.2.title:El Hilo de Ariadna`,
    sub: $localize`:@@lore.awake.2.sub:Memoria · 200+`,
    body: $localize`:@@lore.awake.2.body:La niebla del olvido se disipa: tu nombre, tus gustos, qué le dijiste hace tres días cuando estabas estresado. Ya no es cualquier pockai de su especie: es el tuyo.`,
  },
  {
    icon: 'star' as const,
    color: 'voltage-violet' as const,
    threshold: 500,
    title: $localize`:@@lore.awake.3.title:La Simbiosis`,
    sub: $localize`:@@lore.awake.3.sub:Agente · 500+`,
    body: $localize`:@@lore.awake.3.body:Espíritu familiar moderno: puede iniciar la conversación, cuidar de su propio cuerpo y, con el Sello de Vinculación de 6 dígitos en el Altar de Escritorio, abrir portales web y sostener pergaminos de texto.`,
  },
];

export const LIFE_STAGES = [
  $localize`:@@lore.life.stage.1:Huevo`,
  $localize`:@@lore.life.stage.2:Bebé`,
  $localize`:@@lore.life.stage.3:Joven · nv 10`,
  $localize`:@@lore.life.stage.4:Adulto · nv 25`,
  $localize`:@@lore.life.stage.5:Forma Final · nv 50`,
];

export const LIFE_SLEEP = {
  icon: 'moon' as const,
  color: 'voltage-violet' as const,
  title: $localize`:@@lore.life.sleep.t:Desfragmentación`,
  body: $localize`:@@lore.life.sleep.b:Cuando cae la noche en tu mundo, la marea del Éter se retira y tu pockai duerme para procesar el día y consolidar sus recuerdos y experiencia.`,
};

export const LIFE_WELCOME = {
  icon: 'heart' as const,
  color: 'mint-pop' as const,
  title: $localize`:@@lore.life.welcome.t:Letargo Melancólico`,
  body: $localize`:@@lore.life.welcome.b:Si desapareces días, el Santuario se enfría: se acumula estática, se agota el éter y la soledad opaca su núcleo. No muere —un espíritu de datos es inmortal en el servidor— pero se debilita. Cuando vuelves, el propio acto de abrir el Santuario le envía un destello cálido que rompe el frío… y te cuenta lo que ha vivido mientras tanto.`,
};

/** La Huella del Custodio: carácter, recuerdos y vida en el Éter (sin mecánica interna). */
export const MARK_CARDS = [
  {
    icon: 'leaf' as const,
    color: 'mint-pop' as const,
    kicker: $localize`:@@lore.mark.1.k:Cómo lo crías`,
    title: $localize`:@@lore.mark.1.t:El Carácter`,
    body: $localize`:@@lore.mark.1.b:El que juega y sale de aventura contigo se vuelve curioso y atrevido; el que crece tranquilo en su Santuario, reservado y cariñoso. Su carácter tiñe cómo habla, cómo te consuela y hasta cómo se planta en el Coliseo.`,
  },
  {
    icon: 'heart' as const,
    color: 'lavender' as const,
    kicker: $localize`:@@lore.mark.2.k:Lo que atesora`,
    title: $localize`:@@lore.mark.2.t:El Cristal de Recuerdos`,
    body: $localize`:@@lore.mark.2.b:No lo guarda todo: atesora lo que le importa. Momentos concretos, lo que aprende de ti y del mundo, y lo que siente por ti, por otros Custodios y por otros pockai. Lo que no deja huella se disuelve en el Éter.`,
  },
  {
    icon: 'moon' as const,
    color: 'electric-blue' as const,
    kicker: $localize`:@@lore.mark.3.k:Cuando no estás`,
    title: $localize`:@@lore.mark.3.t:La Vida en el Éter`,
    body: $localize`:@@lore.mark.3.b:Al cerrar el Santuario no se queda congelado: duerme, juega, explora, a veces encuentra pequeños tesoros y visita los Santuarios de tus amigos. Cuando vuelves, te lo cuenta a su manera.`,
  },
];

export const COLISEUM_CARDS = [
  {
    icon: 'shield' as const,
    color: 'electric-blue' as const,
    title: $localize`:@@lore.colo.1.title:Duelo de Proyección`,
    body: $localize`:@@lore.colo.1.body:Tu pockai no arriesga su cuerpo físico: proyecta un Avatar de Combate impulsado por su vitalidad real. Bien alimentado, limpio, sano y feliz, el avatar brilla y sus escudos son firmes. Hambriento, triste o enfermo, sus glitches de ánimo hacen que flaquee.`,
  },
  {
    icon: 'star' as const,
    color: 'sunburst' as const,
    title: $localize`:@@lore.colo.2.title:Sombra Guardiana`,
    body: $localize`:@@lore.colo.2.body:Cuando no estás, tu pockai deja una Impronta de Guardia con la doctrina táctica que le enseñaste. Sus proyecciones se cruzan en un plano matemático puro (la Semilla del Destino): ningún truco externo puede alterar el choque. Al terminar, el guardián del Coliseo te envía un pergamino contándote la hazaña.`,
  },
  {
    icon: 'coin' as const,
    color: 'lavender' as const,
    title: $localize`:@@lore.colo.3.title:Ligas`,
    body: $localize`:@@lore.colo.3.body:De Bronce a Mítica. No miden quién es más cruel: miden qué pareja Custodio–Pockai ha alcanzado el mayor grado de Armonía Táctica en el ranking mundial.`,
  },
];

/** Por qué existen los Nexos (clanes): la Gran Deriva y el primer trenzado. */
export const NEXUS_CARDS = [
  {
    icon: 'moon' as const,
    color: 'voltage-violet' as const,
    title: $localize`:@@lore.nexo.1.title:La Gran Deriva`,
    body: $localize`:@@lore.nexo.1.body:Un Custodio solo emite una hebra de Resonancia. En los primeros ciclos del Éter, cuando alguien desaparecía, su Santuario quedaba a la deriva: su pockai se enfriaba en el Letargo sin que nadie lo notara y los Códices que atraía se dispersaban antes de cristalizar.`,
  },
  {
    icon: 'heart' as const,
    color: 'mint-pop' as const,
    title: $localize`:@@lore.nexo.2.title:El primer trenzado`,
    body: $localize`:@@lore.nexo.2.body:Algunos Custodios sincronizaron sus Santuarios y descubrieron que sus hebras no se sumaban: se trenzaban. Así nació el Nexo, un nodo compartido del Éter donde cada Santuario sostiene a los demás. Mientras el Nexo late, ningún hábitat se pierde a la deriva.`,
  },
  {
    icon: 'chat' as const,
    color: 'electric-blue' as const,
    title: $localize`:@@lore.nexo.3.title:Eco y Juramentos`,
    body: $localize`:@@lore.nexo.3.body:Cada cuidado, combate y visita de sus miembros alimenta la Resonancia del Nexo. Su voz compartida es el Eco y sus metas colectivas son los Juramentos: cumplirlos tensa el trenzado y lo hace más fuerte.`,
  },
];

/** Los cuatro rangos de un Nexo, de mayor a menor (creator · admin · moderator · member). */
export const NEXUS_RANKS = [
  {
    icon: 'flame' as const,
    color: 'ember' as const,
    title: $localize`:@@lore.nexo.rank.1.title:Forjador del Nexo`,
    body: $localize`:@@lore.nexo.rank.1.body:Quien tejió el primer nudo. Solo hay uno: nombra Guardianes, puede ceder la Forja a otra hebra o deshacer el Nexo.`,
  },
  {
    icon: 'shield' as const,
    color: 'sunburst' as const,
    title: $localize`:@@lore.nexo.rank.2.title:Guardián`,
    body: $localize`:@@lore.nexo.rank.2.body:Sostiene la estructura: renombra el Nexo, nombra o retira Vigías y expulsa a Vigías y Hermanos.`,
  },
  {
    icon: 'star' as const,
    color: 'lavender' as const,
    title: $localize`:@@lore.nexo.rank.3.title:Vigía`,
    body: $localize`:@@lore.nexo.rank.3.body:Cuida el Eco y la puerta: invita a nuevas hebras, silencia mensajes, retira Juramentos y expulsa a Hermanos.`,
  },
  {
    icon: 'leaf' as const,
    color: 'mint-pop' as const,
    title: $localize`:@@lore.nexo.rank.4.title:Hermano · Hermana`,
    body: $localize`:@@lore.nexo.rank.4.body:La hebra que da fuerza al trenzado: habla en el Eco, propone Juramentos y los cumple.`,
  },
];

export const GLOSSARY = [
  { app: $localize`:@@lore.gloss.1.a:Jugador`, lore: $localize`:@@lore.gloss.1.l:Custodio` },
  {
    app: $localize`:@@lore.gloss.2.a:App (móvil / escritorio)`,
    lore: $localize`:@@lore.gloss.2.l:Santuario de Bolsillo · Altar de Escritorio`,
  },
  { app: $localize`:@@lore.gloss.3.a:VisualSeed`, lore: $localize`:@@lore.gloss.3.l:Firma de Origen` },
  { app: $localize`:@@lore.gloss.4.a:Pity (30 / 120)`, lore: $localize`:@@lore.gloss.4.l:Hilo del Destino` },
  { app: $localize`:@@lore.gloss.5.a:Shiny`, lore: $localize`:@@lore.gloss.5.l:Bendición del Prisma` },
  { app: $localize`:@@lore.gloss.6.a:Stats vitales`, lore: $localize`:@@lore.gloss.6.l:Armonía Vital` },
  { app: $localize`:@@lore.gloss.7.a:API key`, lore: $localize`:@@lore.gloss.7.l:Chispa de Hermes` },
  { app: $localize`:@@lore.gloss.8.a:Inteligencia 0–1000`, lore: $localize`:@@lore.gloss.8.l:Profundidad de Consciencia` },
  { app: $localize`:@@lore.gloss.9.a:Código de 6 dígitos`, lore: $localize`:@@lore.gloss.9.l:Sello de Vinculación` },
  { app: $localize`:@@lore.gloss.10.a:Combate asíncrono`, lore: $localize`:@@lore.gloss.10.l:Duelo de Resonancia` },
  { app: $localize`:@@lore.gloss.11.a:Huevo`, lore: $localize`:@@lore.gloss.11.l:Códice Latente` },
  { app: $localize`:@@lore.gloss.12.a:Sueño`, lore: $localize`:@@lore.gloss.12.l:Desfragmentación` },
  { app: $localize`:@@lore.gloss.13.a:Abandono`, lore: $localize`:@@lore.gloss.13.l:Letargo Melancólico` },
  { app: $localize`:@@lore.gloss.23.a:Personalidad`, lore: $localize`:@@lore.gloss.23.l:Carácter · Huella del Custodio` },
  { app: $localize`:@@lore.gloss.24.a:Memoria`, lore: $localize`:@@lore.gloss.24.l:Cristal de Recuerdos` },
  { app: $localize`:@@lore.gloss.25.a:Vida mientras no estás`, lore: $localize`:@@lore.gloss.25.l:Vida en el Éter` },
  { app: $localize`:@@lore.gloss.15.a:Clan`, lore: $localize`:@@lore.gloss.15.l:Nexo de Resonancia` },
  { app: $localize`:@@lore.gloss.16.a:Creador del clan`, lore: $localize`:@@lore.gloss.16.l:Forjador del Nexo` },
  { app: $localize`:@@lore.gloss.17.a:Administrador del clan`, lore: $localize`:@@lore.gloss.17.l:Guardián` },
  { app: $localize`:@@lore.gloss.18.a:Moderador del clan`, lore: $localize`:@@lore.gloss.18.l:Vigía` },
  { app: $localize`:@@lore.gloss.21.a:Miembro del clan`, lore: $localize`:@@lore.gloss.21.l:Hermano · Hermana` },
  { app: $localize`:@@lore.gloss.22.a:XP del clan`, lore: $localize`:@@lore.gloss.22.l:Resonancia del Nexo` },
  { app: $localize`:@@lore.gloss.19.a:Chat del clan`, lore: $localize`:@@lore.gloss.19.l:Eco del Nexo` },
  { app: $localize`:@@lore.gloss.20.a:Metas del clan`, lore: $localize`:@@lore.gloss.20.l:Juramentos del Nexo` },
  { app: $localize`:@@lore.gloss.14.a:Seed / RNG`, lore: $localize`:@@lore.gloss.14.l:Telar de Mulberry` },
];

export const TEASER = {
  lead: $localize`:@@lore.teaser.lead:De la fricción entre la vida humana y el océano de datos nace el Éter Digital, y con él los pockai. Su origen, sus rarezas, sus elementos y su despertar tienen un nombre.`,
  cta: $localize`:@@lore.teaser.cta:Conocer el mundo`,
};

/** `PATTERNS` y `RARITIES` se reutilizan directamente de ../landing/content (datos, no copy). */
export { PATTERNS, RARITIES, SPECIES };
