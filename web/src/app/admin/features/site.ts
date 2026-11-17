import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SITE, SiteSettings } from '../data/site-http';

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'full', timeStyle: 'short' });

/**
 * Ajustes de la web pública: landing «Coming soon» (tapa toda la web a quien no tenga sesión con el
 * correo verificado) y su cuenta atrás opcional. Los cambios se ven en la web en la siguiente visita.
 */
@Component({
  selector: 'app-admin-site',
  imports: [FormsModule],
  styleUrl: '../ui/resource-page.css',
  styles: `
    .settings {
      display: grid;
      gap: 14px;
      padding: 16px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-cards);
      background: var(--surface);
    }
    .settings__row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .settings__row + .settings__row {
      padding-block-start: 14px;
      border-block-start: 1px solid var(--line-soft);
    }
    .settings strong {
      display: block;
    }
    .settings p {
      margin: 0;
      color: var(--ink-muted);
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
    .date {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .preview {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
  `,
  template: `
    <section class="page">
      <header class="page__head">
        <div>
          <h1>Sitio web</h1>
          <p>
            Con la landing «Coming soon» activa, toda la web pública queda tapada por una portada de lanzamiento. Solo la pasa quien
            entra con una cuenta que tenga el correo verificado. Entrar, registrarse, verificar el correo y este panel siguen accesibles.
          </p>
        </div>
        <a class="btn" href="/es/" target="_blank" rel="noopener">Ver la web</a>
      </header>

      @if (error(); as e) {
        <p class="error" role="alert">{{ e }}</p>
      }

      @if (settings(); as s) {
        <div class="settings">
          <div class="settings__row">
            <div>
              <strong>Landing «Coming soon»</strong>
              <p>{{ s.comingSoonEnabled ? 'Activa: la web solo se ve con sesión verificada.' : 'Desactivada: la web es pública.' }}</p>
            </div>
            <label class="switch">
              <input type="checkbox" role="switch" [checked]="s.comingSoonEnabled" [disabled]="saving()" (change)="toggle('comingSoonEnabled', $event)" />
              {{ s.comingSoonEnabled ? 'Activada' : 'Desactivada' }}
            </label>
          </div>

          <div class="settings__row">
            <div>
              <strong>Cuenta atrás</strong>
              <p>
                @if (s.comingSoonCountdownEnabled && !s.comingSoonLaunchAt) {
                  Activa, pero sin fecha: no se mostrará hasta que elijas una.
                } @else if (s.comingSoonCountdownEnabled) {
                  Se muestra en la landing hasta el {{ formatDate(s.comingSoonLaunchAt) }}.
                } @else {
                  Oculta.
                }
              </p>
            </div>
            <label class="switch">
              <input
                type="checkbox"
                role="switch"
                [checked]="s.comingSoonCountdownEnabled"
                [disabled]="saving()"
                (change)="toggle('comingSoonCountdownEnabled', $event)"
              />
              {{ s.comingSoonCountdownEnabled ? 'Visible' : 'Oculta' }}
            </label>
          </div>

          <form class="settings__row" (ngSubmit)="saveDate()">
            <div class="field">
              <label for="launch-at">Fecha de lanzamiento (hora local)</label>
              <div class="date">
                <input id="launch-at" class="input" type="datetime-local" name="launchAt" [(ngModel)]="launchAt" />
                <button class="btn btn--filled btn--sm" type="submit" [disabled]="saving()">Guardar fecha</button>
                @if (s.comingSoonLaunchAt) {
                  <button class="btn btn--sm" type="button" [disabled]="saving()" (click)="clearDate()">Quitar fecha</button>
                }
              </div>
            </div>
          </form>
        </div>
      } @else if (!error()) {
        <p>Cargando…</p>
      }

      <p class="visually-hidden" role="status">{{ status() }}</p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Site implements OnInit {
  private readonly site = inject(SITE);

  protected readonly settings = signal<SiteSettings | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly status = signal('');
  protected launchAt = '';

  async ngOnInit() {
    try {
      this.apply(await this.site.get());
    } catch (e) {
      this.error.set(message(e));
    }
  }

  protected formatDate(iso: string | null) {
    return iso ? dateFormat.format(new Date(iso)) : '';
  }

  protected async toggle(field: 'comingSoonEnabled' | 'comingSoonCountdownEnabled', event: Event) {
    const input = event.target as HTMLInputElement;
    const wanted = input.checked;
    const ok = await this.save({ [field]: wanted });
    if (!ok) input.checked = !wanted;
  }

  protected async saveDate() {
    if (!this.launchAt) {
      this.error.set('Elige una fecha y hora.');
      return;
    }
    const date = new Date(this.launchAt);
    if (Number.isNaN(date.getTime())) {
      this.error.set('La fecha no es válida.');
      return;
    }
    await this.save({ comingSoonLaunchAt: date.toISOString() });
  }

  protected async clearDate() {
    await this.save({ comingSoonLaunchAt: null });
  }

  private async save(patch: Partial<SiteSettings>): Promise<boolean> {
    this.saving.set(true);
    this.error.set(null);
    try {
      this.apply(await this.site.update(patch));
      this.status.set('Ajustes del sitio guardados');
      return true;
    } catch (e) {
      this.error.set(message(e));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  private apply(s: SiteSettings) {
    this.settings.set(s);
    this.launchAt = s.comingSoonLaunchAt ? toLocalInput(new Date(s.comingSoonLaunchAt)) : '';
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
