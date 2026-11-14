import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SandboxService } from './sandbox.service';

export type ModType = 'species' | 'furniture' | 'minigame';

export interface PublishModDto {
  type: ModType;
  name: string;
  description: string;
  element?: string;
  rarity?: string;
  data: Record<string, unknown>;
  sprite?: string;
  spriteUrl?: string;
  minigameCode?: string;
  minigameUrl?: string;
}

export interface WorkshopFilters {
  type?: ModType;
  element?: string;
  rarity?: string;
  sort?: 'downloads' | 'rating' | 'newest';
  page?: number;
  limit?: number;
  q?: string;
}

const VALID_TYPES: ModType[] = ['species', 'furniture', 'minigame'];
const VALID_RARITIES = ['common', 'rare', 'super_rare', 'legendary', 'mythic'];
const MAX_FEATURED = 10;
const MIN_RATINGS_FOR_AVERAGE = 3;
const MAX_REPORTS_BEFORE_HIDE = 3;
const MODS_PER_DAY = 5;
const STAT_MAX = 999;

@Injectable()
export class ModdingService {
  private readonly logger = new Logger(ModdingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sandbox: SandboxService,
  ) {}

  async publish(userId: string, dto: PublishModDto) {
    if (!VALID_TYPES.includes(dto.type)) {
      throw new BadRequestException(`Tipo de mod inválido: ${dto.type}`);
    }
    if (!dto.name?.trim() || !dto.data) {
      throw new BadRequestException('Faltan campos obligatorios (name, data)');
    }

    await this.enforceRateLimit(userId);

    if (dto.sprite) this.sandbox.validateSprite(dto.sprite);
    if (dto.type === 'minigame' && dto.minigameCode) {
      this.sandbox.validateMinigame(dto.minigameCode);
    }

    if (dto.rarity && !VALID_RARITIES.includes(dto.rarity)) {
      throw new BadRequestException(`Rarity inválida: ${dto.rarity}`);
    }
    this.validateData(dto.type, dto.data);

    const mod = await this.prisma.mod.create({
      data: {
        creatorId: userId,
        type: dto.type,
        name: dto.name.trim(),
        description: dto.description ?? '',
        element: dto.element ?? null,
        rarity: dto.rarity ?? null,
        data: dto.data as object,
        spriteUrl: dto.spriteUrl ?? (dto.sprite ? `inline://${userId}/${dto.name}` : null),
        minigameUrl: dto.minigameUrl ?? null,
        status: 'published',
      },
    });

    return this.toPublic(mod);
  }

  async getById(id: string) {
    const mod = await this.prisma.mod.findUnique({ where: { id } });
    if (!mod || mod.status === 'deleted') throw new NotFoundException('Mod no encontrado');
    return this.toPublic(mod);
  }

