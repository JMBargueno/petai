import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { CronLockService } from './cron-lock.service';
import { RedisCacheService } from './redis-cache.service';
import { ExclusiveLockService } from './exclusive-lock.service';

/**
 * Cliente de Redis compartido (tolerante a fallos) para limitadores, vinculación y clasificación,
 * bloqueo de crons, caché de lectura de vida corta (R-04) y guard "una operación a la vez"
 * distribuido (R-02).
 */
@Global()
@Module({
  providers: [RedisService, CronLockService, RedisCacheService, ExclusiveLockService],
  exports: [RedisService, CronLockService, RedisCacheService, ExclusiveLockService],
})
export class RedisModule {}
