import { ChangeDetectionStrategy, Component, LOCALE_ID, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { UserAuth } from '../shared/auth/user-auth';
import { DownloadAction } from '../shared/download/download-action';
import { AUTH_FORM_STYLES, AuthShell, setAuthTitle } from './auth-shell';

/** `/account`: datos básicos de la cuenta, descargas y cierre de sesión. Sin sesión, a /login. */
@Component({
  selector: 'app-account',
  imports: [AuthShell, DownloadAction],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-shell path="account">
      <p class="eyebrow" i18n="@@account.eyebrow">Tu cuenta</p>
      @if (auth.user(); as user) {
        <h1 class="display">{{ user.handle ? '@' + user.handle : user.email }}</h1>
        <dl class="facts">
          <div>
            <dt class="label-caps" i18n="@@auth.field.email">Correo</dt>
            <dd>{{ user.email }}</dd>
          </div>
          <div>
            <dt class="label-caps" i18n="@@account.status">Estado</dt>
            <dd>
              @if (user.emailVerified) {
                <span class="tag tag--ok" i18n="@@account.verified">Correo verificado</span>
              } @else {
                <span class="tag" i18n="@@account.unverified">Correo sin verificar</span>
                <a class="link" [href]="'/' + locale + '/verify-email'" i18n="@@account.verifyNow">Verificar ahora</a>
              }
            </dd>
          </div>
        </dl>

        <section class="downloads" aria-labelledby="account-downloads">
          <h2 id="account-downloads" class="label-caps" i18n="@@account.downloads">Descargar Pockai</h2>
          <div class="downloads__list">
            <div class="downloads__item">
              <span>Windows</span>
              <app-download-action platform="windows" label="Windows" />
            </div>
            <div class="downloads__item">
              <span>macOS</span>
              <app-download-action platform="macos" label="macOS" />
            </div>
          </div>
        </section>

        <div class="actions">
          @if (auth.isAdmin()) {
            <a class="btn" href="/es/admin/" i18n="@@account.admin">Panel de administración</a>
          }
          <button class="btn btn--ghost" type="button" (click)="logout()" i18n="@@account.logout">Cerrar sesión</button>
        </div>
      } @else {
        <h1 class="display" i18n="@@account.title">Tu cuenta</h1>
        <p class="lead" i18n="@@account.anon">Entra para ver tu cuenta y descargar Pockai.</p>
        <div class="actions">
          <a class="btn btn--filled" [href]="'/' + locale + '/login?next=%2Faccount'" i18n="@@login.title">Entrar</a>
        </div>
      }
    </app-auth-shell>
  `,
  styles: [
    AUTH_FORM_STYLES,
    `
      h1 {
        overflow-wrap: anywhere;
      }
      .facts {
        display: grid;
        gap: 12px;
        margin: 0;
      }
      .facts div {
        display: grid;
        gap: 4px;
      }
      .facts dd {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
        margin: 0;
        overflow-wrap: anywhere;
      }
      .tag--ok {
        border-color: transparent;
        background: color-mix(in srgb, var(--color-mint-pop) 35%, var(--surface));
      }
      .downloads {
        display: grid;
        gap: 10px;
        padding-block-start: 14px;
        border-block-start: 1px solid var(--line-soft);
      }
      .downloads h2 {
        margin: 0;
      }
      .downloads__list {
        display: grid;
        gap: 12px;
      }
      .downloads__item {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px 16px;
        font-weight: var(--font-weight-bold);
      }
    `,
  ],
})
export class Account {
  protected readonly auth = inject(UserAuth);
  private readonly router = inject(Router);
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);

  constructor() {
    setAuthTitle(inject(Title), $localize`:@@account.title:Tu cuenta`);
    // Estado de verificación al día (p. ej. si se verificó desde la app).
    if (this.auth.loggedIn()) void this.auth.fetchMe().catch(() => undefined);
  }

  protected async logout() {
    await this.auth.logout();
    await this.router.navigateByUrl('/');
  }
}