  async workshop(filters: WorkshopFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(50, Math.max(1, filters.limit ?? 20));

    const where: Record<string, unknown> = { status: 'published' };
    if (filters.type) where.type = filters.type;
    if (filters.element) where.element = filters.element;
    if (filters.rarity) where.rarity = filters.rarity;
    if (filters.q) {
      where.name = { contains: filters.q, mode: 'insensitive' as const };
    }

    const orderBy =
      filters.sort === 'downloads'
        ? { downloads: 'desc' as const }
        : filters.sort === 'rating'
          ? { avgRating: 'desc' as const }
          : { createdAt: 'desc' as const };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.mod.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
      this.prisma.mod.count({ where }),
    ]);

    return {
      items: items.map((m) => this.toPublic(m)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async rate(userId: string, modId: string, stars: number, rating?: string) {
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      throw new BadRequestException('stars debe ser un entero entre 1 y 5');
    }
    const mod = await this.prisma.mod.findUnique({ where: { id: modId } });
    if (!mod || mod.status === 'deleted') throw new NotFoundException('Mod no encontrado');

    await this.prisma.modRating.upsert({
      where: { modId_userId: { modId, userId } },
      update: { stars, rating: rating ?? null },
      create: { modId, userId, stars, rating: rating ?? null },
    });

    const agg = await this.prisma.modRating.aggregate({
      where: { modId },
      _count: { _all: true },
      _avg: { stars: true },
    });
    const count = agg._count._all;
    const avg = agg._avg.stars ? Math.round(agg._avg.stars * 100) / 100 : 0;

    await this.prisma.mod.update({
      where: { id: modId },
      data: { avgRating: avg, ratingCount: count },
    });

    return {
      modId,
      average: avg,
      count,
      showAverage: count >= MIN_RATINGS_FOR_AVERAGE,
    };
  }

  async report(userId: string, modId: string, reason: string, details?: string) {
    const mod = await this.prisma.mod.findUnique({ where: { id: modId } });
    if (!mod || mod.status === 'deleted') throw new NotFoundException('Mod no encontrado');

    // S-17: un usuario solo puede reportar un mod una vez. Sin esto, una cuenta que reportara
    // `MAX_REPORTS_BEFORE_HIDE` veces ocultaría cualquier mod.
    const existing = await this.prisma.modReport.findFirst({ where: { modId, userId } });
    if (existing) throw new ConflictException('Ya has reportado este mod');

    const report = await this.prisma.modReport.create({
      data: { modId, userId, reason: reason ?? 'inapropiado', details: details ?? null },
    });

    const updated = await this.prisma.mod.update({
      where: { id: modId },
      data: { reportCount: { increment: 1 } },
    });

    let hidden = false;
    if (updated.reportCount >= MAX_REPORTS_BEFORE_HIDE && updated.status === 'published') {
      await this.prisma.mod.update({ where: { id: modId }, data: { status: 'hidden' } });
      hidden = true;
      this.logger.warn(`Mod ${modId} auto-hidden por ${updated.reportCount} reports`);
    }

    return { reportId: report.id, reportCount: updated.reportCount, hidden };
  }

  async download(userId: string, modId: string, petId?: string) {
    const mod = await this.prisma.mod.findUnique({ where: { id: modId } });
    if (!mod || mod.status === 'deleted') throw new NotFoundException('Mod no encontrado');
    if (mod.status === 'hidden') {
      throw new HttpException('Este mod está en revisión y no puede descargarse', 403);
    }

    const existing = await this.prisma.modDownload.findUnique({
      where: { modId_userId_petId: { modId, userId, petId: petId ?? null } },
    });
    if (!existing) {
      await this.prisma.modDownload.create({ data: { modId, userId, petId: petId ?? null } });
      await this.prisma.mod.update({ where: { id: modId }, data: { downloads: { increment: 1 } } });
    }

    return {
      message: 'Mod descargado',
      snapshot: mod.data,
      minigameSandbox: mod.type === 'minigame' ? this.sandbox.workerConfig() : undefined,
    };
  }

  async update(userId: string, modId: string, dto: Partial<PublishModDto>) {
    const mod = await this.prisma.mod.findUnique({ where: { id: modId } });
    if (!mod) throw new NotFoundException('Mod no encontrado');
    if (mod.creatorId !== userId) throw new ForbiddenException('Solo el creator puede editar');
    if (mod.status === 'deleted') throw new ConflictException('El mod fue borrado');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.element !== undefined) data.element = dto.element;
    if (dto.rarity !== undefined) {
      if (dto.rarity && !VALID_RARITIES.includes(dto.rarity)) {
        throw new BadRequestException(`Rarity inválida: ${dto.rarity}`);
      }
      data.rarity = dto.rarity;
    }
    if (dto.data !== undefined) {
      this.validateData(mod.type as ModType, dto.data);
      data.data = dto.data as object;
    }
    if (dto.sprite) data.spriteUrl = `inline://${userId}/${dto.name ?? mod.name}`;
    if (dto.spriteUrl !== undefined) data.spriteUrl = dto.spriteUrl;
    if (dto.minigameUrl !== undefined) data.minigameUrl = dto.minigameUrl;

    const updated = await this.prisma.mod.update({ where: { id: modId }, data });
    return this.toPublic(updated);
  }

  async remove(userId: string, modId: string) {
    const mod = await this.prisma.mod.findUnique({ where: { id: modId } });
    if (!mod) throw new NotFoundException('Mod no encontrado');
    if (mod.creatorId !== userId) throw new ForbiddenException('Solo el creator puede borrar');

    await this.prisma.mod.update({ where: { id: modId }, data: { status: 'deleted' } });
    return { message: 'Mod borrado', snapshotPreserved: true };
  }

  async setFeatured(modId: string, featured: boolean) {
    if (featured) {
      const count = await this.prisma.mod.count({ where: { isFeatured: true, status: 'published' } });
      if (count >= MAX_FEATURED) {
        throw new ConflictException(`Máximo ${MAX_FEATURED} mods featured simultáneos`);
      }
    }
    const updated = await this.prisma.mod.update({ where: { id: modId }, data: { isFeatured: featured } });
    return this.toPublic(updated);
  }

  private validateData(type: ModType, data: Record<string, unknown>): void {
    if (type === 'species') {
      const stats = (data.stats ?? data.baseStats) as Record<string, unknown> | undefined;
      if (!stats || typeof stats !== 'object') {
        throw new BadRequestException('Especie requiere stats en data');
      }
      for (const value of Object.values(stats)) {
        if (typeof value === 'number' && value > STAT_MAX) {
          throw new BadRequestException(`Stat excede el máximo permitido (${STAT_MAX})`);
        }
      }
      if (!data.element) throw new BadRequestException('Especie requiere element');
    } else if (type === 'furniture') {
      if (!data.buff && !data.effect) {
        throw new BadRequestException('Mueble requiere buff/effect en data');
      }
    } else if (type === 'minigame') {
      if (!data.api) throw new BadRequestException('Minigame requiere la API limitada en data');
    }
  }

  private async enforceRateLimit(userId: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const redisKey = this.redis.key(`modding:publish:${userId}:${today}`);
    // R-05: el contador diario caduca al terminar el día (antes no se fijaba TTL).
    const secondsUntilEod = Math.max(60, Math.ceil((new Date(`${today}T23:59:59.999Z`).getTime() - Date.now()) / 1000));
    const current = await this.redis.run(async (r) => {
      const val = await r.get(redisKey);
      return val ? parseInt(val, 10) : null;
    });

    if (current === null) {
      const since = new Date(`${today}T00:00:00.000Z`);
      const count = await this.prisma.mod.count({
        where: { creatorId: userId, createdAt: { gte: since } },
      });
      if (count >= MODS_PER_DAY) {
        throw new HttpException('Límite de publicaciones alcanzado (5/día)', 429);
      }
      // Sembrar el contador desde el historial del día y fijar la caducidad. Antes el contador
      // nunca se escribía en Redis (siempre caía en la BD) y, por tanto, no llevaba TTL.
      await this.redis.run(async (r) => {
        await r.set(redisKey, String(count), 'EX', secondsUntilEod);
        await r.incr(redisKey); // +1 por la publicación que se está validando
      });
      return;
    }

    if (current >= MODS_PER_DAY) {
      throw new HttpException('Límite de publicaciones alcanzado (5/día)', 429);
    }
    await this.redis.run((r) => r.incr(redisKey));
  }

  private toPublic(mod: {
    id: string;
    creatorId: string;
    type: string;
    name: string;
    description: string;
    element: string | null;
    rarity: string | null;
    data: unknown;
    spriteUrl: string | null;
    minigameUrl: string | null;
    status: string;
    downloads: number;
    avgRating: number;
    ratingCount: number;
    reportCount: number;
    isFeatured: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: mod.id,
      creatorId: mod.creatorId,
      type: mod.type,
      name: mod.name,
      description: mod.description,
      element: mod.element,
      rarity: mod.rarity,
      data: mod.data,
      spriteUrl: mod.spriteUrl,
      minigameUrl: mod.minigameUrl,
      status: mod.status,
      downloads: mod.downloads,
      avgRating: mod.ratingCount >= MIN_RATINGS_FOR_AVERAGE ? mod.avgRating : null,
      ratingCount: mod.ratingCount,
      reportCount: mod.reportCount,
      isFeatured: mod.isFeatured,
      createdAt: mod.createdAt,
      updatedAt: mod.updatedAt,
    };
  }
}

