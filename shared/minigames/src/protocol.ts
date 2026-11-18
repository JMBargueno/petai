/**
 * Protocolo entre la app (anfitrión) y un minijuego. Mensajes JSON con `type`. El mismo contrato
 * se usa en escritorio (callback directo), Android (`AndroidBridge`) e iOS
 * (`webkit.messageHandlers.pockai`). Ver docs/specs/spec-39-minijuegos-compartidos.md §2.2.
 *
 * Versionado: si cambias un mensaje de forma incompatible, sube `MINIGAME_PROTOCOL_VERSION`. Es
 * independiente del protocolo de la escena.
 *  - v2: `finished` lleva el registro empaquetado (`log`) para que el servidor repita la partida;
 *    `start` admite `variant`; nuevos `pause`/`resume` y evento `paused`.
 */
import type { PackedEntry } from './core/log';
import type { GameVariant } from './core/types';

export const MINIGAME_PROTOCOL_VERSION = 2;

export interface StartMessage {
  type: 'start';
  gameId: string;
  seed: number;
  durationSeconds: number;
  variant?: GameVariant;
  reducedMotion?: boolean;
}

export type HostMessage = StartMessage | { type: 'dispose' } | { type: 'pause' } | { type: 'resume' };

export type MinigameEvent =
  | { type: 'ready'; protocol: number }
  | { type: 'score'; score: number }
  | { type: 'paused'; paused: boolean }
  | { type: 'finished'; gameId: string; score: number; ticks: number; log: PackedEntry[] }
  | { type: 'error'; message: string };

/** Valida un mensaje del anfitrión sin confiar en él. */
export function parseHostMessage(raw: unknown): HostMessage | null {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  if (m.type === 'dispose' || m.type === 'pause' || m.type === 'resume') return { type: m.type };
  if (m.type !== 'start') return null;
  if (typeof m.gameId !== 'string' || !Number.isInteger(m.seed)) return null;
  if (typeof m.durationSeconds !== 'number' || !(m.durationSeconds > 0) || m.durationSeconds > 600) return null;
  return {
    type: 'start',
    gameId: m.gameId,
    seed: m.seed as number,
    durationSeconds: m.durationSeconds,
    variant: m.variant === 'easy' ? 'easy' : 'standard',
    reducedMotion: m.reducedMotion === true,
  };
}
