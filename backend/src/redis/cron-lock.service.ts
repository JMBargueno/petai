import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from './redis.service';

/**
 * C-02 / SDD §3.3 — Bloqueo distribuido de crons.
 *
 * Ningún `@Cron` usaba bloqueo: con 2+ réplicas, cada tarea se ejecutaba N veces (dobles
 * liquidaciones, dobles rotaciones — S-14). Se adquiere con `SET key <token> NX PX ttlMs` (atómico)
 * y se libera con un CAS vía Lua (solo se borra si el token sigue siendo el propio).
 *
 * **Degradación (fail-closed):** `RedisService.run` devuelve `null` si Redis cae, así que
 * `acquire` devuelve `false` y la réplica **salta** el ciclo. Es aceptable: la réplica con Redis lo
 * ejecuta y, además, la acción real está protegida por el guard de estado atómico (S-14), por lo
 * que aunque dos réplicas llegaran a ejecutarlo no habría doble liquidación.
 */
@Injectable()
export class CronLockService {
  constructor(private readonly redis: RedisService) {}

  /** Esquema de clave: `petai:<env>:cron:<nombre>` (`RedisService.key()` añade el prefijo de entorno). */
  private key(name: string): string {
    return this.redis.key(`cron:${name}`);
  }

  /** Adquiere con `SET key <token> PX ttl NX`. Devuelve `true` solo si esta réplica es la única en la ventana. */
  async acquire(name: string, token: string, ttlMs: number): Promise<boolean> {
    const r = await this.redis.run((c) => c.set(this.key(name), token, 'PX', ttlMs, 'NX'), 'cron.lock.acquire');
    return r === 'OK';
  }

  /** Libera SOLO si el token sigue siendo el de esta réplica (CAS). Evita borrar el lock de otra réplica. */
  async release(name: string, token: string): Promise<void> {
    await this.redis.run(
      (c) =>
        c.eval(
          `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
          1,
          this.key(name),
          token,
        ),
      'cron.lock.release',
    );
  }

  /**
   * Helper para `@Cron`: devuelve el token si se adquirió el lock (el llamante ejecuta y luego
   * `release`), o `null` si otra réplica ya lo tiene (el llamante no hace nada).
   */
  async guard(name: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    return (await this.acquire(name, token, ttlMs)) ? token : null;
  }
}