import { InternalServerErrorException, Injectable, Logger } from '@nestjs/common';
import { GameDataService } from '../game-data/game-data.service';

/**
 * Servicio de eventos próximos (feature 009-edge-cdn, T024).
 *
 * `GET /events/upcoming` devuelve los eventos de las próximas 24h con el `assetPrefix` a pre-cargar.
 * Fuente data-driven (Constitución IV): `shared/game-data/festivals.json` vía `GameDataService`
 * (o Feature #5 cuando exista). No toca Prisma.
 */

const WINDOW_HOURS = 24;

interface Festival {
  id: string;
  name: string;
  monthStart: number;
  dayStart: number;
  monthEnd?: number;
  dayEnd?: number;
  accessory?: string;
  type?: string;
}

export interface UpcomingEvent {
  id: string;
  name: string;
  type: string;
  startsAt: string;
  endsAt: string | null;
  assetPrefix: string | null;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly gameDataService: GameDataService) {}

  /**
   * Eventos cuyo intervalo [startsAt, endsAt] solapa la ventana [now, now+24h]. Cada evento expone
   * `assetPrefix` (deriva del id del festival) para que el preloader pre-cargue `event/<id>/`.
   */
  async getUpcoming(userId: string, now: Date = new Date()): Promise<{ windowHours: number; events: UpcomingEvent[] }> {
    let festivals: Festival[];
    try {
      festivals = (this.gameDataService.getFestivals?.() ?? []) as Festival[];
    } catch (err) {
      this.logger.error(`No se pudieron leer los festivales: ${(err as Error).message}`);
      throw new InternalServerErrorException('Fuente de eventos inaccesible');
    }
    if (!Array.isArray(festivals)) festivals = [];

    const nowMs = now.getTime();
    const windowEndMs = nowMs + WINDOW_HOURS * 3600 * 1000;

    const events: UpcomingEvent[] = [];
    for (const f of festivals) {
      const occ = this.nextOccurrence(f, now);
      if (!occ) continue;
      const startMs = occ.startsAt.getTime();
      const endMs = occ.endsAt ? occ.endsAt.getTime() : startMs;
      // Solapamiento con la ventana de 24h.
      if (endMs < nowMs || startMs > windowEndMs) continue;
      events.push({
        id: f.id,
        name: f.name,
        type: f.type || 'festival',
        startsAt: occ.startsAt.toISOString(),
        endsAt: occ.endsAt ? occ.endsAt.toISOString() : null,
        assetPrefix: this.assetPrefixFor(f),
      });
    }

    events.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    void userId;
    return { windowHours: WINDOW_HOURS, events };
  }

  /** Próxima ocurrencia (año actual o siguiente) del festival recurrente por mes/día. */
  private nextOccurrence(f: Festival, now: Date): { startsAt: Date; endsAt: Date | null } | null {
    if (!Number.isFinite(f.monthStart) || !Number.isFinite(f.dayStart)) return null;
    const year = now.getFullYear();
    let startsAt = new Date(year, f.monthStart - 1, f.dayStart, 0, 0, 0);
    // Si ya pasó este año, se usa el siguiente.
    if (startsAt.getTime() < now.getTime()) {
      startsAt = new Date(year + 1, f.monthStart - 1, f.dayStart, 0, 0, 0);
    }
    let endsAt: Date | null = null;
    if (Number.isFinite(f.monthEnd) && Number.isFinite(f.dayEnd)) {
      endsAt = new Date(startsAt.getFullYear(), f.monthEnd - 1, f.dayEnd, 23, 59, 59);
      if (endsAt.getTime() < startsAt.getTime()) endsAt = new Date(startsAt.getTime() + 23 * 3600 * 1000);
    }
    return { startsAt, endsAt };
  }

  /** `assetPrefix` data-driven: `event/<id>/` (los assets del evento viven bajo ese prefijo). */
  private assetPrefixFor(f: Festival): string | null {
    return f.id ? `event/${f.id}/` : null;
  }
}