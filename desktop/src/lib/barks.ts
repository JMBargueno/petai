/**
 * Motor de pensamientos espontáneos (Barks) contextuales para Pockai.
 * Emite frases dinámicas y pensamientos clasificados según la aplicación activa,
 * la hora, el clima, el estado vital o la inactividad del usuario.
 */

export type BarkCategory =
  | 'code'
  | 'browser'
  | 'chat'
  | 'gaming'
  | 'media'
  | 'reading'
  | 'hunger'
  | 'sleepy'
  | 'dirty'
  | 'lonely'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'late_night'
  | 'rain'
  | 'snow'
  | 'hot'
  | 'cold'
  | 'idle_user'
  | 'typing'
  | 'high_five'
  | 'welcome_back'
  | 'generic';

/** Tema local de la ventana (navegador, mensajería). Nunca sale del equipo. */
export type LocalTopic = 'browser' | 'chat';

export interface BarkContext {
  /** Categoría de `contextAwareness` (`coding`, `music`…) o directamente una de frases. */
  appCategory?: string;
  localTopic?: LocalTopic | null;
  /** Hay entrada reciente del usuario con el cursor quieto: está tecleando. */
  isTyping?: boolean;
  hunger?: number;
  energy?: number;
  hygiene?: number;
  happiness?: number;
  timeOfDay?: string;
  weatherCondition?: string;
  isUserIdle?: boolean;
  petName?: string;
}

