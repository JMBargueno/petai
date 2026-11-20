/**
 * Protocolo entre la app nativa (anfitrión) y la escena. Son mensajes JSON con `type`.
 * El mismo contrato se usa en escritorio (llamada directa), Android (`AndroidBridge`) e iOS
 * (`webkit.messageHandlers.pockai`). Ver docs/ART_PIPELINE.md §9.
 *
 * Versionado: si cambias un mensaje de forma incompatible, sube `PROTOCOL_VERSION`. La escena lo
 * anuncia en `ready` para que la app nativa compruebe que habla el mismo idioma.
 */
export const PROTOCOL_VERSION = 4;
// v3: efectos compartidos (`playEffect`, `petAction` → `effectEnded`), ver src/effects.
// v4: escena de la aventura diaria (`setStory` → `storyBeat`), ver src/story.

import { parseAudioSettings, type AudioSettings } from '@pockai/audio/settings';
import { parseEquipped, type EquippedAccessories } from './bake/accessories';
import { parseClock } from './ambience/sunClock';
import { parseRoomMind, type RoomMind } from './room/petWander';

export type { RoomMind };

export type Stage = 'egg' | 'baby' | 'juvenile' | 'adult' | 'final';
export type ThemeMode = 'light' | 'dark';
/** Paleta de un tema para lo que se dibuja: cada clave es un color o una lista de colores en hex. */
export type ThemePalette = Record<string, string | readonly string[]>;

export interface PetState {
  /** Id de especie (species.json); desconocida → `ignisaur`. `egg` para el huevo. */
  species: string;
  stage: Stage;
  palette: { primary: string; secondary: string; accent?: string };
  pattern?: string | null;
  visualSeed: number;
  shiny?: boolean;
  /** Prendas equipadas por ranura (ids de accessories.json). Opcional: sin ellas no se pinta ninguna. */
  accessories?: EquippedAccessories;
}

export type Interaction = 'sleep' | 'eat' | 'play' | 'bathe' | 'sit' | 'listen';

/** Mueble del catálogo (solo lo que la escena necesita para dibujarlo y colocarlo). */
export interface RoomFurniture {
  id: string;
  name?: string;
  footprint?: [number, number];
  mount?: 'floor' | 'wall';
  interaction?: Interaction;
}

/** Mueble colocado en la sala. */
export interface RoomItem {
  id: string;
  furnitureId: string;
  x: number;
  y: number;
  rotation: number;
}

export interface RoomTheme {
  wall: string;
  wallShade: string;
  floor: string;
  floorAlt: string;
  trim: string;
  sky: string;
  light: string;
}

/** Sala isométrica a mostrar (null = solo el Pockai, sin sala). */
export interface RoomState {
  id: string;
  gridWidth: number;
  gridHeight: number;
  /**
   * Celdas sin suelo `[x, y, ancho, fondo]` que dan a la sala su forma. Si el anfitrión no lo
   * manda (versiones antiguas), la escena usa el de habitats.json para ese id de sala.
   */
  blocked?: [number, number, number, number][];
  theme?: RoomTheme | null;
  items: RoomItem[];
  furniture: RoomFurniture[];
}

/** Qué hace el Pockai en la sala: pasear, dormir (va a la cama si hay) o no estar. */
export type Activity = 'idle' | 'sleep' | 'away';

/**
 * Lo que la sala necesita saber del exterior. Cada campo es opcional: el que no viene se queda
 * como estaba; `null` lo borra.
 */
export interface AmbienceMessage {
  type: 'setAmbience';
  /** Clima real: código WMO de Open-Meteo y temperatura en °C. Sin él, cielo despejado. */
  weather?: { code: number | null; temperature: number | null } | null;
  /** Salida y puesta de sol en minutos del día (por el puente admite también "HH:MM"). */
  sun?: { sunrise: number; sunset: number } | null;
  /** Minuto del día forzado (demo y pruebas). `null` = reloj del dispositivo. */
  clock?: number | null;
  /**
   * Fondo de la sala: `painted` (modo híbrido, paisaje pintado detrás de la sala si la sala lo
   * tiene) o `plain` (solo cielo). Por defecto, `painted`.
   */
  backdrop?: BackdropMode;
}

export type BackdropMode = 'painted' | 'plain';

