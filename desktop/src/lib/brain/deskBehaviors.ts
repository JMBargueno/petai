/**
 * Catálogo de conductas del escritorio: qué hace el Pockai en cada una, paso a paso.
 *
 * Cada conducta es un pequeño guion puro: recibe la situación y devuelve órdenes para la vista
 * (`DeskCommand`). No toca el DOM ni el reloj; quién se elige y cuándo lo decide `deskBrain`
 * con los pesos de `balance.json → personality.desktop.behaviors` (mismas claves que aquí).
 */
import { rngInt, rngRange, type Rng } from '@pockai/mind';
import type { DeskConfig } from './deskConfig';
import type { DeskSituation, ForegroundWindow } from './deskSituation';
import { clampX } from './locomotion';
import { calculatePerchTarget } from '../windowPerching';

export type Speed = 'slow' | 'walk' | 'run' | 'climb';

/** Órdenes que la vista (PetView) sabe ejecutar. */
export type DeskCommand =
  | { type: 'move'; x: number | null; y?: number | null; speed: Speed; trail?: boolean }
  | { type: 'stop' }
  | { type: 'face'; dir: 1 | -1 }
  | { type: 'clip'; name: string }
  | { type: 'pose'; pose: 'sit' | null }
  | { type: 'fx'; id: string; params?: Record<string, string | number> }
  | { type: 'bark'; category: string }
  | { type: 'particle'; emoji: string }
  | { type: 'squash' }
  | { type: 'highFive' }
  | { type: 'surface'; surface: 'wall' | 'ceiling'; side?: 'left' | 'right' }
  | { type: 'drop' }
  | { type: 'perch'; x: number; y: number; hop: boolean }
  | { type: 'hide'; on: boolean }
  | { type: 'nap'; on: boolean };

export interface ActiveBehavior {
  id: string;
  startedAt: number;
  phase: number;
  /** Cuándo empezó la fase actual. */
  phaseAt: number;
  /** Límite duro: pasado este momento la conducta se da por terminada. */
  endsAt: number;
  data: Record<string, number>;
}

export interface BehaviorCtx {
  sit: DeskSituation;
  rng: Rng;
  cfg: DeskConfig;
}

export interface BehaviorStart {
  commands: DeskCommand[];
  durationMs: number;
  data?: Record<string, number>;
}

export interface BehaviorStep {
  commands?: DeskCommand[];
  done?: boolean;
  /** Pasa a esta fase (reinicia `phaseAt`). */
  phase?: number;
  data?: Record<string, number>;
}

export interface BehaviorDef {
  start(ctx: BehaviorCtx): BehaviorStart;
  /** Se llama en cada tic mientras la conducta está activa. */
  update?(ctx: BehaviorCtx, active: ActiveBehavior): BehaviorStep;
  /** Órdenes de limpieza, tanto si termina sola como si se interrumpe. */
  end?(ctx: BehaviorCtx, active: ActiveBehavior): DeskCommand[];
}

const MARGIN = 20;

const centerOf = (sit: DeskSituation) => sit.body.x + sit.body.size / 2;
/** Destino horizontal dentro de la pantalla, con un margen a cada lado. */
const insideX = (sit: DeskSituation, x: number) => MARGIN + clampX(x - MARGIN, sit.screen.w - 2 * MARGIN, sit.body.size);
const dirTo = (from: number, to: number): 1 | -1 => (to >= from ? 1 : -1);

/** Ha llegado: ya no se mueve y ha pasado al menos un tic desde que empezó la fase. */
export function arrived(ctx: BehaviorCtx, active: ActiveBehavior): boolean {
  return !ctx.sit.body.moving && ctx.sit.now - active.phaseAt >= ctx.cfg.thinkMs;
}

const untilArrive: BehaviorDef['update'] = (ctx, active) => ({ done: arrived(ctx, active) });

