/**
 * Cliente de escritorio para la feature ambiental (feature 005).
 *
 * - `fetchStatus()` lee `GET /environmental/status` (hora del día, clima, actividad, festividad).
 * - `sendHeartbeat()` manda `POST /environmental/activity` cada ~60 s para detectar inactividad.
 * - `startHeartbeat()` encapsula el intervalo de heartbeats (devuelve una función de parada).
 * - `refreshLocalWeather()` lee la ubicación con la API nativa del sistema y pide el clima del
 *   lugar a Open-Meteo desde el propio equipo. La ubicación nunca va a nuestro servidor.
 *
 * Usa el token de la sesión del módulo `api` y renueva el access token ante un 401.
 */
import { get, writable } from 'svelte/store';
import {
  buildOpenMeteoUrl,
  parseOpenMeteo,
  UNKNOWN_WEATHER,
  type DeviceWeather,
  type WeatherThresholds,
} from '@pockai/scene/weather';
import balance from '@shared/game-data/balance.json';
import { API_BASE_URL, authFetch, getAccessToken } from './api';

export type TimeOfDay = 'late_night' | 'morning' | 'afternoon' | 'evening' | 'night';
export type WeatherCondition = 'clear' | 'cloud' | 'rain' | 'snow' | 'hot' | 'cold' | 'unknown';
export type ActivityMode = 'active' | 'solo';
export type EnvironmentalChangedType = 'weather' | 'timeOfDay' | 'activity' | 'festival';

export interface WeatherInfo {
  condition: WeatherCondition;
  temperature: number | null;
  weatherCode: number | null;
  cached: boolean;
  fetchedAt: string | null;
  /** Salida y puesta de sol de hoy, hora local ("HH:MM"); null sin ubicación. */
  sunrise: string | null;
  sunset: string | null;
  /** Zona horaria IANA y desfase UTC (s) del lugar; null sin ubicación. */
  timezone?: string | null;
  utcOffsetSeconds?: number | null;
}

export interface ActivityInfo {
  active: boolean;
  mode: ActivityMode;
  lastActiveAt: string | null;
}

export interface FestivalInfo {
  id: string;
  name: string;
  accessory: string;
  message: string;
}

export interface EnvironmentalStatus {
  timeOfDay: TimeOfDay;
  weather: WeatherInfo;
  activity: ActivityInfo;
  festival: FestivalInfo | null;
}

export interface UpcomingFestival {
  id: string;
  name: string;
  date: string;
  daysRemaining: number;
}

export interface EnvironmentalChangedEvent {
  type: EnvironmentalChangedType;
  data:
    | { condition: WeatherCondition; temperature: number | null; weatherCode: number | null }
    | { timeOfDay: TimeOfDay }
    | { mode: ActivityMode }
    | FestivalInfo
    | null;
}

/**
 * Último estado ambiental conocido. Lo mantiene `App.svelte`; lo leen las salas del hábitat
 * (`IsoRoomView`) para pintar el clima y el sol reales sin pasar la prop por medio panel.
 */
export const environmentalStatus = writable<EnvironmentalStatus | null>(null);

/** Cada cuánto se vuelve a pedir el estado del servidor y el clima del dispositivo. */
export const STATUS_REFRESH_MS = 15 * 60_000;

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  // La renovación de sesión es la de `authFetch` (una sola en toda la app), no una propia.
  const token = getAccessToken();
  return authFetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
  return data as T;
}

/** Lee el estado ambiental del usuario. */
export async function fetchStatus(): Promise<EnvironmentalStatus> {
  const res = await authedFetch('/v1/environmental/status');
  return json<EnvironmentalStatus>(res);
}

