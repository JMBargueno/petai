/**
 * Behavior Engine (spec 36) — decisiones y comportamiento, funciones puras.
 *
 * 1. `decideBehavior`: antes del LLM, elige la reacción de la criatura (consolar, invitar a jugar,
 *    acurrucarse…) según la intención interpretada, la personalidad y el estado. La reacción se
 *    pasa al prompt como guía, de modo que el texto del LLM y la animación cuadran.
 * 2. `validateBehavior`: capa de reglas del juego. Toda acción —la propuesta por el LLM (herramienta
 *    `express_behavior`) o la del propio motor— pasa por aquí: catálogo cerrado, estado (dormido,
 *    enfermo, sin energía), coherencia con la personalidad. Si no es válida se sustituye por la
 *    alternativa segura más cercana; nunca se aplica algo fuera de catálogo.
 * 3. `effectsOf`: qué aplica el game engine (efectos pequeños y acotados) y qué evento de evolución
 *    registra.
 */
import { Intent } from './conversation.engine';
import { Dims, PersonalityConfig } from './mind.types';

export const BEHAVIORS = [
  'comfort',
  'celebrate',
  'cuddle',
  'invite_play',
  'propose_explore',
  'greet',
  'wave_goodbye',
  'listen',
  'ask_back',
  'sulk',
  'show_off',
  'yawn',
] as const;
export type Behavior = (typeof BEHAVIORS)[number];

/** Animación base (sprites existentes: idle | happy | sleep | eat) + emote opcional para la burbuja. */
export interface BehaviorView {
  action: Behavior;
  animation: 'idle' | 'happy' | 'sleep';
  emote: 'heart' | 'sparkle' | 'note' | 'question' | 'tear' | 'zzz' | 'wave' | 'star' | null;
}

const VIEW: Record<Behavior, Omit<BehaviorView, 'action'>> = {
  comfort: { animation: 'idle', emote: 'heart' },
  celebrate: { animation: 'happy', emote: 'sparkle' },
  cuddle: { animation: 'happy', emote: 'heart' },
  invite_play: { animation: 'happy', emote: 'note' },
  propose_explore: { animation: 'happy', emote: 'star' },
  greet: { animation: 'happy', emote: 'wave' },
  wave_goodbye: { animation: 'idle', emote: 'wave' },
  listen: { animation: 'idle', emote: null },
  ask_back: { animation: 'idle', emote: 'question' },
  sulk: { animation: 'idle', emote: 'tear' },
  show_off: { animation: 'happy', emote: 'star' },
  yawn: { animation: 'sleep', emote: 'zzz' },
};

/** Guía para el LLM: cómo debe sonar la respuesta para encajar con la acción. */
const PROMPT_HINT: Record<Behavior, string> = {
  comfort: 'Consuela a tu entrenador con calidez y dile que estás a su lado.',
  celebrate: 'Celébralo con entusiasmo.',
  cuddle: 'Acércate y muestra cariño, con ternura.',
  invite_play: 'Ofrece jugar un rato juntos para animar el momento.',
  propose_explore: 'Propón salir a explorar juntos.',
  greet: 'Saluda con alegría.',
  wave_goodbye: 'Despídete con cariño.',
  listen: 'Escucha con atención y responde con pocas palabras.',
  ask_back: 'Responde y devuelve una pregunta curiosa.',
  sulk: 'Muéstrate algo dolido, sin ser cruel, y deja la puerta abierta a hacer las paces.',
  show_off: 'Presume un poco de lo que sabes hacer, con gracia.',
  yawn: 'Estás muy cansado: responde bostezando y con pocas palabras.',
};

export interface BehaviorState {
  sleeping: boolean;
  sick: boolean;
  energy: number;
}

/** Candidatas por intención con su peso según la personalidad (sin azar: mismo estado → misma reacción). */
function candidates(intent: Intent, d: Dims): [Behavior, number][] {
  const n = (v: number) => v / 100;
  switch (intent) {
    case 'sad_day':
      return [
        ['comfort', 0.5 + n(d.affection)],
        ['cuddle', n(d.affection) + (1 - n(d.temper)) * 0.5],
        ['invite_play', n(d.temper) * 0.6 + n(d.sociability) * 0.6],
        ['listen', (1 - n(d.affection)) * 0.9],
      ];
    case 'good_news':
      return [
        ['celebrate', 0.6 + n(d.temper)],
        ['cuddle', n(d.affection)],
        ['ask_back', n(d.curiosity) * 0.9],
      ];
    case 'affection':
      return [
        ['cuddle', 0.4 + n(d.affection)],
        ['show_off', (1 - n(d.affection)) * 0.6 + n(d.bravery) * 0.3],
        ['listen', (1 - n(d.affection)) * 0.7],
      ];
    case 'scold':
      return [
        ['sulk', 0.5 + (1 - n(d.bravery)) * 0.5],
        ['listen', n(d.affection) * 0.8],
        ['show_off', n(d.bravery) * n(d.temper)],
      ];
    case 'play_request':
      return [
        ['invite_play', 0.6 + n(d.temper)],
        ['listen', (1 - n(d.temper)) * 0.6],
      ];
    case 'explore_request':
      return [
        ['propose_explore', 0.4 + n(d.curiosity) + n(d.bravery) * 0.4],
        ['listen', (1 - n(d.bravery)) * 0.8],
      ];
    case 'greeting':
      return [
        ['greet', 0.8 + n(d.sociability) * 0.4],
        ['cuddle', n(d.affection) * 0.9],
      ];
    case 'farewell':
      return [
        ['wave_goodbye', 1],
        ['sulk', n(d.affection) * 0.5 * (1 - n(d.bravery))],
      ];
    case 'question':
      return [
        ['ask_back', 0.4 + n(d.curiosity)],
        ['show_off', n(d.bravery) * 0.6],
        ['listen', 0.6],
      ];
    default:
      return [
        ['listen', 0.6],
        ['ask_back', n(d.curiosity) * 0.9],
        ['invite_play', n(d.temper) * 0.5],
      ];
  }
}

