import type { MaintenanceScope } from './site.schemas';

/** Tipo de cliente a efectos del mantenimiento: la web pública o las apps (escritorio, móvil). */
export type ClientKind = 'web' | 'apps';

/** Código de error que devuelve la API mientras el mantenimiento está activo. */
export const MAINTENANCE_CODE = 'MAINTENANCE';

/** Segundos que se sugieren a los clientes antes de reintentar (cabecera Retry-After). */
export const MAINTENANCE_RETRY_AFTER_S = 60;

export const DEFAULT_MAINTENANCE_MESSAGE = {
  es: 'Pockai está en mantenimiento. Volvemos enseguida.',
  en: 'Pockai is under maintenance. We will be back soon.',
} as const;

/**
 * ¿Quién llama? Manda la cabecera `X-Client` (`web`, `desktop`, `android`…). Sin ella (versiones
 * antiguas de las apps): el webview de Tauri envía un Origin `tauri…`, un navegador envía su Origin
 * y una app nativa no envía ninguno.
 */
export function classifyClient(xClient: unknown, origin: unknown): ClientKind {
  const declared = typeof xClient === 'string' ? xClient.trim().toLowerCase() : '';
  if (declared) return declared === 'web' ? 'web' : 'apps';
  if (typeof origin !== 'string' || !origin) return 'apps';
  return /^(tauri:|https?:\/\/tauri\.localhost)/i.test(origin) ? 'apps' : 'web';
}

export function scopeIncludes(scope: MaintenanceScope, kind: ClientKind): boolean {
  return scope === 'all' || scope === kind;
}

/**
 * Rutas que siguen abiertas durante el mantenimiento (sin el prefijo `/v1`): sondas de salud, la
 * configuración pública (para saber que hay mantenimiento), el formulario de contacto, el login y el
 * panel de administración (con lo que este necesita: renovar la sesión y `/me`) y el webhook de
 * Stripe, que no puede perder eventos de pago.
 */
const ALLOWED: readonly RegExp[] = [
  /^health(\/.*)?$/,
  /^site\/config$/,
  /^contact$/,
  /^auth\/(login|refresh|logout)$/,
  /^me$/,
  /^admin(\/.*)?$/,
  /^billing\/stripe\/webhook$/,
];

/** Quita el prefijo global y las barras sobrantes: `/v1/site/config/` → `site/config`. */
export function routePath(path: string, prefix: string): string {
  const clean = path.split('?')[0].replace(/^\/+|\/+$/g, '');
  const p = prefix.replace(/^\/+|\/+$/g, '');
  if (!p) return clean;
  if (clean === p) return '';
  return clean.startsWith(`${p}/`) ? clean.slice(p.length + 1) : clean;
}

export function isMaintenanceAllowed(path: string): boolean {
  return ALLOWED.some((re) => re.test(path));
}
