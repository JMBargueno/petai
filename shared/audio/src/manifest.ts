/**
 * Manifiesto de sonidos (shared/game-data/sounds.json): qué suena, en qué bus y con qué prompt se
 * genera en ElevenLabs. Lo leen el motor (cliente), el script de generación y la validación.
 *
 * El JSON es compacto: cada bus tiene unos `defaults` y un `style` que se añade al final del
 * prompt, y cada sonido solo indica lo que cambia. `normalizeManifest` lo expande y valida.
 */

export const BUSES = ['ui', 'sfx', 'pet', 'ambient', 'music'] as const;
export type Bus = (typeof BUSES)[number];

/** Cómo varía un sonido al reproducirse (ver profiles.ts). */
export const PITCH_PROFILES = ['none', 'subtle', 'creature', 'creature-voice', 'footstep', 'element'] as const;
export type PitchProfile = (typeof PITCH_PROFILES)[number];

/** `elevenlabs`: se genera con la API. `synth`: lo sintetiza el motor en tiempo real (sin fichero). */
export const SOUND_SOURCES = ['elevenlabs', 'synth'] as const;
export type SoundSource = (typeof SOUND_SOURCES)[number];

/** Dónde se reproduce: `scene` = motor web compartido; `android-native` = SoundPool de la UI Compose. */
export const SOUND_PLATFORMS = ['scene', 'desktop', 'android-native'] as const;
export type SoundPlatform = (typeof SOUND_PLATFORMS)[number];

export interface SoundDef {
  id: string;
  bus: Bus;
  source: SoundSource;
  /** Prompt completo para ElevenLabs (ya con el `style` del bus). Vacío en los `synth`. */
  prompt: string;
  /** Segundos (0.5–30, límite de la API de efectos; los temas largos del bus `music`, hasta 180). */
  duration: number;
  loop: boolean;
  /** Tomas que se quedan en el juego y se rotan. */
  variants: number;
  /** Tomas que se generan para elegir. */
  candidates: number;
  /** 0–1: cuánto se ciñe ElevenLabs al prompt. */
  promptInfluence: number;
  gainDb: number;
  cooldownMs: number;
  profile: PitchProfile;
  platforms: SoundPlatform[];
  /** Suena también en modo «audio reducido». */
  essential: boolean;
  /** Nota libre para quien revisa las tomas (no se envía a la API). */
  note?: string;
}

type SoundFields = Omit<SoundDef, 'id' | 'bus' | 'prompt'>;

export interface RawSound extends Partial<SoundFields> {
  id: string;
  prompt?: string;
  /** Sustituye al `style` de su bus (p. ej. los temas lofi del MP3 dentro del bus `music`). */
  style?: string;
}

export interface RawManifest {
  version: number;
  style: Partial<Record<Bus, string>>;
  defaults: Partial<Record<Bus, Partial<SoundFields>>>;
  sounds: RawSound[];
}

export interface SoundManifest {
  version: number;
  sounds: Map<string, SoundDef>;
}

export const ID_RE = /^[a-z0-9_]+(\.[a-z0-9_-]+)+$/;
const MIN_SECONDS = 0.5;
const MAX_SECONDS = 30;
/** Los temas del bus `music` se generan con la API de música de ElevenLabs (spec 42). */
const MAX_MUSIC_SECONDS = 180;

const BASE: SoundFields = {
  source: 'elevenlabs',
  duration: 1,
  loop: false,
  variants: 1,
  candidates: 3,
  promptInfluence: 0.4,
  gainDb: -6,
  cooldownMs: 80,
  profile: 'none',
  platforms: ['scene'],
  essential: false,
};

/** El bus es el primer segmento del id cuando coincide (`ui.tap` → ui); si no, va en `bus`. */
const PREFIX_BUS: Record<string, Bus> = {
  ui: 'ui',
  pet: 'pet',
  amb: 'ambient',
  hab: 'ambient',
  wx: 'ambient',
  music: 'music',
};

