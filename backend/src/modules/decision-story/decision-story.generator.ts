import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CronLockService } from '../../redis/cron-lock.service';
import { SystemAiService, SystemAiUsage } from '../ai/system-ai.service';
import { GameDataService } from '../game-data/game-data.service';
import { buildStoryContentSchema, StoredScenes, StoryContent, StoryData } from '../game-data/story-data.schemas';
import { addDays, computeCanon, localDate, localHour, shuffleChoices } from './decision-story.engine';
import { buildSystemPrompt, buildUserPrompt, ChronicleContext } from './prompt';

const LOCK = 'stories:generate';
const LOCK_TTL_MS = 9 * 60_000;
/** Días hacia atrás cuyos títulos se le pasan a la IA para que no repita tema. */
const AVOID_TITLES_DAYS = 14;

export interface GenerateOptions {
  /** Rellena con reposiciones o semillas los huecos que la IA no cubra. */
  allowFallback: boolean;
  /** No llama a la IA: solo reposiciones y semillas. */
  skipAi?: boolean;
}

export interface GenerateReport {
  day: string;
  created: Array<{ slot: number; source: string; title: string }>;
  /** Huecos que se quedan sin historia (la IA falló y aún no toca recurrir al respaldo). */
  pending: number[];
  costUsd: number;
}

/**
 * DecisionStoryGenerator: teje cada noche el bucket de historias del día siguiente con la IA del
 * sistema. Antes cierra el día anterior: la opción más votada de cada escena pasa a ser canon y
 * alimenta la continuación de la Crónica.
 */
@Injectable()
export class DecisionStoryGenerator implements OnApplicationBootstrap {
  private readonly logger = new Logger(DecisionStoryGenerator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly systemAi: SystemAiService,
    private readonly cronLock: CronLockService,
    private readonly config: ConfigService,
  ) {}

  private get enabled(): boolean {
    return process.env.NODE_ENV !== 'test' && this.config.get<string>('STORY_GENERATOR_ENABLED') !== 'false';
  }

  /** Zona horaria del bucket: `STORY_TZ` o la de `stories.json`. */
  timezone(data: StoryData): string {
    return this.config.get<string>('STORY_TZ') || data.config.bucket.timezone;
  }

  /** Día del bucket que corresponde a un instante. */
  bucketDay(now = new Date()): string | null {
    const data = this.gameData.getStoryData();
    return data ? localDate(now, this.timezone(data)) : null;
  }

  /** Primer despliegue o reinicio a media mañana: no espera al siguiente sondeo. */
  onApplicationBootstrap() {
    if (!this.enabled) return;
    void this.tick();
  }

  /**
   * Sondeo: cada 10 minutos comprueba si ya pasó la hora de tejer y falta alguna historia del día.
   * Un sondeo (y no un cron a las 2:00) se recupera solo si el servidor estaba caído a esa hora.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async tick() {
    if (!this.enabled) return;
    const token = await this.cronLock.guard(LOCK, LOCK_TTL_MS).catch(() => null);
    if (!token) return;
    try {
      await this.ensureBucket(new Date());
    } catch (err: any) {
      this.logger.error(`Error generando las historias del día: ${err?.message}`);
    } finally {
      await this.cronLock.release(LOCK, token).catch(() => undefined);
    }
  }

  /** Genera lo que falte del bucket de hoy si ya es hora. Idempotente. */
  async ensureBucket(now: Date): Promise<GenerateReport | null> {
    const data = this.gameData.getStoryData();
    if (!data) return null;
    const tz = this.timezone(data);
    const { bucket } = data.config;
    const hour = localHour(now, tz);
    if (hour < bucket.generateAtHour) return null;
    const day = localDate(now, tz);
    const have = await this.prisma.decisionStory.count({ where: { day } });
    if (have >= bucket.storiesPerDay) return null;
    // Pasada la hora límite, o si la IA no puede llamar, los huecos se rellenan con el respaldo
    const aiReady = await this.systemAi.isAvailable();
    return this.generateForDay(day, { allowFallback: hour >= bucket.aiDeadlineHour || !aiReady, skipAi: !aiReady });
  }

