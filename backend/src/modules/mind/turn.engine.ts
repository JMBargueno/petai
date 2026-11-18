/**
 * Turn Engine (spec 37 §4.5–4.7) — funciones puras.
 *
 * Un turno de chat con el entrenador, de principio a fin, sin tocar la base de datos:
 * - `planOwnerTurn`: con el mensaje, la mascota y lo que recuerda, monta la pizarra de situación,
 *   decide la reacción y prepara lo que el prompt necesita (qué recuerdos garantizar, por quién
 *   pregunta, qué le apetece, qué truco hace).
 * - `settleOwnerTurn`: tras la respuesta, calcula qué cambia (historial, deseos, trucos, relación)
 *   para que el servicio lo guarde en una sola escritura.
 *
 * El servicio de chat solo trae los datos y aplica el resultado: percibir → decidir → actuar.
 */
import { BehaviorState, BehaviorView, Behavior, decideBehavior, isBehavior, promptHint, pushRecentBehavior } from './behavior.engine';
import { Interpretation, interpretMessage } from './conversation.engine';
import { dayKey } from './evolution.engine';
import { MemoryRow, layerOf } from './memory.engine';
import { Dims, PersonalityConfig, StoredPersonality } from './mind.types';
import { Situation, buildSituation, sinceLastOrder } from './situation.engine';
import { TricksState, nextTrick, normalizeTricks, practiceTrick, trickToPerform } from './tricks.engine';
import { WishId, WishesState, activeWishes, afterChatTurn, fulfilEpisode, fulfilWish, mayShowWish, normalizeWishes, wishHint } from './wishes.engine';
import { createRng, hashSeed } from '../battles/combat/rng';

const DAY_MS = 86_400_000;

export interface TurnPet {
  id: string;
  hunger?: number | null;
  energy?: number | null;
  hygiene?: number | null;
  happiness?: number | null;
  health?: number | null;
  sleeping?: boolean | null;
  sick?: boolean | null;
  lastInteractionAt?: Date | null;
}

export interface TurnInput {
  message: string;
  pet: TurnPet;
  dims: Dims;
  /** JSON de personalidad guardado (historial, trucos, deseos). */
  stored: StoredPersonality;
  /** Episodios recientes y relaciones (nunca la capa semántica). */
  rows: readonly MemoryRow[];
  now: Date;
}

export interface TurnPlanData {
  interpretation: Interpretation;
  situation: Situation;
  /** Condiciones que se cumplen (para validar también lo que proponga el modelo). */
  flags: Set<string>;
  behavior: BehaviorView;
  /** Deseo que se ofrece como tema en este turno, si toca. */
  wish: WishId | null;
  wishes: WishesState;
  tricks: TricksState;
  /** Recuerdos que deben entrar en el prompt. */
  ensureIds: string[];
  /** Sujeto por el que pregunta (`ask_friend`), si lo conoce. */
  subject: string | null;
  /** Líneas de guía para el prompt (reacción, truco, deseo…). */
  hints: string[];
}

const state = (pet: TurnPet): BehaviorState => ({ sleeping: !!pet.sleeping, sick: !!pet.sick, energy: pet.energy ?? 100 });

const daysSince = (rows: readonly MemoryRow[], kinds: string | string[], now: Date): number | null => {
  let latest = -Infinity;
  for (const r of rows) if (Array.isArray(kinds) ? kinds.includes(r.kind) : kinds === r.kind) latest = Math.max(latest, r.createdAt.getTime());
  return latest === -Infinity ? null : Math.max(0, (now.getTime() - latest) / DAY_MS);
};

/** Busca a alguien por su nombre entre las relaciones («Brasa (Pockai de Ana)»). */
export function subjectByName(rows: readonly MemoryRow[], name: string): string | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  for (const r of rows) {
    if (layerOf(r) !== 'emotional' || !r.subject || r.subject === 'owner') continue;
    const label = r.content.trim().toLowerCase();
    if (label === wanted || label.startsWith(`${wanted} `) || label.startsWith(`${wanted}(`)) return r.subject;
  }
  return null;
}

