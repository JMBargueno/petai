/**
 * Tipos del dominio ambiental (feature 005). Coinciden con el contrato publicado en
 * `shared/openapi/openapi.json` (Constitución III): los clientes consumen los tipos generados,
 * no reescritos a mano.
 */

export type TimeOfDay = 'late_night' | 'morning' | 'afternoon' | 'evening' | 'night';

export type WeatherCondition = 'clear' | 'cloud' | 'rain' | 'snow' | 'hot' | 'cold' | 'unknown';

export type ActivityMode = 'active' | 'solo';

export interface WeatherInfo {
  /** Condición mapeada (WMO + temperatura) según `balance.environmental`. */
  condition: WeatherCondition;
  /** Temperatura actual en °C (null si no hay coordenadas o la API falló). */
  temperature: number | null;
  /** Código WMO devuelto por Open-Meteo (null si no hay coordenadas o la API falló). */
  weatherCode: number | null;
  /** true si se sirvió desde la cache de Redis. */
  cached: boolean;
  /** ISO 8601 del momento en que se (re)obtuvo el dato, o null. */
  fetchedAt: string | null;
}

export interface ActivityInfo {
  /** ¿Hay un heartbeat reciente? (mode === 'active'). */
  active: boolean;
  mode: ActivityMode;
  /** ISO 8601 del último heartbeat, o null si aún no hay ninguno. */
  lastActiveAt: string | null;
}

export interface FestivalInfo {
  id: string;
  name: string;
  /** Clave de accesorio/overlay para el escritorio (p. ej. 'sombrerito', 'paraguas'). */
  accessory: string;
  /** Frase de micro-momento (p. ej. '¡Feliz Navidad! 🎄'). */
  message: string;
}

export interface UpcomingFestival {
  id: string;
  name: string;
  /** Fecha ISO (YYYY-MM-DD) del próximo comienzo. */
  date: string;
  /** Días hasta el próximo comienzo (0 si está activa hoy). */
  daysRemaining: number;
}

/** Respuesta de `GET /environmental/status`. */
export interface EnvironmentalStatus {
  timeOfDay: TimeOfDay;
  weather: WeatherInfo;
  activity: ActivityInfo;
  festival: FestivalInfo | null;
}

/** Tipo del evento `environmental:changed` del WebSocket. */
export type EnvironmentalChangedType = 'weather' | 'timeOfDay' | 'activity' | 'festival';

export interface EnvironmentalChangedEvent {
  type: EnvironmentalChangedType;
  data:
    | { condition: WeatherCondition; temperature: number | null; weatherCode: number | null } // weather
    | { timeOfDay: TimeOfDay } // timeOfDay
    | { mode: ActivityMode } // activity
    | (FestivalInfo | null); // festival
}

/** Estructura cruda de `shared/game-data/festivals.json`. */
export interface FestivalEntry {
  id: string;
  name: string;
  monthStart: number;
  dayStart: number;
  monthEnd?: number;
  dayEnd?: number;
  region?: string;
  accessory: string;
  message: string;
}
