import { Injectable } from '@nestjs/common';
import { GameDataService } from '../game-data/game-data.service';
import { FestivalEntry, FestivalInfo, UpcomingFestival } from './environmental.types';

export interface CalendarDay {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function validDate(year: number, month: number, day: number): CalendarDay | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Descarta fechas inexistentes (p. ej. 31 de febrero) por normalización de Date.
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return { year: d.getUTCFullYear(), month, day };
}

/**
 * Lookup de festividades a partir de `shared/game-data/festivals.json` (vía `GameDataService`).
 * Lógica pura sobre el calendario (sin reloj de sistema ni I/O), testeable en aislamiento.
 *
 * El filtrado por región se deja como v1: una festividad con `region` solo aplica si el usuario
 * coincide; sin `region` es global.
 */
@Injectable()
export class FestivalService {
  constructor(private readonly gameData: GameDataService) {}

  private entries(): FestivalEntry[] {
    const data = this.gameData.getFestivals();
    return Array.isArray(data) ? (data as FestivalEntry[]) : [];
  }

  /** Festividad activa en una fecha calendario + región opcional; `null` si no hay. */
  getActive(day: CalendarDay, region?: string | null): FestivalInfo | null {
    const match = this.entries().find((f) => this.matchesRegion(f, region) && this.isActiveOn(f, day));
    if (!match) return null;
    return { id: match.id, name: match.name, accessory: match.accessory, message: match.message };
  }

  /** Próximas festividades (incluida la de hoy) con `daysRemaining`, ordenadas por cercanía. */
  getUpcoming(
    day: CalendarDay,
    opts: { region?: string | null; birthday?: string | null } = {},
  ): UpcomingFestival[] {
    const items: UpcomingFestival[] = [];
    for (const f of this.entries()) {
      if (!this.matchesRegion(f, opts.region)) continue;
      const start = this.nextStart(f, day);
      if (start) {
        items.push({
          id: f.id,
          name: f.name,
          date: `${start.year}-${pad(start.month)}-${pad(start.day)}`,
          daysRemaining: this.daysBetween(day, start),
        });
      }
    }
    const birthday = this.nextBirthday(opts.birthday, day);
    if (birthday) {
      items.push({
        id: 'cumpleaños',
        name: 'Tu cumpleaños',
        date: `${birthday.year}-${pad(birthday.month)}-${pad(birthday.day)}`,
        daysRemaining: this.daysBetween(day, birthday),
      });
    }
    return items.sort((a, b) => a.daysRemaining - b.daysRemaining || a.date.localeCompare(b.date));
  }

  /** ¿La festividad cae en el día calendario `day`? (el rango puede cruzar el año). */
  private isActiveOn(f: FestivalEntry, day: CalendarDay): boolean {
    const startM = f.monthStart;
    const startD = f.dayStart;
    const endM = f.monthEnd ?? f.monthStart;
    const endD = f.dayEnd ?? f.dayStart;
    const dateNum = day.month * 100 + day.day;
    const startNum = startM * 100 + startD;
    const endNum = endM * 100 + endD;
    if (startNum <= endNum) return dateNum >= startNum && dateNum <= endNum;
    return dateNum >= startNum || dateNum <= endNum;
  }

  private matchesRegion(f: FestivalEntry, region?: string | null): boolean {
    if (!f.region) return true; // festividad global
    return !!region && f.region === region;
  }

  /** Próximo comienzo de la festividad a partir de `day` (año actual o siguiente). */
  private nextStart(f: FestivalEntry, day: CalendarDay): CalendarDay | null {
    const m = f.monthStart;
    const d = f.dayStart;
    const thisYear = validDate(day.year, m, d);
    if (!thisYear) return null;
    const dateNum = day.month * 100 + day.day;
    const startNum = m * 100 + d;
    if (dateNum <= startNum) return thisYear; // comienza este año (o hoy)
    // Ya pasó este año: si ahora mismo está activa se cuenta como hoy (0 días); si no, el año que viene.
    if (this.isActiveOn(f, day)) return thisYear;
    return validDate(day.year + 1, m, d) ?? thisYear;
  }

  /** Próximo cumpleaños a partir de `day` (el cumpleaños se guarda como "YYYY-MM-DD"). */
  private nextBirthday(birthday: string | null | undefined, day: CalendarDay): CalendarDay | null {
    if (!birthday || typeof birthday !== 'string') return null;
    const m = parseInt(birthday.slice(5, 7), 10);
    const d = parseInt(birthday.slice(8, 10), 10);
    if (!Number.isFinite(m) || !Number.isFinite(d)) return null;
    const thisYear = validDate(day.year, m, d);
    if (!thisYear) return null;
    const dateNum = day.month * 100 + day.day;
    const startNum = m * 100 + d;
    if (dateNum <= startNum) return thisYear;
    return validDate(day.year + 1, m, d) ?? thisYear;
  }

  /** Días (redondeados, ≥ 0) entre dos fechas calendario. */
  private daysBetween(from: CalendarDay, to: CalendarDay): number {
    const a = Date.UTC(from.year, from.month - 1, from.day);
    const b = Date.UTC(to.year, to.month - 1, to.day);
    return Math.max(0, Math.round((b - a) / 86_400_000));
  }
}
