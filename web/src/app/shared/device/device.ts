/** Sistema del dispositivo desde el que se visita la web. */
export type DeviceOs = 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'unknown';

/** Plataformas con instalador de escritorio publicado. */
export type DesktopPlatform = 'windows' | 'macos';

export interface DeviceInfo {
  os: DeviceOs;
  /** Teléfono o tablet: no puede instalar la app de escritorio. */
  mobile: boolean;
}

/** Lo mínimo de `navigator` que hace falta (los tests lo simulan). */
export interface NavigatorLike {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string; mobile?: boolean };
}

/**
 * Detecta el sistema del visitante. Usa User-Agent Client Hints (`navigator.userAgentData`) cuando
 * existen (Chromium) y, si no, el User-Agent clásico. iPadOS se presenta como un Mac de escritorio:
 * se distingue porque un Mac no tiene pantalla táctil (`maxTouchPoints > 1`).
 * Solo sirve para elegir qué botón destacar: nunca es una medida de seguridad.
 */
export function detectDevice(nav: NavigatorLike | null | undefined): DeviceInfo {
  if (!nav) return { os: 'unknown', mobile: false };
  const ua = nav.userAgent ?? '';
  const hint = nav.userAgentData?.platform?.toLowerCase() ?? '';

  let os: DeviceOs = 'unknown';
  if (/android/i.test(ua) || hint === 'android') os = 'android';
  else if (/iphone|ipad|ipod/i.test(ua) || hint === 'ios') os = 'ios';
  else if (/macintosh|mac os x/i.test(ua) || hint === 'macos') os = (nav.maxTouchPoints ?? 0) > 1 ? 'ios' : 'macos';
  else if (/windows/i.test(ua) || hint === 'windows') os = 'windows';
  else if (/cros/i.test(ua) || hint === 'chrome os' || hint === 'chromeos') os = 'linux';
  else if (/linux/i.test(ua) || hint === 'linux') os = 'linux';

  const mobile = os === 'ios' || os === 'android' || nav.userAgentData?.mobile === true;
  return { os, mobile };
}

/** Instalador que corresponde a este dispositivo, o null si desde aquí no se puede instalar. */
export function desktopPlatformFor(os: DeviceOs): DesktopPlatform | null {
  return os === 'windows' || os === 'macos' ? os : null;
}
