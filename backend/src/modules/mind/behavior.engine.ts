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
import { createRng, hashSeed } from '../battles/combat/rng';
import { Intent } from './conversation.engine';
import { Dims, PersonalityConfig, ReactionAudience, ReactionEntry } from './mind.types';
import { weighted } from './personality.engine';

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
  // Spec 37 §4.6 — con su entrenador
  'bring_gift',
  'tell_story',
  'ask_about_day',
  'apologize',
  'perform_trick',
  // Ante un entrenador que visita (las usa el menú de visita, lote 6)
  'greet_visitor',
  'hide',
  'show_habitat',
  'accept_treat',
  // Con otro Pockai (las usa la escena entre dos, lote 6)
  'play_tag',
  'share_food',
  'nap_together',
  'squabble',
  'make_up',
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
  bring_gift: { animation: 'happy', emote: 'sparkle' },
  tell_story: { animation: 'happy', emote: 'note' },
  ask_about_day: { animation: 'idle', emote: 'question' },
  apologize: { animation: 'idle', emote: 'tear' },
  perform_trick: { animation: 'happy', emote: 'star' },
  greet_visitor: { animation: 'happy', emote: 'wave' },
  hide: { animation: 'idle', emote: null },
  show_habitat: { animation: 'happy', emote: 'star' },
  accept_treat: { animation: 'happy', emote: 'heart' },
  play_tag: { animation: 'happy', emote: 'note' },
  share_food: { animation: 'happy', emote: 'heart' },
  nap_together: { animation: 'sleep', emote: 'zzz' },
  squabble: { animation: 'idle', emote: 'tear' },
  make_up: { animation: 'happy', emote: 'heart' },
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
  bring_gift: 'Enséñale con ilusión lo que encontraste para él mientras no estaba (está entre tus recuerdos).',
  tell_story: 'Cuéntale algo que te ha pasado mientras no estaba (está entre tus recuerdos), con tus palabras.',
  ask_about_day: 'Salúdale y pregúntale con interés qué tal le ha ido el día.',
  apologize: 'Pídele perdón por lo de antes, con sinceridad y pocas palabras.',
  perform_trick: 'Haz uno de tus trucos y cuéntalo con gracia.',
  greet_visitor: 'Saluda al visitante con alegría.',
  hide: 'Te da vergüenza: escóndete un poco y responde con timidez.',
  show_habitat: 'Enséñale tu hábitat con orgullo.',
  accept_treat: 'Acepta el premio y da las gracias.',
  play_tag: 'Proponle jugar al pilla-pilla.',
  share_food: 'Comparte tu comida con él.',
  nap_together: 'Estáis cansados: echad una siesta juntos.',
  squabble: 'Os habéis picado: muéstrate molesto, sin crueldad.',
  make_up: 'Haz las paces con él.',
};

export interface BehaviorState {
  sleeping: boolean;
  sick: boolean;
  energy: number;
}

/** Puntuación de una candidata: lineal en las dimensiones más, si lo declara, un término de producto. */
export function scoreReaction(entry: ReactionEntry, dims: Dims): number {
  // Sin suelo: aquí una puntuación baja debe poder perder (a diferencia de la vida autónoma)
  let score = weighted(entry.base, entry.weights ?? {}, dims, -Infinity);
  if (entry.product) {
    let term = entry.product.scale;
    for (const d of entry.product.dims ?? []) term *= dims[d] / 100;
    for (const d of entry.product.inverse ?? []) term *= 1 - dims[d] / 100;
    score += term;
  }
  return score;
}

/**
 * Candidatas de una intención para una audiencia, con su puntuación, en el orden de los datos
 * (`balance.json → personality.behavior.reactions`). Una intención sin tabla usa la de `chat`.
 */