export function decideBehavior(intent: Intent, dims: Dims, state: BehaviorState, cfg: PersonalityConfig): BehaviorView {
  const list = candidates(intent, dims);
  let best = list[0];
  for (const c of list) if (c[1] > best[1]) best = c;
  return validateBehavior(best[0], dims, state, cfg).view;
}

export interface Validation {
  ok: boolean;
  view: BehaviorView;
  reason?: string;
}

export function viewOf(action: Behavior): BehaviorView {
  return { action, ...VIEW[action] };
}

export function isBehavior(v: unknown): v is Behavior {
  return typeof v === 'string' && (BEHAVIORS as readonly string[]).includes(v);
}

/**
 * Validación de reglas de juego: permisos (catálogo cerrado), límites y estado (dormido, enfermo,
 * sin energía) y coherencia (una criatura muy distante no se acurruca). Devuelve la acción
 * aceptada o la alternativa segura.
 */
export function validateBehavior(proposed: unknown, dims: Dims, state: BehaviorState, cfg: PersonalityConfig): Validation {
  if (!isBehavior(proposed)) return { ok: false, view: viewOf('listen'), reason: 'acción fuera de catálogo' };
  if (state.sleeping) {
    return proposed === 'yawn' ? { ok: true, view: viewOf('yawn') } : { ok: false, view: viewOf('yawn'), reason: 'está dormido' };
  }
  const active = proposed === 'invite_play' || proposed === 'propose_explore' || proposed === 'celebrate';
  if (active && (state.sick || state.energy < cfg.behavior.minEnergyToPlay)) {
    const alt: Behavior = state.energy < cfg.behavior.minEnergyToPlay ? 'yawn' : 'cuddle';
    return { ok: false, view: viewOf(alt), reason: state.sick ? 'está enfermo' : 'no tiene energía' };
  }
  if (proposed === 'cuddle' && dims.affection < 20) return { ok: false, view: viewOf('listen'), reason: 'incoherente con su personalidad distante' };
  if (proposed === 'propose_explore' && dims.bravery < 15) return { ok: false, view: viewOf('listen'), reason: 'incoherente con su personalidad miedosa' };
  return { ok: true, view: viewOf(proposed) };
}

/** Intenciones de un mensaje corriente: la reacción se anima, pero no se le dicta al modelo. */
const NEUTRAL_INTENTS = new Set(['chat', 'question']);

/**
 * Pista de reacción para el prompt, solo cuando el mensaje la merece. En un mensaje corriente la
 * reacción elegida es siempre la misma para una personalidad dada, y repetir la instrucción turno
 * tras turno («devuelve una pregunta curiosa») hace que todas las respuestas suenen igual.
 * Provisional (spec 37 §1.6): cuando haya anti-repetición (§4.4) la pista puede volver siempre.
 */
export function hintForTurn(intent: string, view: BehaviorView): string | undefined {
  return NEUTRAL_INTENTS.has(intent) ? undefined : promptHint(view);
}

export function promptHint(view: BehaviorView): string {
  return `Reacción decidida para este mensaje: ${PROMPT_HINT[view.action]}`;
}

/** Efectos que aplica el game engine tras la respuesta (acotados) y evento de evolución. */
export function effectsOf(action: Behavior): { happiness: number; evolutionEvent?: string } {
  switch (action) {
    case 'comfort':
    case 'cuddle':
      return { happiness: 1, evolutionEvent: 'talk_comfort' };
    case 'celebrate':
    case 'invite_play':
      return { happiness: 2, evolutionEvent: 'talk_play' };
    case 'propose_explore':
      return { happiness: 1, evolutionEvent: 'talk_play' };
    default:
      return { happiness: 0 };
  }
}

/** Definición OpenAI-compatible de la herramienta con la que el LLM propone la acción estructurada. */
export const EXPRESS_BEHAVIOR_TOOL = {
  name: 'express_behavior',
  description:
    'Elige UNA reacción física para acompañar tu respuesta (animación en pantalla). Úsala como mucho una vez por mensaje. El juego puede sustituirla si no es posible (p. ej. sin energía).',
  parameters: {
    type: 'object',
    properties: { action: { type: 'string', enum: [...BEHAVIORS] } },
    required: ['action'],
    additionalProperties: false,
  },
} as const;
