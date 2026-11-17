/**
 * Rutas que la landing «Coming soon» nunca tapa: solo el panel de administración
 * para el equipo (/admin). El login y registro de usuarios se atienden en modales
 * directamente sobre la landing.
 */
export const GATE_EXEMPT = ['admin'] as const;

/** ¿La ruta (del router, sin idioma: `/login?next=…`) queda fuera de la landing? */
export function isGateExempt(url: string): boolean {
  const first = url.split(/[?#]/)[0].replace(/^\/+/, '').split('/')[0];
  return (GATE_EXEMPT as readonly string[]).includes(first);
}

export interface GateInput {
  comingSoon: boolean;
  loggedIn: boolean;
  verified: boolean;
  url: string;
}

/** ¿Se enseña la landing en lugar de la página? Solo pasa quien tiene sesión con el correo verificado. */
export function shouldGate({ comingSoon, loggedIn, verified, url }: GateInput): boolean {
  if (!comingSoon || isGateExempt(url)) return false;
  return !(loggedIn && verified);
}

/** Qué pantalla tapa la web, si alguna. */
export type Gate = 'down' | 'maintenance' | 'coming-soon' | null;

export interface ResolveGateInput extends GateInput {
  /** El backend no responde: mantenimiento automático. */
  down: boolean;
  /** Mantenimiento manual activo (panel → Sitio). */
  maintenance: boolean;
  /** A quién afecta el mantenimiento manual. */
  maintenanceScope: 'web' | 'apps' | 'all';
  /** Usuario con acceso al panel: pasa el mantenimiento manual. */
  isAdmin: boolean;
}

/**
 * Decide la pantalla que tapa la web. Prioridad: backend caído > mantenimiento > «Coming soon».
 * - Backend caído: tapa todo, también el panel (no podría funcionar sin API).
 * - Mantenimiento manual (si su alcance incluye la web): pasan el panel y quien tenga acceso a él.
 * - «Coming soon»: como siempre (`shouldGate`).
 */
export function resolveGate(input: ResolveGateInput): Gate {
  if (input.down) return 'down';
  if (input.maintenance && input.maintenanceScope !== 'apps' && !input.isAdmin && !isGateExempt(input.url)) return 'maintenance';
  return shouldGate(input) ? 'coming-soon' : null;
}