export type StoryPhase = 'enter' | 'await' | 'react' | 'exit';
export type StoryBeat = 'arrived' | 'reacted' | 'exited';
export const STORY_TIMES = ['dawn', 'day', 'dusk', 'night'] as const;
export const STORY_WEATHER = ['clear', 'rain', 'snow', 'fog', 'storm'] as const;

/**
 * Escena de la aventura diaria (null = salir del modo historia). El mensaje lleva el estado ENTERO
 * y es idempotente: repetirlo no cambia nada, y si llega por primera vez en una fase posterior a
 * `enter` (recarga del WebView), el Pockai aparece ya en su sitio.
 */
export interface StoryState {
  /** Identifica la escena (p. ej. `<storyId>:<índice>`). Una clave nueva empieza una escena nueva. */
  key: string;
  /** Localización de shared/game-data/story-locations.json. */
  locationId: string;
  /**
   * `enter`: entra andando por la izquierda hasta el centro (→ `storyBeat: arrived`).
   * `await`: quieto en el centro mientras el jugador elige.
   * `react`: reacciona a la respuesta (→ `storyBeat: reacted`).
   * `exit`: sale andando por la derecha (→ `storyBeat: exited`).
   */
  phase: StoryPhase;
  /** Hora y clima de la escena. Sin ellos, los reales del dispositivo. */
  mood?: { timeOfDay?: (typeof STORY_TIMES)[number]; weather?: (typeof STORY_WEATHER)[number] };
  /** Efecto de @pockai/scene/effects que acompaña al evento, al llegar al centro. */
  fx?: string;
  /** Clip del Pockai al reaccionar (`happy`, `sad`…). */
  clip?: string;
}

/** Anfitrión → escena. */
export type HostMessage =
  | { type: 'setPet'; pet: PetState }
  | { type: 'playClip'; clip: string; once?: boolean }
  /**
   * Apariencia del anfitrión: el esquema y, si lo hay, el tema (`classic`, `cozy`…) con su paleta de
   * canvas en hex (claves de CanvasPalette de @pockai/ui), para teñir efectos y destellos.
   */
  | { type: 'setTheme'; mode: ThemeMode; themeId?: string; palette?: ThemePalette }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'setFacing'; facing: 1 | -1 }
  | { type: 'setRoom'; room: RoomState | null }
  /** `rest`: clip de reposo según el estado del Pockai (idle, sick, hungry, tired, sad…). */
  /**
   * `mind` (opcional): personalidad y necesidades del Pockai para que en la sala elija qué hacer
   * según cómo es y cómo está. Sin él se porta de forma neutra, así que las apps que aún no lo
   * mandan siguen funcionando igual (por eso no sube PROTOCOL_VERSION).
   */
  | { type: 'setActivity'; activity: Activity; rest?: string; mind?: RoomMind }
  /** Luces apagadas porque el Pockai duerme (la hora del día va por `setAmbience`). */
  | { type: 'setNight'; night: boolean }
  /**
   * Pockai de un amigo que está de visita en la sala (`null` = se ha ido). Solo su aspecto. Sin
   * sala no se dibuja. Mensajes opcionales: una app que no los manda sigue funcionando igual.
   */
  | { type: 'setGuest'; pet: PetState | null }
  /** Escena entre el Pockai de la sala y el visitante (la decide el servidor; ver room/visitScene.ts). */
  | { type: 'playScene'; scene: string }
  | AmbienceMessage
  | { type: 'setEditMode'; edit: boolean }
  | { type: 'selectItem'; itemId: string | null }
  | { type: 'rotateSelected' }
  /** Pinta un efecto de @pockai/scene/effects junto al Pockai (con la paleta de su elemento). */
  | { type: 'playEffect'; id: string; params?: EffectParams }
  /**
   * Reenvía un aviso `pet:action` del backend tal cual: la escena decide el efecto con la misma
   * tabla que el escritorio (`effectForPetAction`). Así la app nativa no repite la lógica.
   */
  | { type: 'petAction'; action: string; context?: Record<string, unknown> }
  /** Modo historia: escenario por capas con el Pockai andando de izquierda a derecha. */
  | { type: 'setStory'; story: StoryState | null }
  /**
   * Tapa todo el lienzo con un efecto de pantalla (por defecto `velo-eter`) para cambiar algo por
   * detrás sin que se vea el salto (p. ej. el tamaño de la vista). Responde con `screenCovered`.
   * Mensaje nuevo y opcional: no sube PROTOCOL_VERSION.
   */
  | { type: 'coverScreen'; effect?: string }
  /** Abre el velo de `coverScreen`. Responde con `screenUncovered` al terminar. */
  | { type: 'uncoverScreen' }
  /**
   * Ajustes de sonido del usuario (spec 40). Los aplica el bundle embed (Android/iOS), que tiene
   * su propio motor @pockai/audio; el escritorio usa el suyo y no lo manda.
   * Mensaje nuevo y opcional: no sube PROTOCOL_VERSION.
   */
  | { type: 'setAudio'; settings: AudioSettings };

