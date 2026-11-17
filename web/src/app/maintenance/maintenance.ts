import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, input, signal } from '@angular/core';
import { ContactFooter } from '../shared/layout/contact-footer';
import { SiteConfigService } from '../shared/site-config/site-config';

export type MaintenanceMode = 'down' | 'maintenance';

/**
 * Pantalla de mantenimiento que tapa toda la web.
 * - `down`: el backend no responde (automático). Correo y redes; sin formulario, que no podría
 *   enviarse. La web se vuelve a comprobar sola y se puede reintentar a mano.
 * - `maintenance`: activado desde el panel. Mensaje del panel en el idioma de la página (o el texto
 *   por defecto), formulario de contacto y un acceso discreto al panel para el equipo.
 */
@Component({
  selector: 'app-maintenance',
  imports: [ContactFooter],
  template: `
    <div class="sky" aria-hidden="true">
      <span class="blob blob--a"></span>
      <span class="blob blob--b"></span>
    </div>

    <header class="top">
      <span class="brand">
        <img src="favicon.svg" alt="" width="28" height="28" />
        <span>Pockai</span>
      </span>
      <span class="lang" role="group" aria-label="Idioma" i18n-aria-label="@@nav.lang">
        <a href="/es/" lang="es" hreflang="es" [attr.aria-current]="locale === 'es' ? 'true' : null">ES</a>
        <a href="/en/" lang="en" hreflang="en" [attr.aria-current]="locale === 'en' ? 'true' : null">EN</a>
      </span>
    </header>

    <main id="main" class="stage">
      <div class="badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path
            d="M22.7 19.3 13.6 10.2c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6.3 6 9.3 1.7 5C.6 7.4 1 10.4 3 12.4c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.4-.4.4-1 0-1.4z"
          />
        </svg>
      </div>

      <p class="kicker" i18n="@@maintenance.kicker">Mantenimiento</p>
      <h1 class="title" i18n="@@maintenance.title">Estamos haciendo unos ajustes</h1>

      @if (mode() === 'down') {
        <p class="lead" i18n="@@maintenance.down.lead">
          Ahora mismo no podemos conectar con Pockai. Volvemos enseguida: esta página se actualizará sola.
        </p>
        <button class="btn" type="button" (click)="retry()" [disabled]="retrying()">
          @if (retrying()) {
            <span i18n="@@maintenance.retrying">Comprobando…</span>
          } @else {
            <span i18n="@@maintenance.retry">Reintentar</span>
          }
        </button>
      } @else {
        <p class="lead lead--custom">{{ message() }}</p>
      }
    </main>

    <app-contact-footer [form]="mode() === 'maintenance'" />

    @if (mode() === 'maintenance') {
      <a class="staff" href="admin/login" i18n="@@maintenance.staff">Acceso del equipo</a>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 110;
      display: grid;
      grid-template-rows: auto 1fr auto auto;
      overflow: auto;
      color: #fff;
      background: #0b0a14;
      color-scheme: dark;
      isolation: isolate;
    }
    .sky {
      position: fixed;
      inset: 0;
      z-index: -1;
      overflow: hidden;
      background: var(--grad-ether);
    }
    .blob {
      position: absolute;
      inline-size: 70vmax;
      aspect-ratio: 1;
      border-radius: 50%;
      filter: blur(70px);
      opacity: 0.45;
    }
    .blob--a {
      inset: -25vmax auto auto -20vmax;
      background: radial-gradient(circle, #6d5bff 0%, transparent 65%);
    }
    .blob--b {
      inset: auto -25vmax -30vmax auto;
      background: radial-gradient(circle, #3f8cff 0%, transparent 65%);
    }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px clamp(16px, 4vw, 40px);
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-family: var(--font-lateral);
      font-size: 20px;
      letter-spacing: 0.01em;
    }
    .lang {
      display: inline-flex;
      gap: 4px;
    }
    .lang a {
      padding: 6px 10px;
      border-radius: var(--radius-pills);
      color: rgb(255 255 255 / 0.7);
      font-size: 13px;
      font-weight: var(--font-weight-bold);
      text-decoration: none;
    }
    .lang a[aria-current='true'] {
      background: rgb(255 255 255 / 0.12);
      color: #fff;
    }
    .stage {
      display: grid;
      align-content: center;
      justify-items: center;
      gap: 14px;
      padding: 24px 16px 40px;
      text-align: center;
    }
    .badge {
      display: grid;
      place-items: center;
      inline-size: 96px;
      aspect-ratio: 1;
      margin-block-end: 8px;
      border: 1px solid rgb(255 255 255 / 0.2);
      border-radius: 50%;
      background: rgb(255 255 255 / 0.06);
      box-shadow: 0 0 48px rgb(255 215 49 / 0.25);
    }
    .badge svg {
      inline-size: 40px;
      fill: #ffd731;
    }
    .kicker {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #ffd731;
    }
    .title {
      margin: 0;
      max-inline-size: 18ch;
      font-family: var(--font-lateral);
      font-size: clamp(32px, 6vw, 56px);
      line-height: 1.05;
      letter-spacing: -0.01em;
      text-wrap: balance;
    }
    .lead {
      margin: 0;
      max-inline-size: 52ch;
      font-size: clamp(16px, 2.2vw, 18px);
      line-height: 1.5;
      color: rgb(255 255 255 / 0.8);
      text-wrap: pretty;
    }
    .lead--custom {
      white-space: pre-line;
    }
    .btn {
      margin-block-start: 8px;
      padding: 12px 26px;
      border: 2px solid rgb(255 255 255 / 0.35);
      border-radius: var(--radius-pills);
      background: rgb(255 255 255 / 0.08);
      color: #fff;
      font-family: inherit;
      font-size: 15px;
      font-weight: var(--font-weight-extrabold);
      cursor: pointer;
    }
    .btn:hover:not(:disabled) {
      background: rgb(255 255 255 / 0.16);
    }
    .btn:disabled {
      opacity: 0.6;
      cursor: progress;
    }
    .staff {
      justify-self: center;
      margin-block-end: 18px;
      color: rgb(255 255 255 / 0.45);
      font-size: 12px;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .staff:hover {
      color: #fff;
    }
    @media (prefers-reduced-motion: no-preference) {
      .badge svg {
        animation: wiggle 2.8s ease-in-out infinite;
      }
      @keyframes wiggle {
        0%,
        100% {
          rotate: 0deg;
        }
        20% {
          rotate: -14deg;
        }
        40% {
          rotate: 10deg;
        }
        60% {
          rotate: 0deg;
        }
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Maintenance {
  readonly mode = input.required<MaintenanceMode>();

  private readonly site = inject(SiteConfigService);
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly retrying = signal(false);

  /** Mensaje del panel en el idioma de la página; si no hay, el texto por defecto. */
  protected readonly message = computed(() => {
    const { es, en } = this.site.config().maintenance.message;
    const custom = this.locale === 'en' ? en : es;
    return custom ?? $localize`:@@maintenance.default:Estamos mejorando Pockai. Volvemos muy pronto, ¡gracias por la paciencia!`;
  });

  protected async retry() {
    this.retrying.set(true);
    try {
      await this.site.load(true);
    } finally {
      this.retrying.set(false);
    }
  }
}