export const BARKS_CATALOG: Record<BarkCategory, string[]> = {
  code: [
    '¡Ese código tiene pinta de compilar a la primera! 💻✨',
    '¿Muchos commits hoy? No olvides descansar la vista. 👀',
    'Cuidado con ese punto y coma rebelde... 🧐',
    'Compilando sueños y una taza de café caliente. ☕',
    '¡Refactorizar es un arte! Y tú eres el artista. 🎨',
    'Si un bug te mira fijamente, ¡muérdelo con un test! 🐛🔥',
    '¡A por ese merge sin conflictos! 🚀',
  ],
  browser: [
    'Mucho scroll veo por aquí... ¿encontraste lo que buscabas? 🌐',
    'Esa pestaña del navegador lleva abierta una eternidad jaja. 📑',
    '¿Navegando por la red? ¡A ver si encuentras snacks virtuales! 🍪',
    '¡Cuidado con la madriguera de conejos de internet! 🐇',
    '¡Qué página más interesante! Aunque prefiero cuando me miras a mí. 🐾',
    '¡No te olvides de cerrar las 45 pestañas que no usas! 😜',
  ],
  chat: [
    '¿Hablando con amigos? Mándales saludos de mi parte. 💬✨',
    '¡Escribe rápido, como el viento! 💨',
    'Diles que tu Pockai es el más genial del escritorio. 😎',
    'La buena comunicación es la clave de toda manada. 🤝',
  ],
  gaming: [
    '¡A por esa victoria épica! 🏆🎮',
    '¡Concéntrate! ¡Cuidado por la izquierda! 🕹️',
    'Si ganas esta partida, ¿me das un snack de premio? 🍖',
    '¡Qué buenos reflejos tienes! Casi tan rápidos como los míos. ⚡',
  ],
  media: [
    '¡Sube el volumen, ese temazo me gusta! 🎵🎶',
    'Palomitas y buena música, el mejor plan. 🍿',
    'Mis orejitas bailan con este ritmo. 🐾🎧',
  ],
  reading: [
    'Shhh... modo lectura. Yo paso las páginas con la mirada. 📖',
    '¿Qué estás aprendiendo? Luego me lo cuentas. 📚✨',
    'Tomar notas es de sabios. Yo tomo nota de ti. 📝',
  ],
  hunger: [
    '¡Ñam ñam! Mi barriguita ruge como un volcán... ¿hay algo rico? 🍗',
    'Oye... ¿te sobró algo de tu comida? Tengo hambrita. 🤤',
    '¡Alimentar a tu Pockai da 100 años de buena suerte! 🍎',
  ],
  sleepy: [
    '*Bostezo gigante*... se me cierran los ojitos. 🥱💤',
    'Qué sueño tengo... ¿hacemos una siesta express? 😴',
    'Cinco minutitos más... déjame acurrucarme aquí. 🛌',
  ],
  dirty: [
    '¡Uf! Siento que huelo a tierra mojada... ¿toca baño con burbujas? 🧼🛁',
    'Un poquito de agua y jabón me vendrían de lujo. 🫧',
  ],
  lonely: [
    '¿Sigues ahí? ¡Hazme un mimito con el ratón! ❤️',
    '¡Qué aburrimiento! Ven a jugar un ratito conmigo. 🐾',
  ],
  morning: [
    '¡Buenos días, madrugador! Que hoy tengas un día increíble. ☀️',
    'El sol brilla y el escritorio está lleno de energía. 🌅',
    '¿Ya te tomaste tu primer vaso de agua mañanero? 💧',
  ],
  afternoon: [
    'Ya es por la tarde... ¿has parado a comer algo? 🥪',
    'La tarde se pasa volando contigo, {name} lo confirma. 🌤️',
    'Buen momento para estirar las piernas un minuto. 🚶',
  ],
  evening: [
    'Se va haciendo de noche... ¿cerramos ya por hoy? 🌇',
    'El atardecer tiñe el escritorio de naranja. Qué bonito. 🧡',
    'Hoy has trabajado mucho. {name} está orgulloso de ti. ✨',
  ],
  night: [
    'La noche está tranquila... buen momento para reflexionar. 🌙',
    'Las estrellas ya salieron en el ciberespacio. ✨',
    'No te desveles demasiado frente a la pantalla. 🌌',
  ],
  late_night: [
    '¡Menudas horas! ¿El modo nocturno no te da sueño? 🦉🌃',
    'El club de los noctámbulos está en sesión... duerme pronto. 💤',
    'Los monitores cansan la vista a estas horas, cuídate. 👁️🖤',
  ],
  rain: [
    'Escucho la lluvia caer... qué gusto estar calentitos adentro. 🌧️',
    'Día perfecto para manta, café y teclear con calma. ☕☔',
  ],
  snow: [
    '¡Qué frío hace fuera! Menos mal que aquí tengo tu compañía. ❄️⛄',
  ],
  hot: [
    '¡Uf, qué calor! Voy a necesitar un ventilador o un helado. 🍦☀️',
  ],
  cold: [
    'Brrr... ¡mis patitas están congeladas! 🥶🧤',
  ],
  idle_user: [
    '¿Te fuiste a por un café o te quedaste pensando en la inmortalidad del cangrejo? 🤔',
    'Todo en silencio... vigilaré el escritorio mientras no estás. 🕵️‍♂️',
    '¡Aquí te espero pacientemente! No tardes mucho. ⏳🐾',
  ],
  typing: [
    '¡A toda máquina con ese teclado! ⌨️🔥',
    '¡Tiki-tiki-tiki! Me encanta el sonido de las teclas. 🎹✨',
  ],
  high_five: [
    '¡Choca esos cinco! Haz clic en mi patita rápida. 🐾✋',
    '¡Dame esos cinco! ¡Arriba ese ánimo! 🐾💥',
  ],
  welcome_back: [
    '¡Has vuelto! Te he guardado el sitio. 🐾',
    '¡Por fin! {name} ya te echaba de menos. ❤️',
    '¡Hola otra vez! Me he echado una siestecita mientras no estabas. 😴✨',
    '¡Aquí estás! ¿Seguimos donde lo dejamos? 🌟',
  ],
  generic: [
    '¡Qué bien se está aquí en tu pantalla! 🌸',
    '¿Sabías que eres mi humano favorito? ❤️',
    'Paseando por la barra de tareas sin prisa pero sin pausa. 🐾',
    'Todo en orden por aquí. ¡Sigue así! ✨',
    'Me encanta ver cómo trabajas. ¡Eres un crack! 🌟',
    '¡Estirando las patitas! 🤸‍♂️',
    '{name} de guardia en el escritorio. Todo tranquilo. 🛡️',
  ],
};

/** Categoría de app de `contextAwareness` → categoría de frases. */
const APP_TO_BARK: Record<string, BarkCategory> = {
  coding: 'code',
  music: 'media',
  video: 'media',
  gaming: 'gaming',
  reading: 'reading',
};

/**
 * Traduce la categoría de la app en foco a la de frases. Acepta también una categoría de
 * frases ya resuelta (`code`, `media`…) para no romper a quien la pase directamente.
 */
