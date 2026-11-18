import { ChangeDetectionStrategy, Component, LOCALE_ID, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { UserAuth } from '../auth/user-auth';
import { DesktopPlatform, DeviceInfo, desktopPlatformFor, detectDevice } from '../device/device';

export type DownloadState = 'pending' | 'device' | 'login' | 'verify' | 'ready';

/**
 * Estado del botón de descarga de un instalador de escritorio:
 * - `device`: desde un móvil o Linux no se puede instalar → «Disponible en escritorio», deshabilitado.
 * - `login`: sin sesión → enlace a /login (y vuelta a la sección de descarga).
 * - `verify`: con sesión pero sin verificar el correo → enlace a /verify-email.
 * - `ready`: se puede descargar.
 * `pending` es el estado del prerender, antes de conocer dispositivo y sesión.
 */
export function downloadState(device: DeviceInfo | null, loggedIn: boolean, verified: boolean): DownloadState {
  if (!device) return 'pending';
  if (device.mobile || device.os === 'linux') return 'device';
  if (!loggedIn) return 'login';
  if (!verified) return 'verify';
  return 'ready';
}

/**
 * Botón de descarga del instalador de una plataforma de escritorio. La URL del instalador se pide al
 * backend con la sesión (es temporal y exige el correo verificado) y se abre en el momento.
 * El botón de la plataforma del propio dispositivo va relleno; el de la otra, contorneado.
 */
@Component({
  selector: 'app-download-action',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('pending') {
        <a class="btn" [href]="loginHref()" i18n="@@download.cta">Descargar</a>
      }
      @case ('device') {
        <button class="btn" type="button" disabled i18n="@@download.desktopOnly">Disponible en escritorio</button>
      }
      @case ('login') {
        <a class="btn" [class.btn--filled]="primary()" [href]="loginHref()" i18n="@@download.login">Inicia sesión para descargar</a>
      }
      @case ('verify') {
        <a class="btn" [class.btn--filled]="primary()" [href]="verifyHref" i18n="@@download.verify">Verifica tu correo para descargar</a>
      }
      @case ('ready') {
        <button class="btn" [class.btn--filled]="primary()" type="button" [disabled]="busy()" (click)="download()">
          @if (busy()) {
            <span i18n="@@download.preparing">Preparando…</span>
          } @else if (primary()) {
            <span i18n="@@download.cta">Descargar</span>
          } @else {
            <span i18n="@@download.other">Descargar para {{ label() }}</span>
          }
        </button>
      }
    }
    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 8px;
      justify-items: start;
    }
    .error {
      margin: 0;
      color: var(--color-ember);
      font-weight: var(--font-weight-bold);
      font-size: var(--text-caption);
    }
  `,
})
export class DownloadAction {
  readonly platform = input.required<DesktopPlatform>();
  /** Nombre visible de la plataforma (Windows, macOS). */
  readonly label = input.required<string>();

  private readonly auth = inject(UserAuth);
  private readonly locale = inject(LOCALE_ID).slice(0, 2);
  private readonly device = signal<DeviceInfo | null>(null);

  protected readonly verifyHref = `/${this.locale}/verify-email`;
  protected readonly loginHref = computed(() => `/${this.locale}/login?next=${encodeURIComponent('/#descargar')}`);
  protected readonly state = computed(() => downloadState(this.device(), this.auth.loggedIn(), this.auth.verified()));
  /** Relleno si es el instalador de este dispositivo (o si no se sabe cuál es). */
  protected readonly primary = computed(() => {
    const own = desktopPlatformFor(this.device()?.os ?? 'unknown');
    return own === null || own === this.platform();
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // Solo en el navegador: el prerender no sabe nada del visitante.
    afterNextRender(() => this.device.set(detectDevice(navigator)));
  }

  protected async download() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const url = await this.auth.downloadUrl(this.platform());
      location.href = url;
    } catch (e) {
      this.error.set(
        e instanceof Error && e.message ? e.message : $localize`:@@download.error:No hemos podido preparar la descarga. Inténtalo de nuevo.`,
      );
      // Puede que la cuenta haya cambiado (p. ej. sesión caducada): se relee para corregir el botón.
      void this.auth.revalidate();
    } finally {
      this.busy.set(false);
    }
  }
}
