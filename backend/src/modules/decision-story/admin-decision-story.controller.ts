import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { SYSTEM_AI_BUDGET_SCOPE } from '../ai/system-ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { ManagedBudgetService } from '../billing/managed-budget.service';
import { StoredScenes } from '../game-data/story-data.schemas';
import { sceneCounts } from './decision-story.engine';
import { DecisionStoryGenerator } from './decision-story.generator';
import { StoryRegenerateDto, storyRegenerateSchema } from './decision-story.schemas';

/** Panel del generador de historias. Gasta presupuesto de IA: mismo permiso que la facturación. */
@ApiTags('Admin Stories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('billing:manage')
@Controller('admin/stories')
export class AdminDecisionStoryController {
  constructor(
    private readonly generator: DecisionStoryGenerator,
    private readonly prisma: PrismaService,
    private readonly budget: ManagedBudgetService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Historias de un día con su origen, coste y votos por opción' })
  async list(@Query('day') day?: string) {
    const target = day ?? this.generator.bucketDay();
    if (!target || !/^\d{4}-\d{2}-\d{2}$/.test(target)) throw new BadRequestException('day debe ser YYYY-MM-DD');
    const stories = await this.prisma.decisionStory.findMany({
      where: { day: target },
      orderBy: { slot: 'asc' },
      include: { tallies: true, _count: { select: { plays: true } } },
    });
    return {
      day: target,
      systemAiSpendTodayUsd: await this.budget.getScopedSpendUsd(SYSTEM_AI_BUDGET_SCOPE),
      stories: stories.map((s) => {
        const scenes = (s.scenes as unknown as StoredScenes).scenes;
        return {
          id: s.id,
          slot: s.slot,
          title: s.title,
          synopsis: s.synopsis,
          source: s.source,
          arcKey: s.arcKey,
          arcChapter: s.arcChapter,
          closedAt: s.closedAt,
          canonSummary: s.canonSummary,
          model: s.model,
          costUsd: s.costUsd,
          plays: s._count.plays,
          scenes: scenes.map((scene, i) => {
            const counts = sceneCounts(scene, i, s.tallies);
            return {
              locationId: scene.locationId,
              event: scene.event.text,
              choices: scene.choices.map((c, k) => ({ label: c.label, score: c.score, votes: counts[k] })),
            };
          }),
        };
      }),
    };
  }

  @Post('regenerate')
  @ApiOperation({ summary: 'Teje ahora las historias que falten de un día (opcionalmente, reemplaza las que nadie ha empezado)' })
  async regenerate(@Body(new ZodPipe(storyRegenerateSchema)) body: StoryRegenerateDto) {
    const day = body.day ?? this.generator.bucketDay();
    if (!day) throw new BadRequestException('La aventura diaria no tiene datos de juego');
    let removed = 0;
    if (body.replace) {
      // Las historias con partidas no se tocan: borrarlas se llevaría las respuestas de los usuarios
      const res = await this.prisma.decisionStory.deleteMany({ where: { day, plays: { none: {} } } });
      removed = res.count;
    }
    const report = await this.generator.generateForDay(day, { allowFallback: body.allowFallback });
    return { removed, ...report };
  }
}
