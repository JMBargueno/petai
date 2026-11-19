import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingConfigService } from '../billing/billing-config.service';
import { DailyQuotaService } from '../billing/daily-quota.service';
import { EntitlementService } from '../billing/entitlement.service';
import { GameDataService } from '../game-data/game-data.service';
import { StoredScenes, StoryData, StoryScene } from '../game-data/story-data.schemas';
import { adventureEpisode } from '../mind/memory.engine';
import { PetsService } from '../pets/pets.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { publicScene, resolveOutcome, sceneCounts } from './decision-story.engine';
import { ActivityDropsService } from '../inventory/activity-drops.service';

const scenesOf = (story: { scenes: unknown }): StoryScene[] => (story.scenes as StoredScenes).scenes;

/**
 * Partidas de la aventura diaria: el bucket de hoy, empezar una historia (con el cupo del plan),
 * responder escena a escena y el historial de lo que contestó cada usuario.
 */
@Injectable()
export class DecisionStoryService {
  private readonly logger = new Logger(DecisionStoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly pets: PetsService,
    private readonly entitlement: EntitlementService,
    private readonly billingConfig: BillingConfigService,
    private readonly dailyQuota: DailyQuotaService,
    @Optional() private readonly realtime?: RealtimeGateway,
    @Optional() private readonly events?: EventEmitter2,
    // Drops de actividades (spec 41)
    @Optional() private readonly activityDrops?: ActivityDropsService,
  ) {}

  private data(): StoryData {
    const data = this.gameData.getStoryData();
    if (!data) throw new NotFoundException('La aventura diaria no está disponible');
    return data;
  }

  /** Día del bucket en curso: el más reciente que tenga historias (si hoy aún no se ha tejido, el anterior). */
  private async currentBucketDay(): Promise<string | null> {
    const latest = await this.prisma.decisionStory.findFirst({ orderBy: { day: 'desc' }, select: { day: true } });
    return latest?.day ?? null;
  }

  /** Cupo del usuario hoy (su día local): plan, límite y cuántas historias ha empezado. */
  private async quota(userId: string) {
    const plan = await this.entitlement.planFor(userId);
    const limit = (await this.billingConfig.limits(plan)).dailyStories;
    const { rawKey, resetsAt } = await this.dailyQuota.day(userId);
    // rawKey = `daily:<userId>:<YYYY-MM-DD>`: día local que nunca retrocede al cambiar de zona horaria
    const localDay = rawKey.slice(-10);
    const used = await this.prisma.decisionStoryPlay.count({ where: { userId, localDay } });
    return { plan, limit, used, localDay, resetsAt };
  }

  async today(userId: string) {
    this.data();
    const [day, quota] = await Promise.all([this.currentBucketDay(), this.quota(userId)]);
    const base = { day, plan: quota.plan, limit: quota.limit, used: quota.used, resetsAt: quota.resetsAt };
    if (!day) return { ...base, stories: [] };

    const stories = await this.prisma.decisionStory.findMany({
      where: { day },
      orderBy: { slot: 'asc' },
      include: { plays: { where: { userId } } },
    });
    const parentIds = stories.map((s) => s.parentStoryId).filter(Boolean);
    const parents = parentIds.length
      ? await this.prisma.decisionStory.findMany({ where: { id: { in: parentIds } }, select: { id: true, title: true, canonSummary: true } })
      : [];
    const parentById = new Map(parents.map((p) => [p.id, p]));

    return {
      ...base,
      stories: stories.map((s) => {
        const scenes = scenesOf(s);
        const play = s.plays[0];
        const parent = s.parentStoryId ? parentById.get(s.parentStoryId) : undefined;
        return {
          id: s.id,
          slot: s.slot,
          title: s.title,
          synopsis: s.synopsis,
          sceneCount: scenes.length,
          locationIds: scenes.map((sc) => sc.locationId),
          /** Crónica: capítulo de una historia que continúa día a día. */
          chronicle: s.arcKey ? { chapter: s.arcChapter, closes: s.closesArc } : null,
          /** Lo que decidió ayer la mayoría (solo en la Crónica, a partir del capítulo 2). */
          previously: parent?.canonSummary ? { title: parent.title, decided: parent.canonSummary } : null,
          rerun: s.source === 'rerun',
          play: play ? { status: play.status, sceneIndex: play.answers.length, outcome: play.outcome } : null,
        };
      }),
    };
  }

