import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Caché de lectura de vida corta (R-04). Sirve desde Redis el resultado de una consulta "fría"
 * (varias lecturas a PostgreSQL de datos que cambian poco) durante un TTL breve (5–30 s), para que
 * las lecturas calientes no golpeen la base de datos en cada llamada.
 *
 * Tolerante a fallos: si `RedisService.run` devuelve `null` (Redis caído o sin valor) se recalcula
 * con `factory` y se intenta volver a cachear, sin lanzar.
 */
@Injectable()
export class RedisCacheService {
  constructor(private readonly redis: RedisService) {}

  /** Devuelve el valor JSON en caché para `key`, o `null` si no existe, está corrupto o Redis cae. */
  async get<T>(key: string): Promise<T | null> {
    return this.redis.run(async (r) => {
      const raw = await r.get(this.redis.key(key));
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    }, 'cache.get');
  }

  /** Escribe `value` en caché con un TTL breve (segundos). No lanza si Redis cae. */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.run(
      (r) => r.set(this.redis.key(key), JSON.stringify(value), 'EX', ttlSeconds),
      'cache.set',
    );
  }

  /**
   * Lectura cacheada: si hay valor fresco en Redis se sirve directamente; si no, se calcula con
   * `factory`, se cacha con `ttlSeconds` y se devuelve. (Un resultado `null` no se cacha: se trata
   * como ausencia y se recalcula, que para estas lecturas nunca se produce.)
   */
  async getOrSet<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await factory();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }
}
