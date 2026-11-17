/**
 * Traduce lo que le pasa a la mascota (acciones del backend o de la propia UI) a una reacción:
 * una secuencia de animaciones, un bocadillo opcional y una partícula opcional.
 */
import type { PetAction, PetActionEvent } from './petActions';

export interface Reaction {
  /** Animaciones en orden (las siguientes entran en cola tras la primera). */
  anims: string[];
  bubble?: string;
  particle?: string;
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

/** Actos del Mood Theater del backend → animación. */
const MOOD_ACTS: Record<string, string> = {
  dance: 'dance',
  sing: 'talk',
  cry: 'cry',
  smoke: 'defeat',
  glow: 'level_up',
  yawn: 'tired',
  stretch: 'wake',
};

const REACTIONS: Record<PetAction, (ctx: Ctx) => Reaction | null> = {
  fed: (c) => (c?.favorite ? { anims: ['eat', 'love'], bubble: '¡Mi comida favorita! 😋' } : { anims: ['eat'] }),
  cleaned: () => ({ anims: ['clean', 'happy'] }),
  slept: () => null, // lo cubre el estado base `sleep`
  woke: () => ({ anims: ['wake'] }),
  healed: () => ({ anims: ['heal', 'happy'], bubble: '¡Ya me encuentro mejor! 💚' }),
  level_up: (c) => {
    const level = num(c, 'level');
    return { anims: ['level_up'], bubble: level ? `¡Nivel ${level}! ⬆️` : '¡He subido de nivel! ⬆️' };
  },
  evolved: (c) => {
    const stage = str(c, 'stage');
    return { anims: ['evolution', 'celebrate'], bubble: stage ? `¡He evolucionado (${stage})! ✨` : '¡He evolucionado! ✨' };
  },
  hatched: () => ({ anims: ['summon', 'happy'], bubble: '¡Hola! Encantado de conocerte 🐣' }),
  battle_won: () => ({ anims: ['attack', 'victory'], bubble: '¡Victoria! 🏆' }),
  battle_lost: () => ({ anims: ['hit', 'defeat'], bubble: 'Uf… la próxima ganaré.' }),
  battle_defended: (c) => {
    const attacker = str(c, 'attackerName');
    if (c?.draw) return { anims: ['surprised'], bubble: attacker ? `Empate contra ${attacker} 🤝` : 'Empate 🤝' };
    if (c?.won) return { anims: ['hit', 'victory'], bubble: attacker ? `¡He defendido contra ${attacker}! 🛡️` : '¡He defendido mi puesto! 🛡️' };
    return { anims: ['hit', 'defeat'], bubble: attacker ? `${attacker} me ha ganado…` : 'Me han ganado en la arena…' };
  },
  raid_attack: () => ({ anims: ['attack'] }),
  tournament_win: () => ({ anims: ['victory', 'celebrate'], bubble: '¡Ronda de torneo ganada! 🏅' }),
  tournament_loss: () => ({ anims: ['defeat'], bubble: 'Me han eliminado del torneo…' }),
  trained: (c) =>
    str(c, 'status') === 'failed'
      ? { anims: ['hit', 'sad'], bubble: 'Ese entrenamiento ha sido duro…' }
      : { anims: ['attack', 'victory'], bubble: '¡Entrenamiento completado! 💪' },
  cooked: () => ({ anims: ['eat', 'happy'], particle: '🍳' }),
  adventure: (c) => {
    switch (str(c, 'result')) {
      case 'win':
        return { anims: ['celebrate'], bubble: '¡Qué aventura! Hemos ganado 🗺️', particle: '🗺️' };
      case 'partial':
        return { anims: ['happy'], particle: '🗺️' };
      default:
        return { anims: ['sad'], bubble: 'La aventura no salió bien, pero aprendí mucho.' };
    }
  },
  minigame_finished: () => ({ anims: ['happy'] }),
  gift_received: () => ({ anims: ['surprised', 'love'], bubble: '¡Me han hecho un regalo! 🎁', particle: '🎁' }),
  care_received: () => ({ anims: ['love'], bubble: '¡Alguien me ha mandado cariño! 💌', particle: '💌' }),
  chest_opened: () => ({ anims: ['surprised', 'celebrate'], particle: '🎁' }),
  mission_completed: (c) =>
    c?.dailyCompleted ? { anims: ['celebrate'], bubble: '¡Misiones del día completadas! 🎉' } : { anims: ['happy'], particle: '✅' },
  achievement: (c) => {
    const name = str(c, 'name');
    return { anims: ['victory'], bubble: name ? `¡Logro: ${name}! 🏆` : '¡Nuevo logro! 🏆', particle: '🏆' };
  },
  bonding_up: () => ({ anims: ['love'], bubble: 'Siento que estamos más unidos 💞' }),
  bonding_down: () => ({ anims: ['sad'] }),
  ritual_completed: () => ({ anims: ['celebrate'], particle: '🌟' }),
  ritual_missed: () => ({ anims: ['sad'] }),
  mood_moment: (c) => {
    const act = str(c, 'act');
    const anim = act ? MOOD_ACTS[act] : undefined;
    return anim ? { anims: [anim] } : null;
  },
  buddy_play: () => ({ anims: ['dance', 'happy'] }),
  friend_visit: (c) => {
    const name = str(c, 'visitorName');
    return {
      anims: ['surprised', 'happy'],
      bubble: name ? `¡${name} está de visita en mi hábitat! 👋` : '¡Ha venido un amigo de visita! 👋',
    };
  },
  welcome_back: (c) => {
    switch (str(c, 'tier')) {
      case 'offended':
        return { anims: ['sad'], bubble: 'Hmpf… me has dejado mucho tiempo solo.' };
      case 'sad':
        return { anims: ['cry'], bubble: 'Te he echado de menos…' };
      case 'emotional':
        return { anims: ['cry', 'love'], bubble: '¡Has vuelto! 🥹' };
      default:
        return { anims: ['happy'], bubble: '¡Bienvenido de nuevo! 😊' };
    }
  },
  sick: () => ({ anims: ['sad'], bubble: 'No me encuentro muy bien… 🤒' }),
  vitals_critical: () => null, // el estado base (hungry/tired/sad) ya lo refleja
};

export function reactionForAction(event: Pick<PetActionEvent, 'action' | 'context'>): Reaction | null {
  const fn = REACTIONS[event.action];
  return fn ? fn(event.context) : null;
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
  const b = raw as { action?: unknown; animation?: unknown; emote?: unknown };
  const base = typeof b.animation === 'string' ? BEHAVIOR_ANIMS[b.animation] : undefined;
  const override = typeof b.action === 'string' ? BEHAVIOR_ACTION_ANIMS[b.action] : undefined;
  const anims = base ? (override ?? base) : [];
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