export function reactionScores(
  intent: string,
  dims: Dims,
  cfg: PersonalityConfig,
  audience: ReactionAudience = 'owner',
  flags: ReactionFlags = NO_FLAGS,
): { behavior: Behavior; score: number }[] {
  const table = cfg.behavior.reactions ?? {};
  const catalog = cfg.behavior.catalog ?? {};
  const out: { behavior: Behavior; score: number }[] = [];
  for (const entry of table[intent] ?? table.chat ?? []) {
    if (!isBehavior(entry.behavior)) continue;
    // Una reacción pensada para el entrenador no se le ofrece a un visitante ni a otro Pockai
    const audiences = catalog[entry.behavior]?.audiences ?? ['owner'];
    if (!audiences.includes(audience)) continue;
    // Contar una historia exige tener una; hacer un truco, saber alguno
    const when = catalog[entry.behavior]?.when;
    if (when && !flags.has(when)) continue;
    out.push({ behavior: entry.behavior, score: scoreReaction(entry, dims) });
  }
  return out;
}

/** Condiciones de la situación que se cumplen ahora (tiene algo que contar, sabe un truco…). */
export type ReactionFlags = ReadonlySet<string>;

const NO_FLAGS: ReactionFlags = new Set();

export interface DecisionContext {
  /** Condiciones que se cumplen. Una reacción con `when` solo es candidata si la suya está aquí. */
  flags?: ReactionFlags;
  /** Últimas reacciones elegidas, la más reciente al final. Sin ellas no hay anti-repetición. */
  recent?: readonly string[];
  /** Semilla para desempatar (id de la mascota): mismo estado, misma reacción. */
  seed?: string;
  audience?: ReactionAudience;
}

/**
 * Elige la reacción de la criatura a un mensaje.
 *
 * Sin `ctx.recent` gana la candidata de mayor puntuación (la primera si empatan), como siempre.
 * Con historial (spec 37 §4.4):
 * - cada aparición reciente de una candidata multiplica su puntuación por `penalty`;
 * - nunca la misma tres veces seguidas si hay alternativa;
 * - se cambia de reacción solo si la nueva supera a la última por un margen, para que una
 *   diferencia mínima no haga saltar de una a otra;
 * - los empates se deshacen con un generador sembrado con la mascota y su historial, nunca al azar.
 */
