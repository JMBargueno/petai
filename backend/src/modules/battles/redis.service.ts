import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Cliente de Redis tolerante a fallos: si Redis no está disponible, `run` devuelve null en vez de
 * lanzar, y quien lo usa recurre a un respaldo en PostgreSQL. Las claves llevan el prefijo del
 * entorno (petai:test:, petai:development:…) para que los tests no se mezclen con los datos reales.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private warned = false;
  readonly prefix: string;

  constructor(private readonly config: ConfigService) {
    this.prefix = `petai:${this.config.get<string>('NODE_ENV') ?? 'development'}:`;
  }

  key(name: string): string {
    return `${this.prefix}${name}`;
  }

  private getClient(): Redis {
    if (!this.client) {
      this.client = new Redis(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 1500,
        retryStrategy: (times) => Math.min(times * 500, 5000),
      });
      this.client.on('error', (err) => {
        if (!this.warned) {
          this.warned = true;
          this.logger.warn(`Redis no disponible (${err.message}); se usará el respaldo en la base de datos`);
        }
      });
      this.client.on('ready', () => {
        this.warned = false;
      });
    }
    return this.client;
  }

  /** Ejecuta una operación; devuelve null si Redis falla o no responde. */
  async run<T>(fn: (redis: Redis) => Promise<T>): Promise<T | null> {
    try {
      const client = this.getClient();
      if (client.status === 'wait' || client.status === 'end') await client.connect();
      return await fn(client);
    } catch (err: any) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(`Fallo de Redis (${err?.message}); se usará el respaldo en la base de datos`);
      }
      return null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }
}
