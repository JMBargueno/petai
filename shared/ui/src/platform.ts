/**
 * Modo de plataforma de la UI: cada componente compartido se pinta como en el sistema donde corre.
 *
 * - `desktop`: el aspecto Pockai del escritorio (el valor por defecto: no hace falta CSS extra).
 * - `android`: convenciones de Material 3 (capa de estado, hojas inferiores, interruptor M3…).
 * - `ios`: convenciones de Cupertino (opacidad al pulsar, listas agrupadas, interruptor iOS…).
 *
 * Lo fija la app una vez, en su `main.ts` y antes de montar (como `setUiSound`): no es una opción del
 * jugador. Se aplica como `data-platform` en `<html>`, y `styles/platform/*.css` cambia la geometría,
 * el movimiento y la interacción. Los colores nunca dependen de la plataforma: son cosa del tema.
 */
export type Platform = 'desktop' | 'android' | 'ios';

export const PLATFORMS: readonly Platform[] = ['desktop', 'android', 'ios'];
export const PLATFORM_ATTR = 'data-platform';

type PlatformRoot = { setAttribute(name: string, value: string): void };

let current: Platform = 'desktop';
let locked = false;

export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);
}

/**
 * Fija la plataforma de la app. Solo vale la primera llamada: la plataforma no cambia en caliente.
 */
export function setPlatform(
  platform: Platform,
  root: PlatformRoot | undefined = typeof document !== 'undefined' ? document.documentElement : undefined,
): Platform {
  if (locked && platform !== current) {
    console.warn(`[@pockai/ui] La plataforma ya es "${current}": se ignora "${platform}".`);
    return current;
  }
  current = platform;
  locked = true;
  root?.setAttribute(PLATFORM_ATTR, platform);
  return current;
}

/** Plataforma de la app (por defecto `desktop` si ninguna la ha fijado). */
export function getPlatform(): Platform {
  return current;
}

/** Plataforma táctil (android o ios): hojas inferiores, sin elevación al pasar el ratón… */
export function isMobilePlatform(platform: Platform = current): boolean {
  return platform !== 'desktop';
}

/**
 * La plataforma con la que arranca una app: la suya, salvo que en desarrollo se pida otra con
 * `?platform=ios` (así se prueba iOS en el servidor de Android sin un Mac).
 */
export function resolvePlatform(fallback: Platform, search: string, isDev: boolean): Platform {
  if (!isDev) return fallback;
  const asked = new URLSearchParams(search).get('platform');
  return isPlatform(asked) ? asked : fallback;
}

/** Solo para tests: vuelve al estado inicial. */
export function __resetPlatformForTests(): void {
  current = 'desktop';
  locked = false;
}
