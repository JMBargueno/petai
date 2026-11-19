import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminAuth } from '../auth';
import {
  VOUCHERS,
  VOUCHER_STATUS_LABELS,
  describeRewards,
  emptyRewards,
  hasRewards,
  type AccessoryOption,
  type Rewards,
  type Voucher,
  type VoucherStatus,
} from '../data/vouchers-http';
import { RewardsForm } from '../ui/rewards-form';

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });
const STATUS_OPTIONS = Object.entries(VOUCHER_STATUS_LABELS) as [VoucherStatus, string][];

type Mode = 'random' | 'custom';

/**
 * Vouchers de recompensas: códigos (aleatorios en lote o uno personalizado) que dan un paquete de
 * monedas, gemas, días Pro, cofres y prendas. Cada cuenta canjea un código una sola vez.
 */
@Component({
  selector: 'app-admin-vouchers',
  imports: [FormsModule, RewardsForm],
  styleUrl: '../ui/resource-page.css',
  styles: `
    .created {
      display: grid;
      gap: 8px;
      padding: 16px;
      border: 2px dashed var(--line-soft);
      border-radius: var(--radius-cards);
    }
    .created ul {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .code {
      font-family: ui-monospace, monospace;
      letter-spacing: 0.05em;
      white-space: nowrap;
    }
    .form-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
    }
    .dialog--wide {
      inline-size: min(640px, 100% - 32px);
    }
    .mode {
      display: flex;
      gap: 16px;
      border: 0;
      margin: 0;
      padding: 0;
    }
  `,
  template: `
    <section class="page">
      <header class="page__head">
        <div>
          <h1>Vouchers</h1>
          <p>Códigos que dan recompensas al canjearlos desde las apps o la web. Cada cuenta puede canjear un código una sola vez.</p>
        </div>
        <button class="btn btn--filled" type="button" (click)="openCreate()">Crear vouchers</button>
      </header>

      @if (error(); as e) {
        <p class="error" role="alert">{{ e }}</p>
      }

      @if (created().length) {
        <div class="created" role="region" aria-label="Vouchers recién creados">
          <strong>Códigos creados ({{ created().length }}) · {{ summary(created()[0]) }}</strong>
          <ul>
            @for (c of created(); track c.id) {
              <li><span class="code">{{ c.code }}</span></li>
            }
          </ul>
          <div class="actions">
            <button class="btn btn--sm" type="button" (click)="copyCreated()">Copiar</button>
            <button class="btn btn--sm" type="button" (click)="created.set([])">Ocultar</button>
          </div>
        </div>
      }

      <div class="toolbar">
        <label>
          <span class="visually-hidden">Buscar vouchers</span>
          <input class="input" type="search" placeholder="Buscar…" [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </label>
        <label>
          <span class="visually-hidden">Estado</span>
          <select class="input" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)">
            <option value="">Estado: todos</option>
            @for (o of statusOptions; track o[0]) {
              <option [value]="o[0]">{{ o[1] }}</option>
            }
          </select>
        </label>
        <button class="btn btn--sm" type="button" (click)="load()" [disabled]="loading()">Recargar</button>
      </div>

      <div class="table-wrap" role="region" tabindex="0" aria-labelledby="vouchers-caption">
        <table>
          <caption id="vouchers-caption">Vouchers · {{ visible().length }} de {{ rows().length }}</caption>
          <thead>
            <tr>
              <th scope="col" class="plain">Código</th>
              <th scope="col" class="plain">Recompensas</th>
              <th scope="col" class="plain">Estado</th>
              <th scope="col" class="plain num">Canjes</th>
              <th scope="col" class="plain">Caduca</th>
              <th scope="col" class="plain">Nota</th>
              <th scope="col" class="plain">Creado</th>
              <th scope="col" class="plain">Acciones</th>
            </tr>
          </thead>
          <tbody>
            @for (row of visible(); track row.id) {
              <tr>
                <th scope="row"><span class="code">{{ row.code }}</span></th>
                <td data-label="Recompensas">{{ summary(row) }}</td>
                <td data-label="Estado">{{ statusLabel(row.status) }}</td>
                <td data-label="Canjes" class="num">{{ row.usedCount }} / {{ row.maxUses }}</td>
                <td data-label="Caduca">{{ row.expiresAt ? date(row.expiresAt) : 'Nunca' }}</td>
                <td data-label="Nota">{{ row.note ?? '' }}</td>
                <td data-label="Creado">{{ date(row.createdAt) }}{{ row.createdBy ? ' · ' + row.createdBy.email : '' }}</td>
                <td data-label="Acciones">
                  <span class="actions">
                    @if (row.status === 'active') {
                      <button class="btn btn--sm" type="button" [attr.aria-label]="'Revocar ' + row.code" (click)="askRevoke(row)">Revocar</button>
                    }
                  </span>
                </td>
              </tr>
            } @empty {
              <tr>
                <td class="empty" colspan="8">{{ loading() ? 'Cargando…' : 'Sin vouchers' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <p class="visually-hidden" role="status">{{ status() }}</p>

      <dialog #createDialog class="dialog dialog--wide" aria-labelledby="vouchers-create-title">
        <form class="form" ngNativeValidate (ngSubmit)="create()">
          <h2 id="vouchers-create-title">Crear vouchers</h2>

          <fieldset class="mode">
            <legend class="visually-hidden">Tipo de código</legend>
            <label class="check"><input type="radio" name="mode" value="random" [(ngModel)]="mode" /> Lote de códigos aleatorios</label>
            <label class="check"><input type="radio" name="mode" value="custom" [(ngModel)]="mode" /> Código personalizado</label>
          </fieldset>

          <div class="form-row">
            @if (mode === 'custom') {
              <div class="field">
                <label for="vouchers-code">Código</label>
                <input
                  class="input code"
                  id="vouchers-code"
                  name="code"
                  type="text"
                  required
                  minlength="4"
                  maxlength="32"
                  pattern="[A-Za-z0-9][A-Za-z0-9\\-]{2,30}[A-Za-z0-9]"
                  placeholder="NAVIDAD2026"
                  [(ngModel)]="draft.code"
                />
              </div>
            } @else {
              <div class="field">
                <label for="vouchers-count">Cantidad de códigos</label>
                <input class="input" id="vouchers-count" name="count" type="number" step="1" min="1" max="100" required [(ngModel)]="draft.count" />
              </div>
            }
            <div class="field">
              <label for="vouchers-uses">{{ mode === 'custom' ? 'Canjes totales' : 'Canjes por código' }}</label>
              <input class="input" id="vouchers-uses" name="maxUses" type="number" step="1" min="1" max="1000000" required [(ngModel)]="draft.maxUses" />
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label for="vouchers-expires">Caduca (opcional)</label>
              <input class="input" id="vouchers-expires" name="expiresAt" type="datetime-local" [min]="minExpiry" [(ngModel)]="draft.expiresAt" />
            </div>
            <div class="field">
              <label for="vouchers-note">Nota interna (opcional)</label>
              <input class="input" id="vouchers-note" name="note" type="text" maxlength="200" placeholder="Campaña, sorteo…" [(ngModel)]="draft.note" />
            </div>
          </div>

          <app-rewards-form [(value)]="rewards" [accessories]="accessories()" [canGrantPro]="canGrantPro" />

          @if (formError(); as e) {
            <p class="error" role="alert">{{ e }}</p>
          }
          <div class="dialog__actions">
            <button class="btn" type="button" (click)="createDialog.close()">Cancelar</button>
            <button class="btn btn--filled" type="submit" [disabled]="loading()">Crear</button>
          </div>
        </form>
      </dialog>

      <dialog #revokeDialog class="dialog" closedby="any" aria-labelledby="vouchers-revoke-title" (close)="onRevokeClose(revokeDialog)">
        <h2 id="vouchers-revoke-title">¿Revocar «{{ pendingRevoke()?.code }}»?</h2>
        <p>El código dejará de poder canjearse. Lo que ya se haya canjeado no se retira.</p>
        <form method="dialog" class="dialog__actions">
          <button class="btn" value="cancel" autofocus>Cancelar</button>
          <button class="btn btn--filled" value="revoke">Revocar</button>
        </form>
      </dialog>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Vouchers implements OnInit {
  private readonly vouchers = inject(VOUCHERS);
  private readonly createDialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');
  private readonly revokeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('revokeDialog');

  protected readonly canGrantPro = inject(AdminAuth).can('billing:manage');
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly rows = signal<Voucher[]>([]);
  protected readonly created = signal<Voucher[]>([]);
  protected readonly accessories = signal<AccessoryOption[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly status = signal('');
  protected readonly query = signal('');
  protected readonly statusFilter = signal<VoucherStatus | ''>('');
  protected readonly pendingRevoke = signal<Voucher | null>(null);
  protected readonly rewards = signal<Rewards>(emptyRewards());
  protected mode: Mode = 'random';
  protected draft = { code: '', count: 1, maxUses: 1, expiresAt: '', note: '' };
  protected minExpiry = '';

  private readonly accessoryNames = computed(() => new Map(this.accessories().map((a) => [a.id, a.name])));

  protected readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const s = this.statusFilter();
    return this.rows().filter(
      (r) => (!s || r.status === s) && (!q || r.code.toLowerCase().includes(q) || (r.note ?? '').toLowerCase().includes(q)),
    );
  });

  ngOnInit() {
    void this.load();
    this.vouchers.accessories().then(
      (list) => this.accessories.set(list),
      () => undefined,
    );
  }

  protected summary(row: Voucher) {
    const names = this.accessoryNames();
    return describeRewards(row.rewards, (id) => names.get(id) ?? id);
  }

  protected statusLabel(status: VoucherStatus) {
    return VOUCHER_STATUS_LABELS[status] ?? status;
  }

  protected date(iso: string) {
    return dateFormat.format(new Date(iso));
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.rows.set(await this.vouchers.list());
    } catch (e) {
      this.error.set(message(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected openCreate() {
    this.mode = 'random';
    this.draft = { code: '', count: 1, maxUses: 1, expiresAt: '', note: '' };
    this.rewards.set(emptyRewards());
    this.minExpiry = toLocalInput(new Date(Date.now() + 60_000));
    this.formError.set(null);
    this.createDialog().nativeElement.showModal();
  }

  protected async create() {
    if (!hasRewards(this.rewards())) {
      this.formError.set('Añade al menos una recompensa');
      return;
    }
    this.loading.set(true);
    this.formError.set(null);
    try {
      const items = await this.vouchers.create({
        code: this.mode === 'custom' ? this.draft.code : '',
        count: Number(this.draft.count),
        maxUses: Number(this.draft.maxUses),
        expiresAt: this.draft.expiresAt ? new Date(this.draft.expiresAt).toISOString() : null,
        note: this.draft.note,
        rewards: this.rewards(),
      });
      this.created.set(items);
      this.rows.update((rows) => [...items, ...rows]);
      this.status.set(`${items.length} voucher(s) creado(s)`);
      this.createDialog().nativeElement.close();
    } catch (e) {
      this.formError.set(message(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async copyCreated() {
    try {
      await navigator.clipboard.writeText(this.created().map((c) => c.code).join('\n'));
      this.status.set('Códigos copiados al portapapeles');
    } catch {
      this.error.set('No se pudo copiar al portapapeles');
    }
  }

  protected askRevoke(row: Voucher) {
    this.pendingRevoke.set(row);
    this.revokeDialog().nativeElement.showModal();
  }

  protected async onRevokeClose(dialog: HTMLDialogElement) {
    const confirmed = dialog.returnValue === 'revoke';
    dialog.returnValue = '';
    const row = this.pendingRevoke();
    this.pendingRevoke.set(null);
    if (!confirmed || !row) return;
    try {
      const updated = await this.vouchers.revoke(row.id);
      this.rows.update((rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
      this.created.update((list) => list.filter((c) => c.id !== updated.id));
      this.status.set(`Revocado: ${updated.code}`);
    } catch (e) {
      this.error.set(message(e));
    }
  }
}

function message(e: unknown) {
  return e instanceof Error ? e.message : 'Error inesperado';
}

/** Fecha en el formato de `<input type="datetime-local">` (hora local, sin segundos). */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