/** Manda un heartbeat de actividad. */
export async function sendHeartbeat(body: { active?: boolean; cpuUsage?: number | null } = {}): Promise<{ ok: boolean }> {
  const res = await authedFetch('/v1/environmental/activity', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return json<{ ok: boolean }>(res);
}

/** Lista las festividades próximas. */
export async function getUpcomingFestivals(): Promise<UpcomingFestival[]> {
  const res = await authedFetch('/v1/environmental/festivals/upcoming');
  return json<UpcomingFestival[]>(res);
}

/**
 * Arranca el heartbeat de inactividad (un `POST /environmental/activity` por intervalo).
 * Devuelve una función que detiene el intervalo. Por defecto cada 60 s.
 */
export function startHeartbeat(intervalMs = 60_000): () => void {
  const tick = () => {
    // `active: true` mientras la app está en primer plano; la pestaña oculta se marca inactiva.
    const active = typeof document === 'undefined' ? true : document.visibilityState === 'visible';
    sendHeartbeat({ active }).catch(() => {
      /* sin conexión: se reintenta en el siguiente ciclo */
    });
  };
  tick();
  const id = setInterval(tick, intervalMs);
  return () => clearInterval(id);
}

// ── Clima del lugar donde está el equipo (todo en el dispositivo) ─────────────────────────────
//
// La ubicación sale de la API nativa del sistema (comando de Tauri `get_device_location`:
// Windows.Devices.Geolocation / CoreLocation) y NO se manda a nuestro servidor: con 2 decimales se
// pide el clima directamente a Open-Meteo y se guarda solo en este equipo.

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

/** Clima del lugar (lo mismo que `WeatherInfo` más la zona horaria del lugar). */
export type LocalWeather = DeviceWeather;

/** Clima del dispositivo; `null` hasta la primera lectura. Se funde en `environmentalStatus`. */
export const localWeather = writable<LocalWeather | null>(null);

/** El clima se considera fresco durante 30 min (lo mismo que cacheaba antes el servidor). */
export const LOCAL_WEATHER_TTL_MS = 30 * 60_000;
const CACHE_KEY = 'pockai.localWeather.v1';
const FETCH_TIMEOUT_MS = 5_000;

interface CachedLocalWeather {
  at: number;
  weather: LocalWeather;
}

function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Pide la ubicación al sistema operativo. `null` si se deniega, está apagada o no es Tauri. */
export async function getDeviceLocation(): Promise<DeviceLocation | null> {
  if (!inTauri()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke<DeviceLocation | null>('get_device_location')) ?? null;
  } catch {
    return null;
  }
}

function thresholds(): WeatherThresholds {
  const env = (balance as any)?.environmental ?? {};
  return { hotTemp: env.hot_temp ?? 30, coldTemp: env.cold_temp ?? 5 };
}

function readCache(now: number): LocalWeather | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedLocalWeather;
    if (!c || typeof c.at !== 'number' || !c.weather || now - c.at > LOCAL_WEATHER_TTL_MS) return null;
    return { ...c.weather, cached: true };
  } catch {
    return null;
  }
}

function writeCache(weather: LocalWeather, now: number): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: now, weather } satisfies CachedLocalWeather));
  } catch {
    /* almacenamiento lleno o bloqueado: solo se pierde la caché */
  }
}

/** Consulta Open-Meteo para unas coordenadas (ya redondeadas por `buildOpenMeteoUrl`). */
export async function fetchLocalWeather(
  location: Pick<DeviceLocation, 'latitude' | 'longitude'>,
  fetchFn: typeof fetch = fetch,
): Promise<LocalWeather | null> {
  const url = buildOpenMeteoUrl(location.latitude, location.longitude);
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return parseOpenMeteo(await res.json(), thresholds(), new Date().toISOString());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Actualiza `localWeather`: usa la caché si es reciente; si no, ubicación nativa → Open-Meteo.
 * Sin permiso o sin red se queda con el último valor conocido (o `unknown`). Nunca lanza.
 */
export async function refreshLocalWeather(opts: { force?: boolean } = {}): Promise<LocalWeather> {
  const now = Date.now();
  if (!opts.force) {
    const cached = readCache(now);
    if (cached) {
      localWeather.set(cached);
      return cached;
    }
  }
  const location = await getDeviceLocation();
  const fresh = location ? await fetchLocalWeather(location) : null;
  if (fresh) {
    writeCache(fresh, now);
    localWeather.set(fresh);
    return fresh;
  }
  const fallback = get(localWeather) ?? { ...UNKNOWN_WEATHER };
  localWeather.set(fallback);
  return fallback;
}

/**
 * Junta el estado del servidor (hora del día, actividad, festividad) con el clima del dispositivo.
 * El servidor ya no conoce la ubicación: su `weather` se ignora siempre.
 */
export function mergeLocalWeather(
  status: EnvironmentalStatus | null,
  weather: LocalWeather | null,
): EnvironmentalStatus | null {
  if (!status) return null;
  const w = weather ?? UNKNOWN_WEATHER;
  return { ...status, weather: { ...w } };
}