  /**
   * Cierra los días anteriores a `day` que sigan abiertos: fija el canon de cada historia (la opción
   * más votada por escena) y su resumen. Devuelve cuántas historias cerró.
   */
  async closeDaysBefore(day: string): Promise<number> {
    const data = this.gameData.getStoryData();
    if (!data) return 0;
    const open = await this.prisma.decisionStory.findMany({
      where: { day: { lt: day }, closedAt: null },
      include: { tallies: true },
    });
    let closed = 0;
    for (const story of open) {
      const scenes = (story.scenes as unknown as StoredScenes).scenes;
      const canon = computeCanon(scenes, story.tallies, data.config.canon.minVotesForCanon);
      // Guardia `closedAt: null`: si dos réplicas cierran a la vez, solo una escribe
      const res = await this.prisma.decisionStory.updateMany({
        where: { id: story.id, closedAt: null },
        data: { canon: { options: canon.options, votes: canon.votes } as any, canonSummary: canon.summary, closedAt: new Date() },
      });
      closed += res.count;
    }
    if (closed > 0) this.logger.log(`Cerradas ${closed} historias anteriores a ${day} (canon fijado)`);
    return closed;
  }

  /** Genera las historias que falten del bucket de `day`. Idempotente por `[day, slot]`. */
  async generateForDay(day: string, opts: GenerateOptions): Promise<GenerateReport> {
    const report: GenerateReport = { day, created: [], pending: [], costUsd: 0 };
    const data = this.gameData.getStoryData();
    if (!data) return report;
    await this.closeDaysBefore(day);

    const existing = await this.prisma.decisionStory.findMany({ where: { day }, select: { slot: true, seedId: true, rerunOfId: true } });
    const taken = new Set(existing.map((s) => s.slot));
    const usedSeeds = new Set(existing.map((s) => s.seedId).filter(Boolean));
    const usedReruns = new Set(existing.map((s) => s.rerunOfId).filter(Boolean));
    const schema = buildStoryContentSchema(data.config, data.locations);
    const system = buildSystemPrompt(data.config, data.locations, this.gameData.getLore());
    const { avoidTitles, worldEchoes } = await this.promptContext(day);

    for (let slot = 0; slot < data.config.bucket.storiesPerDay; slot++) {
      if (taken.has(slot)) continue;
      const chronicle = slot === 0 ? await this.chronicleContext(day, data) : null;
      let row: Record<string, unknown> | null = null;

      if (!opts.skipAi) {
        const ai = await this.systemAi.completeJson<StoryContent>({
          purpose: `historia ${day}#${slot}`,
          system,
          user: buildUserPrompt({ day, chronicle: chronicle?.context ?? null, worldEchoes, avoidTitles: [...avoidTitles, ...report.created.map((c) => c.title)] }),
          schema,
          attempts: data.config.bucket.attemptsPerStory,
          textsOf: storyTexts,
        });
        report.costUsd += ai.usage.costUsd;
        if (ai.ok) {
          row = {
            ...this.contentRow(ai.data, `${day}#${slot}`),
            source: 'ai',
            ...(chronicle
              ? { arcKey: chronicle.context.arcKey, arcChapter: chronicle.context.chapter, parentStoryId: chronicle.parentId, closesArc: chronicle.context.closes }
              : {}),
            model: ai.model,
            ...usageRow(ai.usage),
          };
        } else {
          this.logger.warn(`Historia ${day}#${slot}: la IA del sistema no la generó (${ai.reason})`);
        }
      }

      if (!row && opts.allowFallback) row = await this.fallbackRow(day, slot, data, usedSeeds, usedReruns);
      if (!row) {
        report.pending.push(slot);
        continue;
      }
      try {
        const created = await this.prisma.decisionStory.create({ data: { day, slot, ...row } as any });
        report.created.push({ slot, source: created.source, title: created.title });
      } catch (err: any) {
        // P2002: otra réplica creó ese hueco entre medias. No es un error.
        if (err?.code !== 'P2002') throw err;
      }
    }
    if (report.created.length > 0) {
      this.logger.log(
        `Historias de ${day}: ${report.created.map((c) => `#${c.slot} ${c.source} «${c.title}»`).join(', ')} (coste ${report.costUsd.toFixed(4)} $)`,
      );
    }
    return report;
  }

  private contentRow(content: StoryContent, shuffleSeed: string) {
    const stored: StoredScenes = { v: 1, scenes: shuffleChoices(content.scenes, shuffleSeed) };
    return { title: content.title, synopsis: content.synopsis, scenes: stored };
  }

