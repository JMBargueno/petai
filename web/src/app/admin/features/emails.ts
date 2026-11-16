import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ROLES, type AdminRole } from '../data/models';
import {
  CAMPAIGN_STATUS_LABELS,
  EMAILS,
  parseEmailList,
  type Audience,
  type Campaign,
  type CampaignStatus,
  type UserHit,
} from '../data/emails-http';

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });
const ROLE_OPTIONS = Object.entries(ROLES) as [AdminRole, string][];
type AudienceMode = 'segment' | 'users' | 'emails';

/** Cuerpo de ejemplo: muestra lo que admite la plantilla (titulares, párrafos, enlaces, botón). */
const SAMPLE_HTML = `<h2>¡Llega el evento de invierno!</h2>
<p>Hola, entrenador. Durante dos semanas tu Pockai podrá encontrar <strong>huevos de nieve</strong> y nuevos objetos de temporada.</p>
<p>Entra en la app para descubrirlo y <a href="https://pockai.world">lee todos los detalles en la web</a>.</p>
<p style="margin:24px 0;"><a href="https://pockai.world" style="display:inline-block;padding:14px 28px;border:1px solid #0b0a14;border-radius:9999px;background:#5c4ade;color:#ffffff;text-decoration:none;font-weight:700;">Abrir Pockai</a></p>
<p>¡Nos vemos dentro!</p>`;

/**
 * Envíos de correo a usuarios: asunto, preencabezado y cuerpo en HTML libre envuelto en la
 * plantilla de marca. La vista previa es el HTML final del servidor pintado en un iframe con
 * `sandbox` sin `allow-scripts` ni `allow-same-origin`: el HTML pegado no puede ejecutar código ni
 * leer la sesión del panel.
 */
