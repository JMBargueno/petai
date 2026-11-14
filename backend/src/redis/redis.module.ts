import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { CronLockService } from './cron-lock.service';
import { RedisCacheService } from './redis-cache.service';

/**
 * Cliente de Redis compartido (tolerante a fallos) para limitadores, vinculación y clasificación,
 * bloqueo de crons y caché de lectura de vida corta (R-04).
 */
@Global()
@Module({
  providers: [RedisService, CronLockService, RedisCacheService],
  exports: [RedisService, CronLockService, RedisCacheService],
})
export class RedisModule {}
