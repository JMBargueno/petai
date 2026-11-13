import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { z } from 'zod';
import { RedisService } from '../../redis/redis.service';
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
 * Estado en Redis (caduca a los 5 min, compartido entre instancias); si Redis no responde se usa un
 * respaldo en memoria por instancia.
 */
@Injectable()
export class DeviceLinkService {
  private readonly byPollToken = new Map<string, Pending>();
  private readonly byCode = new Map<string, string>();

  constructor(
    private readonly auth: AuthService,
    private readonly throttle: AuthThrottleService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  private pollKey = (token: string) => this.redis!.key(`devlink:poll:${token}`);
  private codeKey = (code: string) => this.redis!.key(`devlink:code:${code}`);

  private sweep() {
    const now = Date.now();
    for (const [token, p] of this.byPollToken) {
      if (p.expiresAt <= now) {
        this.byPollToken.delete(token);
        this.byCode.delete(p.code);
      }
    }
  }

  async start(ip: string) {
    await this.throttle.consume(`device-start:${ip}`, 20, 60 * 60_000);
    const pollToken = crypto.randomBytes(24).toString('hex');
    const randomCode = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

    if (this.redis) {
      for (let i = 0; i < 20; i++) {
        const code = randomCode();
        const res = await this.redis.run(async (r) => {
          // NX: un código vivo no se reutiliza
          const ok = await r.set(this.codeKey(code), pollToken, 'PX', TTL_MS, 'NX');
          if (ok !== 'OK') return 'taken' as const;
          await r.set(this.pollKey(pollToken), JSON.stringify({ code }), 'PX', TTL_MS);
          return 'ok' as const;
        });
        if (res === 'ok') return { code, pollToken, expiresInSeconds: TTL_MS / 1000 };
        if (res === null) break; // Redis caído: respaldo en memoria
      }
    }

    this.sweep();
    if (this.byPollToken.size >= MAX_PENDING) throw new BadRequestException('Demasiadas vinculaciones en curso, inténtalo en unos minutos');
    let code: string;
    do {
      code = randomCode();
    } while (this.byCode.has(code));
    this.byPollToken.set(pollToken, { code, expiresAt: Date.now() + TTL_MS });
    this.byCode.set(code, pollToken);
    return { code, pollToken, expiresInSeconds: TTL_MS / 1000 };
  }

  async confirm(userId: string, raw: unknown, ip: string) {
    // Freno a la fuerza bruta sobre los 10^6 códigos posibles
    await this.throttle.consume(`device-confirm:${ip}`, 10, 15 * 60_000);
    await this.throttle.consume(`device-confirm-user:${userId}`, 10, 15 * 60_000);
    const { code } = parseOrBadRequest(confirmSchema, raw);

    if (this.redis) {
      const res = await this.redis.run(async (r) => {
        const token = await r.get(this.codeKey(code));
        if (!token) return 'missing' as const;
        const json = await r.get(this.pollKey(token));
        if (!json) return 'missing' as const;
        const ttl = await r.pttl(this.pollKey(token));
        await r.set(this.pollKey(token), JSON.stringify({ ...JSON.parse(json), userId }), 'PX', Math.max(ttl, 1000));
        return 'ok' as const;
      });
      if (res === 'ok') return { ok: true };
      if (res === 'missing') throw new NotFoundException('Código inválido o caducado');
    }

    this.sweep();
    const token = this.byCode.get(code);
    const pending = token ? this.byPollToken.get(token) : undefined;
    if (!pending) throw new NotFoundException('Código inválido o caducado');
    pending.userId = userId;
    return { ok: true };
  }

  async poll(raw: unknown) {
    const { pollToken } = parseOrBadRequest(pollSchema, raw);

    if (this.redis) {
      const res = await this.redis.run(async (r) => {
        const json = await r.get(this.pollKey(pollToken));
        if (!json) return { kind: 'missing' as const };
        const p = JSON.parse(json) as { code: string; userId?: string };
        if (!p.userId) return { kind: 'pending' as const };
        // Un solo uso: solo quien consigue borrar la clave recibe la sesión
        const removed = await r.del(this.pollKey(pollToken));
        if (removed !== 1) return { kind: 'missing' as const };
        await r.del(this.codeKey(p.code));
        return { kind: 'confirmed' as const, userId: p.userId };
      });
      if (res) {
        if (res.kind === 'missing') throw new NotFoundException('Vinculación inexistente o caducada');
        if (res.kind === 'pending') return { status: 'pending' as const };
        return { status: 'confirmed' as const, ...(await this.auth.issueSession(res.userId)) };
      }
    }

    this.sweep();
    const pending = this.byPollToken.get(pollToken);
    if (!pending) throw new NotFoundException('Vinculación inexistente o caducada');
    if (!pending.userId) return { status: 'pending' as const };
    this.byPollToken.delete(pollToken);
    this.byCode.delete(pending.code);
    return { status: 'confirmed' as const, ...(await this.auth.issueSession(pending.userId)) };
  }
}
