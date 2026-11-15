import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./landing/landing').then((m) => m.Landing),
  },
  {
    // El mundo: lore oficial en /es/lore y /en/lore (routing de idioma de localize).
    path: 'lore',
    loadComponent: () => import('./lore/lore').then((m) => m.Lore),
  },
  {
    // Panel oculto: no se enlaza desde la landing, no se prerenderiza y va en un chunk aparte.
    path: 'admin',
    loadChildren: () => import('./admin/admin.routes'),
  },
  { path: '**', redirectTo: '' },
];
