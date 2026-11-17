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
    // Especies, rarezas y patrones (antes eran bandas de la home).
    path: 'pockais',
    loadComponent: () => import('./pockais/pockais').then((m) => m.Pockais),
  },
  {
    // La Arena a fondo.
    path: 'arena',
    loadComponent: () => import('./arena/arena').then((m) => m.Arena),
  },
  {
    path: 'pro/ok',
    loadComponent: () => import('./pro/pro-success').then((m) => m.ProSuccess),
  },
  {
    path: 'pro/cancel',
    loadComponent: () => import('./pro/pro-cancel').then((m) => m.ProCancel),
  },
  {
    // Formulario de contacto (llega a contact@pockai.world vía POST /v1/contact).
    path: 'contact',
    loadComponent: () => import('./contact/contact').then((m) => m.Contact),
  },
  {
    // Enlace de verificación del correo de la cuenta (solo cliente: lee ?token=).
    path: 'verify-email',
    loadComponent: () => import('./verify-email/verify-email').then((m) => m.VerifyEmail),
  },
  // Cuenta del visitante (solo cliente): entrar, crear cuenta, recuperar la contraseña y su cuenta.
  {
    path: 'login',
    loadComponent: () => import('./account/login').then((m) => m.Login),
  },
  {
    path: 'register',
    loadComponent: () => import('./account/register').then((m) => m.Register),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./account/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'account',
    loadComponent: () => import('./account/account').then((m) => m.Account),
  },
  {
    // Panel oculto: no se enlaza desde la landing, no se prerenderiza y va en un chunk aparte.
    path: 'admin',
    loadChildren: () => import('./admin/admin.routes'),
  },
  {
    path: '404',
    loadComponent: () => import('./not-found/not-found').then((m) => m.NotFound),
  },
  {
    path: '**',
    loadComponent: () => import('./not-found/not-found').then((m) => m.NotFound),
  },
];
