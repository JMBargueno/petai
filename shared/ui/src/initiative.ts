/**
 * Iniciativa del Pockai (spec 41, fase B), en el escritorio y en el móvil.
 *
 * La app no decide qué dice el Pockai por su cuenta: se lo pregunta al servidor, que
 * ejecuta la librería compartida (`@pockai/mind`) con lo que sabe de la mascota y de su
 * entrenador, y aquí solo se muestra el resultado. Este módulo es el reloj de esas preguntas:
 * cuándo volver a preguntar lo dice el propio servidor (`retryInMs`).
 */

// Niveles de charla y sus textos: viven en `talk.ts`.
import { TALK_LEVELS, LEVEL_LABEL, levelHint, talkFactorLabel } from './talk';
import type { TalkLevel, InitiativeReply, InitiativeSettings } from './talk';
export { TALK_LEVELS, LEVEL_LABEL, levelHint, talkFactorLabel };
export type { TalkLevel, InitiativeReply, InitiativeSettings };

export interface InitiativeDeps {
  /** Pregunta al servidor. Debe rechazar (o devolver `null`) si no hay mascota o no hay red. */
  ask(back: boolean): Promise<InitiativeReply | null>;
  /** Muestra lo que dice. */
  say(text: string, kind: string): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface InitiativeOptions {
  /** Espera antes de la primera pregunta: recién abierta la app no se le pone a hablar. */
  firstDelayMs: number;
  /** Límites de la espera que propone el servidor. */
  minMs: number;
  maxMs: number;
  /** Espera tras un fallo de red. */
  errorMs: number;
}

export const DEFAULT_INITIATIVE: InitiativeOptions = { firstDelayMs: 45_000, minMs: 60_000, maxMs: 30 * 60_000, errorMs: 5 * 60_000 };

export interface InitiativeLoop {
  start(): void;
  stop(): void;
  /**
   * Su entrenador acaba de volver: pregunta ya, avisando de la vuelta. Si el servidor no está
   * disponible se llama a `fallback` (la bienvenida local de siempre).
   */
  ownerBack(fallback?: () => void): Promise<void>;
}

export function createInitiativeLoop(deps: InitiativeDeps, options: Partial<InitiativeOptions> = {}): InitiativeLoop {
  const opts = { ...DEFAULT_INITIATIVE, ...options };
  let timer: unknown = null;
  let running = false;
  let asking = false;

  const clamp = (ms: unknown) => Math.min(opts.maxMs, Math.max(opts.minMs, typeof ms === 'number' && Number.isFinite(ms) ? ms : opts.errorMs));
  const schedule = (ms: number) => {
    if (timer !== null) deps.clearTimer(timer);
    timer = running ? deps.setTimer(() => void tick(false), ms) : null;
  };

  /** Una pregunta. Devuelve `false` si el servidor no contestó. */
  async function tick(back: boolean): Promise<boolean> {
    // Una sola pregunta a la vez: si llega la vuelta mientras se pregunta, esa respuesta ya vale
    if (asking) return true;
    asking = true;
    try {
      const reply = await deps.ask(back);
      if (!reply) {
        schedule(opts.errorMs);
        return false;
      }
      if (reply.phrase?.text) deps.say(reply.phrase.text, reply.phrase.kind);
      schedule(clamp(reply.retryInMs));
      return true;
    } catch {
      schedule(opts.errorMs);
      return false;
    } finally {
      asking = false;
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      schedule(opts.firstDelayMs);
    },
    stop() {
      running = false;
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
    },
    async ownerBack(fallback) {
      if (!running) return fallback?.();
      const ok = await tick(true);
      if (!ok) fallback?.();
    },
  };
}
