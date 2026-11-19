/**
 * Secciones del panel y el permiso que exige cada una. Lo usan la navegación (qué se enseña) y
 * las rutas (no entrar por URL). Si se añade o quita una, actualizar ADMIN_ROUTES en scripts/postbuild.mjs.
 */
export const SECTIONS = [
  { path: 'resumen', label: 'Resumen', permission: 'admin:access' },
  { path: 'precios', label: 'Precios', permission: 'economy:manage' },
  { path: 'eventos', label: 'Eventos', permission: 'admin:access' },
  { path: 'usuarios', label: 'Usuarios', permission: 'users:read' },
  { path: 'invitaciones', label: 'Invitaciones', permission: 'invites:manage' },
  { path: 'vouchers', label: 'Vouchers', permission: 'vouchers:manage' },
  { path: 'sitio', label: 'Sitio web', permission: 'site:manage' },
  { path: 'correos', label: 'Correos', permission: 'email:send' },
  { path: 'pockais', label: 'Pockais', permission: 'pets:read' },
  { path: 'facturacion', label: 'Facturación e IA', permission: 'billing:manage' },
  { path: 'registro', label: 'Registro', permission: 'audit:read' },
] as const;

export type SectionPath = (typeof SECTIONS)[number]['path'];

export const permissionFor = (path: SectionPath) => SECTIONS.find((s) => s.path === path)!.permission;