export function barkCategoryForApp(appCategory: string | null | undefined): BarkCategory | null {
  if (!appCategory || appCategory === 'generic') return null;
  if (appCategory in APP_TO_BARK) return APP_TO_BARK[appCategory];
  return appCategory in BARKS_CATALOG ? (appCategory as BarkCategory) : null;
}

const TIME_TO_BARK: Record<string, BarkCategory> = {
  late_night: 'late_night',
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
  night: 'night',
};

/** Sustituye `{name}` por el nombre de la mascota (o un genérico si no se conoce). */
export function fillBark(text: string, petName?: string | null): string {
  return text.replace(/\{name\}/g, petName?.trim() || 'tu Pockai');
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

export class BarksEngine {
  private recentBarks: string[] = [];
  private maxRecent = 15;

  /** `rng` devuelve un número en [0, 1); se inyecta para poder sembrarlo en tests y en el cerebro. */
  constructor(private readonly rng: () => number = Math.random) {}

  /** Determina las categorías relevantes basadas en el contexto actual */
  getCandidateCategories(ctx: BarkContext): BarkCategory[] {
    const categories: BarkCategory[] = [];

    // Prioridad 1: Necesidades vitales extremas
    if (ctx.hunger !== undefined && ctx.hunger < 25) categories.push('hunger');
    if (ctx.energy !== undefined && ctx.energy < 25) categories.push('sleepy');
    if (ctx.hygiene !== undefined && ctx.hygiene < 25) categories.push('dirty');
    if (ctx.happiness !== undefined && ctx.happiness < 25) categories.push('lonely');

    // Prioridad 2: Usuario inactivo o tecleando
    if (ctx.isUserIdle) categories.push('idle_user');
    else if (ctx.isTyping) categories.push('typing');

    // Prioridad 3: Contexto de ventana (la categoría de la app y, si lo hay, el tema local)
    const appBark = barkCategoryForApp(ctx.appCategory);
    if (appBark) categories.push(appBark);
    if (ctx.localTopic && !categories.includes(ctx.localTopic)) categories.push(ctx.localTopic);

    // Prioridad 4: Clima y hora
    const timeBark = ctx.timeOfDay ? TIME_TO_BARK[ctx.timeOfDay] : undefined;
    if (timeBark) categories.push(timeBark);

    if (ctx.weatherCondition === 'rain') categories.push('rain');
    else if (ctx.weatherCondition === 'snow') categories.push('snow');
    else if (ctx.weatherCondition === 'hot') categories.push('hot');
    else if (ctx.weatherCondition === 'cold') categories.push('cold');

    // Siempre disponible como fallback
    categories.push('generic');

    return categories;
  }

  /**
   * Genera un pensamiento contextual evitando frases recientemente dichas.
   */
  generateBark(ctx: BarkContext, rng: () => number = this.rng): string {
    const candidates = this.getCandidateCategories(ctx);

    // Ponderación: 75 % de probabilidad de elegir una categoría contextual específica
    // frente a 'generic'
    const nonGeneric = candidates.filter((c) => c !== 'generic');
    const selectedCategory =
      nonGeneric.length > 0 && rng() < 0.75 ? pick(nonGeneric, rng) : 'generic';

    return this.barkFrom(selectedCategory, ctx.petName, rng);
  }

  /** Frase de una categoría concreta (p. ej. `high_five`), con el mismo control de repetición. */
  barkFrom(category: BarkCategory, petName?: string | null, rng: () => number = this.rng): string {
    const pool = BARKS_CATALOG[category] || BARKS_CATALOG.generic;

    // El historial guarda la plantilla, no el texto con el nombre ya puesto
    const available = pool.filter((bark) => !this.recentBarks.includes(bark));
    const chosen = pick(available.length > 0 ? available : pool, rng);

    this.recordBark(chosen);
    return fillBark(chosen, petName);
  }

  private recordBark(bark: string) {
    this.recentBarks.push(bark);
    if (this.recentBarks.length > this.maxRecent) {
      this.recentBarks.shift();
    }
  }

  getRecentBarks(): string[] {
    return [...this.recentBarks];
  }

  clearHistory() {
    this.recentBarks = [];
  }
}
