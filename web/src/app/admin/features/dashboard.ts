import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminAuth } from '../auth';
import { AUDIT_EVENTS, AdminStats, AuditEntry, EVENT_SOURCES, RARITIES, ROLES, type AdminRole, eventStatus } from '../data/models';
import { REPORTS } from '../data/reports-http';
import { describeAudit } from './audit';

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink, DatePipe],
  template: `
    <h1>Resumen</h1>

    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    <ul class="kpis">
      @for (kpi of kpis(); track kpi.label) {
        <li class="card kpi" [style.background]="'var(--color-' + kpi.color + ')'">
          <span class="label-caps">{{ kpi.label }}</span>
          <strong>{{ kpi.value }}</strong>
          <span>{{ kpi.note }}</span>
        </li>
      }
    </ul>

    <div class="cols">
      <section class="card" aria-labelledby="rarity-title">
        <h2 id="rarity-title">Pockais por rareza</h2>
        <dl class="bars">
          @for (bar of rarityBars(); track bar.label) {
            <div>
              <dt>{{ bar.label }}</dt>
              <dd>
                <span class="bar" [style.inline-size.%]="bar.percent"></span>
                <span>{{ bar.count }}</span>
              </dd>
            </div>
          }
        </dl>
      </section>

      <section class="card" aria-labelledby="events-title">
        <h2 id="events-title">Eventos activos y próximos</h2>
        <ul class="plain">
          @for (event of upcoming(); track event.id) {
            <li>
              <span class="tag">{{ event.status }}</span>
              <span>{{ event.name }} · {{ event.source }}</span>
              <time [attr.datetime]="event.startDate">{{ event.startDate | date: 'dd/MM' : 'UTC' }}</time>
            </li>
          } @empty {
            <li>{{ stats() ? 'Ninguno en los próximos 30 días.' : 'Cargando…' }}</li>
          }
        </ul>
        <a class="btn btn--sm" routerLink="../eventos">Ver eventos</a>
      </section>

      @if (canReadAudit) {
        <section class="card" aria-labelledby="activity-title">
          <h2 id="activity-title">Actividad reciente</h2>
          <ul class="plain">
            @for (entry of recent(); track entry.id) {
              <li>
                <span class="tag">{{ auditLabel(entry.event) }}</span>
                <span>{{ entry.userEmail ?? entry.userId }}{{ describe(entry) ? ' · ' + describe(entry) : '' }}</span>
                <time [attr.datetime]="entry.createdAt">{{ entry.createdAt | date: 'dd/MM HH:mm' }}</time>
              </li>
            } @empty {
              <li>Todavía no hay actividad.</li>
            }
          </ul>
          <a class="btn btn--sm" routerLink="../registro">Ver registro</a>
        </section>
      }
    </div>
  `,
  styles: `
    h1 {
      margin: 0 0 16px;
      font-size: var(--text-heading-sm);
      line-height: var(--leading-heading-sm);
    }
    h2 {
      margin: 0 0 12px;
      font-size: var(--text-subheading);
      line-height: var(--leading-subheading);
    }
    ul,
    dl,
    dd {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .kpis {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .kpi {
      display: grid;
      gap: 4px;
    }
    .kpi strong {
      font-family: var(--font-lateral);
      font-size: 56px;
      line-height: 0.85;
    }
    .cols {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
      margin-block-start: 12px;
      align-items: start;
    }
    .cols .card {
      display: grid;
      gap: 12px;
      justify-items: start;
    }
    .bars {
      display: grid;
      gap: 8px;
      inline-size: 100%;
    }
    .bars dt {
      font-weight: var(--font-weight-bold);
      font-size: var(--text-caption);
      letter-spacing: 0.032em;
      text-transform: uppercase;
    }
    .bars dd {
      display: flex;
      align-items: center;
      gap: 8px;
      font-variant-numeric: tabular-nums;
    }
    .bar {
      block-size: 16px;
      min-inline-size: 2px;
      border: var(--outline);
      border-radius: var(--radius-pills);
      background: var(--color-electric-blue);
      color-scheme: light;
      color: var(--ink);
    }
    .plain {
      display: grid;
      gap: 8px;
      inline-size: 100%;
    }
    .plain li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    time {
      margin-inline-start: auto;
      font-size: var(--text-caption);
    }
    .error {
      margin: 0 0 12px;
      padding: 8px 16px;
      border: 2px solid var(--color-ember);
      border-radius: var(--radius-2xl);
      background: var(--surface);
      font-weight: var(--font-weight-bold);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  private readonly reports = inject(REPORTS);
  protected readonly canReadAudit = inject(AdminAuth).can('audit:read');
  protected readonly stats = signal<AdminStats | null>(null);
  protected readonly recent = signal<AuditEntry[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly describe = describeAudit;
  protected readonly auditLabel = (event: string) => AUDIT_EVENTS[event] ?? event;

  protected readonly upcoming = computed(() =>
    (this.stats()?.upcomingEvents ?? []).slice(0, 6).map((e) => ({
      id: e.id,
      name: e.name,
      source: EVENT_SOURCES[e.source] ?? e.source,
      status: eventStatus(e),
      startDate: e.startDate,
    })),
  );

  protected readonly kpis = computed(() => {
    const stats = this.stats();
    const fmt = (n: number | undefined) => (n === undefined ? '…' : new Intl.NumberFormat('es').format(n));
    const byRole = stats?.users.byRole ?? {};
    const team = Object.entries(byRole)
      .filter(([role]) => role !== 'user')
      .map(([role, n]) => `${n} ${ROLES[role as AdminRole] ?? role}`)
      .join(' · ');
    const upcoming = stats?.upcomingEvents ?? [];
    return [
      { label: 'Usuarios', value: fmt(stats?.users.total), note: team || 'Sin equipo', color: 'lavender' },
      { label: 'Pockais', value: fmt(stats?.pets.total), note: 'Mascotas eclosionadas', color: 'sunburst' },
      {
        label: 'Eventos activos',
        value: fmt(stats ? upcoming.filter((e) => eventStatus(e) === 'Activo').length : undefined),
        note: `${upcoming.length} en los próximos 30 días`,
        color: 'mint-pop',
      },
      { label: 'Ítems en la tienda', value: fmt(stats?.items), note: 'Precios editables en Precios', color: 'paper-white' },
    ];
  });

  protected readonly rarityBars = computed(() => {
    const byRarity = this.stats()?.pets.byRarity ?? {};
    const max = Math.max(1, ...Object.values(byRarity));
    return Object.entries(RARITIES).map(([id, label]) => {
      const count = byRarity[id] ?? 0;
      return { label, count, percent: (count / max) * 85 };
    });
  });

  constructor() {
    this.reports
      .stats()
      .then((stats) => this.stats.set(stats))
      .catch((e: unknown) => this.error.set(e instanceof Error ? e.message : 'Error inesperado'));
    if (this.canReadAudit) {
      this.reports
        .audit(1, 6)
        .then((page) => this.recent.set(page.items))
        .catch(() => undefined); // El resumen sigue útil sin la actividad.
    }
  }
}
