import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { AuthThrottleService } from './auth-throttle.service';
import { parseOrBadRequest } from './dto/auth.schemas';

const TTL_MS = 5 * 60_000;
const MAX_PENDING = 5000;

const confirmSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'El código debe tener 6 dígitos') });
const pollSchema = z.object({ pollToken: z.string().min(16).max(128) });

interface Pending {
  code: string;
  expiresAt: number;
  userId?: string;
}

/**
 * Vinculación de dispositivos: el cliente sin sesión pide un código de 6 dígitos, el usuario lo
 * confirma desde otro dispositivo ya autenticado y el primero recibe su propia sesión.
 * Estado en memoria (caduca a los 5 min): con varias instancias debe pasar a Redis.
 */
@Injectable()
export class DeviceLinkService {
  private readonly byPollToken = new Map<string, Pending>();
  private readonly byCode = new Map<string, string>();

  constructor(private readonly auth: AuthService, private readonly throttle: AuthThrottleService) {}

  private sweep() {
    const now = Date.now();
    for (const [token, p] of this.byPollToken) {
      if (p.expiresAt <= now) {
        this.byPollToken.delete(token);
        this.byCode.delete(p.code);
      }
    }
  }

  start(ip: string) {
    this.throttle.consume(`device-start:${ip}`, 20, 60 * 60_000);
    this.sweep();
    if (this.byPollToken.size >= MAX_PENDING) throw new BadRequestException('Demasiadas vinculaciones en curso, inténtalo en unos minutos');
    let code: string;
    do {
      code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    } while (this.byCode.has(code));
    const pollToken = crypto.randomBytes(24).toString('hex');
    this.byPollToken.set(pollToken, { code, expiresAt: Date.now() + TTL_MS });
    this.byCode.set(code, pollToken);
    return { code, pollToken, expiresInSeconds: TTL_MS / 1000 };
  }

  confirm(userId: string, raw: unknown, ip: string) {
    // Freno a la fuerza bruta sobre los 10^6 códigos posibles
    this.throttle.consume(`device-confirm:${ip}`, 10, 15 * 60_000);
    this.throttle.consume(`device-confirm-user:${userId}`, 10, 15 * 60_000);
    const { code } = parseOrBadRequest(confirmSchema, raw);
    this.sweep();
    const token = this.byCode.get(code);
    const pending = token ? this.byPollToken.get(token) : undefined;
    if (!pending) throw new NotFoundException('Código inválido o caducado');
    pending.userId = userId;
    return { ok: true };
  }

  async poll(raw: unknown) {
    const { pollToken } = parseOrBadRequest(pollSchema, raw);
    this.sweep();
    const pending = this.byPollToken.get(pollToken);
    if (!pending) throw new NotFoundException('Vinculación inexistente o caducada');
    if (!pending.userId) return { status: 'pending' as const };
    // Un solo uso: se borra antes de emitir la sesión
    this.byPollToken.delete(pollToken);
    this.byCode.delete(pending.code);
    return { status: 'confirmed' as const, ...(await this.auth.issueSession(pending.userId)) };
  }
}
