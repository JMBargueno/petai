/**
 * Visitor Engine (spec 37 §6.2) — funciones puras.
 *
 * Un entrenador que está de visita habla con el Pockai anfitrión **por menú**: sin texto libre y
 * sin LLM. Aquí se decide qué opciones tiene, qué contesta el Pockai y qué efecto deja, según su
 * personalidad y lo que siente por ese visitante (la etapa de su relación).
 *
 * Reglas:
 * - No hay opciones negativas: un visitante no puede regañar a un Pockai ajeno.
 * - Nada del entrenador del anfitrión sale de aquí. La única vivencia que puede contar («¿qué tal
 *   estás?») llega ya filtrada por la lista blanca de los rumores (`social.engine.isShareable`).
 * - Los topes (interacciones por visita, efectos por día) se aplican aquí; el servicio solo
 *   cuenta y guarda.
 *
 * Los textos viven aquí en castellano hasta que el lote 5 (diálogo por datos) los pase a
 * identificadores de línea.
 */
import { createRng, hashSeed } from '../battles/combat/rng';
import { Behavior, BehaviorView, validateBehavior, viewOf } from './behavior.engine';
import { Dims, PersonalityConfig } from './mind.types';
import { STAGES, Stage } from './social.engine';

export const VISITOR_OPTIONS = ['greet', 'pet', 'treat', 'play', 'ask', 'wait', 'bye'] as const;
export type VisitorOption = (typeof VISITOR_OPTIONS)[number];

export function isVisitorOption(v: unknown): v is VisitorOption {
  return typeof v === 'string' && (VISITOR_OPTIONS as readonly string[]).includes(v);
}

export interface VisitorConfig {
  /** Interacciones que admite una visita (despedirse no cuenta). */
  maxPerVisit: number;
  /** Interacciones de un mismo visitante que dejan huella en un día. */
  dailyEffects: number;
  /** Sociabilidad por debajo de la cual se esconde de quien no conoce. */
  shyBelow: number;
  /** Afecto por debajo del cual no se deja acariciar por quien no conoce. */
  aloofBelow: number;
  /** Energía mínima para jugar. */
  minEnergyToPlay: number;
  /** Lo que le sube un premio (acotado: el visitante no cría a la mascota de otro). */
  treat: { happiness: number; hunger: number };
  /** Cuánto mejora lo que siente por el visitante con cada opción. */
  deltas: Partial<Record<VisitorOption, number>>;
}

export interface VisitorCtx {
  petId: string;
  petName: string;
  visitorName: string;
  dims: Dims;
  /** Lo que el Pockai siente por este visitante. */
  stage: Stage;
  sleeping: boolean;
  sick: boolean;
  energy: number;
  happiness: number;
  hunger: number;
  /** Alimento del visitante que se ofrecería como premio, si tiene alguno. */
  treat: { id: string; name: string } | null;
  /** Una vivencia propia y no privada que puede contar, si la hay. */
  story: string | null;
  /** Quedan efectos por hoy para este visitante. */
  canEffect: boolean;
}

export interface VisitorMenuOption {
  id: VisitorOption;
  label: string;
  /** En «ofrecer un premio», qué alimento se gastaría. */
  item?: { id: string; name: string };
}

export interface VisitorReply {
  /** Número de turno: el cliente lo devuelve con su elección, para que repetir una petición no repita el efecto. */
  turn: number;
  line: string;
  behavior: BehaviorView;
  options: VisitorMenuOption[];
  /** Interacciones que quedan en esta visita. */
  remaining: number;
  ended: boolean;
}

export interface VisitorState {
  turn: number;
  /** Interacciones hechas en esta visita. */
  count: number;
  /** Opciones ya usadas (cada una, una vez por visita). */
  done: VisitorOption[];
  /** Ha salido de su escondite. */
  open: boolean;
  ended: boolean;
  /** Premio que trajo en esta visita (para el recuerdo). */
  item?: string;
  /** Última respuesta: se devuelve tal cual si llega una petición repetida. */
  last: VisitorReply | null;
}

export interface VisitorEffect {
  option: VisitorOption;
  /** Cambio en lo que siente por el visitante. */
  delta: number;
  /** Evento de deriva (`balance.personality.evolution.events`). */
  event: string;
  /** Alimento del visitante que se consume. */
  consume: { id: string; name: string } | null;
  happiness: number;
  hunger: number;
  /** Cómo lo recordará el Pockai. */
  episode: string;
}

export interface VisitorStep {
  state: VisitorState;
  reply: VisitorReply;
  effect: VisitorEffect | null;
}

const rank = (s: Stage) => STAGES.indexOf(s);
const knows = (ctx: VisitorCtx) => rank(ctx.stage) >= rank('acquaintance');
const friends = (ctx: VisitorCtx) => rank(ctx.stage) >= rank('friend');