  /** Estado de una partida para pintarla o retomarla. */
  private playState(story: { id: string; title: string; synopsis: string; scenes: unknown }, play: { status: string; answers: number[]; outcome: string | null; score: number | null; xpAwarded: number; coinsAwarded: number }) {
    const scenes = scenesOf(story);
    const sceneIndex = play.answers.length;
    return {
      storyId: story.id,
      title: story.title,
      synopsis: story.synopsis,
      sceneCount: scenes.length,
      status: play.status,
      sceneIndex,
      /** Escena pendiente de respuesta (`null` si la historia ya terminó). */
      scene: sceneIndex < scenes.length ? publicScene(scenes[sceneIndex], sceneIndex) : null,
      answered: play.answers.map((optionIndex, i) => ({
        sceneIndex: i,
        optionIndex,
        label: scenes[i].choices[optionIndex]?.label ?? '',
        consequence: scenes[i].choices[optionIndex]?.consequence ?? '',
      })),
      result: play.status === 'completed' ? { outcome: play.outcome, score: play.score, rewards: { xp: play.xpAwarded, coins: play.coinsAwarded } } : null,
    };
  }

  /** Empieza una historia del bucket de hoy, o devuelve la partida si ya la había empezado. */
  async start(userId: string, storyId: string, petId: string) {
    this.data();
    const story = await this.prisma.decisionStory.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Historia no encontrada');

    const existing = await this.prisma.decisionStoryPlay.findUnique({ where: { userId_storyId: { userId, storyId } } });
    if (existing) return this.playState(story, existing);

    if (story.day !== (await this.currentBucketDay())) throw new BadRequestException('Esa historia ya no está en el bucket de hoy');
    const pet = await this.pets.getPetById(userId, petId);
    if (pet.sleeping) throw new BadRequestException('La mascota está durmiendo');

    const quota = await this.quota(userId);
    if (quota.used >= quota.limit) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'daily_stories_exceeded',
        message: quota.plan === 'pro' ? 'Ya has vivido todas tus historias de hoy.' : 'Ya has vivido tu historia de hoy. Con Pro puedes vivir más cada día.',
        plan: quota.plan,
        limit: quota.limit,
        resetsAt: quota.resetsAt,
      });
    }
    try {
      const play = await this.prisma.decisionStoryPlay.create({
        data: { userId, petId, storyId, localDay: quota.localDay, ordinal: quota.used, answers: [] },
      });
      return this.playState(story, play);
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      // Dos peticiones a la vez: o era esta misma historia (se devuelve) o se pisaron el cupo
      const raced = await this.prisma.decisionStoryPlay.findUnique({ where: { userId_storyId: { userId, storyId } } });
      if (raced) return this.playState(story, raced);
      throw new ConflictException('Ya estás empezando otra historia; inténtalo de nuevo');
    }
  }

  /** Responde la escena pendiente. En la última, cierra la partida y reparte las recompensas. */
  async answer(userId: string, storyId: string, sceneIndex: number, optionIndex: number) {
    const data = this.data();
    const play = await this.prisma.decisionStoryPlay.findUnique({ where: { userId_storyId: { userId, storyId } }, include: { story: true } });
    if (!play) throw new NotFoundException('No has empezado esa historia');
    if (play.status !== 'active') throw new BadRequestException('Esa historia ya ha terminado');
    const story = play.story;
    const scenes = scenesOf(story);
    if (sceneIndex !== play.answers.length) throw new ConflictException('Esa escena ya está respondida o aún no toca');
    const scene = scenes[sceneIndex];
    const choice = scene?.choices[optionIndex];
    if (!choice) throw new BadRequestException('Opción inválida');

    const answers = [...play.answers, optionIndex];
    const last = answers.length >= scenes.length;
    const result = last ? resolveOutcome(scenes, answers, data.config) : null;
    const rewards = result ? data.config.rewards[result.outcome] : null;

    await this.prisma.$transaction(async (tx) => {
      // Guardia: solo avanza si nadie ha respondido esta escena entre medias (doble clic, dos dispositivos)
      const moved = await tx.decisionStoryPlay.updateMany({
        where: { id: play.id, status: 'active', answers: { equals: play.answers } },
        data: {
          answers: { push: optionIndex },
          ...(result ? { status: 'completed', outcome: result.outcome, score: result.score, xpAwarded: rewards.xp, coinsAwarded: rewards.coins, finishedAt: new Date() } : {}),
        },
      });
      if (moved.count !== 1) throw new ConflictException('Esa escena ya está respondida');
      // El voto solo cuenta mientras el día de la historia sigue abierto
      if (!story.closedAt) {
        await tx.decisionStoryTally.upsert({
          where: { storyId_sceneIndex_optionIndex: { storyId, sceneIndex, optionIndex } },
          create: { storyId, sceneIndex, optionIndex, count: 1 },
          update: { count: { increment: 1 } },
        });
      }
      if (rewards) {
        await tx.pet.update({ where: { id: play.petId }, data: { happiness: { increment: rewards.happiness } } });
        // La felicidad tiene tope 100: el incremento atómico puede pasarse, se recorta aquí
        await tx.pet.updateMany({ where: { id: play.petId, happiness: { gt: 100 } }, data: { happiness: 100 } });
        await tx.user.update({ where: { id: userId }, data: { coins: { increment: rewards.coins } } });
      }
    });

    const tallies = await this.prisma.decisionStoryTally.findMany({ where: { storyId, sceneIndex } });
    const counts = sceneCounts(scene, sceneIndex, tallies);
    const response = {
      sceneIndex,
      optionIndex,
      consequence: choice.consequence,
      /** Qué eligió la comunidad en esta escena (votos por opción, incluido el tuyo). */
      community: { counts, total: counts.reduce((a, b) => a + b, 0) },
      next: last ? null : publicScene(scenes[sceneIndex + 1], sceneIndex + 1),
      completed: null as null | { outcome: string; score: number; rewards: { xp: number; coins: number; happiness: number }; memory: string },
      /** Objeto que soltó la aventura al terminarla (spec 41). */
      bonusItem: null as null | { itemId: string; name: string; qty: number },
    };
    if (!result) return response;

    // La XP va aparte (grantXp): debe subir nivel y etapa, no solo acumularse
    await this.pets.grantXp(userId, play.petId, rewards.xp);
    // La mente mueve la personalidad y guarda el recuerdo al recibir este evento (igual que antes)
    this.events?.emit('adventure:finished', { userId, petId: play.petId, theme: story.title, outcome: result.outcome });
    if (this.realtime) {
      const after = await this.prisma.pet.findUnique({ where: { id: play.petId }, include: { species: true, pattern: true } });
      if (after) this.realtime.emitPetUpdate(userId, after);
      this.realtime.emitPetAction(userId, play.petId, 'adventure', { result: result.outcome });
    }
    this.logger.log(`Historia ${storyId} terminada por ${userId}: ${result.outcome} (${result.score})`);
    response.completed = { outcome: result.outcome, score: result.score, rewards, memory: adventureEpisode(story.title, result.outcome) };
    response.bonusItem = (await this.activityDrops?.roll(userId, 'adventure')) ?? null;
    return response;
  }

  /** Historial del usuario: qué contestó en cada historia. */
  async history(userId: string, limit = 20) {
    const take = Math.min(Math.max(1, Math.floor(limit) || 20), 50);
    const plays = await this.prisma.decisionStoryPlay.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take,
      include: { story: true },
    });
    return plays.map((p) => {
      const scenes = scenesOf(p.story);
      const canon = (p.story.canon as { options?: number[] } | null)?.options;
      return {
        storyId: p.storyId,
        day: p.story.day,
        title: p.story.title,
        status: p.status,
        outcome: p.outcome,
        score: p.score,
        xpAwarded: p.xpAwarded,
        coinsAwarded: p.coinsAwarded,
        startedAt: p.startedAt,
        finishedAt: p.finishedAt,
        answers: p.answers.map((optionIndex, i) => ({
          sceneIndex: i,
          optionIndex,
          label: scenes[i]?.choices[optionIndex]?.label ?? '',
          /** `true` si coincidió con lo que eligió la mayoría (solo cuando el día ya se cerró). */
          withMajority: canon ? canon[i] === optionIndex : null,
        })),
      };
    });
  }
}
