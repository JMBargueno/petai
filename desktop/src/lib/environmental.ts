/**
 * Cliente de escritorio para la feature ambiental (feature 005).
 *
 * - `fetchStatus()` lee `GET /environmental/status` (hora del día, clima, actividad, festividad).
 * - `sendHeartbeat()` manda `POST /environmental/activity` cada ~60 s para detectar inactividad.
 * - `startHeartbeat()` encapsula el intervalo de heartbeats (devuelve una función de parada).
 * - `requestOptInCoordinates()` pide la geolocalización del equipo (opt-in, privacidad) y
 *   `saveCoordinates()` la persiste en el perfil vía `PATCH /v1/me`.
 *
 * Usa el token de la sesión del módulo `api` y renueva el access token ante un 401.
 */
import { API_BASE_URL, getAccessToken, renewAccessToken } from './api';

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

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = `${API_BASE_URL}${path}`;
  const doFetch = (token: string | null) =>
    fetch(base, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  let res = await doFetch(getAccessToken());
  if (res.status === 401) {
    const token = await renewAccessToken(getAccessToken());
    if (token) res = await doFetch(token);
  }
  return res;
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

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Pide la geolocalización del equipo (opt-in, requiere permiso del sistema). Devuelve `null` si el
 * usuario se lo deniega o el API no está disponible. El servidor solo la usa para el clima.
 */
export function requestOptInCoordinates(timeoutMs = 8_000): Promise<Coordinates | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 600_000 },
    );
  });
}

/** Persiste las coordenadas (opt-in) en el perfil vía `PATCH /v1/me`. */
export async function saveCoordinates(coords: Coordinates): Promise<void> {
  const rounded = {
    latitude: Math.round(coords.latitude * 100) / 100,
    longitude: Math.round(coords.longitude * 100) / 100,
  };
  await authedFetch('/v1/me', {
    method: 'PATCH',
    body: JSON.stringify(rounded),
  });
}
