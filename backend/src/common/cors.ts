import type { INestApplication } from '@nestjs/common';

/** Orígenes por defecto: Vite en desarrollo y el webview de Tauri en cada plataforma. */
export const DEFAULT_CORS_ORIGINS =
  'http://localhost:5173,http://127.0.0.1:5173,tauri://localhost,http://tauri.localhost,https://tauri.localhost';

export function parseOrigins(value?: string | null): string[] {
  return (value ?? DEFAULT_CORS_ORIGINS)
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * ¿Se permite este origen? Las peticiones sin cabecera Origin (curl, apps nativas, servidor a
 * servidor) no son de navegador y no necesitan CORS, así que se aceptan; un navegador siempre
 * envía Origin, y solo se admiten los de la lista.
 */
export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true;
  return allowed.includes(origin.replace(/\/+$/, ''));
}

/** Para socket.io: lee la lista en cada conexión (la configuración se carga después de importar el módulo). */
export function socketCorsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  callback(null, isOriginAllowed(origin, parseOrigins(process.env.CORS_ORIGINS)));
}

export function applyCors(app: INestApplication, corsOrigins?: string | null) {
  const allowed = parseOrigins(corsOrigins);
  app.enableCors({
    origin: (origin, callback) => callback(null, isOriginAllowed(origin, allowed)),
    // La autenticación va en la cabecera Authorization, no en cookies: no se necesitan credenciales
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    maxAge: 600,
  });
}