/** Datos de un efecto: solo textos y números (viajan por el puente como JSON). */
export type EffectParams = Record<string, string | number>;

/** Escena → anfitrión. */
export type SceneEvent =
  | { type: 'ready'; protocol: number }
  | { type: 'petLoaded'; species: string; stage: Stage }
  | { type: 'petTapped' }
  | { type: 'clipEnded'; clip: string }
  | { type: 'itemSelected'; itemId: string | null }
  /** El usuario movió o giró un mueble a una posición válida (la escena ya lo muestra ahí). */
  | { type: 'furnitureMoved'; itemId: string; x: number; y: number; rotation: number }
  /**
   * El Pockai ha usado un mueble por su cuenta (comer, bañarse, sentarse, jugar, dormir). El
   * anfitrión puede avisar al servidor, que decide si tiene efecto (con tope diario).
   */
  | { type: 'furnitureUsed'; itemId: string; interaction: string }
  /** Un efecto pedido con `playEffect` o `petAction` terminó (o se descartó por otro más importante). */
  | { type: 'effectEnded'; id: string }
  /** Hito de la escena de historia en curso (ver `StoryState.phase`). Cada uno llega una vez por escena. */
  | { type: 'storyBeat'; key: string; beat: StoryBeat }
  /** El velo de `coverScreen` ya tapa todo: el anfitrión puede hacer su cambio. */
  | { type: 'screenCovered' }
  /** El velo terminó de abrirse. */
  | { type: 'screenUncovered' }
  | { type: 'error'; message: string };

const HOST_TYPES = new Set<HostMessage['type']>([
  'setPet',
  'playClip',
  'setTheme',
  'setPaused',
  'setFacing',
  'setRoom',
  'setActivity',
  'setNight',
  'setGuest',
  'playScene',
  'setAmbience',
  'setEditMode',
  'selectItem',
  'rotateSelected',
  'playEffect',
  'petAction',
  'setStory',
  'coverScreen',
  'uncoverScreen',
  'setAudio',
]);

/** Escena de historia validada; undefined si está mal formada. */
function parseStory(raw: unknown): StoryState | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.key !== 'string' || !/^[A-Za-z0-9:_-]{1,80}$/.test(r.key)) return undefined;
  if (typeof r.locationId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(r.locationId)) return undefined;
  if (r.phase !== 'enter' && r.phase !== 'await' && r.phase !== 'react' && r.phase !== 'exit') return undefined;
  const story: StoryState = { key: r.key, locationId: r.locationId, phase: r.phase };
  if (r.mood && typeof r.mood === 'object') {
    const m = r.mood as Record<string, unknown>;
    const mood: NonNullable<StoryState['mood']> = {};
    if ((STORY_TIMES as readonly unknown[]).includes(m.timeOfDay)) mood.timeOfDay = m.timeOfDay as (typeof STORY_TIMES)[number];
    if ((STORY_WEATHER as readonly unknown[]).includes(m.weather)) mood.weather = m.weather as (typeof STORY_WEATHER)[number];
    if (mood.timeOfDay || mood.weather) story.mood = mood;
  }
  if (typeof r.fx === 'string' && /^[a-z-]{1,40}$/.test(r.fx)) story.fx = r.fx;
  if (typeof r.clip === 'string' && /^[a-z_]{1,24}$/.test(r.clip)) story.clip = r.clip;
  return story;
}

