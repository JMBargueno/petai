/**
 * Protocolo entre la app (anfitrión) y un minijuego. Mensajes JSON con `type`. El mismo contrato
 * se usa en escritorio (callback directo), Android (`AndroidBridge`) e iOS
 * (`webkit.messageHandlers.pockai`). Ver docs/specs/spec-39-minijuegos-compartidos.md §2.2.
 *
 * Versionado: si cambias un mensaje de forma incompatible, sube `MINIGAME_PROTOCOL_VERSION`. Es
 * independiente del protocolo de la escena.
 *  - v2: `finished` lleva el registro empaquetado (`log`) para que el servidor repita la partida;
 *    `start` admite `variant`; nuevos `pause`/`resume` y evento `paused`.
 *  - v3: `start` admite `pet`, la mascota del jugador, que sale dentro del juego. Es opcional: un
 *    anfitrión que no la mande sigue jugando, con la especie por defecto.
 *  - `setAudio` (spec 40): ajustes de sonido de la app. Mensaje nuevo y opcional, como en la escena:
 *    no sube la versión. El embed los valida con `parseAudioSettings`.
 */
import type { PackedEntry } from './core/log';
import type { GameVariant } from './core/types';

export const MINIGAME_PROTOCOL_VERSION = 3;

export type PetStage = 'baby' | 'juvenile' | 'adult' | 'final';

/**
 * La mascota que sale en el juego. Solo es aspecto: no cambia las reglas ni la puntuación (la lógica
 * no la recibe), así que el servidor repite la partida sin ella.
 */
export interface MinigamePet {
  species: string;
  stage?: PetStage;
  palette?: { primary: string; secondary: string; accent?: string };
  /** Id del patrón de piel (`shared/assets/patterns/<id>.png`); `plain` o ausente, sin patrón. */
  pattern?: string | null;
  visualSeed?: number;
}

export interface StartMessage {
  type: 'start';
  gameId: string;
  seed: number;
  durationSeconds: number;
  variant?: GameVariant;
  reducedMotion?: boolean;
  pet?: MinigamePet;
}

export type HostMessage =
  | StartMessage
  | { type: 'dispose' }
  | { type: 'pause' }
  | { type: 'resume' }
  /** Ajustes de sonido tal como los manda la app; el embed los valida antes de usarlos. */
  | { type: 'setAudio'; settings: Record<string, unknown> };

export type MinigameEvent =
  | { type: 'ready'; protocol: number }
  | { type: 'score'; score: number }
  | { type: 'paused'; paused: boolean }
  | { type: 'finished'; gameId: string; score: number; ticks: number; log: PackedEntry[] }
  | { type: 'error'; message: string };

const ID = /^[a-z][a-z0-9_]{0,63}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const STAGES: readonly PetStage[] = ['baby', 'juvenile', 'adult', 'final'];

/** Valida la mascota de `start`. Lo que no vale se descarta campo a campo; sin especie, no hay mascota. */
export function parsePet(raw: unknown): MinigamePet | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.species !== 'string' || !ID.test(r.species)) return undefined;
  const pet: MinigamePet = { species: r.species };
  if (STAGES.includes(r.stage as PetStage)) pet.stage = r.stage as PetStage;
  const p = r.palette as Record<string, unknown> | null | undefined;
  if (p && typeof p === 'object' && typeof p.primary === 'string' && HEX.test(p.primary) && typeof p.secondary === 'string' && HEX.test(p.secondary)) {
    pet.palette = { primary: p.primary, secondary: p.secondary };
    if (typeof p.accent === 'string' && HEX.test(p.accent)) pet.palette.accent = p.accent;
  }
  if (typeof r.pattern === 'string' && ID.test(r.pattern)) pet.pattern = r.pattern;
  if (Number.isInteger(r.visualSeed)) pet.visualSeed = r.visualSeed as number;
  return pet;
}

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
  if (m.type === 'setAudio') {
    return m.settings && typeof m.settings === 'object' && !Array.isArray(m.settings) ? { type: 'setAudio', settings: m.settings as Record<string, unknown> } : null;
  }
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
    pet: parsePet(m.pet),
  };
}
