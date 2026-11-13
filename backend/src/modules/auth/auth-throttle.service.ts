import { HttpException, HttpStatus, Injectable, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';

const MINUTE = 60_000;
const MAX_KEYS = 50_000;

/**
 * Límite de intentos para registro, login y refresh (ventana deslizante en memoria).
 *
 * - Login: los intentos FALLIDOS se cuentan por cuenta+IP (frena la adivinanza de una contraseña) y
 *   por IP (frena el barrido de muchas cuentas). Un acierto reinicia el contador de esa cuenta.
 * - Registro y refresh: se cuentan todas las peticiones por IP.
 *
 * Almacén: Redis (ZSET por clave, compartido entre instancias del backend) y, si Redis no responde o
 * no está configurado, un mapa en memoria por instancia. En tests (NODE_ENV=test) está desactivado salvo que se fuerce con
 * AUTH_RATE_LIMIT_FORCE=true.
 */
@Injectable()
export class AuthThrottleService {
  private readonly hits = new Map<string, number[]>();
  private ops = 0;

  constructor(private readonly config: ConfigService, @Optional() private readonly redis?: RedisService) {}

  private rkey(key: string) {
    return this.redis!.key(`throttle:${key}`);
  }

  private get enabled(): boolean {
    if (this.config.get<string>('AUTH_RATE_LIMIT_DISABLED') === 'true') return false;
    if (this.config.get<string>('NODE_ENV') === 'test' && this.config.get<string>('AUTH_RATE_LIMIT_FORCE') !== 'true') {
      return false;
    }
    return true;
  }

  private num(key: string, fallback: number): number {
    const v = Number(this.config.get(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  }

  get limits() {
    return {
      loginFailsPerAccount: this.num('AUTH_LOGIN_MAX_FAILS_PER_ACCOUNT', 10),
      loginFailsPerIp: this.num('AUTH_LOGIN_MAX_FAILS_PER_IP', 100),
      loginWindowMs: this.num('AUTH_LOGIN_WINDOW_MINUTES', 15) * MINUTE,
      registerPerIp: this.num('AUTH_REGISTER_MAX_PER_IP', 10),
      registerWindowMs: 60 * MINUTE,
      refreshPerIp: this.num('AUTH_REFRESH_MAX_PER_MINUTE', 60),
      refreshWindowMs: MINUTE,
    };
  }

  private recent(key: string, windowMs: number): number[] {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length === 0) this.hits.delete(key);
    else this.hits.set(key, list);
    return list;
  }

  /** Intentos dentro de la ventana: Redis si está disponible, memoria si no. */
  private async count(key: string, windowMs: number): Promise<number> {
    if (this.redis) {
      const n = await this.redis.run(async (r) => {
        const k = this.rkey(key);
        await r.zremrangebyscore(k, 0, Date.now() - windowMs);
        return r.zcard(k);
      });
      if (n !== null) return n;
    }
    return this.recent(key, windowMs).length;
  }

  private prune() {
    // Se limpian entradas antiguas de vez en cuando para que el mapa no crezca sin límite
    if (++this.ops % 500 !== 0 && this.hits.size < MAX_KEYS) return;
    const now = Date.now();
    const longest = Math.max(this.limits.loginWindowMs, this.limits.registerWindowMs);
    for (const [k, list] of this.hits) {
      if (list.length === 0 || now - list[list.length - 1] > longest) this.hits.delete(k);
    }
    if (this.hits.size >= MAX_KEYS) this.hits.clear(); // último recurso ante un ataque masivo
  }

  private tooMany(windowMs: number): HttpException {
    return new HttpException(
      { statusCode: 429, message: 'Demasiados intentos. Inténtalo de nuevo más tarde.', retryAfterSeconds: Math.ceil(windowMs / 1000) },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Lanza 429 si ya se alcanzó el máximo (sin registrar un intento nuevo). */
  async assertBelow(key: string, max: number, windowMs: number) {
    if (!this.enabled) return;
    this.prune();
    if ((await this.count(key, windowMs)) >= max) throw this.tooMany(windowMs);
  }

  /** Registra un intento. */
  async add(key: string, windowMs: number) {
    if (!this.enabled) return;
    if (this.redis) {
      const ok = await this.redis.run(async (r) => {
        const k = this.rkey(key);
        const now = Date.now();
        await r.multi().zadd(k, now, `${now}-${crypto.randomBytes(4).toString('hex')}`).pexpire(k, windowMs).exec();
        return true;
      });
      if (ok) return;
    }
    const list = this.recent(key, windowMs);
    list.push(Date.now());
    this.hits.set(key, list);
  }

  /** Comprueba el máximo y registra el intento (registro y refresh). */
  async consume(key: string, max: number, windowMs: number) {
    await this.assertBelow(key, max, windowMs);
    await this.add(key, windowMs);
  }

  async clear(key: string) {
    this.hits.delete(key);
    await this.redis?.run((r) => r.del(this.rkey(key)));
  }

  /** Borra todos los contadores (memoria y Redis). Solo para tests. */
  async reset() {
    this.hits.clear();
    await this.redis?.run(async (r) => {
      const keys = await r.keys(this.redis!.key('throttle:*'));
      if (keys.length) await r.del(...keys);
    });
  }
}
