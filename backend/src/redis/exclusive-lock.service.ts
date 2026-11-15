import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from './redis.service';

/**
 * Guard distribuido "una operación a la vez por (scope, clave)" (R-02).
 *
 * Evita que varias peticiones del mismo recurso (p. ej. una pelea o una respuesta de chat por
 * usuario) se ejecuten en paralelo. Antes cada módulo usaba un `Set`/`Map` **en memoria del
 * proceso**: con una réplica iba bien, pero con varias (lo que habilita el adaptador de Redis de
 * Socket.IO) dos peticiones en réplicas distintas podían pasar el check y lanzar la operación en
 * paralelo (doble gasto de LLM, doble delta de ELO, doble límite diario…). Ahora el guard vive en
 * Redis (`SET key token NX` + TTL) y lo respetan todas las réplicas entre sí.
 *
 * Tolerante a fallos: si Redis no está disponible, degrada a un guard en memoria del proceso
 * (fail-open). El TTL es una red de seguridad: si una réplica muere a mitad de operación, la
 * llave expira sola y el guard no queda atrapado.
 */
@Injectable()
export class ExclusiveLockService {
  private readonly ttlMs = 60_000;

  // Respaldo a una sola réplica cuando Redis no está disponible. Clave compuesta: `${scope}:${key}`.
  private readonly fallback = new Set<string>();

  constructor(private readonly redis: RedisService) {}

  /**
   * Ejecuta `fn` bajo el guard (una operación a la vez por `scope`+`key`). Lanza `429` si ya hay
   * una en curso. El guard se libera en `finally`, de modo que una operación que falle no bloquea.
   */
  async runExclusive<T>(scope: string, key: string, fn: () => Promise<T>, ttlMs?: number): Promise<T> {
    const lock = await this.acquire(scope, key, ttlMs);
    if (!lock.ok) throw new HttpException('Ya hay una operación en curso', HttpStatus.TOO_MANY_REQUESTS);
    try {
      return await fn();
    } finally {
      await this.release(scope, key, lock.token);
    }
  }

  /**
   * Adquiere el guard de forma explícita (para flujos en streaming/generadores donde no se puede
   * envolver la operación en una sola llamada). `ok=false` si ya hay una en curso; el llamante
   * debe soltarla con `release(scope, key, token)` (idealmente en un `finally`).
   */
  async acquire(scope: string, key: string, ttlMs?: number): Promise<{ ok: boolean; token: string }> {
    const ttl = ttlMs ?? this.ttlMs;
    const redisKey = this.redis.key(`exclusive:${scope}:${key}`);
    const token = randomBytes(16).toString('hex');

    const res = await this.redis.run(async (client) => {
      const r = await client.set(redisKey, token, 'PX', ttl, 'NX');
      return r === 'OK' ? ('acquired' as const) : ('held' as const);
    }, 'exclusive.lock.acquire');

    if (res === 'acquired') return { ok: true, token };
    if (res === 'held') return { ok: false, token };

    // Redis no disponible (run → null): guard en memoria del proceso.
    const fbKey = `${scope}:${key}`;
    if (this.fallback.has(fbKey)) return { ok: false, token };
    this.fallback.add(fbKey);
    return { ok: true, token };
  }

  /**
   * Suelta el guard. Idempotente: el borrado en Redis es *compare-and-delete* (solo si el token
   * sigue siendo el propio, por si el TTL expiró y otra operación tomó el lock) y la limpieza en
   * memoria es un no-op si no estaba.
   */
  async release(scope: string, key: string, token: string): Promise<void> {
    this.fallback.delete(`${scope}:${key}`);
    const redisKey = this.redis.key(`exclusive:${scope}:${key}`);
    await this.redis.run(
      (client) =>
        client.eval(
          `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
          1,
          redisKey,
          token,
        ),
      'exclusive.lock.release',
    );
  }
}
