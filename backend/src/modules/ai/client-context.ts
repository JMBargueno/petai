import { getDesktopSkill, skillStateOf } from './desktop-skills';

/**
 * Contexto en vivo que envía la app de escritorio con cada mensaje (funciones puras).
 *
 * Privacidad: nunca se aceptan títulos de ventana ni texto libre, solo valores de listas
 * cerradas y números acotados. Además el servidor vuelve a comprobar la habilidad que
 * protege cada dato (no se fía del cliente): sin `context_awareness` activa se descarta la
 * categoría de app, y sin `window_perching` el dato de la ventana.
 */

export const APP_CATEGORIES = ['coding', 'music', 'video', 'gaming', 'reading', 'generic'] as const;
export type AppCategory = (typeof APP_CATEGORIES)[number];
const POMODORO_PHASES = ['idle', 'work', 'break'] as const;
const PET_POSES = ['walking', 'climbing', 'perched', 'sleeping'] as const;

export interface ClientContext {
  appCategory?: AppCategory;
  pomodoro?: { phase: (typeof POMODORO_PHASES)[number]; minutesLeft?: number; sessionsToday?: number };
  pose?: (typeof PET_POSES)[number];
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined;

const intIn = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined;

function skillActive(pet: any, id: string): boolean {
  const skill = getDesktopSkill(id);
  return !!skill && skillStateOf(skill, pet?.desktopSkills as any, pet ?? {}).state === 'active';
}

/** Valida el contexto del cliente. Devuelve null si no hay nada aprovechable. */
export function sanitizeClientContext(raw: unknown, pet: any): ClientContext | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, any>;
  const out: ClientContext = {};

  const cat = oneOf(APP_CATEGORIES, r.appCategory);
  if (cat && skillActive(pet, 'context_awareness')) out.appCategory = cat;

  if (r.pomodoro && typeof r.pomodoro === 'object' && skillActive(pet, 'pomodoro_companion')) {
    const phase = oneOf(POMODORO_PHASES, r.pomodoro.phase);
    if (phase) {
      out.pomodoro = { phase };
      const left = intIn(r.pomodoro.minutesLeft, 0, 180);
      if (left !== undefined && phase !== 'idle') out.pomodoro.minutesLeft = left;
      const done = intIn(r.pomodoro.sessionsToday, 0, 50);
      if (done !== undefined) out.pomodoro.sessionsToday = done;
    }
  }

  const pose = oneOf(PET_POSES, r.pose);
  if (pose && (pose !== 'perched' || skillActive(pet, 'window_perching'))) out.pose = pose;

  return Object.keys(out).length ? out : null;
}

const APP_LABEL: Record<AppCategory, string> = {
  coding: 'programando',
  music: 'escuchando música',
  video: 'viendo un vídeo',
  gaming: 'jugando a un videojuego',
  reading: 'leyendo o navegando',
  generic: 'con otra aplicación',
};

const POSE_LABEL: Record<(typeof PET_POSES)[number], string> = {
  walking: 'paseando por su escritorio',
  climbing: 'trepando por un borde de la pantalla',
  perched: 'posado sobre la barra de la ventana que está usando',
  sleeping: 'durmiendo en su escritorio',
};

/**
 * Bloque «dónde estamos y qué pasa». La ubicación sale del servidor (`inHabitat`);
 * el resto, del contexto ya validado.
 */
export function buildLocationBlock(pet: { inHabitat?: boolean | null }, ctx: ClientContext | null): string {
  const lines: string[] = [];
  if (pet.inHabitat) {
    lines.push('- Estás en tu casita (hábitat), descansando; no estás en el escritorio de tu entrenador.');
  } else if (ctx?.pose) {
    lines.push(`- Estás en la pantalla de tu entrenador, ${POSE_LABEL[ctx.pose]}.`);
  } else if (ctx) {
    lines.push('- Estás en la pantalla del ordenador de tu entrenador.');
  }
  if (ctx?.appCategory && ctx.appCategory !== 'generic') {
    lines.push(`- Ahora mismo tu entrenador está ${APP_LABEL[ctx.appCategory]}.`);
  }
  if (ctx?.pomodoro) {
    const p = ctx.pomodoro;
    if (p.phase === 'work') {
      lines.push(`- Está en una sesión de foco Pomodoro${p.minutesLeft !== undefined ? ` (quedan ${p.minutesLeft} min)` : ''}: no le distraigas, anímale en una frase.`);
    } else if (p.phase === 'break') {
      lines.push(`- Está en el descanso del Pomodoro${p.minutesLeft !== undefined ? ` (quedan ${p.minutesLeft} min)` : ''}: anímale a estirarse o beber agua.`);
    }
    if (p.sessionsToday) lines.push(`- Hoy lleva ${p.sessionsToday} sesiones de foco completadas.`);
  }
  if (!lines.length) return '';
  return `Dónde estás y qué pasa ahora:\n${lines.join('\n')}`;
}