/** Dónde se posa sobre una ventana, sin salirse de la pantalla. */
export function perchSpot(win: ForegroundWindow, sit: DeskSituation): { x: number; y: number } {
  const t = calculatePerchTarget({ ...win, title: '', is_valid: true }, sit.body.size);
  return {
    x: Math.min(Math.max(0, t.x), Math.max(0, sit.screen.w - sit.body.size)),
    y: Math.min(Math.max(0, t.y), Math.max(0, sit.screen.h - sit.body.size)),
  };
}

/** Una ventana sirve para posarse si es visible, ancha y no ocupa la pantalla entera. */
export function canPerchOn(win: ForegroundWindow | null, sit: DeskSituation): win is ForegroundWindow {
  if (!win || win.fullscreen) return false;
  if (win.w < 300 || win.y < 40) return false;
  return win.x + win.w > 60 && win.x < sit.screen.w - 60 && win.y < sit.screen.h - 80;
}

const quietApps = ['gaming', 'video'];

/** Gesto del Talento del Flujo según el elemento (solo clips y efectos que ya existen). */
function flowTalent(ctx: BehaviorCtx): BehaviorStart {
  const { sit } = ctx;
  const dash = insideX(sit, sit.body.x + sit.body.dir * 170);
  switch (sit.element) {
    case 'fire':
      return { commands: [{ type: 'clip', name: 'attack' }, { type: 'move', x: dash, speed: 'run', trail: true }], durationMs: 3500 };
    case 'water':
      return { commands: [{ type: 'clip', name: 'clean' }, { type: 'fx', id: 'destello-ritual' }], durationMs: 3000 };
    case 'plant':
    case 'grass':
      return { commands: [{ type: 'clip', name: 'heal' }, { type: 'fx', id: 'destello-ritual' }], durationMs: 3000 };
    case 'electric':
      return {
        commands: [{ type: 'move', x: insideX(sit, sit.body.x + sit.body.dir * 120), speed: 'run', trail: true }],
        durationMs: 5000,
        data: { dashes: 2 },
      };
    case 'shadow':
      return { commands: [{ type: 'clip', name: 'attack' }, { type: 'fx', id: 'glitch-animo' }], durationMs: 3000 };
    case 'light':
      return { commands: [{ type: 'clip', name: 'celebrate' }, { type: 'fx', id: 'destello-prisma' }], durationMs: 3000 };
    default:
      return { commands: [{ type: 'clip', name: 'celebrate' }], durationMs: 2500 };
  }
}