/** Aspecto de un Pockai validado (el propio o el de un visitante); `null` si le falta lo imprescindible. */
function parsePet(raw: unknown): PetState | null {
  const p = raw as Record<string, unknown> | undefined;
  const pal = p?.palette as Record<string, unknown> | undefined;
  if (!p || typeof p !== 'object' || typeof p.species !== 'string' || typeof pal?.primary !== 'string' || typeof pal?.secondary !== 'string') return null;
  return {
    species: p.species,
    stage: (['egg', 'baby', 'juvenile', 'adult', 'final'] as const).includes(p.stage as Stage) ? (p.stage as Stage) : 'adult',
    palette: { primary: pal.primary, secondary: pal.secondary, ...(typeof pal.accent === 'string' ? { accent: pal.accent } : {}) },
    pattern: typeof p.pattern === 'string' ? p.pattern : null,
    visualSeed: Number.isFinite(p.visualSeed) ? (p.visualSeed as number) : 1337,
    shiny: p.shiny === true,
    accessories: parseEquipped(p.accessories),
  };
}

/** Datos de efecto validados: claves cortas y valores texto/número finitos; el resto se descarta. */
function parseEffectParams(raw: unknown): EffectParams {
  const out: EffectParams = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-zA-Z_]{1,24}$/.test(k)) continue;
    if (typeof v === 'string' && v.length <= 40) out[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

const INTERACTIONS: Interaction[] = ['sleep', 'eat', 'play', 'bathe', 'sit', 'listen'];
const int = (v: unknown, min = 0, max = 63) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isPair = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => int(n, 1, 8));

const COLOR = /^#[0-9a-fA-F]{6}$|^\d{1,3}, \d{1,3}, \d{1,3}$/;

/** Paleta de tema validada (colores hex o "r, g, b", sueltos o en listas cortas); null si no vale. */
function parseThemePalette(raw: unknown): ThemePalette | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string | string[]> = {};
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 24) return null;
  for (const [k, v] of entries) {
    if (!/^[a-zA-Z]{1,24}$/.test(k)) return null;
    if (typeof v === 'string' && COLOR.test(v)) out[k] = v;
    else if (Array.isArray(v) && v.length <= 8 && v.every((c) => typeof c === 'string' && COLOR.test(c))) out[k] = [...v];
    else return null;
  }
  return out;
}

