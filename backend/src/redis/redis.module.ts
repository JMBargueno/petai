import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/** Cliente de Redis compartido (tolerante a fallos) para limitadores, vinculación y clasificación. */
@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
