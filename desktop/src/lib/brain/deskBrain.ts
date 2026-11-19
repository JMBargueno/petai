/**
 * Cerebro del Pockai en el escritorio: decide qué hacer a partir de la pizarra de situación.
 *
 * Tres capas separadas (spec 37 §7): percibir (`deskSituation`) → decidir (este archivo) →
 * actuar (PetView ejecuta las órdenes). Aquí no hay DOM, reloj ni azar propio: el generador
 * llega de fuera, así que la misma secuencia de situaciones da la misma secuencia de órdenes.
 *
 * - Un **modo superior** dice qué se puede hacer ahora (dormida, en brazos, oculta por una
 *   pantalla completa, de siesta porque el usuario se fue, en foco de Pomodoro o libre).
 * - En modo libre o foco, un **selector por utilidad** (`@pockai/mind`) elige la siguiente
 *   conducta según la personalidad, las necesidades, la app en foco y lo que hizo hace poco.
 */
import { creditTarget, learnedFactor, pushRecent, rngRange, selectByUtility, type LearningConfig, type Rng, type UtilityCandidate } from '@pockai/mind';
import type { BehaviorConfig, BehaviorRequires, DeskConfig } from './deskConfig';
import { DESK_BEHAVIORS, canPerchOn, type ActiveBehavior, type BehaviorCtx, type DeskCommand } from './deskBehaviors';
import type { DeskSituation } from './deskSituation';

export type DeskMode = 'asleep' | 'away' | 'held' | 'busy' | 'hidden' | 'napping' | 'focus' | 'free';

export interface BrainState {
  mode: DeskMode;
  active: ActiveBehavior | null;
  nextDecisionAt: number;
  /** Últimas conductas elegidas (la más reciente al final). */
  recent: string[];
  lastAt: Record<string, number>;
  /** Último tramo del día que ya saludó. */
  timeSlot: string | null;
  /** Desde cuándo falta el usuario (solo mientras duerme la siesta). */
  awaySince: number | null;
  /** La última conducta que terminó: un gesto justo después aún va por ella. */
  lastEnded?: { id: string; at: number } | null;
}

export interface BrainStep {
  state: BrainState;
  commands: DeskCommand[];
}

export function initialBrain(now: number): BrainState {
  return { mode: 'free', active: null, nextDecisionAt: now + 1200, recent: [], lastAt: {}, timeSlot: null, awaySince: null };
}

/** Modo superior: lo que manda sobre cualquier conducta. */
export function resolveMode(sit: DeskSituation, cfg: DeskConfig): DeskMode {
  if (sit.away) return 'away';
  if (sit.sleeping) return 'asleep';
  if (sit.held) return 'held';
  if (sit.foreground?.fullscreen) return 'hidden';
  if (sit.skills.presence_sense && sit.idleMs >= cfg.idle.napAfterMs) return 'napping';
  if (sit.busy) return 'busy';
  if (sit.pomodoro === 'work' && sit.skills.pomodoro_companion) return 'focus';
  return 'free';
}

/** ¿Se cumplen los requisitos declarados en datos? Lista blanca: nada de `eval`. */
export function meets(req: BehaviorRequires | undefined, sit: DeskSituation, state: BrainState, cfg: DeskConfig): boolean {
  if (!req) return true;
  const { needs, cursor } = sit;
  if (req.minEnergy !== undefined && needs.energy < req.minEnergy) return false;
  if (req.maxEnergy !== undefined && needs.energy > req.maxEnergy) return false;
  if (req.minHappiness !== undefined && needs.happiness < req.minHappiness) return false;
  if (req.skill && !sit.skills[req.skill]) return false;
  if (req.userActive !== undefined && sit.userActive !== req.userActive) return false;
  if (req.typing !== undefined && sit.typing !== req.typing) return false;
  if (req.motion && sit.reducedMotion) return false;
  if (req.newTimeSlot && (!sit.timeOfDay || sit.timeOfDay === state.timeSlot)) return false;
  if (req.window && !canPerchOn(sit.foreground, sit)) return false;
  if (req.apps && !req.apps.includes(sit.appCategory)) return false;
  if (req.moods && !req.moods.includes(sit.mood)) return false;
  for (const [d, min] of Object.entries(req.minDims ?? {})) if (sit.dims[d as keyof typeof sit.dims] < (min as number)) return false;
  for (const [d, max] of Object.entries(req.maxDims ?? {})) if (sit.dims[d as keyof typeof sit.dims] > (max as number)) return false;
  if (req.cursor) {
    if (!cursor.onScreen) return false;
    const c = cfg.cursor;
    // La mascota anda por su franja: un cursor muy por encima o por debajo le queda fuera de alcance
    if (cursor.dy > c.nearPx) return false;
    switch (req.cursor) {
      case 'near':
        if (cursor.dist > c.nearPx) return false;
        break;
      case 'still':
        if (cursor.kind !== 'still' || cursor.dist < c.stalkMinPx || cursor.dist > c.stalkMaxPx) return false;
        break;
      case 'fast':
        if (cursor.kind !== 'fast') return false;
        break;
      case 'slow':
        if (cursor.kind !== 'slow' || cursor.dist > c.nearPx * 1.5) return false;
        break;
      case 'approaching':
        if (!cursor.approaching || cursor.dist > c.shyPx) return false;
        break;
    }
  }
  return true;
}