export function decideBehavior(intent: Intent, dims: Dims, state: BehaviorState, cfg: PersonalityConfig, ctx: DecisionContext = {}): BehaviorView {
  const audience = ctx.audience ?? 'owner';
  const flags = ctx.flags ?? NO_FLAGS;
  let list = reactionScores(intent, dims, cfg, audience, flags);
  if (!list.length) return validateBehavior('listen', dims, state, cfg, audience, flags).view;

  const anti = cfg.behavior.antiRepeat;
  const recent = anti && ctx.recent ? ctx.recent.slice(-anti.window) : [];
  if (anti && recent.length) {
    list = list.map((c) => {
      const repeats = recent.reduce((n, r) => (r === c.behavior ? n + 1 : n), 0);
      return { behavior: c.behavior, score: Math.max(0, c.score) * Math.pow(anti.penalty, repeats) };
    });
    const last = recent[recent.length - 1];
    const twice = recent.length > 1 && recent[recent.length - 2] === last;
    if (twice && list.some((c) => c.behavior !== last)) list = list.filter((c) => c.behavior !== last);
  }

  let best = list[0];
  for (const c of list) if (c.score > best.score) best = c;

  if (anti && recent.length) {
    // Empate: lo decide la semilla, no el orden de la tabla
    const tied = list.filter((c) => Math.abs(c.score - best.score) < 1e-9);
    if (tied.length > 1 && ctx.seed) {
      const rng = createRng(hashSeed(`reaction:${ctx.seed}:${recent.join(',')}`));
      best = tied[Math.min(tied.length - 1, Math.floor(rng() * tied.length))];
    }
    // Histéresis: la última reacción se mantiene si la nueva no la supera con claridad
    const prev = list.find((c) => c.behavior === recent[recent.length - 1]);
    if (prev && prev.behavior !== best.behavior && best.score < prev.score * (1 + anti.margin)) best = prev;
  }
  return validateBehavior(best.behavior, dims, state, cfg, audience, flags).view;
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
 * Validación de reglas de juego. Toda acción, la proponga quien la proponga, pasa por aquí:
 * 1. catálogo cerrado;
 * 2. modo superior (dormida solo bosteza; enferma o sin energía no hace nada activo);
 * 3. audiencia (una reacción para el entrenador no vale ante un visitante);
 * 4. coherencia con la personalidad (mínimos de `balance.json → personality.behavior.catalog`).
 * Devuelve la acción aceptada o la alternativa segura; nunca algo fuera de catálogo.
 */
export function validateBehavior(
  proposed: unknown,
  dims: Dims,
  state: BehaviorState,
  cfg: PersonalityConfig,
  audience: ReactionAudience = 'owner',
  flags: ReactionFlags = NO_FLAGS,
): Validation {
  if (!isBehavior(proposed)) return { ok: false, view: viewOf('listen'), reason: 'acción fuera de catálogo' };
  if (state.sleeping) {
    return proposed === 'yawn' ? { ok: true, view: viewOf('yawn') } : { ok: false, view: viewOf('yawn'), reason: 'está dormido' };
  }
  const catalog = cfg.behavior.catalog ?? {};
  const entry = catalog[proposed];
  const allowed = (b: Behavior) => (catalog[b]?.audiences ?? ['owner']).includes(audience);
  if (!allowed(proposed)) return { ok: false, view: viewOf('listen'), reason: 'no es una reacción para quien tiene delante' };
  // No puede contar lo que no ha vivido ni hacer un truco que no sabe, lo proponga quien lo proponga
  if (entry?.when && !flags.has(entry.when)) return { ok: false, view: viewOf('listen'), reason: 'ahora no tiene sentido' };

  if (entry?.active && (state.sick || state.energy < cfg.behavior.minEnergyToPlay)) {
    const tired = state.energy < cfg.behavior.minEnergyToPlay;
    // Enferma pero con energía busca mimos; si eso no cabe ante esta audiencia, escucha
    const alt: Behavior = tired ? 'yawn' : allowed('cuddle') ? 'cuddle' : 'listen';
    return { ok: false, view: viewOf(alt), reason: state.sick ? 'está enfermo' : 'no tiene energía' };
  }
  for (const [d, min] of Object.entries(entry?.minDims ?? {})) {
    if (dims[d as keyof Dims] < (min as number)) {
      const fallback = isBehavior(entry?.fallback) && allowed(entry.fallback) ? entry.fallback : 'listen';
      return { ok: false, view: viewOf(fallback), reason: entry?.reason ?? 'incoherente con su personalidad' };
    }
  }
  return { ok: true, view: viewOf(proposed) };
}

/** Añade una reacción al historial reciente, sin dejarlo crecer más que la ventana. */
export function pushRecentBehavior(recent: readonly string[], action: Behavior, cfg: PersonalityConfig): string[] {
  const window = cfg.behavior.antiRepeat?.window ?? 4;
  return [...recent, action].slice(-window);
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
    case 'perform_trick':
      return { happiness: 1, evolutionEvent: 'talk_play' };
    case 'bring_gift':
    case 'apologize':
      return { happiness: 1, evolutionEvent: 'talk_comfort' };
    default:
      return { happiness: 0 };
  }
}

const NOT_FOR_CHAT = new Set<string>(['greet_visitor', 'hide', 'show_habitat', 'accept_treat', 'play_tag', 'share_food', 'nap_together', 'squabble', 'make_up']);

/** Definición OpenAI-compatible de la herramienta con la que el LLM propone la acción estructurada. */
export const EXPRESS_BEHAVIOR_TOOL = {
  name: 'express_behavior',
  description:
    'Elige UNA reacción física para acompañar tu respuesta (animación en pantalla). Úsala como mucho una vez por mensaje. El juego puede sustituirla si no es posible (p. ej. sin energía).',
  parameters: {
    type: 'object',
    // Solo las reacciones pensadas para el entrenador: las de visitantes y otros Pockai no son para el chat
    properties: { action: { type: 'string', enum: BEHAVIORS.filter((b) => !NOT_FOR_CHAT.has(b)) } },
    required: ['action'],
    additionalProperties: false,
  },
} as const;
