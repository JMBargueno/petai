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
