import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

/** Sondas para balanceadores y orquestadores (sin autenticación y sin datos sensibles). */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness: el proceso responde' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: PostgreSQL responde (Redis es opcional: solo degrada)' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'down', database: 'down' });
    }
    const pong = await this.redis.run((r) => r.ping());
    return { status: 'ok', database: 'up', redis: pong === 'PONG' ? 'up' : 'degraded' };
  }
}
