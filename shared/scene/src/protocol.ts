/**
 * Protocolo entre la app nativa (anfitrión) y la escena. Son mensajes JSON con `type`.
 * El mismo contrato se usa en escritorio (llamada directa), Android (`AndroidBridge`) e iOS
 * (`webkit.messageHandlers.pockai`). Ver docs/ART_PIPELINE.md §9.
 *
 * Versionado: si cambias un mensaje de forma incompatible, sube `PROTOCOL_VERSION`. La escena lo
 * anuncia en `ready` para que la app nativa compruebe que habla el mismo idioma.
 */
export const PROTOCOL_VERSION = 2;

import { parseEquipped, type EquippedAccessories } from './bake/accessories';
import { parseClock } from './ambience/sunClock';

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
  /** Prendas equipadas por ranura (ids de accessories.json). Opcional: sin ellas no se pinta ninguna. */
  accessories?: EquippedAccessories;
}

export type Interaction = 'sleep' | 'eat' | 'play' | 'bathe' | 'sit';

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
}

/** Anfitrión → escena. */
export type HostMessage =
  | { type: 'setPet'; pet: PetState }
  | { type: 'playClip'; clip: string; once?: boolean }
  | { type: 'setTheme'; mode: ThemeMode }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'setFacing'; facing: 1 | -1 }
  | { type: 'setRoom'; room: RoomState | null }
  /** `rest`: clip de reposo según el estado del Pockai (idle, sick, hungry, tired, sad…). */
  | { type: 'setActivity'; activity: Activity; rest?: string }
  /** Luces apagadas porque el Pockai duerme (la hora del día va por `setAmbience`). */
  | { type: 'setNight'; night: boolean }
  | AmbienceMessage
  | { type: 'setEditMode'; edit: boolean }
  | { type: 'selectItem'; itemId: string | null }
  | { type: 'rotateSelected' };

/** Escena → anfitrión. */
export type SceneEvent =
  | { type: 'ready'; protocol: number }
  | { type: 'petLoaded'; species: string; stage: Stage }
  | { type: 'petTapped' }
  | { type: 'clipEnded'; clip: string }
  | { type: 'itemSelected'; itemId: string | null }
  /** El usuario movió o giró un mueble a una posición válida (la escena ya lo muestra ahí). */
  | { type: 'furnitureMoved'; itemId: string; x: number; y: number; rotation: number }
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
  'setAmbience',
  'setEditMode',
  'selectItem',
  'rotateSelected',
]);

const INTERACTIONS: Interaction[] = ['sleep', 'eat', 'play', 'bathe', 'sit'];
const int = (v: unknown, min = 0, max = 63) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isPair = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => int(n, 1, 8));

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
          accessories: parseEquipped(p.accessories),
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
    case 'setRoom': {
      const room = parseRoom(m.room);
      return room === undefined ? null : { type: 'setRoom', room };
    }
    case 'setActivity':
      if (m.activity !== 'idle' && m.activity !== 'sleep' && m.activity !== 'away') return null;
      return typeof m.rest === 'string' && /^[a-z_]{1,24}$/.test(m.rest)
        ? { type: 'setActivity', activity: m.activity, rest: m.rest }
        : { type: 'setActivity', activity: m.activity };
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
  }
  return null;
}
