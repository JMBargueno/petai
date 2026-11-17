/**
 * Protocolo entre la app nativa (anfitrión) y la escena. Son mensajes JSON con `type`.
 * El mismo contrato se usa en escritorio (llamada directa), Android (`AndroidBridge`) e iOS
 * (`webkit.messageHandlers.pockai`). Ver docs/ART_PIPELINE.md §9.
 *
 * Versionado: si cambias un mensaje de forma incompatible, sube `PROTOCOL_VERSION`. La escena lo
 * anuncia en `ready` para que la app nativa compruebe que habla el mismo idioma.
 */
export const PROTOCOL_VERSION = 1;

export type Stage = 'egg' | 'baby' | 'juvenile' | 'adult' | 'final';
export type ThemeMode = 'light' | 'dark';

export interface PetState {
  /** Id de especie (species.json); desconocida → `ignisaur`. `egg` para el huevo. */
  species: string;
  stage: Stage;
  palette: { primary: string; secondary: string };
  pattern?: string | null;
  visualSeed: number;
  shiny?: boolean;
}

/** Anfitrión → escena. */
export type HostMessage =
  | { type: 'setPet'; pet: PetState }
  | { type: 'playClip'; clip: string; once?: boolean }
  | { type: 'setTheme'; mode: ThemeMode }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'setFacing'; facing: 1 | -1 };

/** Escena → anfitrión. */
export type SceneEvent =
  | { type: 'ready'; protocol: number }
  | { type: 'petLoaded'; species: string; stage: Stage }
  | { type: 'petTapped' }
  | { type: 'clipEnded'; clip: string }
  | { type: 'error'; message: string };

const HOST_TYPES = new Set<HostMessage['type']>(['setPet', 'playClip', 'setTheme', 'setPaused', 'setFacing']);

/** Valida y normaliza un mensaje del anfitrión (llega como JSON sin tipar desde el WebView). */
export function parseHostMessage(raw: unknown): HostMessage | null {
  let msg: unknown = raw;
  if (typeof raw === 'string') {
    try {
      msg = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as Record<string, unknown>;
  if (typeof m.type !== 'string' || !HOST_TYPES.has(m.type as HostMessage['type'])) return null;
  switch (m.type) {
    case 'setPet': {
      const p = m.pet as Record<string, unknown> | undefined;
      const pal = p?.palette as Record<string, unknown> | undefined;
      if (!p || typeof p.species !== 'string' || typeof pal?.primary !== 'string' || typeof pal?.secondary !== 'string') return null;
      return {
        type: 'setPet',
        pet: {
          species: p.species,
          stage: (['egg', 'baby', 'juvenile', 'adult', 'final'] as const).includes(p.stage as Stage) ? (p.stage as Stage) : 'adult',
          palette: { primary: pal.primary, secondary: pal.secondary },
          pattern: typeof p.pattern === 'string' ? p.pattern : null,
          visualSeed: Number.isFinite(p.visualSeed) ? (p.visualSeed as number) : 1337,
          shiny: p.shiny === true,
        },
      };
    }
    case 'playClip':
      return typeof m.clip === 'string' ? { type: 'playClip', clip: m.clip, once: m.once === true } : null;
    case 'setTheme':
      return m.mode === 'dark' || m.mode === 'light' ? { type: 'setTheme', mode: m.mode } : null;
    case 'setPaused':
      return typeof m.paused === 'boolean' ? { type: 'setPaused', paused: m.paused } : null;
    case 'setFacing':
      return m.facing === 1 || m.facing === -1 ? { type: 'setFacing', facing: m.facing } : null;
  }
  return null;
}
