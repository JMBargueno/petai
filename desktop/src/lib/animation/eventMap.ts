/**
 * Traduce lo que le pasa a la mascota (acciones del backend o de la propia UI) a una reacción:
 * una secuencia de animaciones, un bocadillo opcional y una partícula opcional.
 */
import { birthParams, clipsForPetAction, effectForPetAction, extraSoundsForPetAction } from '@pockai/scene/effects';
import type { PetAction, PetActionEvent } from './petActions';

export interface Reaction {
  /** Animaciones en orden (las siguientes entran en cola tras la primera). */
  anims: string[];
  bubble?: string;
  particle?: string;
  /** Efecto (@pockai/scene/effects) que acompaña al momento, con sus datos. */
  effect?: { id: string; params?: Record<string, string | number> };
  /** Sonidos extra del Pockai además de los de sus clips (spec 40), p. ej. burbujas al limpiar. */
  sounds?: string[];
  /** Momento exagerado (Mood Theater): PetView añade un squash marcado. */
  emphasis?: boolean;
}

type Ctx = Record<string, unknown> | undefined;

const str = (ctx: Ctx, key: string): string | undefined => {
  const v = ctx?.[key];
  return typeof v === 'string' && v ? v : undefined;
};
const num = (ctx: Ctx, key: string): number | undefined => {
  const v = ctx?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

/** Partícula de cada acto del Mood Theater (intensidad normal o exagerada). */
const MOOD_PARTICLES: Record<string, string> = {
  dance: '🎵',
  sing: '🎶',
  cry: '💧',
  smoke: '💨',
  glow: '✨',
  yawn: '💤',
  stretch: '✨',
};

/** Lo que solo pinta el escritorio: bocadillo, partícula y énfasis. Los clips vienen de la tabla compartida. */
type Extras = Omit<Reaction, 'anims'>;

const EXTRAS: Partial<Record<PetAction, (ctx: Ctx) => Extras>> = {
  fed: (c) => (c?.favorite ? { bubble: '¡Mi comida favorita! 😋' } : {}),
  healed: () => ({ bubble: '¡Ya me encuentro mejor! 💚' }),
  level_up: (c) => {
    const level = num(c, 'level');
    return { bubble: level ? `¡Nivel ${level}! ⬆️` : '¡He subido de nivel! ⬆️' };
  },
  evolved: (c) => {
    const stage = str(c, 'stage');
    return { bubble: stage ? `¡He evolucionado (${stage})! ✨` : '¡He evolucionado! ✨' };
  },
  hatched: (c) => ({
    bubble: c?.shiny === true ? '¡Hola! Nací con la Bendición del Prisma ✨' : '¡Hola! Encantado de conocerte 🐣',
  }),
  battle_won: () => ({ bubble: '¡Victoria! 🏆' }),
  battle_lost: () => ({ bubble: 'Uf… la próxima ganaré.' }),
  battle_defended: (c) => {
    const attacker = str(c, 'attackerName');
    if (c?.draw) return { bubble: attacker ? `Empate contra ${attacker} 🤝` : 'Empate 🤝' };
    if (c?.won) return { bubble: attacker ? `¡He defendido contra ${attacker}! 🛡️` : '¡He defendido mi puesto! 🛡️' };
    return { bubble: attacker ? `${attacker} me ha ganado…` : 'Me han ganado en la arena…' };
  },
  raid_victory: (c) => {
    const theme = str(c, 'theme');
    const gems = num(c, 'gems');
    return { bubble: `¡Hemos derrotado a ${theme ?? 'el jefe'}!${gems ? ` +${gems} 💎` : ''}` };
  },
  tournament_win: () => ({ bubble: '¡Ronda de torneo ganada! 🏅' }),
  tournament_loss: () => ({ bubble: 'Me han eliminado del torneo…' }),
  trained: (c) =>
    str(c, 'status') === 'failed' ? { bubble: 'Ese entrenamiento ha sido duro…' } : { bubble: '¡Entrenamiento completado! 💪' },
  cooked: () => ({ particle: '🍳' }),
  adventure: (c) => {
    switch (str(c, 'result')) {
      case 'win':
        return { bubble: '¡Qué aventura! Hemos ganado 🗺️', particle: '🗺️' };
      case 'partial':
        return { particle: '🗺️' };
      default:
        return { bubble: 'La aventura no salió bien, pero aprendí mucho.' };
    }
  },
  gift_received: () => ({ bubble: '¡Me han hecho un regalo! 🎁' }),
  care_received: () => ({ bubble: '¡Alguien me ha mandado cariño! 💌' }),
  mission_completed: (c) => (c?.dailyCompleted ? { bubble: '¡Misiones del día completadas! 🎉' } : { particle: '✅' }),
  achievement: (c) => {
    const name = str(c, 'name');
    return { bubble: name ? `¡Logro: ${name}! 🏆` : '¡Nuevo logro! 🏆' };
  },
  bonding_up: () => ({ bubble: 'Siento que estamos más unidos 💞' }),
  mood_moment: (c) => {
    const act = str(c, 'act');
    // Intensidad: suave = solo el clip; normal = con su partícula; exagerado = doble (en la tabla) y marcado
    switch (str(c, 'intensity')) {
      case 'soft':
        return {};
      case 'exaggerated':
        return { particle: act ? MOOD_PARTICLES[act] : undefined, emphasis: true };
      default:
        return { particle: act ? MOOD_PARTICLES[act] : undefined };
    }
  },
  friend_visit: (c) => {
    const name = str(c, 'visitorName');
    return { bubble: name ? `¡${name} está de visita en mi hábitat! 👋` : '¡Ha venido un amigo de visita! 👋' };
  },
  welcome_back: (c) => welcomeExtras(str(c, 'tier')),
  sick: () => ({ bubble: 'No me encuentro muy bien… 🤒' }),
};

/** Juramento de clan cumplido (LORE §8): la trenza del Nexo se tensa sobre la mascota. */
export function reactionForClanGoal(title?: string | null): Reaction {
  return {
    anims: ['celebrate'],
    bubble: title ? `¡Juramento cumplido: ${title}! 🤝` : '¡Hemos cumplido el juramento del clan! 🤝',
    effect: { id: 'trenza-juramento' },
  };
}

function welcomeExtras(tier: string | undefined): Extras {
  switch (tier) {
    case 'offended':
      return { bubble: 'Hmpf… me has dejado mucho tiempo solo.' };
    case 'sad':
      return { bubble: 'Te he echado de menos…' };
    case 'emotional':
      return { bubble: '¡Has vuelto! 🥹' };
    default:
      return { bubble: '¡Bienvenido de nuevo! 😊' };
  }
}

/**
 * Nace otro Pockai de tu colección y no es el que está en el escritorio: el activo lo presencia
 * (sorpresa y alegría) y la revelación se alza A SU LADO, en el Flujo de la recién nacida.
 */
export function reactionForSiblingHatch(newborn: {
  nickname?: string;
  rarity?: string;
  shiny?: boolean;
  pityGuarantee?: string | null;
  species?: { element?: string; name?: string };
}): Reaction {
  const name = newborn.nickname || newborn.species?.name || 'un Pockai';
  const params = birthParams({ rarity: newborn.rarity, shiny: newborn.shiny, pity: newborn.pityGuarantee ?? undefined });
  return {
    anims: ['surprised', 'happy'],
    bubble: newborn.shiny ? `¡Ha nacido ${name}… y brilla! ✨` : `¡Ha nacido ${name}! 🐣`,
    effect: { id: 'revelacion-densidad', params: { ...params, element: newborn.species?.element ?? 'neutral', beside: 1 } },
  };
}

/**
 * Reacción a un aviso `pet:action`: clips y efecto de las tablas compartidas (`clipsForPetAction`,
 * `effectForPetAction`, las mismas que usa la escena en Android e iOS) más el bocadillo del escritorio.
 */
export function reactionForAction(event: Pick<PetActionEvent, 'action' | 'context'>): Reaction | null {
  const anims = clipsForPetAction(event.action, event.context);
  if (anims === null) return null;
  const extras = EXTRAS[event.action]?.(event.context) ?? {};
  const reaction: Reaction = { anims, ...extras };
  if (reaction.particle === undefined) delete reaction.particle;
  const sounds = extraSoundsForPetAction(event.action, event.context);
  if (sounds.length) reaction.sounds = sounds;
  const effect = effectForPetAction(event.action, event.context);
  return effect ? { ...reaction, effect } : reaction;
}

/**
 * Reacción de chat (spec 36): `behavior` del evento `done` → animación de una pasada + emote.
 * Solo se usan clips de acción: `idle`, `sleep` y `tired` son bucles de la capa base y, lanzados
 * como acción, no terminarían nunca. `sleep` (bostezo) se resuelve con el estiramiento de `wake`.
 */
const BEHAVIOR_ANIMS: Record<string, string[]> = {
  idle: [],
  happy: ['happy'],
  sleep: ['wake'],
};

/** Acciones con un clip más expresivo que el genérico de su animación. */
const BEHAVIOR_ACTION_ANIMS: Record<string, string[]> = {
  celebrate: ['celebrate'],
  cuddle: ['love'],
};

/**
 * Clips que el servidor puede pedir para una reacción y que terminan solos. Los demás (`sleep`,
 * `tired`, `idle_alt`, `talk`…) son bucles o reposos: lanzados como acción no acabarían.
 */
export const BEHAVIOR_ONE_SHOT: ReadonlySet<string> = new Set(['happy', 'love', 'dance', 'celebrate', 'eat', 'surprised', 'attack', 'wake']);

export const EMOTE_EMOJI: Record<string, string> = {
  heart: '❤️',
  sparkle: '✨',
  note: '🎵',
  question: '❓',
  tear: '💧',
  zzz: '💤',
  wave: '👋',
  star: '⭐',
};

/** Tolerante: `behavior` ausente, nulo o con valores desconocidos no rompe el chat. */
export function reactionForBehavior(raw: unknown): Reaction | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as { action?: unknown; animation?: unknown; emote?: unknown; clip?: unknown };
  const base = typeof b.animation === 'string' ? BEHAVIOR_ANIMS[b.animation] : undefined;
  const override = typeof b.action === 'string' ? BEHAVIOR_ACTION_ANIMS[b.action] : undefined;
  // El servidor dice con qué clip se representa cada reacción. Se usa si es de una pasada; los
  // bucles de la capa base (dormir, cansado, escuchar…) se quedan en la tabla de arriba.
  const clip = typeof b.clip === 'string' && BEHAVIOR_ONE_SHOT.has(b.clip) ? [b.clip] : undefined;
  const anims = clip ?? (base ? (override ?? base) : []);
  const particle = typeof b.emote === 'string' ? EMOTE_EMOJI[b.emote] : undefined;
  if (!anims.length && !particle) return null;
  return particle ? { anims, particle } : { anims };
}

/** Acciones locales de la UI (ControlPanel) → acción equivalente del backend. */
export const LOCAL_ACTIONS: Record<string, PetAction> = {
  eat: 'fed',
  clean: 'cleaned',
  happy: 'minigame_finished',
  wake: 'woke',
  hatched: 'hatched',
};

/**
 * Evita animar dos veces lo mismo cuando la UI lo dispara localmente y luego llega el
 * `pet:action` del backend (o al revés) dentro de la ventana indicada.
 */
export class ReactionDeduper {
  private last = new Map<string, number>();
  constructor(private windowMs = 1500) {}

  shouldPlay(petId: string, action: string, now = Date.now()): boolean {
    const key = `${petId}:${action}`;
    const prev = this.last.get(key);
    this.last.set(key, now);
    return prev === undefined || now - prev > this.windowMs;
  }
}
