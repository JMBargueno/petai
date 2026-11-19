/**
 * Visitor Engine (spec 37 §6.2 y lote 5) — funciones puras.
 *
 * Un entrenador que está de visita habla con el Pockai anfitrión **por menú**: sin texto libre y
 * sin LLM. La conversación es un grafo de datos (`shared/game-data/dialogues.json` → `visit`) que
 * recorre el intérprete (`dialogue.engine.ts`); los textos están en `shared/game-data/strings`.
 * Este módulo es el adaptador entre el juego y ese grafo:
 * - convierte lo que se sabe de la mascota y del visitante en las variables del grafo;
 * - traduce las líneas y las opciones a texto, con la variante del carácter del Pockai;
 * - convierte los comandos del grafo en una reacción validada y en un efecto acotado.
 *
 * Reglas:
 * - No hay opciones negativas: un visitante no puede regañar a un Pockai ajeno.
 * - Nada del entrenador del anfitrión sale de aquí. La única vivencia que puede contar («¿qué tal
 *   estás?») llega ya filtrada por la lista blanca de los rumores (`social.engine.isShareable`).
 * - Los topes (interacciones por visita, efectos por día) se aplican aquí y en el grafo; el
 *   servicio solo cuenta y guarda.
 */
import { Behavior, BehaviorView, validateBehavior, viewOf } from './behavior.engine';
import { Dialogue, DialogueState, DialogueStep, Vars, choose, parseCommand, start, visibleChoices } from './dialogue.engine';
import { Dims, PersonalityConfig } from './mind.types';
import { describeDims } from './personality.engine';
import { STAGES, Stage } from './social.engine';
import { Lang, text } from './strings';

// Mismo mecanismo que el resto de datos de juego que no se recargan en caliente
const DIALOGUES: Record<string, Dialogue> = require('../../../../shared/game-data/dialogues.json').conversations;
const DIALOGUE_ID = 'visit';

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
  /** Idioma en el que se le habla al visitante. */
  lang?: Lang;
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
  ended: boolean;
  /** Premio que trajo en esta visita (para el recuerdo). */
  item?: string;
  /** Posición en el grafo. Vive en el servidor: el cliente solo envía el índice de la opción. */
  dialogue: DialogueState | null;
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

/** Se esconde de quien no conoce. */
export function isShy(ctx: VisitorCtx, cfg: VisitorConfig): boolean {
  return ctx.dims.sociability < cfg.shyBelow && !knows(ctx);
}

/** No se deja tocar por quien no conoce. */
export function isAloof(ctx: VisitorCtx, cfg: VisitorConfig): boolean {
  return ctx.dims.affection < cfg.aloofBelow && !knows(ctx);
}

/** Lo que el grafo necesita saber, leído de la situación. Las cuentas y lo ya hecho los lleva el grafo. */
export function visitVars(ctx: VisitorCtx, v: VisitorConfig): Vars {
  return {
    sleeping: ctx.sleeping,
    sick: ctx.sick,
    shy: ctx.dims.sociability < v.shyBelow,
    aloof: ctx.dims.affection < v.aloofBelow,
    knows: knows(ctx),
    friends: rank(ctx.stage) >= rank('friend'),
    has_treat: !!ctx.treat,
    can_effect: ctx.canEffect,
    has_story: !!ctx.story,
    energy: ctx.energy,
    min_energy: v.minEnergyToPlay,
    max: v.maxPerVisit,
  };
}

/** Ánimo en una frase, sin números. Solo su estado: nada de su entrenador. */
export function moodLine(ctx: Pick<VisitorCtx, 'sick' | 'hunger' | 'energy' | 'happiness'> & { petName?: string; lang?: Lang }): string {
  const id = ctx.sick
    ? 'DLG_MOOD_SICK'
    : ctx.hunger < 30
      ? 'DLG_MOOD_HUNGRY'
      : ctx.energy < 25
        ? 'DLG_MOOD_TIRED'
        : ctx.happiness < 35
          ? 'DLG_MOOD_SAD'
          : ctx.happiness > 70
            ? 'DLG_MOOD_HAPPY'
            : 'DLG_MOOD_FINE';
  return text(id, { pet: ctx.petName ?? 'Tu amigo' }, { lang: ctx.lang });
}

/** Qué pesa más en el recuerdo de la visita (una visita deja un solo episodio). */
const EPISODE_WEIGHT: VisitorOption[] = ['ask', 'greet', 'pet', 'play', 'treat'];

/** Opción que mejor resume la visita entre las que hizo. */
export function episodeOption(done: readonly VisitorOption[]): VisitorOption | null {
  let best: VisitorOption | null = null;
  for (const id of done) if (EPISODE_WEIGHT.includes(id) && (!best || EPISODE_WEIGHT.indexOf(id) > EPISODE_WEIGHT.indexOf(best))) best = id;
  return best;
}

export function visitorEpisode(option: VisitorOption, ctx: VisitorCtx, item?: string): string {
  // Los recuerdos se guardan con el texto ya resuelto: el modelo los lee tal cual
  return text(`DLG_VISIT_EP_${option.toUpperCase()}`, { visitor: ctx.visitorName, item: item ?? 'un premio' });
}

/** `DLG_OPT_GREET` → `greet`. */
const optionOf = (textId: string): VisitorOption | null => {
  const id = textId.replace(/^DLG_OPT_/, '').toLowerCase();
  return isVisitorOption(id) ? id : null;
};

