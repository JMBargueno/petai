import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

export const VALID_SCOPES = ['read:pets', 'read:leaderboard', 'read:events', 'webhooks'] as const;
export type ApiKeyScope = (typeof VALID_SCOPES)[number];

export interface CreateApiKeyDto {
  name: string;
  scopes: string[];
}

const MAX_KEYS_PER_USER = 5;
const RATE_LIMIT_PER_MIN = 100;

/**
 * ApiKeyService — Feature 025. CRUD de API keys con hash (SHA-256), verificación de
 * scope y rate limiting por key (Redis con respaldo en DB).
 */
@Injectable()
export class ApiKeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Crea una API key. El plaintext solo se devuelve una vez; se persiste el hash. */
  async create(userId: string, dto: CreateApiKeyDto) {
    if (!dto.name?.trim()) throw new NotFoundException('name es requerido');
    const scopes = (dto.scopes ?? []).filter((s) => VALID_SCOPES.includes(s as ApiKeyScope));
    if (scopes.length === 0) {
      throw new HttpException(
        `scopes inválidos (válidos: ${VALID_SCOPES.join(', ')})`,
        400,
      );
    }

    const count = await this.prisma.apiKey.count({ where: { userId } });
    if (count >= MAX_KEYS_PER_USER) {
      throw new ConflictException(`Máximo ${MAX_KEYS_PER_USER} API keys por usuario`);
    }

    const plaintext = `petai_key_${randomBytes(24).toString('hex')}`;
    const keyHash = this.hash(plaintext);

    const record = await this.prisma.apiKey.create({
      data: { userId, name: dto.name.trim(), keyHash, scopes },
    });

    return {
      id: record.id,
      name: record.name,
      key: plaintext, // única vez
      scopes: record.scopes as string[],
      createdAt: record.createdAt,
    };
  }

  /** Lista las keys del usuario (sin el key plaintext, solo hash + metadatos). */
  async list(userId: string) {
    const keys = await this.prisma.apiKey.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      scopes: k.scopes as string[],
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
      createdAt: k.createdAt,
    }));
  }

  /** Revoca una key (solo su dueño). */
  async revoke(userId: string, id: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('API key no encontrada');
    if (key.userId !== userId) throw new HttpException('No es tu API key', 403);
    if (key.revokedAt) return { message: 'Ya revocada' };

    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    return { message: 'API key revocada', id };
  }

  /**
   * Verifica un key plaintext: hash SHA-256, valida que no esté revocada y la devuelve.
   */
  async verify(plaintext: string) {
    const keyHash = this.hash(plaintext);
    const record = await this.prisma.apiKey.findUnique({ where: { keyHash } });
    if (!record) throw new UnauthorizedException('API key inválida');
    if (record.revokedAt) throw new UnauthorizedException('API key revocada');
    return {
      id: record.id,
      userId: record.userId,
      name: record.name,
      scopes: record.scopes as string[],
    };
  }

  /** Rate limit: 100 req/min por API key (Redis sliding window, respaldo en DB). */
  async enforceRateLimit(keyId: string): Promise<void> {
    const windowKey = this.redis.key(`apikey:rl:${keyId}:${Math.floor(Date.now() / 60000)}`);
    // S-16: INCR + PEXPIRE atómico (antes hacía GET→INCR, con carrera, y la clave nunca expiraba →
    // una key en Redis por key/minuto para siempre). La caducidad se fija solo en el primer INCR.
    const count = await this.redis.run(async (r) => {
      const n = await r.incr(windowKey);
      if (n === 1) await r.pexpire(windowKey, 60_000);
      return n;
    });

    if (count === null) return; // Redis caído → sin rate limit (fallback permisivo)
    if (count > RATE_LIMIT_PER_MIN) {
      throw new HttpException('Rate limit excedido (100 req/min)', 429);
    }
  }

  /**
   * Actualiza `lastUsedAt` con throttle (máx 1 write/min) para no saturar la BD en
   * endpoints de alto tráfico.
   */
  async touchLastUsed(keyId: string): Promise<void> {
    const lockKey = this.redis.key(`apikey:lastused:${keyId}:${Math.floor(Date.now() / 60000)}`);
    // S-16: la clave de throttle ahora expira (antes `SETNX` sin TTL dejaba claves para siempre).
    const allowed = await this.redis.run(async (r) => {
      const ok = await r.setnx(lockKey, '1');
      if (ok === 1) await r.pexpire(lockKey, 60_000);
      return ok;
    });
    if (allowed !== 1) return; // ya se tocó en este minuto
    await this.prisma.apiKey.update({ where: { id: keyId }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }

  private hash(plaintext: string): string {
    return createHash('sha256').update(plaintext).digest('hex');
  }
}