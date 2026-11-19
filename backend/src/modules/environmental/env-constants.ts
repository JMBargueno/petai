/**
 * Constantes de infraestructura de la feature ambiental (TTLs). Los umbrales de juego viven en
 * `balance.json → environmental`. El clima ya no lo consulta el servidor: cada app lo pide desde
 * su dispositivo (`@pockai/scene/weather`).
 */

/** Estado de actividad en Redis (3 h); expira solo, sin cola de limpieza (YAGNI). */
export const ACTIVITY_TTL_SECONDS = 3 * 60 * 60;
