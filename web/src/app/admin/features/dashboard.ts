import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuditLog } from '../data/audit-log';
import { AdminUser, CatalogItem, GameEvent, PetEntry, RARITIES, eventStatus } from '../data/models';
import { EVENTS, ITEMS, PETS, USERS } from '../data/repository';

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink, DatePipe],
  template: `
    <h1>Resumen</h1>

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
              {{ event.name }}
            </li>
          } @empty {
            <li>Ninguno.</li>
          }
        </ul>
        <a class="btn btn--sm" routerLink="../eventos">Ver eventos</a>
      </section>

      <section class="card" aria-labelledby="activity-title">
        <h2 id="activity-title">Actividad reciente</h2>
        <ul class="plain">
          @for (entry of recent(); track entry.at + entry.detail) {
            <li>
              <span class="tag">{{ entry.action }}</span>
              <span>{{ entry.resource }} · {{ entry.detail }}</span>
              <time [attr.datetime]="entry.at">{{ entry.at | date: 'HH:mm' }}</time>
            </li>
          } @empty {
            <li>Todavía no hay actividad.</li>
          }
        </ul>
        <a class="btn btn--sm" routerLink="../registro">Ver registro</a>
      </section>
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  private readonly users = signal<AdminUser[]>([]);
  private readonly pets = signal<PetEntry[]>([]);
  private readonly items = signal<CatalogItem[]>([]);
  private readonly events = signal<GameEvent[]>([]);
  private readonly log = inject(AuditLog);

  protected readonly recent = computed(() => this.log.entries().slice(0, 6));

  protected readonly upcoming = computed(() =>
    this.events()
      .map((e) => ({ id: e.id, name: e.name, status: eventStatus(e), startDate: e.startDate }))
      .filter((e) => e.status === 'Activo' || e.status === 'Programado')
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 6),
  );

  protected readonly kpis = computed(() => {
    const users = this.users();
    const pets = this.pets();
    const events = this.events();
    const coins = users.reduce((sum, u) => sum + u.coins, 0);
    return [
      {
        label: 'Usuarios',
        value: users.length,
        note: `${users.filter((u) => u.status === 'suspended').length} suspendidos`,
        color: 'lavender',
      },
      {
        label: 'Pockais',
        value: pets.length,
        note: `${pets.filter((p) => p.shiny).length} shiny · ${pets.filter((p) => p.sick).length} enfermos`,
        color: 'sunburst',
      },
      {
        label: 'Eventos activos',
        value: events.filter((e) => eventStatus(e) === 'Activo').length,
        note: `${events.length} en total`,
        color: 'mint-pop',
      },
      {
        label: 'Ítems en venta',
        value: this.items().filter((i) => i.active).length,
        note: `${new Intl.NumberFormat('es').format(coins)} monedas en circulación`,
        color: 'paper-white',
      },
    ];
  });

  protected readonly rarityBars = computed(() => {
    const pets = this.pets();
    const max = Math.max(1, ...Object.keys(RARITIES).map((r) => pets.filter((p) => p.rarity === r).length));
    return Object.entries(RARITIES).map(([id, label]) => {
      const count = pets.filter((p) => p.rarity === id).length;
      return { label, count, percent: (count / max) * 85 };
    });
  });

  constructor() {
    const [users, pets, items, events] = [inject(USERS), inject(PETS), inject(ITEMS), inject(EVENTS)];
    void users.list().then((rows) => this.users.set(rows));
    void pets.list().then((rows) => this.pets.set(rows));
    void items.list().then((rows) => this.items.set(rows));
    void events.list().then((rows) => this.events.set(rows));
  }
}
