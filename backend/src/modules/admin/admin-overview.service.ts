import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';

export const EVENT_SOURCES = ['festival', 'season', 'tournament', 'raid'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export interface AdminEvent {
  id: string;
  name: string;
  source: EventSource;
  /** Fechas YYYY-MM-DD (UTC), ambas inclusive. */
  startDate: string;
  endDate: string;
  enabled: boolean;
  /** Ya terminó por su estado (torneo resuelto, raid liquidada...), aunque las fechas digan otra cosa. */
  finished: boolean;
  detail: string;
}

const RECENT = 20;
/** Estados de torneos y raids que siguen en marcha; cualquier otro (finished, settled, expired...) ya terminó. */
const LIVE_STATUSES = new Set(['entry', 'bracket', 'active', 'pending']);
const UPCOMING_DAYS = 30;
const day = (d: Date) => d.toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Vista de solo lectura para el panel: eventos del juego (leídos de donde los usa el juego hoy) y
 * métricas del resumen calculadas en BD, para no descargar todas las filas solo para contarlas.
 */
@Injectable()
export class AdminOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
  ) {}

  async listEvents(now = new Date()): Promise<AdminEvent[]> {
    const [tournaments, raids] = await Promise.all([
      this.prisma.tournament.findMany({ orderBy: { createdAt: 'desc' }, take: RECENT }),
      this.prisma.raid.findMany({ orderBy: { startedAt: 'desc' }, take: RECENT }),
    ]);
    const events: AdminEvent[] = [
      ...this.festivals(now),
      ...this.seasons(),
      ...tournaments.map((t) => ({
        id: `tournament:${t.id}`,
        name: `Torneo del ${day(t.startedAt ?? t.createdAt)}`,
        source: 'tournament' as const,
        startDate: day(t.startedAt ?? t.createdAt),
        endDate: day(t.endedAt ?? t.endsAt),
        enabled: t.status !== 'cancelled',
        finished: !LIVE_STATUSES.has(t.status),
        detail: `Estado: ${t.status} · inscripción ${t.entryFee} · bote ${t.totalPrizePool}`,
      })),
      ...raids.map((r) => ({
        id: `raid:${r.id}`,
        name: `Raid ${r.theme}`,
        source: 'raid' as const,
        startDate: day(r.startedAt),
        endDate: day(r.endedAt ?? r.endsAt),
        enabled: r.status !== 'cancelled',
        finished: !LIVE_STATUSES.has(r.status),
        detail: `${r.element} · nivel ${r.level} · ${r.status} · PV ${r.hpRemaining}/${r.hpGlobal}`,
      })),
    ];
    return events.sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  async stats(now = new Date()) {
    const [byRole, byRarity, items, events] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.pet.groupBy({ by: ['rarity'], _count: { _all: true } }),
      this.prisma.item.count(),
      this.listEvents(now),
    ]);
    const today = day(now);
    const horizon = day(new Date(now.getTime() + UPCOMING_DAYS * 86_400_000));
    const sum = (rows: { _count: { _all: number } }[]) => rows.reduce((n, r) => n + r._count._all, 0);
    return {
      users: { total: sum(byRole), byRole: Object.fromEntries(byRole.map((r) => [r.role, r._count._all])) },
      pets: { total: sum(byRarity), byRarity: Object.fromEntries(byRarity.map((r) => [r.rarity, r._count._all])) },
      items,
      // Eventos en curso o que empiezan en los próximos 30 días, del más cercano al más lejano.
      upcomingEvents: events
        .filter((e) => e.enabled && !e.finished && e.endDate >= today && e.startDate <= horizon)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    };
  }

  /** Festividades recurrentes (día/mes) proyectadas al año en curso. */
  private festivals(now: Date): AdminEvent[] {
    const year = now.getUTCFullYear();
    return (this.gameData.getFestivals() as any[])
      .filter((f) => Number.isFinite(f.monthStart) && Number.isFinite(f.dayStart))
      .map((f) => {
        const startDate = `${year}-${pad(f.monthStart)}-${pad(f.dayStart)}`;
        const hasEnd = Number.isFinite(f.monthEnd) && Number.isFinite(f.dayEnd);
        let endDate = hasEnd ? `${year}-${pad(f.monthEnd)}-${pad(f.dayEnd)}` : startDate;
        // Festividad que cruza el fin de año (p. ej. 24/12 → 6/1).
        if (endDate < startDate) endDate = `${year + 1}-${pad(f.monthEnd)}-${pad(f.dayEnd)}`;
        return {
          id: `festival:${f.id}`,
          name: f.name,
          source: 'festival' as const,
          startDate,
          endDate,
          enabled: true,
          finished: false,
          detail: [f.region && `Región: ${f.region}`, f.accessory && `Accesorio: ${f.accessory}`].filter(Boolean).join(' · '),
        };
      });
  }

  /** Temporada actual y próxima tal como las usa `SeasonsService` (seasons.json). */
  private seasons(): AdminEvent[] {
    const data = this.gameData.readFileFromDisk('seasons') as { currentSeason?: any; upcomingSeason?: any } | null;
    const label = { current: 'Actual', upcoming: 'Próxima' };
    return (['current', 'upcoming'] as const)
      .map((kind) => [kind, kind === 'current' ? data?.currentSeason : data?.upcomingSeason] as const)
      .filter(([, s]) => s)
      .map(([kind, s]) => ({
        id: `season:${s.id}`,
        name: s.name,
        source: 'season' as const,
        startDate: day(new Date(s.startTime)),
        endDate: day(new Date(s.endTime)),
        enabled: true,
        finished: false,
        detail: `${label[kind]} · pase ${s.passPrice} ${s.passCurrency === 'gems' ? 'gemas' : s.passCurrency} · ${s.maxTier} niveles`,
      }));
  }
}