export function busForId(id: string): Bus {
  return PREFIX_BUS[id.split('.')[0]] ?? 'sfx';
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Expande y valida el manifiesto. Nunca lanza: devuelve los errores para que la validación los
 * liste todos y el cliente se quede con lo que sí es válido.
 */
export function normalizeManifest(raw: unknown): { manifest: SoundManifest; errors: string[] } {
  const errors: string[] = [];
  const sounds = new Map<string, SoundDef>();
  if (!isObj(raw) || !Array.isArray(raw['sounds'])) {
    return { manifest: { version: 0, sounds }, errors: ['sounds.json: falta la lista `sounds`'] };
  }
  const style = (isObj(raw['style']) ? raw['style'] : {}) as Partial<Record<Bus, string>>;
  const defaults = (isObj(raw['defaults']) ? raw['defaults'] : {}) as Partial<Record<Bus, Partial<SoundFields>>>;
  for (const k of Object.keys(defaults)) if (!BUSES.includes(k as Bus)) errors.push(`defaults.${k}: bus desconocido`);

  for (const [i, entry] of (raw['sounds'] as unknown[]).entries()) {
    if (!isObj(entry) || typeof entry['id'] !== 'string') {
      errors.push(`sounds[${i}]: falta el id`);
      continue;
    }
    const e = entry as unknown as RawSound & { bus?: unknown };
    const at = `sound ${e.id}`;
    if (!ID_RE.test(e.id)) errors.push(`${at}: id inválido (minúsculas, con puntos: zona.nombre)`);
    if (sounds.has(e.id)) errors.push(`${at}: id duplicado`);
    const bus = (e.bus ?? busForId(e.id)) as Bus;
    if (!BUSES.includes(bus)) {
      errors.push(`${at}: bus desconocido "${String(bus)}"`);
      continue;
    }
    const { style: ownStyle, ...fields } = e;
    const def: SoundDef = { ...BASE, ...defaults[bus], ...fields, id: e.id, bus, prompt: '' } as SoundDef;
    if (ownStyle !== undefined && typeof ownStyle !== 'string') errors.push(`${at}: style debe ser un texto`);
    const extraStyle = typeof ownStyle === 'string' ? ownStyle : style[bus];
    if (def.source === 'elevenlabs') {
      const prompt = (e.prompt ?? '').trim();
      if (!prompt) errors.push(`${at}: falta el prompt`);
      def.prompt = extraStyle ? `${prompt}, ${extraStyle}` : prompt;
      if (def.prompt.length > 450) errors.push(`${at}: prompt demasiado largo (${def.prompt.length} > 450)`);
    } else if (!SOUND_SOURCES.includes(def.source)) {
      errors.push(`${at}: source desconocido "${def.source}"`);
    }
    const maxSeconds = bus === 'music' ? MAX_MUSIC_SECONDS : MAX_SECONDS;
    if (!(def.duration >= MIN_SECONDS && def.duration <= maxSeconds)) errors.push(`${at}: duration debe estar entre ${MIN_SECONDS} y ${maxSeconds} s`);
    if (!Number.isInteger(def.variants) || def.variants < 1 || def.variants > 8) errors.push(`${at}: variants debe ser 1–8`);
    if (!Number.isInteger(def.candidates) || def.candidates < def.variants || def.candidates > 10) errors.push(`${at}: candidates debe ser ≥ variants y ≤ 10`);
    if (!(def.promptInfluence >= 0 && def.promptInfluence <= 1)) errors.push(`${at}: promptInfluence debe ser 0–1`);
    if (!(def.gainDb <= 6 && def.gainDb >= -40)) errors.push(`${at}: gainDb fuera de rango (−40…+6)`);
    if (!(def.cooldownMs >= 0)) errors.push(`${at}: cooldownMs inválido`);
    if (!PITCH_PROFILES.includes(def.profile)) errors.push(`${at}: profile desconocido "${def.profile}"`);
    if (!Array.isArray(def.platforms) || def.platforms.length === 0 || def.platforms.some((p) => !SOUND_PLATFORMS.includes(p))) {
      errors.push(`${at}: platforms inválido`);
    }
    sounds.set(def.id, def);
  }
  return { manifest: { version: typeof raw['version'] === 'number' ? raw['version'] : 0, sounds }, errors };
}

/** Ruta relativa del fichero de una toma dentro de shared/assets/audio. */
export function assetPath(def: Pick<SoundDef, 'id' | 'bus'>, variant: number, ext = 'm4a'): string {
  return `${def.bus}/${def.id}_${variant + 1}.${ext}`;
}

const ASSET_RE = /(?:^|\/)(ui|sfx|pet|ambient|music)\/([a-z0-9_.-]+)_(\d+)\.(m4a|mp3|ogg)$/;

/**
 * Convierte un listado de ficheros (p. ej. `import.meta.glob(..., { query: '?url', eager: true })`)
 * en id → URLs de sus tomas, ordenadas por número. Si hay .m4a y .ogg de la misma toma, gana .m4a.
 */
export function sourcesFromFiles(files: Record<string, string>): Map<string, string[]> {
  const byId = new Map<string, { n: number; ext: string; url: string }[]>();
  for (const [path, url] of Object.entries(files)) {
    const m = ASSET_RE.exec(path.replace(/\\/g, '/'));
    if (!m) continue;
    const list = byId.get(m[2]) ?? [];
    const n = Number(m[3]);
    const prev = list.find((x) => x.n === n);
    if (prev) {
      if (prev.ext !== 'm4a' && m[4] === 'm4a') Object.assign(prev, { ext: m[4], url });
    } else {
      list.push({ n, ext: m[4], url });
    }
    byId.set(m[2], list);
  }
  const out = new Map<string, string[]>();
  for (const [id, list] of byId) out.set(id, list.sort((a, b) => a.n - b.n).map((x) => x.url));
  return out;
}
