import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
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

/**
 * Confirmación atómica. KEYS[1] = clave del código; ARGV[1] = prefijo de las claves de sondeo;
 * ARGV[2] = usuario que confirma. Devuelve 'missing', 'taken' (ya confirmado) u 'ok'.
 * Conserva la caducidad que le quedaba a la vinculación.
 */
const CONFIRM_SCRIPT = `
local token = redis.call('GET', KEYS[1])
if not token then return 'missing' end
local pollKey = ARGV[1] .. token
local json = redis.call('GET', pollKey)
if not json then return 'missing' end
local data = cjson.decode(json)
if data.userId then return 'taken' end
data.userId = ARGV[2]
local ttl = redis.call('PTTL', pollKey)
if ttl < 1000 then ttl = 1000 end
redis.call('SET', pollKey, cjson.encode(data), 'PX', ttl)
return 'ok'
`;

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

    const alreadyConfirmed = () => new ConflictException('Este código ya fue confirmado');

    if (this.redis) {
      // Un solo script (atómico): dos confirmaciones simultáneas no pueden pisarse, y un código que ya
      // tiene dueño no se reasigna a otra cuenta.
      const res = await this.redis.run(
        (r) => r.eval(CONFIRM_SCRIPT, 1, this.codeKey(code), this.redis!.key('devlink:poll:'), userId) as Promise<string>,
      );
      if (res === 'ok') return { ok: true };
      if (res === 'taken') throw alreadyConfirmed();
      // 'missing' o Redis caído: puede ser una vinculación iniciada con el respaldo en memoria
    }

    this.sweep();
    const token = this.byCode.get(code);
    const pending = token ? this.byPollToken.get(token) : undefined;
    if (!pending) throw new NotFoundException('Código inválido o caducado');
    if (pending.userId) throw alreadyConfirmed();
    pending.userId = userId;
    return { ok: true };
  }

  async poll(raw: unknown, ip: string) {
    // El sondeo normal es de una petición cada pocos segundos; el tope solo frena el abuso
    await this.throttle.consume(`device-poll:${ip}`, 120, 60_000);
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
        if (res.kind === 'pending') return { status: 'pending' as const };
        if (res.kind === 'confirmed') return { status: 'confirmed' as const, ...(await this.auth.issueSession(res.userId)) };
        // 'missing': puede ser una vinculación iniciada con el respaldo en memoria
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