function needsFactor(b: BehaviorConfig, sit: DeskSituation, cfg: DeskConfig): number {
  const boost = b.boost;
  if (!boost) return 1;
  let f = 1;
  if (boost.lowEnergy && sit.needs.energy <= cfg.needs.low) f *= boost.lowEnergy;
  if (boost.highEnergy && sit.needs.energy >= cfg.needs.high) f *= boost.highEnergy;
  if (boost.lowHappiness && sit.needs.happiness <= cfg.needs.low) f *= boost.lowHappiness;
  if (boost.highHappiness && sit.needs.happiness >= cfg.needs.high) f *= boost.highHappiness;
  return f;
}

/** Candidatas de este instante: las que tienen guion, cumplen requisitos y admite el modo. */
export function candidatesFor(mode: DeskMode, sit: DeskSituation, state: BrainState, cfg: DeskConfig, learning?: LearningConfig): UtilityCandidate[] {
  const profile = cfg.appProfiles[sit.appCategory];
  const out: UtilityCandidate[] = [];
  for (const [id, b] of Object.entries(cfg.behaviors)) {
    if (!DESK_BEHAVIORS[id]) continue;
    if (mode === 'focus' && !cfg.focus.includes(id)) continue;
    if (!meets(b.requires, sit, state, cfg)) continue;
    // Lo aprendido inclina la balanza, pero no salta requisitos ni lo que la app en foco descarta
    const liked = learning ? learnedFactor(sit.learned, id, learning) : 1;
    const factor = needsFactor(b, sit, cfg) * (profile?.factors[id] ?? 1) * liked;
    if (factor <= 0) continue;
    out.push({ id, base: b.base, weights: b.weights, cooldownMs: b.cooldownMs, factor });
  }
  return out;
}

/** ¿Puede soltar ahora una frase espontánea? En foco, oculta o de siesta, nunca. */
export function mayBark(state: BrainState, sit: DeskSituation, cfg: DeskConfig, rng: Rng): boolean {
  if (state.mode !== 'free') return false;
  const factor = cfg.appProfiles[sit.appCategory]?.barkFactor ?? 1;
  return factor > 0 && rng() < factor;
}

/** A qué conducta va un gesto del entrenador ahora mismo (`null`: a ninguna). */
export function creditOf(state: BrainState, now: number, learning: LearningConfig): string | null {
  return creditTarget(state.active?.id ?? null, state.lastEnded ?? null, now, learning);
}

const pause = (rng: Rng, cfg: DeskConfig) => rngRange(rng, cfg.pauseMs[0], cfg.pauseMs[1]);

/** Termina la conducta en curso y devuelve sus órdenes de limpieza. */
function finish(state: BrainState, ctx: BehaviorCtx): DeskCommand[] {
  const active = state.active;
  if (!active) return [];
  state.active = null;
  state.lastEnded = { id: active.id, at: ctx.sit.now };
  state.nextDecisionAt = ctx.sit.now + pause(ctx.rng, ctx.cfg);
  return DESK_BEHAVIORS[active.id]?.end?.(ctx, active) ?? [];
}