/** Se esconde de quien no conoce. */
export function isShy(ctx: VisitorCtx, cfg: VisitorConfig): boolean {
  return ctx.dims.sociability < cfg.shyBelow && !knows(ctx);
}

/** No se deja tocar por quien no conoce. */
export function isAloof(ctx: VisitorCtx, cfg: VisitorConfig): boolean {
  return ctx.dims.affection < cfg.aloofBelow && !knows(ctx);
}

const LABELS: Record<VisitorOption, string> = {
  greet: 'Saludar',
  pet: 'Acariciar',
  treat: 'Ofrecer un premio',
  play: 'Jugar un momento',
  ask: '¿Qué tal estás?',
  wait: 'Esperar un poco',
  bye: 'Despedirse',
};

/** Opciones disponibles ahora. Siempre queda, al menos, despedirse. */
export function menuFor(state: VisitorState, ctx: VisitorCtx, cfg: VisitorConfig): VisitorMenuOption[] {
  const opt = (id: VisitorOption, extra: Partial<VisitorMenuOption> = {}): VisitorMenuOption => ({ id, label: LABELS[id], ...extra });
  if (state.ended) return [];
  if (ctx.sleeping || state.count >= cfg.maxPerVisit) return [opt('bye')];
  if (isShy(ctx, cfg) && !state.open) return [opt('wait'), opt('bye')];
  const out: VisitorMenuOption[] = [];
  const free = (id: VisitorOption) => !state.done.includes(id);
  if (free('greet')) out.push(opt('greet'));
  if (free('pet')) out.push(opt('pet'));
  // Sin efectos por hoy no se ofrece el premio: no se gasta un alimento para nada
  if (free('treat') && ctx.treat && ctx.canEffect && !ctx.sick) out.push(opt('treat', { label: `Ofrecer ${ctx.treat.name}`, item: ctx.treat }));
  if (free('play')) out.push(opt('play'));
  if (free('ask')) out.push(opt('ask'));
  out.push(opt('bye'));
  return out;
}

type Tone = 'low' | 'mid' | 'high';
const tone = (v: number): Tone => (v < 35 ? 'low' : v > 65 ? 'high' : 'mid');

/** Líneas por opción y tono. `{pet}` es el Pockai, `{you}` el visitante, `{item}` el premio. */
const LINES = {
  open: {
    low: ['{pet} te mira desde su rincón, sin acercarse del todo.', '{pet} levanta una oreja al verte, pero se queda donde está.'],
    mid: ['{pet} se acerca a ver quién ha venido.', '{pet} te mira con curiosidad.'],
    high: ['{pet} viene corriendo a recibirte.', '{pet} da saltitos al verte entrar.'],
  },
  openFriend: ['{pet} te reconoce y viene derecho hacia ti.', '¡{pet} se alegra un montón de verte otra vez!'],
  hide: ['{pet} se esconde detrás de un mueble. Solo se le ven los ojos.', '{pet} se mete en su rincón y te observa desde ahí.'],
  asleep: ['{pet} está durmiendo. Mejor no despertarle.'],
  waitOut: ['Te quedas quieto. Al rato, {pet} asoma y se acerca despacio.', 'Sin prisa. {pet} sale de su escondite y te olisquea de lejos.'],
  greet: {
    low: ['{pet} te devuelve el saludo con un gesto tímido.', '{pet} inclina la cabeza, a su manera.'],
    mid: ['{pet} te saluda contento.', '{pet} mueve la cola al oír tu voz.'],
    high: ['{pet} te saluda dando vueltas a tu alrededor.', '{pet} te recibe como si llevara todo el día esperándote.'],
  },
  petOk: {
    low: ['{pet} se deja acariciar un momento.', '{pet} tolera la caricia y hasta cierra un ojo.'],
    mid: ['{pet} ronronea con tus caricias.', '{pet} se arrima para que sigas.'],
    high: ['{pet} se derrite con tus mimos.', '{pet} se tumba panza arriba para que le rasques.'],
  },
  petNo: ['{pet} se aparta: todavía no te conoce lo bastante.', '{pet} esquiva tu mano. Dale tiempo.'],
  treat: {
    low: ['{pet} olfatea {item}, se lo lleva a su rincón y se lo come allí.', '{pet} acepta {item} con cautela.'],
    mid: ['{pet} acepta {item} encantado.', '{pet} se come {item} y te mira agradecido.'],
    high: ['¡{pet} devora {item} y te pide más con la mirada!', '{pet} da un brinco de alegría con {item}.'],
  },
  playOk: {
    low: ['{pet} juega un poco contigo, a su ritmo.', '{pet} empuja una pelota hacia ti y espera.'],
    mid: ['{pet} juega contigo un buen rato.', '{pet} te enseña su juguete favorito.'],
    high: ['{pet} corretea por toda la sala y te reta a seguirle.', '¡{pet} no para! Te enseña todos sus rincones jugando.'],
  },
  playTired: ['{pet} está demasiado cansado para jugar ahora.', '{pet} bosteza: hoy no tiene cuerpo para juegos.'],
  playSick: ['{pet} no se encuentra bien; hoy no está para juegos.'],
  bye: {
    low: ['{pet} te ve marchar desde su sitio.', '{pet} te despide con una mirada.'],
    mid: ['{pet} te acompaña hasta la puerta.', '{pet} te despide moviendo la cola.'],
    high: ['{pet} no quiere que te vayas y te sigue hasta la puerta.', '¡{pet} te despide dando saltos!'],
  },
  limit: ['{pet} ya ha tenido bastante visita por hoy y se va a su rincón.', '{pet} se retira a descansar: demasiadas emociones.'],
};

