import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./landing/landing').then((m) => m.Landing),
  },
  {
    // Panel oculto: no se enlaza desde la landing, no se prerenderiza y va en un chunk aparte.
    path: 'admin',
    loadChildren: () => import('./admin/admin.routes'),
  },
  { path: '**', redirectTo: '' },
];