function onModeChange(prev: DeskMode, next: DeskMode, state: BrainState, ctx: BehaviorCtx): DeskCommand[] {
  const { sit, cfg } = ctx;
  const commands: DeskCommand[] = [];

  if (next !== 'free' && next !== 'focus') {
    // En brazos, de viaje o dormida la vista ya gobierna la postura: basta con olvidar la conducta
    const cleanup = next === 'hidden' || next === 'napping' ? finish(state, ctx) : [];
    state.active = null;
    commands.push(...cleanup, { type: 'stop' }, { type: 'pose', pose: null });
  }

  if (prev === 'hidden') commands.push({ type: 'hide', on: false }, { type: 'clip', name: 'idle_alt' });
  if (next === 'hidden') commands.push({ type: 'hide', on: true });

  if (next === 'napping') {
    state.awaySince = sit.now - sit.idleMs;
    commands.push({ type: 'nap', on: true });
  }
  if (prev === 'napping') {
    commands.push({ type: 'nap', on: false });
    const awayMs = state.awaySince === null ? 0 : sit.now - state.awaySince;
    state.awaySince = null;
    if (next === 'free' || next === 'focus') {
      commands.push({ type: 'clip', name: 'wake' });
      if (awayMs >= cfg.idle.welcomeMinAwayMs) {
        commands.push({ type: 'clip', name: sit.dims.affection >= 60 ? 'love' : 'happy' });
        if (next === 'free') commands.push({ type: 'bark', category: 'welcome_back' });
        if (awayMs >= cfg.idle.longAwayMs) commands.push({ type: 'fx', id: 'descarga-calida', params: { tier: 'happy' } });
      }
      state.nextDecisionAt = sit.now + 2500;
    }
  }
  return commands;
}

/**
 * Un tic del cerebro. No muta el estado recibido: devuelve el nuevo y las órdenes para la vista.
 */
export function stepBrain(prev: BrainState, sit: DeskSituation, rng: Rng, cfg: DeskConfig, learning?: LearningConfig): BrainStep {
  const state: BrainState = { ...prev, recent: prev.recent, lastAt: prev.lastAt };
  const ctx: BehaviorCtx = { sit, rng, cfg };
  const commands: DeskCommand[] = [];

  const mode = resolveMode(sit, cfg);
  // Estar ocupada con un clip es una pausa, no un cambio de modo: muchas conductas reproducen
  // el suyo. Se espera sin tocar nada y al terminar se retoma donde estaba.
  if (mode === 'busy') return { state, commands };
  if (mode !== state.mode) {
    commands.push(...onModeChange(state.mode, mode, state, ctx));
    state.mode = mode;
  }
  if (mode !== 'free' && mode !== 'focus') return { state, commands };

  // La pelota manda: si rueda por el suelo, va a por ella
  if (mode === 'free' && sit.ball?.rolling && sit.body.surface === 'ground') {
    commands.push(...finish(state, ctx));
    commands.push({ type: 'move', x: sit.ball.x - sit.body.size / 2, speed: 'run' });
    state.nextDecisionAt = sit.now + 900;
    return { state, commands };
  }

  if (state.active) {
    const active = state.active;
    const def = DESK_BEHAVIORS[active.id];
    // En foco solo sigue lo que el foco admite
    const allowed = mode !== 'focus' || cfg.focus.includes(active.id);
    const step = allowed ? (def?.update?.(ctx, active) ?? {}) : { done: true };
    if (step.commands) commands.push(...step.commands);
    const next: ActiveBehavior = {
      ...active,
      phase: step.phase ?? active.phase,
      phaseAt: step.phase !== undefined && step.phase !== active.phase ? sit.now : active.phaseAt,
      data: step.data ? { ...active.data, ...step.data } : active.data,
    };
    state.active = next;
    if (step.done || sit.now >= next.endsAt || !def) commands.push(...finish(state, ctx));
    return { state, commands };
  }

  // Sin conducta y fuera del suelo (se interrumpió trepando o posada): baja
  if (sit.body.surface === 'wall' || sit.body.surface === 'ceiling' || sit.body.surface === 'perched') {
    commands.push({ type: 'drop' });
    state.nextDecisionAt = sit.now + 1500;
    return { state, commands };
  }
  if (sit.body.surface !== 'ground' || sit.now < state.nextDecisionAt) return { state, commands };

  const id = selectByUtility({
    candidates: candidatesFor(mode, sit, state, cfg, learning),
    dims: sit.dims,
    recent: state.recent,
    lastAt: state.lastAt,
    now: sit.now,
    rng,
    cfg: cfg.antiRepeat,
  });
  if (!id) {
    state.nextDecisionAt = sit.now + pause(rng, cfg);
    return { state, commands };
  }

  const started = DESK_BEHAVIORS[id].start(ctx);
  commands.push(...started.commands);
  state.active = {
    id,
    startedAt: sit.now,
    phase: 0,
    phaseAt: sit.now,
    endsAt: sit.now + started.durationMs,
    data: started.data ?? {},
  };
  state.recent = pushRecent(state.recent, id, cfg.antiRepeat.window);
  state.lastAt = { ...state.lastAt, [id]: sit.now };
  if (id === 'time_routine') state.timeSlot = sit.timeOfDay;
  return { state, commands };
}