@Component({
  selector: 'app-admin-emails',
  imports: [FormsModule],
  styleUrl: '../ui/resource-page.css',
  styles: `
    .composer {
      display: grid;
      gap: 16px;
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
    }
    @media (min-width: 1100px) {
      .composer {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
    }
    .panel {
      display: grid;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-cards);
      background: var(--surface);
      box-shadow: var(--shadow-2);
    }
    .panel h2 {
      font-size: var(--text-subheading);
    }
    .code {
      min-block-size: 280px;
      font-family: ui-monospace, 'Cascadia Code', monospace;
      font-size: 13px;
      line-height: 1.5;
      tab-size: 2;
      resize: vertical;
    }
    fieldset {
      display: grid;
      gap: 12px;
      margin: 0;
      padding: 0;
      border: 0;
      min-inline-size: 0;
    }
    legend {
      padding: 0;
      margin-block-end: 8px;
      font-weight: var(--font-weight-bold);
      font-size: var(--text-caption);
      letter-spacing: 0.032em;
      text-transform: uppercase;
    }
    .modes {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
    }
    .form-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 4px 2px 12px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-pills);
      background: var(--surface-2);
      font-size: 14px;
    }
    .chip button {
      inline-size: 28px;
      block-size: 28px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .chip button:hover {
      background: color-mix(in srgb, var(--accent) 12%, transparent);
    }
    .hits {
      display: grid;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .hits button {
      inline-size: 100%;
      padding: 8px 12px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-2xl);
      background: var(--surface);
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .hits button:hover,
    .hits button:focus-visible {
      border-color: var(--accent);
    }
    .muted {
      color: var(--ink-muted);
      font-size: 14px;
    }
    .count {
      font-weight: var(--font-weight-bold);
    }
    .warn {
      color: var(--color-ember);
      font-size: 14px;
    }
    .send-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: end;
      gap: 8px;
    }
    .preview-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .preview-frame {
      display: block;
      inline-size: 100%;
      max-inline-size: 100%;
      block-size: min(78vh, 900px);
      margin-inline: auto;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-2xl);
      background: #dceeff;
      transition: max-inline-size 0.2s ease;
    }
    .preview-frame.mobile {
      max-inline-size: 390px;
    }
    @media (min-width: 1100px) {
      .preview {
        position: sticky;
        inset-block-start: 16px;
      }
    }
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-pills);
      font-size: 13px;
      font-weight: var(--font-weight-bold);
      white-space: nowrap;
    }
    .badge--sent {
      background: color-mix(in srgb, var(--color-mint-pop) 35%, transparent);
    }
    .badge--failed {
      background: color-mix(in srgb, var(--color-ember) 25%, transparent);
    }
    .badge--sending,
    .badge--queued {
      background: color-mix(in srgb, var(--color-sunburst) 40%, transparent);
    }
    dialog:modal {
      overscroll-behavior: contain;
    }
    dialog::backdrop {
      overflow: hidden;
      overscroll-behavior: contain;
    }
  `,
  template: `
    <section class="page">
      <header class="page__head">
        <div>
          <h1>Correos</h1>
          <p>Envía correos con la plantilla de Pockai. Nunca se envía a quien se dio de baja, y los envíos a cuentas llevan enlace de baja.</p>
        </div>
      </header>

      @if (error(); as e) {
        <p class="error" role="alert">{{ e }}</p>
      }

      <div class="composer">
        <form class="panel form" ngNativeValidate (ngSubmit)="askSend()">
          <h2>Nuevo envío</h2>

          <div class="field">
            <label for="email-subject">Asunto</label>
            <input class="input" id="email-subject" name="subject" type="text" maxlength="200" required
              [ngModel]="subject()" (ngModelChange)="subject.set($event)" />
          </div>
          <div class="field">
            <label for="email-preheader">Preencabezado (opcional)</label>
            <input class="input" id="email-preheader" name="preheader" type="text" maxlength="200"
              placeholder="Texto que muestran las bandejas junto al asunto"
              [ngModel]="preheader()" (ngModelChange)="preheader.set($event)" />
          </div>
          <div class="field">
            <label for="email-html">Cuerpo (HTML)</label>
            <textarea class="input code" id="email-html" name="html" required spellcheck="false" autocomplete="off"
              aria-describedby="email-html-help"
              [ngModel]="html()" (ngModelChange)="html.set($event)"></textarea>
            <span id="email-html-help" class="muted">
              Solo el contenido: la cabecera con el logo, la tarjeta y el pie los pone la plantilla. Los scripts se eliminan.
              <button class="btn btn--sm" type="button" (click)="insertSample()">Insertar ejemplo</button>
            </span>
          </div>

          <fieldset>
            <legend>Destinatarios</legend>
            <div class="modes" role="radiogroup" aria-label="Tipo de destinatarios">
              @for (m of modes; track m[0]) {
                <label class="check">
                  <input type="radio" name="mode" [value]="m[0]" [ngModel]="mode()" (ngModelChange)="mode.set($event)" />
                  {{ m[1] }}
                </label>
              }
            </div>

            @switch (mode()) {
              @case ('segment') {
                <div class="form-row">
                  <div class="field">
                    <label for="email-role">Rol</label>
                    <select class="input" id="email-role" name="role" [ngModel]="segmentRole()" (ngModelChange)="segmentRole.set($event)">
                      <option value="">Todos los roles</option>
                      @for (r of roleOptions; track r[0]) {
                        <option [value]="r[0]">{{ r[1] }}</option>
                      }
                    </select>
                  </div>
                  <div class="field">
                    <label for="email-verified">Correo</label>
                    <select class="input" id="email-verified" name="verified" [ngModel]="segmentVerified()" (ngModelChange)="segmentVerified.set($event)">
                      <option value="any">Verificados y sin verificar</option>
                      <option value="verified">Solo verificados</option>
                      <option value="unverified">Solo sin verificar</option>
                    </select>
                  </div>
                </div>
              }
              @case ('users') {
                <div class="field">
                  <label for="email-user-search">Buscar usuarios</label>
                  <input class="input" id="email-user-search" name="userSearch" type="search" autocomplete="off"
                    placeholder="Correo o nombre…" [ngModel]="userQuery()" (ngModelChange)="onUserQuery($event)" />
                </div>
                @if (hits().length) {
                  <ul class="hits" aria-label="Resultados">
                    @for (h of hits(); track h.id) {
                      <li>
                        <button type="button" (click)="addUser(h)">
                          {{ h.email }}@if (h.displayName) { <span class="muted"> · {{ h.displayName }}</span> }
                        </button>
                      </li>
                    }
                  </ul>
                }
                @if (selected().length) {
                  <ul class="chips" aria-label="Usuarios elegidos">
                    @for (u of selected(); track u.id) {
                      <li class="chip">
                        {{ u.email }}
                        <button type="button" [attr.aria-label]="'Quitar ' + u.email" (click)="removeUser(u.id)">✕</button>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="muted">Busca y elige uno o varios usuarios.</p>
                }
              }
              @case ('emails') {
                <div class="field">
                  <label for="email-list">Correos</label>
                  <textarea class="input" id="email-list" name="emailList" rows="4" spellcheck="false"
                    placeholder="uno@ejemplo.com, otro@ejemplo.com…"
                    [ngModel]="emailList()" (ngModelChange)="emailList.set($event)"></textarea>
                  <span class="muted">Separados por comas, espacios o saltos de línea. Máximo 500.</span>
                  @if (parsedEmails().invalid.length) {
                    <span class="warn" role="alert">No válidos (se ignoran): {{ parsedEmails().invalid.join(', ') }}</span>
                  }
                </div>
              }
            }

            <p aria-live="polite">
              @if (counting()) {
                <span class="muted">Calculando destinatarios…</span>
              } @else if (recipients() !== null) {
                <span class="count">{{ recipients() }} destinatario(s)</span>
              }
            </p>
          </fieldset>

          @if (formError(); as e) {
            <p class="error" role="alert">{{ e }}</p>
          }
          <p class="muted" role="status">{{ notice() }}</p>

          <div class="send-actions">
            <button class="btn" type="button" (click)="sendTest()" [disabled]="busy() || !canSendContent()">Enviarme una prueba</button>
            <button class="btn btn--filled" type="submit" [disabled]="busy() || !canSendContent() || !recipients()">Enviar…</button>
          </div>
        </form>

        <section class="panel preview" aria-labelledby="email-preview-title">
          <div class="preview-head">
            <h2 id="email-preview-title">Vista previa</h2>
            <label class="check">
              <input type="checkbox" name="mobile" [ngModel]="mobile()" (ngModelChange)="mobile.set($event)" />
              Móvil
            </label>
          </div>
          <iframe
            #previewFrame
            class="preview-frame"
            [class.mobile]="mobile()"
            title="Vista previa del correo"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            referrerpolicy="no-referrer"
          ></iframe>
        </section>
      </div>

      <div class="toolbar">
        <h2>Historial</h2>
        <button class="btn btn--sm" type="button" (click)="loadHistory()" [disabled]="loadingHistory()">Recargar</button>
      </div>
      <div class="table-wrap" role="region" tabindex="0" aria-labelledby="emails-caption">
        <table>
          <caption id="emails-caption">Envíos recientes · {{ campaigns().length }}</caption>
          <thead>
            <tr>
              <th scope="col" class="plain">Asunto</th>
              <th scope="col" class="plain">Destinatarios</th>
              <th scope="col" class="plain">Estado</th>
              <th scope="col" class="plain num">Enviados</th>
              <th scope="col" class="plain num">Fallidos</th>
              <th scope="col" class="plain">Creado</th>
            </tr>
          </thead>
          <tbody>
            @for (c of campaigns(); track c.id) {
              <tr>
                <th scope="row">{{ c.subject }}</th>
                <td data-label="Destinatarios">{{ audienceLabel(c.audience) }}</td>
                <td data-label="Estado">
                  <span [class]="'badge badge--' + c.status" [attr.title]="c.lastError ?? null">{{ statusLabel(c.status) }}</span>
                </td>
                <td data-label="Enviados" class="num">{{ c.sent }} / {{ c.total }}</td>
                <td data-label="Fallidos" class="num">{{ c.failed }}</td>
                <td data-label="Creado">{{ date(c.createdAt) }}{{ c.createdBy ? ' · ' + c.createdBy.email : '' }}</td>
              </tr>
            } @empty {
              <tr>
                <td class="empty" colspan="6">{{ loadingHistory() ? 'Cargando…' : 'Todavía no hay envíos' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <p class="visually-hidden" role="status">{{ status() }}</p>

      <dialog #confirmDialog class="dialog" closedby="any" aria-labelledby="emails-confirm-title" (close)="onConfirmClose(confirmDialog)">
        <h2 id="emails-confirm-title">¿Enviar a {{ recipients() }} destinatario(s)?</h2>
        <p>«{{ subject() }}». El envío se hace por lotes y no se puede cancelar una vez iniciado.</p>
        <form method="dialog" class="dialog__actions">
          <button class="btn" value="cancel" autofocus>Cancelar</button>
          <button class="btn btn--filled" value="send">Enviar</button>
        </form>
      </dialog>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Emails implements OnInit {
  private readonly emails = inject(EMAILS);
  private readonly previewFrame = viewChild.required<ElementRef<HTMLIFrameElement>>('previewFrame');
  private readonly confirmDialog = viewChild.required<ElementRef<HTMLDialogElement>>('confirmDialog');

  protected readonly modes: [AudienceMode, string][] = [
    ['segment', 'Segmento'],
    ['users', 'Usuarios concretos'],
    ['emails', 'Lista de correos'],
  ];
  protected readonly roleOptions = ROLE_OPTIONS;

  protected readonly subject = signal('');
  protected readonly preheader = signal('');
  protected readonly html = signal('');
  protected readonly mode = signal<AudienceMode>('segment');
  protected readonly segmentRole = signal<AdminRole | ''>('');
  protected readonly segmentVerified = signal<'any' | 'verified' | 'unverified'>('any');
  protected readonly userQuery = signal('');
  protected readonly hits = signal<UserHit[]>([]);
  protected readonly selected = signal<UserHit[]>([]);
  protected readonly emailList = signal('');
  protected readonly mobile = signal(false);

  protected readonly recipients = signal<number | null>(null);
  protected readonly counting = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly status = signal('');
  /** Aviso visible (y anunciado) tras una acción correcta. */
  protected readonly notice = signal('');
  protected readonly campaigns = signal<Campaign[]>([]);
  protected readonly loadingHistory = signal(false);

  protected readonly parsedEmails = computed(() => parseEmailList(this.emailList()));
  protected readonly canSendContent = computed(() => !!this.subject().trim() && !!this.html().trim());

  /** Destinatarios actuales en el formato del backend (null si aún no hay ninguno elegido). */
  protected readonly audience = computed<Audience | null>(() => {
    switch (this.mode()) {
      case 'segment':
        return { type: 'segment', verified: this.segmentVerified(), ...(this.segmentRole() ? { role: this.segmentRole() as AdminRole } : {}) };
      case 'users':
        return this.selected().length ? { type: 'users', userIds: this.selected().map((u) => u.id) } : null;
      case 'emails':
        return this.parsedEmails().valid.length ? { type: 'emails', emails: this.parsedEmails().valid.slice(0, 500) } : null;
    }
  });

  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private countTimer: ReturnType<typeof setTimeout> | undefined;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private previewSeq = 0;
  private countSeq = 0;

  constructor() {
    // Vista previa con el HTML final del servidor (con retardo para no pedirla en cada tecla).
    effect(() => {
      const content = { subject: this.subject(), preheader: this.preheader() || undefined, html: this.html() };
      clearTimeout(this.previewTimer);
      this.previewTimer = setTimeout(() => void this.refreshPreview(content), 350);
    });
    // Recuento de destinatarios al cambiar el público.
    effect(() => {
      const audience = this.audience();
      clearTimeout(this.countTimer);
      if (!audience) {
        this.recipients.set(0);
        return;
      }
      this.countTimer = setTimeout(() => void this.refreshCount(audience), 300);
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.previewTimer);
      clearTimeout(this.countTimer);
      clearTimeout(this.searchTimer);
      clearInterval(this.pollTimer);
    });
  }

  ngOnInit() {
    void this.loadHistory();
  }

  private async refreshPreview(content: { subject: string; preheader?: string; html: string }) {
    const seq = ++this.previewSeq;
    try {
      const html = await this.emails.preview(content);
      // Solo la última petición pinta (las respuestas pueden llegar desordenadas).
      if (seq === this.previewSeq) this.previewFrame().nativeElement.srcdoc = html;
    } catch (e) {
      if (seq === this.previewSeq) this.error.set(message(e));
    }
  }

  private async refreshCount(audience: Audience) {
    const seq = ++this.countSeq;
    this.counting.set(true);
    try {
      const n = await this.emails.count(audience);
      if (seq === this.countSeq) this.recipients.set(n);
    } catch (e) {
      if (seq === this.countSeq) {
        this.recipients.set(null);
        this.formError.set(message(e));
      }
    } finally {
      if (seq === this.countSeq) this.counting.set(false);
    }
  }

  protected insertSample() {
    this.html.set(SAMPLE_HTML);
    if (!this.subject()) this.subject.set('¡Llega el evento de invierno a Pockai!');
  }

  protected onUserQuery(q: string) {
    this.userQuery.set(q);
    clearTimeout(this.searchTimer);
    if (q.trim().length < 2) {
      this.hits.set([]);
      return;
    }
    this.searchTimer = setTimeout(async () => {
      try {
        const picked = new Set(this.selected().map((u) => u.id));
        this.hits.set((await this.emails.searchUsers(q.trim())).filter((h) => !picked.has(h.id)));
      } catch (e) {
        this.formError.set(message(e));
      }
    }, 250);
  }

  protected addUser(user: UserHit) {
    if (this.selected().some((u) => u.id === user.id)) return;
    this.selected.update((list) => [...list, user]);
    this.hits.update((list) => list.filter((h) => h.id !== user.id));
    this.status.set(`${user.email} añadido`);
  }

  protected removeUser(id: string) {
    this.selected.update((list) => list.filter((u) => u.id !== id));
  }

  private content() {
    return { subject: this.subject().trim(), preheader: this.preheader().trim() || undefined, html: this.html() };
  }

  protected async sendTest() {
    this.busy.set(true);
    this.formError.set(null);
    try {
      const to = await this.emails.sendTest(this.content());
      this.notice.set(`Prueba enviada a ${to}`);
    } catch (e) {
      this.formError.set(message(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected askSend() {
    this.formError.set(null);
    this.notice.set('');
    if (!this.audience() || !this.recipients()) {
      this.formError.set('Elige al menos un destinatario');
      return;
    }
    this.confirmDialog().nativeElement.showModal();
  }

  protected async onConfirmClose(dialog: HTMLDialogElement) {
    const choice = dialog.returnValue;
    dialog.returnValue = '';
    if (choice !== 'send') return;
    const audience = this.audience();
    if (!audience) return;
    this.busy.set(true);
    try {
      const campaign = await this.emails.send(this.content(), audience);
      this.campaigns.update((list) => [campaign, ...list.filter((c) => c.id !== campaign.id)]);
      this.notice.set(`Envío creado: ${campaign.total} destinatario(s). Puedes seguir el progreso en el historial.`);
      this.subject.set('');
      this.preheader.set('');
      this.html.set('');
      this.selected.set([]);
      this.emailList.set('');
      this.startPolling();
    } catch (e) {
      this.formError.set(message(e));
    } finally {
      this.busy.set(false);
    }
  }

  async loadHistory() {
    this.loadingHistory.set(true);
    try {
      this.campaigns.set(await this.emails.list());
      if (this.campaigns().some(isActive)) this.startPolling();
    } catch (e) {
      this.error.set(message(e));
    } finally {
      this.loadingHistory.set(false);
    }
  }

  /** Mientras haya envíos en curso, refresca el historial cada 5 s. */
  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(async () => {
      try {
        this.campaigns.set(await this.emails.list());
      } catch {
        /* se reintenta en el siguiente ciclo */
      }
      if (!this.campaigns().some(isActive)) {
        clearInterval(this.pollTimer);
        this.pollTimer = undefined;
      }
    }, 5000);
  }

  protected statusLabel(s: CampaignStatus) {
    return CAMPAIGN_STATUS_LABELS[s] ?? s;
  }

  protected audienceLabel(a: Audience) {
    switch (a.type) {
      case 'users':
        return `${a.userIds.length} usuario(s)`;
      case 'emails':
        return `${a.emails.length} correo(s)`;
      case 'segment': {
        const role = a.role ? ROLES[a.role] : 'Todos';
        const verified = { any: '', verified: ' · verificados', unverified: ' · sin verificar' }[a.verified ?? 'any'];
        return `Segmento: ${role}${verified}`;
      }
    }
  }

  protected date(iso: string) {
    return dateFormat.format(new Date(iso));
  }
}

const isActive = (c: Campaign) => c.status === 'queued' || c.status === 'sending';

function message(e: unknown): string {
  return e instanceof Error ? e.message : 'Ha ocurrido un error';
}