export const DESK_BEHAVIORS: Record<string, BehaviorDef> = {
  /** Paseo sin rumbo: unos pasos en la dirección en la que mira (a veces se da la vuelta). */
  stroll: {
    start({ sit, rng }) {
      let dir = rng() < 0.3 ? -sit.body.dir : sit.body.dir;
      const dist = rngRange(rng, 80, 260);
      let target = insideX(sit, sit.body.x + dir * dist);
      if (Math.abs(target - sit.body.x) < 40) {
        dir = -dir;
        target = insideX(sit, sit.body.x + dir * dist);
      }
      return { commands: [{ type: 'move', x: target, speed: 'walk' }], durationMs: 9000 };
    },
    update: untilArrive,
  },

  look_around: {
    start({ sit, cfg }) {
      const commands: DeskCommand[] = [{ type: 'clip', name: 'idle_alt' }];
      if (sit.cursor.onScreen && sit.cursor.dist > 80 && sit.cursor.dist < cfg.cursor.nearPx) {
        commands.unshift({ type: 'face', dir: dirTo(centerOf(sit), sit.cursor.x) });
      }
      return { commands, durationMs: 1600 };
    },
  },

  rest_sit: {
    start({ rng }) {
      return { commands: [{ type: 'stop' }, { type: 'pose', pose: 'sit' }], durationMs: rngRange(rng, 5000, 12000) };
    },
    end: () => [{ type: 'pose', pose: null }],
  },

  /** Carrera de punta a punta dejando la estela del Flujo. */
  zoomies: {
    start({ sit, rng }) {
      const target = sit.body.x < sit.screen.w / 2 ? sit.screen.w - sit.body.size - 30 : 30;
      return {
        commands: [{ type: 'move', x: target, speed: 'run', trail: true }],
        durationMs: 8000,
        data: { laps: rngInt(rng, 1, 2) },
      };
    },
    update(ctx, active) {
      if (!arrived(ctx, active)) return {};
      if (active.data.laps > 1) {
        const { sit } = ctx;
        const target = sit.body.x < sit.screen.w / 2 ? sit.screen.w - sit.body.size - 30 : 30;
        return {
          commands: [{ type: 'move', x: target, speed: 'run', trail: true }],
          phase: active.phase + 1,
          data: { laps: active.data.laps - 1 },
        };
      }
      return { commands: [{ type: 'squash' }], done: true };
    },
  },

  /** Va al borde, saca medio cuerpo fuera, espera y vuelve. */
  peek_edge: {
    start({ sit }) {
      const left = sit.body.x < sit.screen.w / 2;
      const target = left ? -sit.body.size * 0.55 : sit.screen.w - sit.body.size * 0.45;
      return { commands: [{ type: 'move', x: target, speed: 'walk' }], durationMs: 25000, data: { left: left ? 1 : 0 } };
    },
    update(ctx, active) {
      const { sit, rng } = ctx;
      if (active.phase === 0) {
        if (!arrived(ctx, active)) return {};
        return { phase: 1, data: { until: sit.now + rngRange(rng, 2000, 4000) } };
      }
      if (active.phase === 1) {
        if (sit.now < active.data.until) return {};
        const back = active.data.left ? 70 : sit.screen.w - sit.body.size - 70;
        return { commands: [{ type: 'move', x: back, speed: 'walk' }], phase: 2 };
      }
      return { done: arrived(ctx, active) };
    },
    // Si se interrumpe asomada, que no se quede con medio cuerpo fuera
    end: ({ sit }) =>
      sit.body.x < MARGIN || sit.body.x > sit.screen.w - sit.body.size - MARGIN
        ? [{ type: 'move', x: insideX(sit, sit.body.x), speed: 'walk' }]
        : [],
  },

  high_five_offer: {
    start: () => ({ commands: [{ type: 'stop' }, { type: 'highFive' }], durationMs: 6000 }),
  },

  /** Expresa cómo se siente sin que nadie se lo pida. */
  mood_express: {
    start({ sit }) {
      const commands: DeskCommand[] = [];
      if (sit.mood === 'happy') {
        if (sit.dims.affection >= 60) commands.push({ type: 'clip', name: 'love' }, { type: 'particle', emoji: '💕' });
        else commands.push({ type: 'clip', name: 'dance' }, { type: 'particle', emoji: '✨' });
      } else if (sit.mood === 'sad') {
        commands.push({ type: 'clip', name: 'cry' }, { type: 'bark', category: 'lonely' });
      } else if (sit.mood === 'exhausted') {
        commands.push({ type: 'stop' }, { type: 'pose', pose: 'sit' }, { type: 'bark', category: 'sleepy' });
      } else if (sit.mood === 'hungry') {
        commands.push({ type: 'clip', name: 'talk' }, { type: 'bark', category: 'hunger' });
      }
      return { commands, durationMs: 3200 };
    },
    end: () => [{ type: 'pose', pose: null }],
  },

  /** Saluda al cambiar el tramo del día. */
  time_routine: {
    start({ sit }) {
      const slot = sit.timeOfDay ?? 'morning';
      const commands: DeskCommand[] = [{ type: 'bark', category: slot }];
      if (slot === 'morning') commands.push({ type: 'clip', name: 'wake' });
      else if (slot === 'night' || slot === 'late_night') commands.push({ type: 'stop' }, { type: 'pose', pose: 'sit' });
      else commands.push({ type: 'clip', name: 'talk' });
      return { commands, durationMs: 3500 };
    },
    end: () => [{ type: 'pose', pose: null }],
  },

  dance: {
    start: () => ({
      commands: [{ type: 'stop' }, { type: 'clip', name: 'dance' }, { type: 'particle', emoji: '🎵' }],
      durationMs: 2600,
    }),
  },

  /** En juegos y vídeo se aparta a la esquina más lejana al cursor y se queda quieta. */
  retreat_corner: {
    start({ sit }) {
      const target = sit.cursor.x < sit.screen.w / 2 ? sit.screen.w - sit.body.size - 24 : 24;
      return { commands: [{ type: 'move', x: target, speed: 'walk' }], durationMs: 90000 };
    },
    update(ctx, active) {
      if (!quietApps.includes(ctx.sit.appCategory)) return { done: true };
      if (active.phase === 0 && arrived(ctx, active)) return { commands: [{ type: 'pose', pose: 'sit' }], phase: 1 };
      return {};
    },
    end: () => [{ type: 'pose', pose: null }],
  },

  /** Se acerca con sigilo al cursor quieto; si el cursor se mueve, se lleva un susto. */
  cursor_stalk: {
    start({ sit }) {
      const offset = sit.cursor.x > centerOf(sit) ? -55 : 55;
      const target = insideX(sit, sit.cursor.x + offset - sit.body.size / 2);
      return { commands: [{ type: 'move', x: target, speed: 'slow' }], durationMs: 14000 };
    },
    update(ctx, active) {
      const { sit } = ctx;
      if (sit.cursor.kind !== 'still') {
        return { commands: [{ type: 'stop' }, { type: 'clip', name: 'surprised' }], done: true };
      }
      if (!arrived(ctx, active)) return {};
      return {
        commands: [{ type: 'face', dir: dirTo(centerOf(sit), sit.cursor.x) }, { type: 'clip', name: 'idle_alt' }],
        done: true,
      };
    },
  },

  /** Persigue el cursor cuando pasa deprisa; si lo alcanza, lo celebra. */
  cursor_chase: {
    start({ sit }) {
      return {
        commands: [{ type: 'move', x: insideX(sit, sit.cursor.x - sit.body.size / 2), speed: 'run', trail: true }],
        durationMs: 6000,
      };
    },
    update({ sit, cfg }) {
      if (!sit.cursor.onScreen) return { done: true };
      if (sit.cursor.dist < cfg.cursor.catchPx) {
        return {
          commands: [{ type: 'stop' }, { type: 'clip', name: 'happy' }, { type: 'particle', emoji: '✨' }, { type: 'squash' }],
          done: true,
        };
      }
      return { commands: [{ type: 'move', x: insideX(sit, sit.cursor.x - sit.body.size / 2), speed: 'run', trail: true }] };
    },
    end: () => [{ type: 'stop' }],
  },

  /** Acompaña al cursor a una distancia fija mientras se mueve despacio. */
  cursor_follow: {
    start: () => ({ commands: [], durationMs: 20000 }),
    update({ sit, cfg }) {
      if (!sit.cursor.onScreen || sit.cursor.kind === 'fast') return { done: true };
      const gap = sit.cursor.x > centerOf(sit) ? -cfg.cursor.followGapPx : cfg.cursor.followGapPx;
      const target = insideX(sit, sit.cursor.x + gap - sit.body.size / 2);
      if (Math.abs(target - sit.body.x) <= 12) return {};
      return { commands: [{ type: 'move', x: target, speed: 'walk' }] };
    },
    end: () => [{ type: 'stop' }],
  },

  /** Un Pockai miedoso se aparta cuando el cursor se le echa encima. */
  cursor_shy: {
    start({ sit }) {
      const away = sit.cursor.x > centerOf(sit) ? -1 : 1;
      return {
        commands: [{ type: 'clip', name: 'surprised' }, { type: 'move', x: insideX(sit, sit.body.x + away * 200), speed: 'run' }],
        durationMs: 4000,
      };
    },
    update: untilArrive,
  },

  typing_cheer: {
    start: () => ({ commands: [{ type: 'clip', name: 'talk' }, { type: 'bark', category: 'typing' }], durationMs: 2500 }),
  },

  /** Va al borde más cercano, sube por la pared, recorre el techo y se deja caer. */
  climb: {
    start({ sit }) {
      const left = sit.body.x < sit.screen.w / 2;
      const edge = left ? 5 : sit.screen.w - sit.body.size - 5;
      return { commands: [{ type: 'move', x: edge, speed: 'walk' }], durationMs: 70000, data: { left: left ? 1 : 0 } };
    },
    update(ctx, active) {
      if (!arrived(ctx, active)) return {};
      const { sit, rng } = ctx;
      if (active.phase === 0) {
        return {
          commands: [
            { type: 'surface', surface: 'wall', side: active.data.left ? 'left' : 'right' },
            { type: 'move', x: null, y: 30, speed: 'climb' },
          ],
          phase: 1,
        };
      }
      if (active.phase === 1) {
        const along = rngRange(rng, sit.screen.w * 0.25, sit.screen.w * 0.75) - sit.body.size / 2;
        return {
          commands: [{ type: 'surface', surface: 'ceiling' }, { type: 'move', x: insideX(sit, along), y: null, speed: 'climb' }],
          phase: 2,
        };
      }
      return { done: true };
    },
    end: ({ sit }) => (sit.body.surface === 'wall' || sit.body.surface === 'ceiling' ? [{ type: 'drop' }] : []),
  },

  /**
   * Se posa en la barra de la ventana en primer plano. La sigue si se mueve, salta a la nueva si
   * cambia el foco y se deja caer si desaparece o pasa a pantalla completa.
   */
  perch_window: {
    start({ sit, rng, cfg }) {
      const win = sit.foreground as ForegroundWindow;
      const spot = perchSpot(win, sit);
      const stay = rngRange(rng, cfg.perch.stayMs[0], cfg.perch.stayMs[1]);
      return {
        commands: [{ type: 'perch', x: spot.x, y: spot.y, hop: true }],
        durationMs: stay + 5000,
        data: { win: win.id, tx: spot.x, ty: spot.y, until: sit.now + stay, hopAt: sit.now },
      };
    },
    update({ sit, cfg }, active) {
      const win = sit.foreground;
      if (sit.now >= active.data.until) return { done: true };
      // No llegó a posarse (la vista no pudo): no insistir
      if (sit.body.surface !== 'perched' && sit.now - active.startedAt > 2500) return { done: true };
      if (!win) return {};
      if (win.fullscreen) return { done: true };
      if (win.id !== active.data.win) {
        // Otra ventana en primer plano: salta a ella si sirve y no acaba de saltar
        if (!canPerchOn(win, sit) || sit.now - active.data.hopAt < cfg.perch.hopCooldownMs) return {};
        const spot = perchSpot(win, sit);
        return {
          commands: [{ type: 'perch', x: spot.x, y: spot.y, hop: true }],
          data: { win: win.id, tx: spot.x, ty: spot.y, hopAt: sit.now },
        };
      }
      if (!canPerchOn(win, sit)) return { done: true };
      const spot = perchSpot(win, sit);
      if (Math.abs(spot.x - active.data.tx) < 1 && Math.abs(spot.y - active.data.ty) < 1) return {};
      // La misma ventana se ha movido o cambiado de tamaño: va con ella
      return { commands: [{ type: 'perch', x: spot.x, y: spot.y, hop: false }], data: { tx: spot.x, ty: spot.y } };
    },
    end: ({ sit }) => (sit.body.surface === 'perched' ? [{ type: 'drop' }] : []),
  },

  /** Talento del Flujo: un gesto propio de su elemento. */
  flow_talent: {
    start: flowTalent,
    update(ctx, active) {
      if (active.data.dashes === undefined) {
        return { done: ctx.sit.element === 'fire' ? arrived(ctx, active) : false };
      }
      if (!arrived(ctx, active)) return {};
      const { sit } = ctx;
      if (active.data.dashes > 0) {
        const dir = active.phase % 2 === 0 ? -sit.body.dir : sit.body.dir;
        return {
          commands: [{ type: 'move', x: insideX(sit, sit.body.x + dir * 120), speed: 'run', trail: true }],
          phase: active.phase + 1,
          data: { dashes: active.data.dashes - 1 },
        };
      }
      return { commands: [{ type: 'fx', id: 'destello-prisma' }, { type: 'squash' }], done: true };
    },
  },
};
