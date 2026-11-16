import type { Request } from 'express';

/** IP del cliente (con TRUST_PROXY configurado respeta X-Forwarded-For del proxy de confianza). */
export const clientIp = (req: Request) => req.ip || req.socket?.remoteAddress || 'unknown';
