/**
 * Constantes de la feature ambiental. El host de meteo está en una allowlist (SSRF, Constitución
 * VIII): la URL se construye únicamente sobre este host fijo. Los umbrales/tasas de juego viven en
 * `balance.json → environmental`; aquí solo van valores de infraestructura (TTLs, timeouts, hosts).
 */

export const WEATHER_API_HOST = 'api.open-meteo.com';
export const WEATHER_API_BASE = 'https://api.open-meteo.com/v1/forecast';

/** Timeout de la llamada a Open-Meteo (ms). */
export const WEATHER_TIMEOUT_MS = 3000;
/** Cache de clima por coordenada en Redis (30 min). */
export const WEATHER_CACHE_TTL_SECONDS = 30 * 60;
/** Estado de actividad en Redis (3 h); expira solo, sin cola de limpieza (YAGNI). */
export const ACTIVITY_TTL_SECONDS = 3 * 60 * 60;
