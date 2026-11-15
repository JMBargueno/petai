import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { INVITES, INVITE_STATUS_LABELS, Invite, InviteStatus } from '../data/invites-http';

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });
const STATUS_OPTIONS = Object.entries(INVITE_STATUS_LABELS) as [InviteStatus, string][];

/**
 * Invitaciones de registro: interruptor «solo con invitación», generación de códigos y
 * revocación. Datos reales del backend.
 */
@Component({
  selector: 'app-admin-invites',
  imports: [FormsModule],
  styleUrl: '../ui/resource-page.css',
  styles: `
    .settings {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-cards);
      background: var(--surface);
    }
    .settings strong {
      display: block;
    }
    .switch {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: var(--font-weight-bold);
    }
    .switch input {
      inline-size: 20px;
      block-size: 20px;
    }
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
  `,
  template: `
    <section class="page">
      <header class="page__head">
        <div>
          <h1>Invitaciones</h1>
          <p>Códigos de invitación para el registro. Con el modo activo, solo se registra quien tenga un código válido.</p>
        </div>
        <button class="btn btn--filled" type="button" (click)="openCreate()">Generar códigos</button>
      </header>

      <div class="settings">
        <div>
          <strong>Registro solo con invitación</strong>
          <span>{{ inviteOnly() ? 'Activo: el registro exige un código.' : 'Desactivado: cualquiera puede registrarse.' }}</span>
        </div>
        <label class="switch">
          <input
            type="checkbox"
            role="switch"
            [checked]="inviteOnly()"
            [disabled]="savingSettings() || inviteOnly() === null"
            (change)="toggleInviteOnly($event)"
          />
          {{ inviteOnly() ? 'Activado' : 'Desactivado' }}
        </label>
      </div>

      @if (error(); as e) {
        <p class="error" role="alert">{{ e }}</p>
      }

      @if (created().length) {
        <div class="created" role="region" aria-label="Códigos recién generados">
          <strong>Códigos generados ({{ created().length }})</strong>
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
          <span class="visually-hidden">Buscar invitaciones</span>
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

      <div class="table-wrap" role="region" tabindex="0" aria-labelledby="invites-caption">
        <table>
          <caption id="invites-caption">Invitaciones · {{ visible().length }} de {{ rows().length }}</caption>
          <thead>
            <tr>
              <th scope="col" class="plain">Código</th>
              <th scope="col" class="plain">Estado</th>
              <th scope="col" class="plain num">Usos</th>
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
                <td data-label="Estado">{{ statusLabel(row.status) }}</td>
                <td data-label="Usos" class="num">{{ row.usedCount }} / {{ row.maxUses }}</td>
                <td data-label="Caduca">{{ row.expiresAt ? date(row.expiresAt) : 'Nunca' }}</td>
                <td data-label="Nota">{{ row.note ?? '' }}</td>
                <td data-label="Creado">{{ date(row.createdAt) }}{{ row.createdBy ? ' · ' + row.createdBy.email : '' }}</td>
                <td data-label="Acciones">
                  <span class="actions">
                    @if (row.status === 'active') {
                      <button class="btn btn--sm" type="button" [attr.aria-label]="'Revocar ' + row.code" (click)="askRevoke(row)">
                        Revocar
                      </button>
                    }
                  </span>
                </td>
              </tr>
            } @empty {
              <tr>
                <td class="empty" colspan="7">{{ loading() ? 'Cargando…' : 'Sin invitaciones' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <p class="visually-hidden" role="status">{{ status() }}</p>

      <dialog #createDialog class="dialog" aria-labelledby="invites-create-title">
        <form class="form" ngNativeValidate (ngSubmit)="create()">
          <h2 id="invites-create-title">Generar códigos</h2>
          <div class="form-row">
            <div class="field">
              <label for="invites-count">Cantidad</label>
              <input class="input" id="invites-count" name="count" type="number" step="1" min="1" max="50" required [(ngModel)]="draft.count" />
            </div>
            <div class="field">
              <label for="invites-uses">Usos por código</label>
              <input class="input" id="invites-uses" name="maxUses" type="number" step="1" min="1" max="10000" required [(ngModel)]="draft.maxUses" />
            </div>
          </div>
          <div class="field">
            <label for="invites-expires">Caduca (opcional)</label>
            <input class="input" id="invites-expires" name="expiresAt" type="datetime-local" [min]="minExpiry" [(ngModel)]="draft.expiresAt" />
          </div>
          <div class="field">
            <label for="invites-note">Nota (opcional)</label>
            <input class="input" id="invites-note" name="note" type="text" maxlength="200" placeholder="Para quién es" [(ngModel)]="draft.note" />
          </div>
          @if (formError(); as e) {
            <p class="error" role="alert">{{ e }}</p>
          }
          <div class="dialog__actions">
            <button class="btn" type="button" (click)="createDialog.close()">Cancelar</button>
            <button class="btn btn--filled" type="submit" [disabled]="loading()">Generar</button>
          </div>
        </form>
      </dialog>

      <dialog #revokeDialog class="dialog" closedby="any" aria-labelledby="invites-revoke-title" (close)="onRevokeClose(revokeDialog)">
        <h2 id="invites-revoke-title">¿Revocar «{{ pendingRevoke()?.code }}»?</h2>
        <p>El código dejará de servir para registrarse. Las cuentas ya creadas con él no se ven afectadas.</p>
        <form method="dialog" class="dialog__actions">
          <button class="btn" value="cancel" autofocus>Cancelar</button>
          <button class="btn btn--filled" value="revoke">Revocar</button>
        </form>
      </dialog>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Invites implements OnInit {
  private readonly invites = inject(INVITES);
  private readonly createDialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');
  private readonly revokeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('revokeDialog');

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly rows = signal<Invite[]>([]);
  protected readonly created = signal<Invite[]>([]);
  protected readonly inviteOnly = signal<boolean | null>(null);
  protected readonly loading = signal(false);
  protected readonly savingSettings = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly status = signal('');
  protected readonly query = signal('');
  protected readonly statusFilter = signal<InviteStatus | ''>('');
  protected readonly pendingRevoke = signal<Invite | null>(null);
  protected draft = { count: 1, maxUses: 1, expiresAt: '', note: '' };
  protected minExpiry = '';

  protected readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const s = this.statusFilter();
    return this.rows().filter(
      (r) => (!s || r.status === s) && (!q || r.code.toLowerCase().includes(q) || (r.note ?? '').toLowerCase().includes(q)),
    );
  });

  ngOnInit() {
    void this.load();
  }

  protected statusLabel(status: InviteStatus) {
    return INVITE_STATUS_LABELS[status] ?? status;
  }

  protected date(iso: string) {
    return dateFormat.format(new Date(iso));
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [rows, inviteOnly] = await Promise.all([this.invites.list(), this.invites.inviteOnly()]);
      this.rows.set(rows);
      this.inviteOnly.set(inviteOnly);
    } catch (e) {
      this.error.set(message(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async toggleInviteOnly(event: Event) {
    const input = event.target as HTMLInputElement;
    const wanted = input.checked;
    this.savingSettings.set(true);
    this.error.set(null);
    try {
      this.inviteOnly.set(await this.invites.setInviteOnly(wanted));
      this.status.set(`Registro solo con invitación ${wanted ? 'activado' : 'desactivado'}`);
    } catch (e) {
      input.checked = !wanted;
      this.error.set(message(e));
    } finally {
      this.savingSettings.set(false);
    }
  }

  protected openCreate() {
    this.draft = { count: 1, maxUses: 1, expiresAt: '', note: '' };
    this.minExpiry = toLocalInput(new Date(Date.now() + 60_000));
    this.formError.set(null);
    this.createDialog().nativeElement.showModal();
  }

  protected async create() {
    this.loading.set(true);
    this.formError.set(null);
    try {
      const items = await this.invites.create({
        count: Number(this.draft.count),
        maxUses: Number(this.draft.maxUses),
        expiresAt: this.draft.expiresAt ? new Date(this.draft.expiresAt).toISOString() : null,
        note: this.draft.note,
      });
      this.created.set(items);
      this.rows.update((rows) => [...items, ...rows]);
      this.status.set(`${items.length} código(s) generado(s)`);
      this.createDialog().nativeElement.close();
    } catch (e) {
      this.formError.set(message(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async copyCreated() {
    const text = this.created().map((c) => c.code).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.status.set('Códigos copiados al portapapeles');
    } catch {
      this.error.set('No se pudo copiar al portapapeles');
    }
  }

  protected askRevoke(row: Invite) {
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
      const updated = await this.invites.revoke(row.id);
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
