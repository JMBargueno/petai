import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AUDIT_EVENTS, AuditEntry, options } from '../data/models';
import { REPORTS } from '../data/reports-http';

const PAGE_SIZE = 50;

/** Resumen legible de los metadatos de una entrada (lo que cambió y quién lo hizo). */
export function describeAudit(entry: AuditEntry): string {
  const m = (entry.metadata ?? {}) as Record<string, any>;
  switch (entry.event) {
    case 'role_change':
      return `${m['from']} → ${m['to']}`;
    case 'item_price_change': {
      const to = m['to'] ?? {};
      const parts = Object.entries(to).map(([k, v]) => `${k === 'priceGems' ? 'gemas' : 'monedas'} ${m['from']?.[k]} → ${v}`);
      return `${m['itemId']}: ${parts.join(', ')}`;
    }
    case 'item_price_bulk':
      return `${m['percent']} % en ${m['currency'] === 'priceGems' ? 'gemas' : 'monedas'} · ${m['changes']?.length ?? 0} ítems`;
    case 'invite_create':
      return `${m['count']} código(s) · ${m['maxUses']} uso(s) cada uno`;
    case 'registration_settings_change':
      return `Solo con invitación: ${m['inviteOnly'] ? 'sí' : 'no'}`;
    default:
      return entry.ip ? `IP ${entry.ip}` : '';
  }
}

@Component({
  selector: 'app-admin-audit',
  imports: [DatePipe, FormsModule],
  template: `
    <header class="head">
      <div>
        <h1>Registro</h1>
        <p>Auditoría del servidor: inicios de sesión, cambios de rol, precios e invitaciones.</p>
      </div>
      <label>
        <span class="visually-hidden">Tipo de evento</span>
        <select class="input" [ngModel]="event()" (ngModelChange)="filter($event)">
          <option value="">Evento: todos</option>
          @for (o of eventOptions; track o.value) {
            <option [value]="o.value">{{ o.label }}</option>
          }
        </select>
      </label>
    </header>

    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    <ol class="list" aria-live="off">
      @for (entry of entries(); track entry.id) {
        <li class="card">
          <span class="tag">{{ label(entry.event) }}</span>
          <span class="what">
            <strong>{{ entry.userEmail ?? entry.userId }}</strong>
            @if (describe(entry); as detail) {
              · {{ detail }}
            }
          </span>
          <time [attr.datetime]="entry.createdAt">{{ entry.createdAt | date: 'dd/MM/yyyy HH:mm:ss' }}</time>
        </li>
      } @empty {
        <li class="card">{{ loading() ? 'Cargando…' : 'Sin actividad.' }}</li>
      }
    </ol>

    <p class="foot" role="status">
      {{ entries().length }} de {{ total() }}
      @if (entries().length < total()) {
        <button class="btn btn--sm" type="button" [disabled]="loading()" (click)="more()">Cargar más</button>
      }
    </p>
  `,
  styles: `
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      justify-content: space-between;
      gap: 12px;
      margin-block-end: 16px;
    }
    h1 {
      margin: 0;
      font-size: var(--text-heading-sm);
      line-height: var(--leading-heading-sm);
    }
    p {
      margin: 4px 0 0;
    }
    .list {
      display: grid;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
    }
    .what {
      flex: 1;
      min-inline-size: 200px;
      overflow-wrap: anywhere;
    }
    time {
      font-size: var(--text-caption);
      font-variant-numeric: tabular-nums;
    }
    .error {
      margin: 0 0 12px;
      padding: 8px 16px;
      border: 2px solid var(--color-ember);
      border-radius: var(--radius-2xl);
      background: var(--surface);
      font-weight: var(--font-weight-bold);
    }
    .foot {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-block-start: 12px;
      font-size: var(--text-caption);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Audit {
  private readonly reports = inject(REPORTS);
  protected readonly eventOptions = options(AUDIT_EVENTS);
  protected readonly entries = signal<AuditEntry[]>([]);
  protected readonly total = signal(0);
  protected readonly event = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly describe = describeAudit;
  private page = 0;
  private request = 0;

  constructor() {
    void this.more();
  }

  protected label(event: string) {
    return AUDIT_EVENTS[event] ?? event;
  }

  protected filter(event: string) {
    this.event.set(event);
    this.page = 0;
    this.entries.set([]);
    void this.more();
  }

  protected async more() {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.reports.audit(this.page + 1, PAGE_SIZE, this.event());
      if (request !== this.request) return; // Llegó tarde: el filtro cambió entretanto.
      this.page = res.page;
      this.entries.update((rows) => [...rows, ...res.items]);
      this.total.set(res.total);
    } catch (e) {
      if (request === this.request) this.error.set(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}
