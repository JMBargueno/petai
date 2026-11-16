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
  | 'hunger'
  | 'sleepy'
  | 'dirty'
  | 'lonely'
  | 'morning'
  | 'night'
  | 'late_night'
  | 'rain'
  | 'snow'
  | 'hot'
  | 'cold'
  | 'idle_user'
  | 'typing'
  | 'high_five'
  | 'generic';

export interface BarkContext {
  appCategory?: string;
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
  generic: [
    '¡Qué bien se está aquí en tu pantalla! 🌸',
    '¿Sabías que eres mi humano favorito? ❤️',
    'Paseando por la barra de tareas sin prisa pero sin pausa. 🐾',
    'Todo en orden por aquí. ¡Sigue así! ✨',
    'Me encanta ver cómo trabajas. ¡Eres un crack! 🌟',
    '¡Estirando las patitas! 🤸‍♂️',
  ],
};

export class BarksEngine {
  private recentBarks: string[] = [];
  private maxRecent = 15;

  /** Determina las categorías relevantes basadas en el contexto actual */
  getCandidateCategories(ctx: BarkContext): BarkCategory[] {
    const categories: BarkCategory[] = [];

    // Prioridad 1: Necesidades vitales extremas
    if (ctx.hunger !== undefined && ctx.hunger < 25) categories.push('hunger');
    if (ctx.energy !== undefined && ctx.energy < 25) categories.push('sleepy');
    if (ctx.hygiene !== undefined && ctx.hygiene < 25) categories.push('dirty');
    if (ctx.happiness !== undefined && ctx.happiness < 25) categories.push('lonely');

    // Prioridad 2: Usuario inactivo
    if (ctx.isUserIdle) categories.push('idle_user');

    // Prioridad 3: Contexto de ventana
    if (ctx.appCategory && ctx.appCategory in BARKS_CATALOG) {
      categories.push(ctx.appCategory as BarkCategory);
    }

    // Prioridad 4: Clima y hora
    if (ctx.timeOfDay === 'late_night') categories.push('late_night');
    else if (ctx.timeOfDay === 'night') categories.push('night');
    else if (ctx.timeOfDay === 'morning') categories.push('morning');

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
  generateBark(ctx: BarkContext): string {
    const candidates = this.getCandidateCategories(ctx);

    // Ponderación: 70% de probabilidad de elegir una categoría contextual específica
    // frente a 'generic'
    const nonGeneric = candidates.filter((c) => c !== 'generic');
    const selectedCategory =
      nonGeneric.length > 0 && Math.random() < 0.75
        ? nonGeneric[Math.floor(Math.random() * nonGeneric.length)]
        : 'generic';

    const pool = BARKS_CATALOG[selectedCategory] || BARKS_CATALOG.generic;

    // Filtrar los que no estén en recentBarks
    const available = pool.filter((bark) => !this.recentBarks.includes(bark));
    const chosen =
      available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : pool[Math.floor(Math.random() * pool.length)];

    this.recordBark(chosen);
    return chosen;
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