/** Sala validada; undefined si está mal formada. */
function parseRoom(raw: unknown): RoomState | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !int(r.gridWidth, 1) || !int(r.gridHeight, 1)) return undefined;
  if (!Array.isArray(r.items) || !Array.isArray(r.furniture)) return undefined;
  const items: RoomItem[] = [];
  for (const it of r.items as Record<string, unknown>[]) {
    if (!it || typeof it.id !== 'string' || typeof it.furnitureId !== 'string' || !int(it.x) || !int(it.y)) {
      return undefined;
    }
    items.push({
      id: it.id,
      furnitureId: it.furnitureId,
      x: it.x as number,
      y: it.y as number,
      rotation: int(it.rotation, 0, 3) ? (it.rotation as number) : 0,
    });
  }
  const furniture: RoomFurniture[] = [];
  for (const f of r.furniture as Record<string, unknown>[]) {
    if (!f || typeof f.id !== 'string') return undefined;
    furniture.push({
      id: f.id,
      name: typeof f.name === 'string' ? f.name : undefined,
      footprint: isPair(f.footprint) ? f.footprint : undefined,
      mount: f.mount === 'wall' ? 'wall' : 'floor',
      interaction: INTERACTIONS.includes(f.interaction as Interaction) ? (f.interaction as Interaction) : undefined,
    });
  }
  const theme = r.theme && typeof r.theme === 'object' ? (r.theme as RoomTheme) : null;
  const room: RoomState = { id: r.id, gridWidth: r.gridWidth as number, gridHeight: r.gridHeight as number, theme, items, furniture };
  if (r.blocked !== undefined && r.blocked !== null) {
    if (!Array.isArray(r.blocked)) return undefined;
    const blocked: [number, number, number, number][] = [];
    for (const b of r.blocked as unknown[]) {
      if (!Array.isArray(b) || b.length !== 4 || !int(b[0]) || !int(b[1]) || !int(b[2], 1) || !int(b[3], 1)) return undefined;
      blocked.push(b as [number, number, number, number]);
    }
    room.blocked = blocked;
  }
  return room;
}

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
      const pet = parsePet(m.pet);
      return pet ? { type: 'setPet', pet } : null;
    }
    case 'setGuest': {
      if (m.pet === null) return { type: 'setGuest', pet: null };
      const pet = parsePet(m.pet);
      return pet ? { type: 'setGuest', pet } : null;
    }
    case 'playScene':
      return typeof m.scene === 'string' && /^[a-z_]{1,32}$/.test(m.scene) ? { type: 'playScene', scene: m.scene } : null;
    case 'playClip':
      return typeof m.clip === 'string' ? { type: 'playClip', clip: m.clip, once: m.once === true } : null;
    case 'setTheme': {
      if (m.mode !== 'dark' && m.mode !== 'light') return null;
      const out: Extract<HostMessage, { type: 'setTheme' }> = { type: 'setTheme', mode: m.mode };
      if (m.themeId !== undefined) {
        if (typeof m.themeId !== 'string' || !/^[a-z0-9-]{1,32}$/.test(m.themeId)) return null;
        out.themeId = m.themeId;
      }
      if (m.palette !== undefined) {
        const palette = parseThemePalette(m.palette);
        if (!palette) return null;
        out.palette = palette;
      }
      return out;
    }
    case 'setPaused':
      return typeof m.paused === 'boolean' ? { type: 'setPaused', paused: m.paused } : null;
    case 'setFacing':
      return m.facing === 1 || m.facing === -1 ? { type: 'setFacing', facing: m.facing } : null;
    case 'setRoom': {
      const room = parseRoom(m.room);
      return room === undefined ? null : { type: 'setRoom', room };
    }
    case 'setActivity':
      if (m.activity !== 'idle' && m.activity !== 'sleep' && m.activity !== 'away') return null;
    {
      const out: Extract<HostMessage, { type: 'setActivity' }> = { type: 'setActivity', activity: m.activity };
      if (typeof m.rest === 'string' && /^[a-z_]{1,24}$/.test(m.rest)) out.rest = m.rest;
      const mind = parseRoomMind(m.mind);
      if (mind) out.mind = mind;
      return out;
    }
    case 'setNight':
      return typeof m.night === 'boolean' ? { type: 'setNight', night: m.night } : null;
    case 'setAmbience': {
      const out: AmbienceMessage = { type: 'setAmbience' };
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      if (m.weather === null) out.weather = null;
      else if (m.weather && typeof m.weather === 'object') {
        const w = m.weather as Record<string, unknown>;
        out.weather = { code: num(w.code), temperature: num(w.temperature) };
      }
      if (m.sun === null) out.sun = null;
      else if (m.sun && typeof m.sun === 'object') {
        const s = m.sun as Record<string, unknown>;
        const sunrise = parseClock(s.sunrise);
        const sunset = parseClock(s.sunset);
        // Un sol mal formado se trata como "sin dato": la escena usa sus horas de defecto.
        out.sun = sunrise !== null && sunset !== null ? { sunrise, sunset } : null;
      }
      if ('clock' in m) out.clock = parseClock(m.clock);
      if (m.backdrop === 'painted' || m.backdrop === 'plain') out.backdrop = m.backdrop;
      return out;
    }
    case 'setEditMode':
      return typeof m.edit === 'boolean' ? { type: 'setEditMode', edit: m.edit } : null;
    case 'selectItem':
      return m.itemId === null || typeof m.itemId === 'string'
        ? { type: 'selectItem', itemId: m.itemId as string | null }
        : null;
    case 'rotateSelected':
      return { type: 'rotateSelected' };
    case 'playEffect':
      return typeof m.id === 'string' && /^[a-z-]{1,40}$/.test(m.id)
        ? { type: 'playEffect', id: m.id, params: parseEffectParams(m.params) }
        : null;
    case 'setStory': {
      const story = parseStory(m.story);
      return story === undefined ? null : { type: 'setStory', story };
    }
    case 'coverScreen':
      if (m.effect === undefined) return { type: 'coverScreen' };
      return typeof m.effect === 'string' && /^[a-z-]{1,40}$/.test(m.effect)
        ? { type: 'coverScreen', effect: m.effect }
        : null;
    case 'uncoverScreen':
      return { type: 'uncoverScreen' };
    case 'setAudio':
      return m.settings && typeof m.settings === 'object' && !Array.isArray(m.settings)
        ? { type: 'setAudio', settings: parseAudioSettings(m.settings) }
        : null;
    case 'petAction': {
      if (typeof m.action !== 'string' || !/^[a-z_]{1,40}$/.test(m.action)) return null;
      const ctx = m.context && typeof m.context === 'object' && !Array.isArray(m.context) ? (m.context as Record<string, unknown>) : undefined;
      return ctx ? { type: 'petAction', action: m.action, context: ctx } : { type: 'petAction', action: m.action };
    }
  }
  return null;
}
