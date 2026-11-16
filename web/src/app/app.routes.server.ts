import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // El panel de administración es solo cliente: nunca se genera HTML con sus datos.
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'pro/**', renderMode: RenderMode.Client },
  // Lleva un token de un solo uso en la URL: no se prerenderiza (postbuild copia el shell CSR).
  { path: 'verify-email', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Prerender },
];
