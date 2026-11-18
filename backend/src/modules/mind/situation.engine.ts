/**
 * Situation Engine (spec 37 §4.1 y §4.2) — funciones puras.
 *
 * La **pizarra de situación** reúne, una vez por interacción, lo que la criatura percibe: con
 * quién está, qué siente por él, cómo se encuentra, cuánto lleva sin ver a su entrenador y qué ha
 * hecho hace poco. Todos los motores leen de ella en vez de averiguar cada uno lo suyo.
 *
 * Tres capas, cada una con su trabajo: **percibir** (esta pizarra) → **decidir** (una reacción o
 * una actividad) → **actuar** (animación, línea, efectos). Si una decisión consulta la base de
 * datos, o una acción vuelve a decidir, es un error de diseño.
 *
 * Regla de la pizarra: contiene solo lo que la criatura ha vivido o recuerda **y puede usar ante
 * quien tiene delante**. Ante un visitante u otro Pockai no entra nada de lo aprendido de su
 * entrenador ni de la relación con él (privacidad entre dueños, spec 37 §3).
 */
import type { Behavior } from './behavior.engine';
import type { MemoryRow } from './memory.engine';
import { layerOf } from './memory.engine';
import type { PersonalityConfig } from './mind.types';
import type { Stage } from './social.engine';

export type Audience = 'owner' | 'visitor' | 'pockai' | 'alone';

/**
 * Modo superior: lo que manda sobre cualquier reacción. Las salidas comunes (se duerme, enferma)
 * se resuelven aquí una vez, y no en cada acción.
 */
export type Mode = 'asleep' | 'sick' | 'alone' | 'with_owner' | 'hosting' | 'visiting';

export interface Needs {
  hunger: number;
  energy: number;
  hygiene: number;
  happiness: number;
  health: number;
  sleeping: boolean;
  sick: boolean;
}

export interface SituationSubject {
  /** `owner`, `user:<id>` o `pet:<id>`. */
  key: string;
  /** -1..1: cómo le cae. */
  valence: number;
  /** Etapa de la relación (el entrenador no va por etapas). */
  stage: Stage | null;
}

export interface UntoldEpisode {
  id: string;
  content: string;
  kind: string;
  subject: string | null;
}

export interface Situation {
  mode: Mode;
  audience: Audience;
  subject: SituationSubject | null;
  needs: Needs;
  /** Minutos desde la última interacción de su entrenador (0 si no se sabe). */
  awayMinutes: number;
  /** Últimas reacciones elegidas, la más reciente al final. */
  recent: Behavior[];
  /** Episodios propios que aún no ha contado y que puede contar a quien tiene delante. */
  untold: UntoldEpisode[];
  /** Deseos activos (spec 37 §4.5). */
  wishes: string[];
  /** Trucos que sabe (spec 37 §4.6). */
  tricks: string[];
}

export interface SituationInput {
  audience: Audience;
  /** Fila emocional del interlocutor, si la hay. */
  subject?: SituationSubject | null;
  pet: {
    hunger?: number | null;
    energy?: number | null;
    hygiene?: number | null;
    happiness?: number | null;
    health?: number | null;
    sleeping?: boolean | null;
    sick?: boolean | null;
  };
  now: Date;
  /** Última vez que su entrenador interactuó con ella. */
  lastOwnerInteractionAt?: Date | null;
  /** Hay una visita activa en su hábitat. */
  hosting?: boolean;
  /** Su entrenador la ha llevado de visita. */
  visiting?: boolean;
  recent?: readonly unknown[];
  /** Recuerdos candidatos a «aún no contado» (se filtran aquí según la audiencia). */
  memories?: readonly MemoryRow[];
  wishes?: readonly string[];
  tricks?: readonly string[];
}

const vital = (v: number | null | undefined, fallback = 60) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fallback;