  /** Títulos recientes (para no repetir) y lo que decidió ayer la comunidad fuera de la Crónica. */
  private async promptContext(day: string): Promise<{ avoidTitles: string[]; worldEchoes: string[] }> {
    const recent = await this.prisma.decisionStory.findMany({
      where: { day: { gte: addDays(day, -AVOID_TITLES_DAYS), lt: day } },
      select: { title: true, day: true, arcKey: true, canonSummary: true },
      orderBy: [{ day: 'desc' }, { slot: 'asc' }],
    });
    const yesterday = addDays(day, -1);
    return {
      avoidTitles: [...new Set(recent.map((r) => r.title))].slice(0, 20),
      worldEchoes: recent.filter((r) => r.day === yesterday && !r.arcKey && r.canonSummary).map((r) => r.canonSummary),
    };
  }

  /** Contexto del capítulo de hoy de la Crónica: continúa el arco abierto o empieza uno nuevo. */
  private async chronicleContext(day: string, data: StoryData): Promise<{ context: ChronicleContext; parentId: string | null }> {
    const { maxChapters, contextChapters } = data.config.arc;
    const last = await this.prisma.decisionStory.findFirst({
      where: { arcKey: { not: null }, day: { lt: day } },
      orderBy: [{ day: 'desc' }],
    });
    if (!last || last.closesArc || last.arcChapter >= maxChapters) {
      return { context: { arcKey: `arc-${day}`, chapter: 1, maxChapters, closes: false, previous: [] }, parentId: null };
    }
    const chapters = await this.prisma.decisionStory.findMany({
      where: { arcKey: last.arcKey },
      orderBy: { arcChapter: 'desc' },
      take: contextChapters,
      select: { title: true, canonSummary: true },
    });
    const chapter = last.arcChapter + 1;
    return {
      context: {
        arcKey: last.arcKey,
        chapter,
        maxChapters,
        closes: chapter >= maxChapters,
        previous: chapters.reverse().map((c) => ({ title: c.title, decided: c.canonSummary ?? 'Nadie llegó a decidir.' })),
      },
      parentId: last.id,
    };
  }

  /**
   * Respaldo cuando la IA no llega: repone una historia antigua autoconclusiva (la menos repuesta) o,
   * si aún no hay ninguna lo bastante vieja, usa la semilla que lleve más tiempo sin salir.
   */
  private async fallbackRow(day: string, slot: number, data: StoryData, usedSeeds: Set<string>, usedReruns: Set<string>) {
    const candidates = await this.prisma.decisionStory.findMany({
      where: { source: 'ai', arcKey: null, day: { lte: addDays(day, -data.config.rerun.minAgeDays) } },
      orderBy: { day: 'asc' },
      take: 60,
    });
    const free = candidates.filter((c) => !usedReruns.has(c.id));
    if (free.length > 0) {
      const counts = await this.prisma.decisionStory.groupBy({
        by: ['rerunOfId'],
        where: { rerunOfId: { in: free.map((c) => c.id) } },
        _count: { _all: true },
      });
      const timesRerun = new Map(counts.map((c) => [c.rerunOfId, c._count._all]));
      // `sort` es estable: entre las igual de repuestas gana la más antigua
      const pick = [...free].sort((a, b) => (timesRerun.get(a.id) ?? 0) - (timesRerun.get(b.id) ?? 0))[0];
      usedReruns.add(pick.id);
      return { title: pick.title, synopsis: pick.synopsis, scenes: pick.scenes, source: 'rerun', rerunOfId: pick.id };
    }

    const lastUse = await this.prisma.decisionStory.groupBy({ by: ['seedId'], where: { seedId: { not: null } }, _max: { day: true } });
    const lastDay = new Map(lastUse.map((u) => [u.seedId, u._max.day ?? '']));
    const seeds = data.seeds.filter((s) => !usedSeeds.has(s.id)).sort((a, b) => (lastDay.get(a.id) ?? '').localeCompare(lastDay.get(b.id) ?? ''));
    const seed = seeds[0];
    if (!seed) return null;
    usedSeeds.add(seed.id);
    const { id, ...content } = seed;
    return { ...this.contentRow(content, `${day}#${slot}`), source: 'seed', seedId: id };
  }
}

function usageRow(usage: SystemAiUsage) {
  return { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, costUsd: usage.costUsd };
}

/** Todos los textos de una historia, para la moderación de salida. */
function storyTexts(content: StoryContent): string[] {
  return [
    content.title,
    content.synopsis,
    ...content.scenes.flatMap((s) => [s.narration, s.event.text, ...s.choices.flatMap((c) => [c.label, c.consequence, c.canonLine])]),
  ];
}
