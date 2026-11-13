import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

/**
 * Cabeceras de seguridad HTTP (nosniff, HSTS, frame-ancestors, sin X-Powered-By…). La API solo sirve
 * JSON, así que la CSP por defecto de helmet es adecuada; Swagger UI necesita scripts en línea, por lo
 * que con la documentación activada (solo desarrollo) se relaja.
 */
export function applySecurity(app: INestApplication, opts: { swagger: boolean }) {
  app.use(helmet({ contentSecurityPolicy: opts.swagger ? false : undefined, crossOriginResourcePolicy: { policy: 'same-site' } }));
}
