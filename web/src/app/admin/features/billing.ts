import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApi } from '../api';

interface BillingStats {
  activeSubscribers: number;
  pastDueSubscribers: number;
  canceledSubscribers30d: number;
  estimatedMrr: number;
  currency: string;
  dailySpendUsd: number;
  monthlySpendUsd: number;
  activeFreeUsersToday: number;
  activeConfigVersion: number;
}

/** Conexión de IA interna tal como la devuelve el backend (la clave nunca viaja, solo su máscara). */
interface InternalAiView {
  configured: boolean;
  enabled: boolean;
  baseUrl: string | null;
  model: string | null;
  hasKey: boolean;
  keyMask: string | null;
  jsonMode: boolean;
  allowPrivateNetwork: boolean;
  updatedAt: string | null;
}

interface BillingConfigVersion {
  id: string;
  version: number;
  active: boolean;
  createdById: string;
  note: string | null;
  createdAt: string;
}

@Component({
  selector: 'app-admin-billing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="billing-page">
      <header class="page-header">
        <div>
          <h2>Facturación e IA gestionada</h2>
          <p class="intro">
            Gestión centralizada de planes, límites diarios de IA, precios en Stripe/Google Play,
            modelos de OpenRouter y control de gasto.
          </p>
        </div>
        <button class="btn btn-secondary" (click)="loadAll()" [disabled]="loading()">
          {{ loading() ? 'Cargando...' : 'Refrescar datos' }}
        </button>
      </header>

      @if (stats(); as s) {
        <section class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Suscriptores Pro</span>
            <span class="stat-value">{{ s.activeSubscribers }}</span>
            <span class="stat-sub">{{ s.pastDueSubscribers }} con pago pendiente</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">MRR Estimado</span>
            <span class="stat-value">{{ s.estimatedMrr | number:'1.2-2' }} €</span>
            <span class="stat-sub">{{ s.canceledSubscribers30d }} cancelados (30d)</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Gasto IA Hoy (UTC)</span>
            <span class="stat-value">{{ s.dailySpendUsd | number:'1.4-4' }} $</span>
            <span class="stat-sub">Mes actual: {{ s.monthlySpendUsd | number:'1.2-2' }} $</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Usuarios Free Hoy</span>
            <span class="stat-value">{{ s.activeFreeUsersToday }}</span>
            <span class="stat-sub">Versión activa: v{{ s.activeConfigVersion }}</span>
          </div>
        </section>
      }

      @if (error()) {
        <div class="alert alert-error">{{ error() }}</div>
      }
      @if (success()) {
        <div class="alert alert-success">{{ success() }}</div>
      }

      <div class="two-columns">
        <!-- Editor de Configuración -->
        <section class="card config-card">
          <h3>Configuración activa (v{{ currentVersion() }})</h3>
          <p class="section-desc">
            Al guardar se crea una versión inmutable nueva que se sincroniza inmediatamente con todos los pods de backend.
          </p>

          @if (formConfig) {
            <form (ngSubmit)="saveConfig()">
              <div class="fieldset-group">
                <h4>Precios de Suscripción</h4>
                <div class="row">
                  <label class="field">
                    <span>Precio mensual (EUR €)</span>
                    <input type="number" step="0.01" [(ngModel)]="formConfig.pricing.monthlyPriceEur" name="priceEur" required />
                  </label>
                  <label class="field">
                    <span>Precio mensual (USD $)</span>
                    <input type="number" step="0.01" [(ngModel)]="formConfig.pricing.monthlyPriceUsd" name="priceUsd" required />
                  </label>
                  <label class="field">
                    <span>Días de prueba</span>
                    <input type="number" [(ngModel)]="formConfig.pricing.trialDays" name="trialDays" min="0" />
                  </label>
                </div>
                <p class="section-desc">
                  Al cambiar el precio se crea un precio nuevo en Stripe para las altas nuevas; los suscriptores
                  actuales mantienen el suyo. En Google Play el precio y la prueba se cambian en Play Console.
                </p>
              </div>

              <div class="fieldset-group">
                <h4>Plan Gratuito (Free)</h4>
                <div class="row">
                  <label class="field">
                    <span>Mensajes diarios</span>
                    <input type="number" [(ngModel)]="formConfig.free.dailyMessages" name="freeDaily" required min="1" />
                  </label>
                  <label class="field">
                    <span>Límite caracteres entrada</span>
                    <input type="number" [(ngModel)]="formConfig.free.maxInputChars" name="freeChars" required min="50" />
                  </label>
                  <label class="field">
                    <span>Mensajes en memoria/historial</span>
                    <input type="number" [(ngModel)]="formConfig.free.historyMessages" name="freeHist" required min="1" />
                  </label>
                  <label class="field">
                    <span>Historias de aventura al día</span>
                    <input type="number" [(ngModel)]="formConfig.free.dailyStories" name="freeStories" required min="0" max="8" />
                  </label>
                </div>
              </div>

              <div class="fieldset-group">
                <h4>Plan Pro</h4>
                <div class="row">
                  <label class="field">
                    <span>Mensajes diarios</span>
                    <input type="number" [(ngModel)]="formConfig.pro.dailyMessages" name="proDaily" required min="1" />
                  </label>
                  <label class="field">
                    <span>Límite caracteres entrada</span>
                    <input type="number" [(ngModel)]="formConfig.pro.maxInputChars" name="proChars" required min="50" />
                  </label>
                  <label class="field">
                    <span>Mensajes en memoria/historial</span>
                    <input type="number" [(ngModel)]="formConfig.pro.historyMessages" name="proHist" required min="1" />
                  </label>
                  <label class="field">
                    <span>Historias de aventura al día</span>
                    <input type="number" [(ngModel)]="formConfig.pro.dailyStories" name="proStories" required min="0" max="8" />
                  </label>
                </div>
                <div class="row checkbox-row">
                  <label class="checkbox-label">
                    <input type="checkbox" [(ngModel)]="formConfig.pro.agentTools" name="proTools" />
                    <span>Herramientas de agente desbloqueadas (recordatorios, tareas, etc.)</span>
                  </label>
                </div>
              </div>

              <div class="fieldset-group">
                <h4>IA Gestionada (OpenRouter)</h4>
                <div class="row checkbox-row">
                  <label class="checkbox-label">
                    <input type="checkbox" [(ngModel)]="formConfig.managedAi.enabled" name="managedEnabled" />
                    <span>IA gestionada habilitada globalmente</span>
                  </label>
                </div>
                <div class="row">
                  <label class="field field-full">
                    <span>Modelo principal</span>
                    <input type="text" [(ngModel)]="formConfig.managedAi.primaryModel" name="primaryModel" required />
                  </label>
                </div>
                <div class="row">
                  <label class="field field-full">
                    <span>Modelos de reserva (separados por coma)</span>
                    <input type="text" [ngModel]="fallbackModelsString" (ngModelChange)="onFallbackModelsChange($event)" name="fallbacks" />
                  </label>
                </div>
                <div class="row">
                  <label class="field">
                    <span>Presupuesto diario ($ USD)</span>
                    <input type="number" step="0.5" [(ngModel)]="formConfig.managedAi.dailyBudgetUsd" name="budgetUsd" required min="1" />
                  </label>
                  <label class="field">
                    <span>Multiplicador presupuesto Pro</span>
                    <input type="number" step="0.1" [(ngModel)]="formConfig.managedAi.proBudgetMultiplier" name="proMultiplier" min="1" />
                  </label>
                  <label class="field">
                    <span>Concurrencia máx. por pod</span>
                    <input type="number" [(ngModel)]="formConfig.managedAi.maxConcurrency" name="concurrency" min="1" />
                  </label>
                </div>
              </div>

              @if (formConfig.systemAi) {
                <div class="fieldset-group">
                  <h4>IA del sistema (aventura diaria)</h4>
                  <p class="section-desc">
                    Límites de las tareas internas, como tejer las historias de cada noche. La conexión que usan se
                    configura más abajo, en «IA interna».
                  </p>
                  <div class="row checkbox-row">
                    <label class="checkbox-label">
                      <input type="checkbox" [(ngModel)]="formConfig.systemAi.enabled" name="systemEnabled" />
                      <span>IA del sistema habilitada (apagada, las historias salen de las de reserva)</span>
                    </label>
                  </div>
                  <div class="row">
                    <label class="field">
                      <span>Presupuesto diario ($ USD)</span>
                      <input type="number" step="0.1" [(ngModel)]="formConfig.systemAi.dailyBudgetUsd" name="systemBudget" required min="0" />
                    </label>
                    <label class="field">
                      <span>Tokens de salida máx.</span>
                      <input type="number" [(ngModel)]="formConfig.systemAi.maxOutputTokens" name="systemTokens" required min="256" max="8000" />
                    </label>
                    <label class="field">
                      <span>Temperatura</span>
                      <input type="number" step="0.1" [(ngModel)]="formConfig.systemAi.temperature" name="systemTemp" required min="0" max="2" />
                    </label>
                  </div>
                  <div class="row">
                    <label class="field field-full">
                      <span>Modelo de respaldo en OpenRouter (solo si no hay IA interna activa)</span>
                      <input type="text" [(ngModel)]="formConfig.systemAi.model" name="systemModel" required />
                    </label>
                  </div>
                </div>
              }

              <div class="fieldset-group">
                <h4>Nota de cambio</h4>
                <label class="field field-full">
                  <span>Motivo del cambio (para registro de auditoría)</span>
                  <input type="text" [(ngModel)]="changeNote" name="changeNote" placeholder="Ej. Aumento de cuota diaria o cambio de modelo de reserva" />
                </label>
              </div>

              <div class="form-actions">
                <button type="submit" class="btn btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Guardando versión...' : 'Guardar y activar nueva versión' }}
                </button>
              </div>
            </form>
          }
        </section>

        <!-- Historial de Versiones -->
        <section class="card history-card">
          <h3>Historial de versiones</h3>
          <p class="section-desc">Auditoría completa de cambios y rollback con 1 clic.</p>

          <div class="versions-list">
            @for (v of versions(); track v.id) {
              <div class="version-item" [class.is-active]="v.active">
                <div class="version-meta">
                  <div class="version-badge-line">
                    <span class="v-num">v{{ v.version }}</span>
                    @if (v.active) {
                      <span class="badge badge-active">Activa</span>
                    }
                  </div>
                  <span class="v-date">{{ v.createdAt | date:'short' }} · {{ v.createdById }}</span>
                  @if (v.note) {
                    <p class="v-note">{{ v.note }}</p>
                  }
                </div>
                @if (!v.active) {
                  <button class="btn btn-sm" (click)="activateVersion(v.version)" [disabled]="activating()">
                    Revertir
                  </button>
                }
              </div>
            }
          </div>
        </section>
      </div>

      <!-- Conexión de IA interna -->
      <section class="card">
        <h3>IA interna</h3>
        <p class="section-desc">
          Conexión propia del equipo a cualquier servidor compatible con la API de OpenAI (Chat Completions).
          La usa la IA del sistema para tejer las historias de la aventura diaria. El chat de los usuarios no
          pasa por aquí: sigue con la IA gestionada de OpenRouter o con la clave de cada usuario.
        </p>

        @if (internalAi(); as ia) {
          <p class="internal-status" [class.is-on]="ia.configured && ia.enabled">
            @if (!ia.configured) {
              Sin configurar: la IA del sistema usa el respaldo de OpenRouter, si el servidor tiene su clave.
            } @else if (!ia.enabled) {
              Guardada pero desactivada: la IA del sistema usa el respaldo de OpenRouter.
            } @else {
              Activa · {{ ia.model }} · {{ ia.hasKey ? 'clave ' + ia.keyMask : 'sin clave' }}
            }
          </p>
        }
        @if (internalError()) {
          <div class="alert alert-error">{{ internalError() }}</div>
        }
        @if (internalSuccess()) {
          <div class="alert alert-success">{{ internalSuccess() }}</div>
        }

        <form (ngSubmit)="saveInternalAi()">
          <div class="row">
            <label class="field field-full">
              <span>URL base (termina normalmente en /v1)</span>
              <input type="url" [(ngModel)]="internalForm.baseUrl" name="iaBaseUrl" placeholder="https://ia.ejemplo.com/v1" required />
            </label>
          </div>
          <div class="row">
            <label class="field">
              <span>Modelo</span>
              <input type="text" [(ngModel)]="internalForm.model" name="iaModel" placeholder="nombre-del-modelo" required />
            </label>
            <label class="field">
              <span>Clave de API</span>
              <input
                type="password"
                [(ngModel)]="internalForm.apiKey"
                name="iaApiKey"
                autocomplete="off"
                [placeholder]="internalAi()?.hasKey ? 'Guardada (' + internalAi()?.keyMask + '). Escribe para cambiarla' : 'Opcional si el servidor no la pide'"
              />
            </label>
          </div>
          <div class="row checkbox-row">
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="internalForm.enabled" name="iaEnabled" />
              <span>Conexión activa</span>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="internalForm.jsonMode" name="iaJsonMode" />
              <span>Pedir la salida en modo JSON (desmárcalo si el servidor rechaza <code>response_format</code>)</span>
            </label>
          </div>
          <div class="row checkbox-row">
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="internalForm.allowPrivateNetwork" name="iaPrivate" />
              <span>El servidor está en nuestra red privada (permite http y direcciones internas)</span>
            </label>
            @if (internalAi()?.hasKey) {
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="internalForm.clearKey" name="iaClearKey" />
                <span>Borrar la clave guardada</span>
              </label>
            }
          </div>
          <div class="form-actions internal-actions">
            @if (internalAi()?.configured) {
              <button type="button" class="btn btn-secondary" (click)="removeInternalAi()" [disabled]="internalBusy()">Quitar conexión</button>
              <button type="button" class="btn btn-secondary" (click)="testInternalAi()" [disabled]="internalBusy()">
                {{ internalBusy() === 'test' ? 'Probando…' : 'Probar conexión guardada' }}
              </button>
            }
            <button type="submit" class="btn btn-primary" [disabled]="internalBusy()">
              {{ internalBusy() === 'save' ? 'Guardando…' : 'Guardar conexión' }}
            </button>
          </div>
        </form>
      </section>
    </div>
  `,
  styles: [`
    .internal-status {
      font-size: 0.9rem;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--border, #27272a);
      margin-bottom: 16px;
    }
    .internal-status.is-on {
      border-color: #14532d;
      color: #86efac;
    }
    .internal-actions {
      gap: 8px;
      flex-wrap: wrap;
    }
    .card .alert {
      margin-bottom: 12px;
    }
    .billing-page {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .intro {
      color: var(--text-muted, #71717a);
      font-size: 0.95rem;
      margin-top: 4px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }
    .stat-card {
      background: var(--surface, #18181b);
      border: 1px solid var(--border, #27272a);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .stat-label {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted, #71717a);
    }
    .stat-value {
      font-size: 1.6rem;
      font-weight: 700;
      color: var(--text-main, #f4f4f5);
    }
    .stat-sub {
      font-size: 0.8rem;
      color: var(--text-muted, #a1a1aa);
    }
    .two-columns {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 24px;
    }
    @media (max-width: 900px) {
      .two-columns {
        grid-template-columns: 1fr;
      }
    }
    .card {
      background: var(--surface, #18181b);
      border: 1px solid var(--border, #27272a);
      border-radius: 8px;
      padding: 20px;
    }
    .section-desc {
      font-size: 0.85rem;
      color: var(--text-muted, #71717a);
      margin-bottom: 16px;
    }
    .fieldset-group {
      border-top: 1px solid var(--border, #27272a);
      padding-top: 16px;
      margin-bottom: 20px;
    }
    .fieldset-group h4 {
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .field {
      flex: 1;
      min-width: 140px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .field-full {
      flex: 100%;
    }
    .field span {
      font-size: 0.8rem;
      color: var(--text-muted, #a1a1aa);
    }
    .field input {
      background: var(--bg-input, #09090b);
      border: 1px solid var(--border, #27272a);
      border-radius: 6px;
      color: inherit;
      padding: 8px 12px;
      font-size: 0.9rem;
    }
    .checkbox-row {
      align-items: center;
    }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
      cursor: pointer;
    }
    .form-actions {
      display: flex;
      justify-content: flex-end;
      padding-top: 16px;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
    }
    .btn-primary {
      background: var(--primary, #6366f1);
      color: white;
    }
    .btn-secondary {
      background: var(--surface-hover, #27272a);
      color: inherit;
      border: 1px solid var(--border, #3f3f46);
    }
    .btn-sm {
      padding: 4px 10px;
      font-size: 0.8rem;
      background: var(--surface-hover, #27272a);
      color: inherit;
      border: 1px solid var(--border, #3f3f46);
    }
    .alert {
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 0.9rem;
    }
    .alert-error {
      background: #450a0a;
      border: 1px solid #7f1d1d;
      color: #fca5a5;
    }
    .alert-success {
      background: #052e16;
      border: 1px solid #14532d;
      color: #86efac;
    }
    .versions-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 600px;
      overflow-y: auto;
    }
    .version-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid var(--border, #27272a);
      background: var(--bg-item, #09090b);
    }
    .version-item.is-active {
      border-color: var(--primary, #6366f1);
      background: rgba(99, 102, 241, 0.08);
    }
    .version-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .version-badge-line {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .v-num {
      font-weight: 600;
      font-size: 0.95rem;
    }
    .badge-active {
      background: #166534;
      color: #bbf7d0;
      font-size: 0.75rem;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .v-date {
      font-size: 0.75rem;
      color: var(--text-muted, #71717a);
    }
    .v-note {
      font-size: 0.85rem;
      color: var(--text-muted, #a1a1aa);
      margin-top: 4px;
    }
  `],
})
export class Billing {
  private readonly api = inject(AdminApi);

  readonly stats = signal<BillingStats | null>(null);
  readonly versions = signal<BillingConfigVersion[]>([]);
  readonly currentVersion = signal<number>(1);
  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly activating = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  formConfig: any = null;
  fallbackModelsString = '';
  changeNote = '';

  // Conexión de IA interna (se guarda aparte: no forma parte de las versiones de configuración)
  readonly internalAi = signal<InternalAiView | null>(null);
  readonly internalBusy = signal<'save' | 'test' | 'remove' | null>(null);
  readonly internalError = signal<string | null>(null);
  readonly internalSuccess = signal<string | null>(null);
  internalForm = { baseUrl: '', model: '', apiKey: '', jsonMode: true, allowPrivateNetwork: false, enabled: true, clearKey: false };

  constructor() {
    this.loadAll();
  }

  async loadAll() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [stats, configRes, versions, internal] = await Promise.all([
        this.api.request<BillingStats>('/v1/admin/billing/stats'),
        this.api.request<{ version: number; data: any }>('/v1/admin/billing/config'),
        this.api.request<BillingConfigVersion[]>('/v1/admin/billing/config/versions'),
        this.api.request<InternalAiView>('/v1/admin/ai/internal'),
      ]);
      this.applyInternalAi(internal);

      this.stats.set(stats);
      this.currentVersion.set(configRes.version);
      this.versions.set(versions);
      this.formConfig = JSON.parse(JSON.stringify(configRes.data));
      this.fallbackModelsString = (this.formConfig.managedAi?.fallbackModels || []).join(', ');
    } catch (err: any) {
      this.error.set(err.message || 'Error cargando datos de facturación');
    } finally {
      this.loading.set(false);
    }
  }

  private applyInternalAi(view: InternalAiView) {
    this.internalAi.set(view);
    this.internalForm = {
      baseUrl: view.baseUrl ?? '',
      model: view.model ?? '',
      apiKey: '',
      jsonMode: view.jsonMode,
      allowPrivateNetwork: view.allowPrivateNetwork,
      enabled: view.configured ? view.enabled : true,
      clearKey: false,
    };
  }

  async saveInternalAi() {
    this.internalBusy.set('save');
    this.internalError.set(null);
    this.internalSuccess.set(null);
    try {
      const f = this.internalForm;
      // Sin `apiKey` el backend conserva la clave guardada; vacía la borra
      const apiKey = f.clearKey ? '' : f.apiKey.trim() || undefined;
      const view = await this.api.request<InternalAiView>('/v1/admin/ai/internal', {
        method: 'PUT',
        body: JSON.stringify({
          baseUrl: f.baseUrl.trim(),
          model: f.model.trim(),
          ...(apiKey !== undefined ? { apiKey } : {}),
          jsonMode: f.jsonMode,
          allowPrivateNetwork: f.allowPrivateNetwork,
          enabled: f.enabled,
        }),
      });
      this.applyInternalAi(view);
      this.internalSuccess.set('Conexión guardada. Pruébala antes de la próxima generación de historias.');
    } catch (err: any) {
      this.internalError.set(err.message || 'No se pudo guardar la conexión');
    } finally {
      this.internalBusy.set(null);
    }
  }

  async testInternalAi() {
    this.internalBusy.set('test');
    this.internalError.set(null);
    this.internalSuccess.set(null);
    try {
      const res = await this.api.request<{ ok: boolean; model: string }>('/v1/admin/ai/internal/test', { method: 'POST' });
      this.internalSuccess.set(`La IA interna responde con el modelo ${res.model}.`);
    } catch (err: any) {
      this.internalError.set(err.message || 'La IA interna no respondió');
    } finally {
      this.internalBusy.set(null);
    }
  }

  async removeInternalAi() {
    if (!confirm('¿Quitar la conexión de IA interna? La IA del sistema volverá a su respaldo de OpenRouter.')) return;
    this.internalBusy.set('remove');
    this.internalError.set(null);
    this.internalSuccess.set(null);
    try {
      this.applyInternalAi(await this.api.request<InternalAiView>('/v1/admin/ai/internal', { method: 'DELETE' }));
      this.internalSuccess.set('Conexión quitada.');
    } catch (err: any) {
      this.internalError.set(err.message || 'No se pudo quitar la conexión');
    } finally {
      this.internalBusy.set(null);
    }
  }

  onFallbackModelsChange(val: string) {
    this.fallbackModelsString = val;
    this.formConfig.managedAi.fallbackModels = val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async saveConfig() {
    if (!this.formConfig) return;
    this.saving.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      const res = await this.api.request<{ version: number; data: any }>('/v1/admin/billing/config', {
        method: 'PUT',
        body: JSON.stringify({
          data: this.formConfig,
          note: this.changeNote || undefined,
        }),
      });
      this.currentVersion.set(res.version);
      this.changeNote = '';
      this.success.set(`Configuración guardada y activada como versión v${res.version}.`);
      await this.loadAll();
    } catch (err: any) {
      this.error.set(err.message || 'Error guardando configuración');
    } finally {
      this.saving.set(false);
    }
  }

  async activateVersion(version: number) {
    if (!confirm(`¿Seguro que deseas revertir la configuración activa a la versión v${version}?`)) return;
    this.activating.set(true);
    this.error.set(null);
    this.success.set(null);
    try {
      await this.api.request(`/v1/admin/billing/config/versions/${version}/activate`, {
        method: 'POST',
      });
      this.success.set(`Se ha revertido exitosamente a la versión v${version}.`);
      await this.loadAll();
    } catch (err: any) {
      this.error.set(err.message || `Error revirtiendo a versión v${version}`);
    } finally {
      this.activating.set(false);
    }
  }
}