export function resolveMode(needs: Pick<Needs, 'sleeping' | 'sick'>, audience: Audience, flags: { hosting?: boolean; visiting?: boolean } = {}): Mode {
  if (needs.sleeping) return 'asleep';
  if (needs.sick) return 'sick';
  if (flags.visiting) return 'visiting';
  if (flags.hosting) return 'hosting';
  return audience === 'owner' ? 'with_owner' : 'alone';
}

/**
 * ¿Es un episodio que se puede contar fuera de casa? Lo nacido del chat con el entrenador es
 * privado: las plantillas (`ep:<intención>`), lo que extrae el LLM (sujeto `owner`) y los
 * resúmenes. Lo vivido por su cuenta (encuentros, aventuras, vida autónoma), no.
 */
export function isPrivateEpisode(m: Pick<MemoryRow, 'kind' | 'key' | 'subject'>): boolean {
  return m.kind === 'summary' || m.subject === 'owner' || !!m.key?.startsWith('ep:');
}

/** Episodios aún no contados que la criatura puede usar ante esta audiencia. */
export function untoldFor(memories: readonly MemoryRow[], audience: Audience, subjectKey: string | null): UntoldEpisode[] {
  const out: UntoldEpisode[] = [];
  for (const m of memories) {
    // Solo episodios: ni lo aprendido del entrenador (semántica) ni las relaciones (emocional)
    if (layerOf(m) !== 'episodic' || m.kind === 'summary') continue;
    // «Aún no contado» = nunca ha entrado en una conversación
    if (m.lastRecalledAt) continue;
    if (audience === 'owner') {
      // A su entrenador le cuenta lo que vivió sin él; lo que hablaron juntos ya lo sabe
      if (m.subject === 'owner' || m.key?.startsWith('ep:')) continue;
    } else if (audience === 'visitor') {
      // A un visitante, solo lo que vivió con él
      if (!subjectKey || m.subject !== subjectKey) continue;
    } else if (audience === 'pockai') {
      // A otro Pockai, lo vivido con él y lo propio que no sea privado
      if (m.subject !== subjectKey && isPrivateEpisode(m)) continue;
    } else {
      continue;
    }
    out.push({ id: m.id, content: m.content, kind: m.kind, subject: m.subject ?? null });
  }
  return out;
}

/**
 * Monta la pizarra. Función pura: la misma entrada da la misma `Situation`.
 * `validBehaviors` filtra el historial de reacciones guardado (puede traer ids de otra versión).
 */
export function buildSituation(input: SituationInput, cfg: PersonalityConfig, isBehavior: (v: unknown) => v is Behavior): Situation {
  const needs: Needs = {
    hunger: vital(input.pet.hunger),
    energy: vital(input.pet.energy),
    hygiene: vital(input.pet.hygiene),
    happiness: vital(input.pet.happiness),
    health: vital(input.pet.health, 100),
    sleeping: !!input.pet.sleeping,
    sick: !!input.pet.sick,
  };
  // El sujeto solo vale si es quien tiene delante: ante un visitante no se cuela la fila del entrenador
  const subject =
    input.subject && (input.audience === 'owner' ? input.subject.key === 'owner' : input.subject.key !== 'owner') ? input.subject : null;
  const window = cfg.behavior.antiRepeat?.window ?? 4;
  const recent = (input.recent ?? []).filter(isBehavior).slice(-window);
  const last = input.lastOwnerInteractionAt;
  const awayMinutes = last ? Math.max(0, Math.floor((input.now.getTime() - last.getTime()) / 60_000)) : 0;
  return {
    mode: resolveMode(needs, input.audience, { hosting: input.hosting, visiting: input.visiting }),
    audience: input.audience,
    subject,
    needs,
    awayMinutes,
    recent,
    untold: input.audience === 'alone' ? [] : untoldFor(input.memories ?? [], input.audience, subject?.key ?? null),
    wishes: [...(input.wishes ?? [])],
    tricks: [...(input.tricks ?? [])],
  };
}