export const emptyVisitorState = (): VisitorState => ({ turn: 0, count: 0, done: [], ended: false, dialogue: null, last: null });

function menu(step: DialogueStep, ctx: VisitorCtx): VisitorMenuOption[] {
  const out: VisitorMenuOption[] = [];
  for (const c of step.choices) {
    const id = optionOf(c.text);
    if (!id) continue;
    const item = id === 'treat' ? (ctx.treat ?? undefined) : undefined;
    out.push({ id, label: text(c.text, { item: item?.name }, { lang: ctx.lang }), ...(item ? { item } : {}) });
  }
  return out;
}

/** Opciones disponibles ahora. Siempre queda, al menos, despedirse. */
export function menuFor(state: VisitorState, ctx: VisitorCtx, v: VisitorConfig): VisitorMenuOption[] {
  if (state.ended || !state.dialogue?.node) return [];
  const vars = { ...state.dialogue.vars, ...visitVars(ctx, v) };
  const node = DIALOGUES[DIALOGUE_ID].nodes[state.dialogue.node];
  // Las mismas opciones que vería el intérprete, sin avanzar
  const choices = node ? visibleChoices(node, vars).map((c, index) => ({ index, text: c.text })) : [];
  return menu({ choices } as DialogueStep, ctx);
}

/** Convierte un paso del grafo en lo que ve el visitante y en el efecto que deja. */
function present(step: DialogueStep, prev: VisitorState, option: VisitorOption | null, ctx: VisitorCtx, cfg: PersonalityConfig): VisitorStep {
  const v = cfg.social.visitor!;
  const vars = step.state.vars;
  const keywords = Object.values(describeDims(ctx.dims, cfg)).map((d) => d.keyword);
  const done = VISITOR_OPTIONS.filter((o) => vars[`done_${o}`] === true);
  const count = typeof vars.count === 'number' ? vars.count : 0;

  // Comandos del grafo (catálogo cerrado; el validador de datos ya rechazó cualquier otro)
  let proposed: Behavior | string = 'listen';
  let delta = 0;
  let felt = false;
  let takes = false;
  for (const raw of step.commands) {
    const cmd = parseCommand(raw);
    if (!cmd) continue;
    if (cmd.name === 'behavior') proposed = cmd.arg;
    if (cmd.name === 'feel') {
      felt = true;
      delta += Number(cmd.arg) || 0;
    }
    if (cmd.name === 'take_item') takes = cmd.arg === 'visitor';
  }
  const consume = takes ? ctx.treat : null;
  const item = consume?.name ?? prev.item;

  // Toda reacción pasa por la validación común: modo, audiencia «visitante» y personalidad
  const validated = validateBehavior(proposed, ctx.dims, { sleeping: ctx.sleeping, sick: ctx.sick, energy: ctx.energy }, cfg, 'visitor');
  const behavior: BehaviorView = validated.view ?? viewOf('listen');

  const params = { pet: ctx.petName, visitor: ctx.visitorName, item, mood: moodLine({ ...ctx, petName: ctx.petName }), story: ctx.story ?? '' };
  const line = step.lines.map((l) => text(l.line, params, { lang: ctx.lang, keywords })).join(' ');

  const state: VisitorState = { turn: prev.turn + 1, count, done, ended: step.state.ended, item, dialogue: step.state, last: null };
  const reply: VisitorReply = { turn: state.turn, line, behavior, options: menu(step, ctx), remaining: Math.max(0, v.maxPerVisit - count), ended: state.ended };

  // Solo deja huella lo que el grafo marca con `feel`, y solo si quedan efectos por hoy
  const effect: VisitorEffect | null =
    option && felt && ctx.canEffect
      ? {
          option,
          delta: Math.max(0, delta),
          event: `visitor_${option}`,
          consume,
          happiness: consume ? v.treat.happiness : 0,
          hunger: consume ? v.treat.hunger : 0,
          episode: visitorEpisode(episodeOption(done) ?? option, ctx, item),
        }
      : null;
  return { state: { ...state, last: reply }, reply, effect };
}

/** Empieza la conversación: cómo recibe al visitante. No cuenta como interacción ni deja efecto. */
export function openVisit(ctx: VisitorCtx, cfg: PersonalityConfig): VisitorStep {
  const step = start(DIALOGUES, DIALOGUE_ID, visitVars(ctx, cfg.social.visitor!));
  return present(step, emptyVisitorState(), null, ctx, cfg);
}

/**
 * Avanza con la opción elegida. Devuelve `null` si la opción no está en el menú actual (el
 * servicio contesta 400): nunca se ejecuta algo que no se ofreció.
 */
export function stepVisit(prev: VisitorState, option: VisitorOption, ctx: VisitorCtx, cfg: PersonalityConfig): VisitorStep | null {
  const v = cfg.social.visitor!;
  if (prev.ended || !prev.dialogue) return null;
  const index = menuFor(prev, ctx, v).findIndex((o) => o.id === option);
  if (index < 0) return null;
  // Lo que ha podido cambiar desde el paso anterior (energía, premio disponible, efectos por hoy)
  const step = choose(DIALOGUES, prev.dialogue, index, visitVars(ctx, v));
  return step ? present(step, prev, option, ctx, cfg) : null;
}
