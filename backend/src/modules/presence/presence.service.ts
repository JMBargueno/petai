import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';

/**
 * Presence Service — tracks device presence via Redis.
 * Feature 021: Multi-Device Presence + Co-op
 *
 * Modelo Redis-backed y multi-réplica: en vez de un Map en memoria por proceso, cada usuario
 * tiene UN hash de Redis cuya clave es `presence:<userId>` (con el prefijo de entorno de
 * `RedisService.key`, p. ej. `petai:development:presence:<userId>`). Cada campo es un `deviceId`
 * y su valor es el JSON `{ platform, lastHeartbeat }` (lastHeartbeat en ms epoch). El hash lleva
 * un TTL de 90s (`EXPIRE_MS`) que se refresca con `PEXPIRE` en cada heartbeat: cuando un dispositivo
 * deja de enviar heartbeats, el hash caduca solo y la presencia desaparece globalmente, sin
 * depender de `cleanup()` y de forma coherente entre réplicas/procesos del backend.
 *
 * Todas las operaciones son ASÍNCRONAS y TOLERANTES A FALLOS: si Redis no responde
 * (`RedisService.run` devuelve null), se degrada (heartbeat no-op, `getPresence` → `[]`,
 * `hasActiveDevices` → `false`) y NUNCA lanza.
 */
export interface DevicePresenceInfo {
  deviceId: string;
  platform: string;
  lastHeartbeat: number; // unix ms
  status: 'online' | 'offline';
}

const EXPIRE_MS = 90000; // 90s

@Injectable()
export class PresenceService implements OnModuleInit {
  private readonly logger = new Logger(PresenceService.name);
  private warned = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('PresenceService initialized');
  }

  private presenceKey(userId: string): string {
    return this.redis.key(`presence:${userId}`);
  }

  /** Avisa una única vez (hasta que Redis vuelve) si un heartbeat no pudo persistirse. */
  private warnDown(): void {
    if (!this.warned) {
      this.warned = true;
      this.logger.warn('Redis no disponible: los heartbeats de presencia no se están persistiendo');
    }
  }

  /**
   * Record a heartbeat for a device: escribe el campo del dispositivo en el hash y refresca el
   * TTL de 90s. Fault-tolerant: si Redis falla se degrada sin lanzar.
   */
  async heartbeat(userId: string, deviceId: string, platform: string): Promise<void> {
    const key = this.presenceKey(userId);
    const result = await this.redis.run(async (r) => {
      await r.hset(key, deviceId, JSON.stringify({ platform, lastHeartbeat: Date.now() }));
      await r.pexpire(key, EXPIRE_MS);
    }, 'presence.set');
    if (result === null) this.warnDown();
  }

  /**
   * Get all device presences for a user. Un dispositivo sin heartbeat en 90s se marca offline.
   * Fault-tolerant: si Redis falla devuelve `[]`.
   */
  async getPresence(userId: string): Promise<DevicePresenceInfo[]> {
    const key = this.presenceKey(userId);
    const hash = await this.redis.run((r) => r.hgetall(key), 'presence.get');
    if (hash === null) return [];

    const now = Date.now();
    return Object.entries(hash).map(([deviceId, raw]) => {
      let platform = 'unknown';
      let lastHeartbeat = 0;
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.platform === 'string') platform = parsed.platform;
        if (typeof parsed?.lastHeartbeat === 'number') lastHeartbeat = parsed.lastHeartbeat;
      } catch {
        /* valor corrupto: se mantiene por defecto */
      }
      return {
        deviceId,
        platform,
        lastHeartbeat,
        status: now - lastHeartbeat < EXPIRE_MS ? 'online' : 'offline',
      };
    });
  }

  /**
   * Check if a user has at least one online device. PTTL > 0 significa que el hash (y por tanto un
   * heartbeat dentro de 90s) sigue vivo. Fault-tolerant: si Redis falla devuelve `false`.
   */
  async hasActiveDevices(userId: string): Promise<boolean> {
    const key = this.presenceKey(userId);
    const ttl = await this.redis.run((r) => r.pttl(key), 'presence.pttl');
    if (ttl === null) return false;
    return ttl > 0;
  }

  /**
   * Remove a device (disconnection). Fault-tolerant: si Redis falla se degrada sin lanzar.
   */
  async removeDevice(userId: string, deviceId: string): Promise<void> {
    const key = this.presenceKey(userId);
    await this.redis.run((r) => r.hdel(key, deviceId), 'presence.del');
  }

  /**
   * No-op: el TTL de Redis ya expira las presencias caducadas. Se mantiene el método para no
   * romper llamadas existentes.
   */
  cleanup(): number {
    return 0;
  }
}
