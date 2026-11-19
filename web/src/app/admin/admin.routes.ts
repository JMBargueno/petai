import { Routes } from '@angular/router';
import { adminGuard, permissionGuard } from './auth';
import { permissionFor, type SectionPath } from './sections';

const section = (path: SectionPath, loadComponent: Routes[number]['loadComponent']) => ({
  path,
  loadComponent,
  canActivate: [permissionGuard],
  data: { permission: permissionFor(path) },
});

/** Si se añade o quita una sección, actualizar sections.ts y ADMIN_ROUTES en scripts/postbuild.mjs. */
export default [
  { path: 'login', loadComponent: () => import('./login').then((m) => m.Login) },
  {
    path: '',
    canMatch: [adminGuard],
    loadComponent: () => import('./shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'resumen' },
      section('resumen', () => import('./features/dashboard').then((m) => m.Dashboard)),
      section('precios', () => import('./features/prices').then((m) => m.Prices)),
      section('eventos', () => import('./features/events').then((m) => m.Events)),
      section('usuarios', () => import('./features/users').then((m) => m.Users)),
      section('invitaciones', () => import('./features/invites').then((m) => m.Invites)),
      section('vouchers', () => import('./features/vouchers').then((m) => m.Vouchers)),
      section('sitio', () => import('./features/site').then((m) => m.Site)),
      section('correos', () => import('./features/emails').then((m) => m.Emails)),
      section('pockais', () => import('./features/pockais').then((m) => m.Pockais)),
      section('facturacion', () => import('./features/billing').then((m) => m.Billing)),
      section('registro', () => import('./features/audit').then((m) => m.Audit)),
    ],
  },
  { path: '**', redirectTo: 'login' },
] satisfies Routes;
