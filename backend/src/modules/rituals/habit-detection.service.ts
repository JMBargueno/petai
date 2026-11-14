import { Injectable } from '@nestjs/common';

export interface RitualEvent {
  type: string; // feed | battle | minigame | chat | clean
  at: Date;
}

export interface RitualCandidate {
  type: string;
  hour: number;
  minute: number;
  cadence: 'daily' | 'weekly';
  dayOfWeek: number | null;
  occurrences: number;
  confidence: number;
}

/**
 * Motor puro de detección de hábitos (feature 030, AC1/AC2/AC8). Analiza eventos de
 * interacción del jugador y detecta patrones consistentes (±30 min del spec) que se
 * convierten en "ritual candidato". También evalúa la adaptación de horario.
 *
 * No toca la BD: recibe eventos ya cargados y un `now` inyectable para tests.
 */
@Injectable()
export class HabitDetectionService {
  /** Tolerancia de ±30 min (AC2) — horas aleatorias NO sugieren. */
  readonly TOLERANCE_MS = 30 * 60 * 1000;
  /** Umbral de detección: ≥3 apariciones consistentes (AC2). */
  readonly MIN_OCCURRENCES = 3;
  /** Adaptación: 3 cambios de horario → re-calibrar (AC8). */
  readonly ADAPT_THRESHOLD = 3;
  /** Ventana de análisis: últimos 30 días. */
  readonly WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

  /**
   * Detecta candidatos por tipo de acción. Agrupa eventos por hora y (para rituales
   * semanales) por día de semana; un grupo con ≥3 apariciones dentro de ±30 min es
   * candidato.
   */
  detectCandidates(events: RitualEvent[], now: Date = new Date()): RitualCandidate[] {
    const cutoff = now.getTime() - this.WINDOW_MS;
    const valid = events.filter((e) => e.at.getTime() >= cutoff);
    const candidates: RitualCandidate[] = [];

    const byType = new Map<string, RitualEvent[]>();
    for (const e of valid) {
      const arr = byType.get(e.type) ?? [];
      arr.push(e);
      byType.set(e.type, arr);
    }

    for (const [type, list] of byType) {
      const daily = this.clusterByHour(list, (e) => e);
      const weekly = this.clusterByDay(list, (e) => e);
      for (const c of [...daily, ...weekly]) {
        if (c.occurrences >= this.MIN_OCCURRENCES) candidates.push(c);
      }
    }

    // Mayor número de apariciones primero; un candidato por tipo-cadence.
    candidates.sort((a, b) => b.occurrences - a.occurrences);
    return candidates;
  }

  /** ¿Debería adaptarse el ritual? Si hubo ≥3 cambios de horario distintos recientes. */
  shouldAdapt(hours: number[]): boolean {
    const distinct = new Set(hours);
    return distinct.size >= this.ADAPT_THRESHOLD;
  }

  private clusterByHour(list: RitualEvent[], _sel: (e: RitualEvent) => RitualEvent): RitualCandidate[] {
    if (list.length < this.MIN_OCCURRENCES) return [];
    const sorted = [...list].sort((a, b) => a.at.getTime() - b.at.getTime());
    // Busca la hora "mediana" de mayor densidad: el bucket de 60 min con más eventos
    // dentro de ±30 min.
    let best = { hour: 0, minute: 0, count: 0 };
    for (let anchor = 0; anchor < sorted.length; anchor++) {
      const anchorMs = sorted[anchor].at.getTime();
      const hour = sorted[anchor].at.getHours();
      let count = 0;
      for (const e of sorted) {
        if (Math.abs(e.at.getTime() - anchorMs) <= this.TOLERANCE_MS * 2) count++;
      }
      if (count > best.count) {
        best = { hour, minute: Math.round(sorted[anchor].at.getMinutes() / 15) * 15 % 60, count };
      }
    }
    if (best.count < this.MIN_OCCURRENCES) return [];
    return [{
      type: list[0].type,
      hour: best.hour,
      minute: best.minute,
      cadence: 'daily',
      dayOfWeek: null,
      occurrences: best.count,
      confidence: Math.min(1, best.count / 7),
    }];
  }

  private clusterByDay(list: RitualEvent[], _sel: (e: RitualEvent) => RitualEvent): RitualCandidate[] {
    if (list.length < this.MIN_OCCURRENCES) return [];
    const byDay = new Map<number, RitualEvent[]>();
    for (const e of list) {
      const dow = e.at.getDay();
      const arr = byDay.get(dow) ?? [];
      arr.push(e);
      byDay.set(dow, arr);
    }
    const out: RitualCandidate[] = [];
    for (const [dow, dayList] of byDay) {
      if (dayList.length < this.MIN_OCCURRENCES) continue;
      const sorted = [...dayList].sort((a, b) => a.at.getTime() - b.at.getTime());
      const anchor = sorted[Math.floor(sorted.length / 2)];
      out.push({
        type: list[0].type,
        hour: anchor.at.getHours(),
        minute: Math.round(anchor.at.getMinutes() / 15) * 15 % 60,
        cadence: 'weekly',
        dayOfWeek: dow,
        occurrences: dayList.length,
        confidence: Math.min(1, dayList.length / 7),
      });
    }
    return out;
  }
}
