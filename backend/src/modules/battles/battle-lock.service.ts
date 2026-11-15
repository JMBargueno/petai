import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from '../../redis/redis.service';

/**
 * Guard distribuido "una pelea a la vez por usuario" (R-02).
 *
 * Antes, el guard era un `Set` en memoria del proceso: con una sola réplica funcionaba, pero con
 * varias (lo que habilita el adaptador de Redis de Socket.IO) dos peticiones del mismo usuario en
 * réplicas distintas podían pasar el check y lanzar dos peleas en paralelo (doble conteo diario,
 * doble ELO, doble gasto de energía). Ahora el guard vive en Redis (`SET key token NX` + TTL),
 * de modo que todas las réplicas lo respetan entre sí.
 *
 * Tolerante a fallos: si Redis no está disponible, degrada a un guard en memoria del proceso
 * (fail-open, misma semántica que antes del fix), para que una réplica solitaria siga funcionando.
 * El TTL es una red de seguridad: si una réplica muere a mitad de pelea, la llave expira sola.
 */
@Injectable()
export class BattleLockService {
  /** Red de seguridad: más que cualquier pelea (síncrona, <segundos), breve ante un crash de réplica. */
  private readonly ttlMs = 60_000;

  // Respaldo a una sola réplica cuando Redis no está disponible.
  private readonly fallback = new Set<string>();

  constructor(private readonly redis: RedisService) {}

  /**
   * Ejecuta `fn` bajo el guard "una pelea a la vez por usuario". Lanza `429` si ya hay una en curso.
   * El guard se libera en `finally`, de modo que una pelea que falle (o termine) no bloquea al usuario.
   */
  async runExclusive<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const key = this.redis.key(`battle:active:${userId}`);
    const token = randomBytes(16).toString('hex');

    const res = await this.redis.run(async (client) => {
      const r = await client.set(key, token, 'PX', this.ttlMs, 'NX');
      return r === 'OK' ? ('acquired' as const) : ('held' as const);
    }, 'battle.lock.acquire');

    let viaRedis = res === 'acquired';
    if (res === 'held') {
      throw new HttpException('Ya hay una pelea en curso', HttpStatus.TOO_MANY_REQUESTS);
    }

    if (!viaRedis) {
      // Redis no disponible (run → null): guard en memoria del proceso.
      if (this.fallback.has(userId)) {
        throw new HttpException('Ya hay una pelea en curso', HttpStatus.TOO_MANY_REQUESTS);
      }
      this.fallback.add(userId);
    }

    try {
      return await fn();
    } finally {
      if (viaRedis) {
        await this.releaseRedis(key, token);
      } else {
        this.fallback.delete(userId);
      }
    }
  }

  /**
   * Libera la llave solo si aún la tiene el token propio (compare-and-delete vía Lua): el TTL pudo
   * haber expirado y otra pelea haber tomado el lock entretanto; no queremos borrar ese otro lock.
   */
  private async releaseRedis(key: string, token: string) {
    await this.redis.run(
      (client) =>
        client.eval(
          `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
          1,
          key,
          token,
        ),
      'battle.lock.release',
    );
  }
}