const MOOD = {
  sick: '{pet} no se encuentra muy bien hoy.',
  hungry: '{pet} tiene hambre: no para de mirar su cuenco.',
  tired: '{pet} está cansado; se le cierran los ojos.',
  sad: '{pet} anda un poco alicaído.',
  happy: '{pet} está contentísimo.',
  fine: '{pet} está tranquilo y a gusto.',
};

/** Ánimo en una frase, sin números. Solo su estado: nada de su entrenador. */
export function moodLine(ctx: Pick<VisitorCtx, 'sick' | 'hunger' | 'energy' | 'happiness'>): string {
  if (ctx.sick) return MOOD.sick;
  if (ctx.hunger < 30) return MOOD.hungry;
  if (ctx.energy < 25) return MOOD.tired;
  if (ctx.happiness < 35) return MOOD.sad;
  if (ctx.happiness > 70) return MOOD.happy;
  return MOOD.fine;
}

const EPISODES: Partial<Record<VisitorOption, string>> = {
  greet: '{you} vino a verme y me saludó.',
  pet: '{you} vino a verme y me hizo mimos.',
  treat: '{you} vino a verme y me trajo {item}.',
  play: '{you} vino a verme y jugamos un rato.',
  ask: '{you} vino a verme y se interesó por mí.',
};

/** Qué pesa más en el recuerdo de la visita (una visita deja un solo episodio). */
const EPISODE_WEIGHT: VisitorOption[] = ['ask', 'greet', 'pet', 'play', 'treat'];

/** Opción que mejor resume la visita entre las que hizo. */
export function episodeOption(done: readonly VisitorOption[]): VisitorOption | null {
  let best: VisitorOption | null = null;
  for (const id of done) if (EPISODE_WEIGHT.includes(id) && (!best || EPISODE_WEIGHT.indexOf(id) > EPISODE_WEIGHT.indexOf(best))) best = id;
  return best;
}

function fill(text: string, ctx: VisitorCtx, item?: string): string {
  return text
    .replace(/\{pet\}/g, ctx.petName)
    .replace(/\{you\}/g, ctx.visitorName)
    .replace(/\{item\}/g, item ?? 'un premio');
}

export function visitorEpisode(option: VisitorOption, ctx: VisitorCtx, item?: string): string {
  return fill(EPISODES[option] ?? '{you} vino a verme.', ctx, item);
}

/** Elige una variante con un azar sembrado por mascota, turno y opción: repetir da lo mismo. */
function pick(lines: string[], ctx: VisitorCtx, turn: number, salt: string): string {
  const rng = createRng(hashSeed(`visitor:${ctx.petId}:${turn}:${salt}`));
  return lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))];
}

function behave(action: Behavior, ctx: VisitorCtx, cfg: PersonalityConfig): BehaviorView {
  // Toda reacción pasa por la validación común: modo, audiencia «visitante» y personalidad
  return validateBehavior(action, ctx.dims, { sleeping: ctx.sleeping, sick: ctx.sick, energy: ctx.energy }, cfg, 'visitor').view;
}

export const emptyVisitorState = (): VisitorState => ({ turn: 0, count: 0, done: [], open: false, ended: false, last: null });

function reply(state: VisitorState, line: string, behavior: BehaviorView, ctx: VisitorCtx, v: VisitorConfig): VisitorReply {
  return {
    turn: state.turn,
    line,
    behavior,
    options: menuFor(state, ctx, v),
    remaining: Math.max(0, v.maxPerVisit - state.count),
    ended: state.ended,
  };
}

