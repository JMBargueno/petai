/**
 * Ajustes de sonido del usuario. Se guardan en local en cada dispositivo. Android e iOS los pasan
 * a la escena y a los minijuegos con el mensaje `setAudio`, y todo pasa por `parseAudioSettings`.
 */
import { BUSES, type Bus } from './manifest';

export interface AudioSettings {
  /** Interruptor general. */
  enabled: boolean;
  /** Volumen general, 0–1. */
  master: number;
  /** Volumen por bus, 0–1. */
  buses: Record<Bus, number>;
  /** Silencio total cuando la app no tiene el foco (también la mascota del escritorio). */
  muteWhenUnfocused: boolean;
  /** Audio reducido: solo interfaz y avisos importantes. */
  reduced: boolean;
  /** Solo escritorio: la mascota que vive en el escritorio hace sonidos. */
  petOnDesktop: boolean;
  /** Solo escritorio: sonidos de ambiente (clima, sala) también fuera del panel. */
  ambientOnDesktop: boolean;
}

export type AudioPlatform = 'desktop' | 'android' | 'ios' | 'web';

const BUS_DEFAULTS: Record<Bus, number> = { ui: 0.7, sfx: 0.8, pet: 0.8, ambient: 0.5, music: 0.6 };

export function defaultAudioSettings(platform: AudioPlatform = 'web'): AudioSettings {
  const desktop = platform === 'desktop';
  return {
    enabled: true,
    master: desktop ? 0.6 : 0.8,
    buses: { ...BUS_DEFAULTS, pet: desktop ? 0.5 : BUS_DEFAULTS.pet },
    muteWhenUnfocused: false,
    reduced: false,
    petOnDesktop: true,
    ambientOnDesktop: false,
  };
}

const unit = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Valida y completa unos ajustes que vienen de fuera (almacenamiento, puente nativo). */
export function parseAudioSettings(raw: unknown, platform: AudioPlatform = 'web'): AudioSettings {
  const d = defaultAudioSettings(platform);
  let src: unknown = raw;
  if (typeof raw === 'string') {
    try {
      src = JSON.parse(raw);
    } catch {
      return d;
    }
  }
  if (!src || typeof src !== 'object' || Array.isArray(src)) return d;
  const r = src as Record<string, unknown>;
  const rb = (r.buses && typeof r.buses === 'object' ? r.buses : {}) as Record<string, unknown>;
  const buses = {} as Record<Bus, number>;
  for (const b of BUSES) buses[b] = unit(rb[b], d.buses[b]);
  return {
    enabled: bool(r.enabled, d.enabled),
    master: unit(r.master, d.master),
    buses,
    muteWhenUnfocused: bool(r.muteWhenUnfocused, d.muteWhenUnfocused),
    reduced: bool(r.reduced, d.reduced),
    petOnDesktop: bool(r.petOnDesktop, d.petOnDesktop),
    ambientOnDesktop: bool(r.ambientOnDesktop, d.ambientOnDesktop),
  };
}

/**
 * Dónde se está escuchando: `app` = el usuario está usando la app (panel abierto y con foco, o la
 * pantalla del móvil); `desktop` = la mascota vive suelta en el escritorio mientras el usuario hace
 * otra cosa. El escritorio es una sola ventana, así que lo decide el anfitrión (panel y foco).
 */
export type AudioSurface = 'app' | 'desktop';

export interface AudioEnv {
  surface: AudioSurface;
  /** La ventana tiene el foco. */
  focused: boolean;
  /** La página se ve (no está en segundo plano ni minimizada). */
  visible: boolean;
}

/** Volumen final (0–1) de un bus en este momento, con todo aplicado. */
export function effectiveBusGain(s: AudioSettings, bus: Bus, env: AudioEnv): number {
  if (!s.enabled || !env.visible) return 0;
  if (s.muteWhenUnfocused && !env.focused) return 0;
  if (env.surface === 'desktop') {
    // Fuera de la app no hay interfaz que oír; la mascota y sus efectos, si se permite.
    if (bus === 'ui' || bus === 'music') return 0;
    if ((bus === 'pet' || bus === 'sfx') && !s.petOnDesktop) return 0;
    if (bus === 'ambient' && !s.ambientOnDesktop) return 0;
  }
  return s.master * s.buses[bus];
}