export function planOwnerTurn(input: TurnInput, cfg: PersonalityConfig): TurnPlanData {
  const { pet, dims, stored, rows, now } = input;
  const interpretation = interpretMessage(input.message);
  const ownerRow = rows.find((r) => r.key === 'emo:owner');
  const tricks = normalizeTricks(stored.tricks, cfg.tricks);
  const wishesState = normalizeWishes(stored.wishes);

  const situation = buildSituation(
    {
      audience: 'owner',
      subject: ownerRow ? { key: 'owner', valence: ownerRow.valence, stage: null } : null,
      pet,
      now,
      lastOwnerInteractionAt: pet.lastInteractionAt ?? null,
      recent: stored.recent,
      memories: rows,
      tricks: tricks.known,
    },
    cfg,
    isBehavior,
  );

  const finds = situation.untold.filter((u) => u.kind === 'find');
  const last = pet.lastInteractionAt ?? null;
  const flags = new Set<string>();
  if (situation.untold.length) flags.add('untold');
  if (finds.length) flags.add('has_find');
  if (tricks.known.length) flags.add('knows_trick');
  if (!last || dayKey(last) !== dayKey(now)) flags.add('first_turn_today');
  // Pide perdón por su enfado si la relación es buena: tras enfurruñarse, no a quien le cae mal
  if (situation.recent[situation.recent.length - 1] === 'sulk' && (ownerRow?.valence ?? 0) >= 0.2) flags.add('after_scold');

  const hasFriends = rows.some((r) => layerOf(r) === 'emotional' && !!r.subject?.startsWith('pet:'));
  const wishes = activeWishes(
    {
      dims,
      now,
      awayMinutes: situation.awayMinutes,
      daysSinceAdventure: daysSince(rows, 'adventure', now),
      // Con amigos y sin ningún encuentro recordado, es como llevar mucho sin verlos
      daysSinceFriend: hasFriends ? (daysSince(rows, ['encounter', 'visit'], now) ?? 999) : null,
      hasUntoldFind: finds.length > 0,
      canLearnTrick: !!tricks.learning || nextTrick(tricks, dims, cfg.tricks) !== null,
      energy: situation.needs.energy,
      sick: situation.needs.sick,
    },
    wishesState,
    cfg.wishes,
  );
  situation.wishes = wishes;

  const behavior = decideBehavior(interpretation.intent, dims, state(pet), cfg, { recent: situation.recent, seed: pet.id, flags });

  // Lo que vaya a contar tiene que estar delante del modelo
  const ensureIds: string[] = [];
  const stories = situation.untold.filter((u) => u.kind !== 'find');
  if (behavior.action === 'bring_gift' && finds[0]) ensureIds.push(finds[0].id);
  else if (behavior.action === 'tell_story') ensureIds.push((stories[0] ?? situation.untold[0]).id);
  if (interpretation.intent === 'ask_life') for (const u of situation.untold.slice(0, 2)) if (!ensureIds.includes(u.id)) ensureIds.push(u.id);

  const hints = [promptHint(behavior)];
  let subject: string | null = null;
  if (interpretation.intent === 'ask_friend' && interpretation.mentioned) {
    subject = subjectByName(rows, interpretation.mentioned);
    // Sin recuerdos de esa persona no hay nada que contar: que lo diga, no que se lo invente
    hints.push(
      subject
        ? `Te pregunta por ${interpretation.mentioned}: responde solo con lo que recuerdas de él.`
        : `Te pregunta por ${interpretation.mentioned}, pero no recuerdas a nadie con ese nombre: dilo con naturalidad y no inventes nada.`,
    );
  }
  if (interpretation.intent === 'ask_life' && !situation.untold.length) {
    hints.push('Te pregunta qué has hecho: si no recuerdas nada nuevo, dilo con sencillez y no inventes aventuras.');
  }
  if (behavior.action === 'perform_trick') {
    const rng = createRng(hashSeed(`trick:${pet.id}:${wishesState.turn}`));
    const id = trickToPerform(tricks, rng());
    if (id) hints.push(`El truco que haces: ${cfg.tricks.catalog[id].name}.`);
  }
  if (interpretation.intent === 'teach') {
    const id = tricks.learning?.id ?? nextTrick(tricks, dims, cfg.tricks);
    hints.push(
      id
        ? `Tu entrenador te está enseñando un truco: ${cfg.tricks.catalog[id].name}. Aún lo estás practicando; no digas que ya lo dominas.`
        : 'Tu entrenador quiere enseñarte un truco, pero ya sabes todos los que puedes aprender: díselo con gracia.',
    );
  }

  const heavy = interpretation.intent === 'sad_day' || interpretation.intent === 'scold' || interpretation.intent === 'farewell';

  // «Desde la última vez» (§6.6): en el primer turno tras una ausencia tiene delante lo que vivió
  // mientras tanto, diga lo que diga el mensaje. Lo inyectado queda como contado, así que el
  // turno siguiente no lo repite; y `lastChatAt` impide forzarlo otra vez en la misma charla.
  const awayLimit = cfg.autonomy?.ownerAwayMinutes ?? 30;
  const lastChat = typeof stored.lastChatAt === 'string' ? Date.parse(stored.lastChatAt) : NaN;
  const sinceChat = Number.isFinite(lastChat) ? Math.max(0, (now.getTime() - lastChat) / 60_000) : Infinity;
  const back = !!last && Math.min(situation.awayMinutes, sinceChat) >= awayLimit;
  if (back && !heavy && !pet.sleeping && situation.untold.length) {
    const max = cfg.memory.sinceLastMax ?? 2;
    const before = ensureIds.length;
    for (const u of sinceLastOrder(situation.untold)) {
      if (ensureIds.length >= Math.max(max, before)) break;
      if (!ensureIds.includes(u.id)) ensureIds.push(u.id);
    }
    hints.push(
      'Tu entrenador vuelve después de un rato sin veros. Entre tus recuerdos tienes lo que viviste mientras no estaba: si viene a cuento, cuéntale algo de eso con tus palabras, en una frase y sin inventar nada.',
    );
  }

  // Un deseo, como mucho cada tantos turnos, y nunca cuando el mensaje pide otra cosa
  const wish = !pet.sleeping && !heavy && wishes[0] && mayShowWish(wishesState, cfg.wishes) ? wishes[0] : null;
  if (wish) hints.push(wishHint(wish));

  return { interpretation, situation, flags, behavior, wish, wishes: wishesState, tricks, ensureIds, subject, hints };
}

