import { Routes } from '@angular/router';
import { adminGuard } from './auth';

/** Si se añade o quita una sección, actualizar ADMIN_ROUTES en scripts/postbuild.mjs. */
export default [
  { path: 'login', loadComponent: () => import('./login').then((m) => m.Login) },
  {
    path: '',
    canMatch: [adminGuard],
    loadComponent: () => import('./shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'resumen' },
      { path: 'resumen', loadComponent: () => import('./features/dashboard').then((m) => m.Dashboard) },
      { path: 'precios', loadComponent: () => import('./features/prices').then((m) => m.Prices) },
      { path: 'eventos', loadComponent: () => import('./features/events').then((m) => m.Events) },
      { path: 'usuarios', loadComponent: () => import('./features/users').then((m) => m.Users) },
      { path: 'pockais', loadComponent: () => import('./features/pockais').then((m) => m.Pockais) },
      { path: 'registro', loadComponent: () => import('./features/audit').then((m) => m.Audit) },
    ],
  },
  { path: '**', redirectTo: 'login' },
] satisfies Routes;