/** Empieza la conversación: cómo recibe al visitante. No cuenta como interacción ni deja efecto. */
export function openVisit(ctx: VisitorCtx, cfg: PersonalityConfig): VisitorStep {
  const v = cfg.social.visitor!;
  const state: VisitorState = { ...emptyVisitorState(), turn: 1 };
  let line: string;
  let behavior: BehaviorView;
  if (ctx.sleeping) {
    line = pick(LINES.asleep, ctx, 1, 'asleep');
    behavior = viewOf('yawn');
  } else if (isShy(ctx, v)) {
    line = pick(LINES.hide, ctx, 1, 'hide');
    behavior = behave('hide', ctx, cfg);
  } else {
    state.open = true;
    line = friends(ctx) ? pick(LINES.openFriend, ctx, 1, 'open') : pick(LINES.open[tone(ctx.dims.sociability)], ctx, 1, 'open');
    behavior = behave(ctx.dims.sociability < 35 ? 'listen' : 'greet_visitor', ctx, cfg);
  }
  const r = reply(state, fill(line, ctx), behavior, ctx, v);
  return { state: { ...state, last: r }, reply: r, effect: null };
}

/**
 * Avanza con la opción elegida. Devuelve `null` si la opción no está en el menú actual (el
 * servicio contesta 400): nunca se ejecuta algo que no se ofreció.
 */
export function stepVisit(prev: VisitorState, option: VisitorOption, ctx: VisitorCtx, cfg: PersonalityConfig): VisitorStep | null {
  const v = cfg.social.visitor!;
  const offered = menuFor(prev, ctx, v).find((o) => o.id === option);
  if (!offered) return null;
  const turn = prev.turn + 1;
  const state: VisitorState = { ...prev, turn, done: [...prev.done], last: null };
  const say = (lines: string[], salt: string, item?: string) => fill(pick(lines, ctx, turn, salt), ctx, item);
  let line: string;
  let behavior: BehaviorView;
  let worked = false;
  let consume: VisitorEffect['consume'] = null;

  if (option === 'bye') {
    state.ended = true;
    line = say(state.count >= v.maxPerVisit ? LINES.limit : LINES.bye[tone(ctx.dims.sociability)], 'bye');
    behavior = behave(ctx.sleeping ? 'yawn' : 'greet_visitor', ctx, cfg);
    const r = reply(state, line, behavior, ctx, v);
    return { state: { ...state, last: r }, reply: r, effect: null };
  }

  state.count = prev.count + 1;
  if (option !== 'wait') state.done.push(option);

  switch (option) {
    case 'wait':
      state.open = true;
      line = say(LINES.waitOut, 'wait');
      behavior = behave('listen', ctx, cfg);
      break;
    case 'greet':
      worked = true;
      line = say(LINES.greet[tone(ctx.dims.sociability)], 'greet');
      behavior = behave('greet_visitor', ctx, cfg);
      break;
    case 'pet':
      if (isAloof(ctx, v)) {
        line = say(LINES.petNo, 'pet');
        behavior = behave('listen', ctx, cfg);
      } else {
        worked = true;
        line = say(LINES.petOk[tone(ctx.dims.affection)], 'pet');
        behavior = behave('greet_visitor', ctx, cfg);
      }
      break;
    case 'treat':
      worked = true;
      consume = offered.item ?? null;
      state.item = consume?.name;
      line = say(LINES.treat[tone(ctx.dims.affection)], 'treat', consume?.name);
      behavior = behave('accept_treat', ctx, cfg);
      break;
    case 'play':
      if (ctx.sick) {
        line = say(LINES.playSick, 'play');
        behavior = behave('listen', ctx, cfg);
      } else if (ctx.energy < v.minEnergyToPlay) {
        line = say(LINES.playTired, 'play');
        behavior = behave('yawn', ctx, cfg);
      } else {
        worked = true;
        line = say(LINES.playOk[tone(ctx.dims.temper)], 'play');
        behavior = behave('show_habitat', ctx, cfg);
      }
      break;
    case 'ask':
    default:
      worked = true;
      // El ánimo y, como mucho, una vivencia suya. Nunca nada de su entrenador.
      line = fill(moodLine(ctx), ctx) + (ctx.story && knows(ctx) ? ` Parece que quiere contarte algo: «${ctx.story}»` : '');
      behavior = behave('listen', ctx, cfg);
      break;
  }

  // Al llegar al tope, el propio Pockai da la visita por terminada
  if (state.count >= v.maxPerVisit) line += ' ' + fill(pick(LINES.limit, ctx, turn, 'limit'), ctx);

  const effect: VisitorEffect | null =
    worked && ctx.canEffect
      ? {
          option,
          delta: v.deltas[option] ?? 0,
          event: `visitor_${option}`,
          consume,
          happiness: option === 'treat' ? v.treat.happiness : 0,
          hunger: option === 'treat' ? v.treat.hunger : 0,
          episode: visitorEpisode(episodeOption(state.done) ?? option, ctx, state.item),
        }
      : null;
  const r = reply(state, line, behavior, ctx, v);
  return { state: { ...state, last: r }, reply: r, effect };
}
