import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuditLog } from '../data/audit-log';

@Component({
  selector: 'app-admin-audit',
  imports: [DatePipe],
  template: `
    <header class="head">
      <div>
        <h1>Registro</h1>
        <p>Lo que se ha hecho en el panel desde este navegador (máximo 200 entradas).</p>
      </div>
      <button class="btn" type="button" [disabled]="!log.entries().length" (click)="log.clear()">Vaciar</button>
    </header>

    <ol class="list">
      @for (entry of log.entries(); track entry.at + entry.detail) {
        <li class="card">
          <span class="tag">{{ entry.action }}</span>
          <span class="what"><strong>{{ entry.resource }}</strong> · {{ entry.detail }}</span>
          <time [attr.datetime]="entry.at">{{ entry.at | date: 'dd/MM/yyyy HH:mm:ss' }}</time>
        </li>
      } @empty {
        <li class="card">Todavía no hay actividad.</li>
      }
    </ol>
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
    }
    time {
      font-size: var(--text-caption);
      font-variant-numeric: tabular-nums;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Audit {
  protected readonly log = inject(AuditLog);
}