export interface TurnOutcome {
  /** Claves del JSON de personalidad a guardar junto con la deriva. */
  patch: Partial<StoredPersonality>;
  /** Recuerdos que deja el turno (además del episodio de plantilla del mensaje). */
  episodes: { key: string; content: string; importance: number; valence: number }[];
  /** Mejora adicional de la relación con el entrenador (una disculpa repara, una vez al día). */
  ownerDelta: number;
  /** Felicidad por deseos cumplidos (acotada). */
  happiness: number;
  fulfilled: WishId[];
  /** Truco aprendido en este turno, si lo hubo. */
  learned: string | null;
}

/**
 * Qué cambia tras el turno. `action` es la reacción que al final se vio (la del motor o la que
 * propuso el modelo, ya validada).
 */
export function settleOwnerTurn(plan: TurnPlanData, action: Behavior, dims: Dims, stored: StoredPersonality, now: Date, cfg: PersonalityConfig): TurnOutcome {
  const today = dayKey(now);
  const episodes: TurnOutcome['episodes'] = [];
  const fulfilled: WishId[] = [];
  let wishes = afterChatTurn(plan.wishes, plan.wish);
  let tricks = plan.tricks;
  let learned: string | null = null;

  const fulfil = (id: WishId) => {
    // Solo cuenta como cumplido lo que de verdad le apetecía
    if (!plan.situation.wishes.includes(id) || fulfilled.includes(id)) return;
    const next = fulfilWish(wishes, id, now, cfg.wishes);
    if (!next) return;
    wishes = next;
    fulfilled.push(id);
    episodes.push({ key: `wish:${id}`, content: fulfilEpisode(id), importance: 0.45, valence: 0.6 });
  };

  if (action === 'bring_gift') fulfil('show_find');
  if (action === 'cuddle') fulfil('be_cuddled');

  // Enseñar: una práctica con tope diario. Que la regex acierte no basta para avanzar sin límite.
  if (plan.interpretation.intent === 'teach') {
    const res = practiceTrick(tricks, dims, cfg.tricks, today, 'teach');
    tricks = res.state;
    if (res.learned) {
      learned = res.learned;
      episodes.push({ key: `trick:${res.learned}`, content: `Aprendí un truco nuevo con mi entrenador: ${cfg.tricks.catalog[res.learned].name}.`, importance: 0.6, valence: 0.7 });
      fulfil('learn_trick');
    }
  }

  // Una disculpa repara parte de lo que dolió un regaño, una vez al día
  let ownerDelta = 0;
  const patch: Partial<StoredPersonality> = {
    lastChatAt: now.toISOString(),
    recent: pushRecentBehavior(plan.situation.recent, action, cfg),
    wishes,
    tricks,
  };
  if (plan.interpretation.intent === 'apology' && stored.apologyDay !== today) {
    ownerDelta = 0.1;
    patch.apologyDay = today;
  }

  return { patch, episodes, ownerDelta, happiness: Math.min(cfg.wishes.happinessOnFulfil, fulfilled.length * cfg.wishes.happinessOnFulfil), fulfilled, learned };
}
