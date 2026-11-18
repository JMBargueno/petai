import { ChangeDetectionStrategy, Component, LOCALE_ID, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { safeNext } from '../account/auth-shell';
import { WEB_CLIENT_HEADERS } from '../shared/auth/api';
import { UserAuth } from '../shared/auth/user-auth';
import { navPages } from '../shared/layout/nav-pages';
import { NavLink, SiteHeader } from '../shared/layout/site-header';
import { SiteFooter } from '../shared/layout/site-footer';
import { Sticker } from '../shared/ui/sticker';
import site from '../site.json';

/** Endpoint de verificación por enlace: `POST {apiUrl}/v1/auth/verify-email/link`. */
export const VERIFY_EMAIL_ENDPOINT = `${site.apiUrl.replace(/\/$/, '')}/v1/auth/verify-email/link`;

export type VerifyStatus = 'idle' | 'sending' | 'verified' | 'invalid' | 'limited' | 'error' | 'missing';

/** Traduce la respuesta del backend al estado de la página. */
export function statusFromResponse(httpStatus: number): VerifyStatus {
  if (httpStatus >= 200 && httpStatus < 300) return 'verified';
  if (httpStatus === 400) return 'invalid';
  if (httpStatus === 429) return 'limited';
  return 'error';
}

/**
 * Página del enlace de verificación del correo (`/es/verify-email?token=…`).
 *
 * Solo cliente (lee el token de la URL). La verificación se hace al PULSAR el botón, nunca al
 * cargar: los escáneres de enlaces del correo (Outlook Safe Links y similares) abren la URL y, si
 * verificase al cargar, la cuenta quedaría verificada sin que el dueño hiciese nada.
 */
@Component({
  selector: 'app-verify-email',
  imports: [FormsModule, SiteHeader, SiteFooter, Sticker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-site-header
      [pages]="pages"
      [cta]="cta"
      [home]="home"
      [homeLabel]="homeLabel"
      [navLabel]="navLabel"
      [locale]="locale"
      [langHrefs]="langHrefs"
    />

    <main id="main" tabindex="-1" class="band band--hero band--first verify">
      <app-sticker class="spot spot--a" icon="egg" color="sunburst" [size]="76" [rotate]="-12" />
      <app-sticker class="spot spot--b" icon="heart" color="mint-pop" [size]="60" [rotate]="10" />

      <div class="band__inner verify__inner">
        <div class="verify__card card--pop" aria-live="polite">
          @switch (status()) {
            @case ('verified') {
              <p class="eyebrow" i18n="@@verifyEmail.done.eyebrow">Cuenta verificada</p>
              <h1 class="display verify__title" i18n="@@verifyEmail.done.title">¡Correo verificado!</h1>
              <p class="lead" i18n="@@verifyEmail.done.lead">
                Ya puedes volver a la app de Pockai. Si la tenías abierta, pulsa «Ya lo he verificado» para continuar.
              </p>
              <div class="verify__actions">
                <a class="btn btn--filled" [href]="continueHref" i18n="@@verifyEmail.done.home">Ir a la web</a>
              </div>
            }
            @case ('invalid') {
              <p class="eyebrow" i18n="@@verifyEmail.invalid.eyebrow">Enlace no válido</p>
              <h1 class="display verify__title" i18n="@@verifyEmail.invalid.title">Este enlace ha caducado</h1>
              <p class="lead" i18n="@@verifyEmail.invalid.lead">
                El enlace no es válido, ya se ha sustituido por otro o ha caducado. Pide un correo nuevo desde la app de Pockai con «Reenviar correo».
              </p>
            }
            @case ('missing') {
              @if (auth.loggedIn() && auth.verified()) {
                <p class="eyebrow" i18n="@@verifyEmail.done.eyebrow">Cuenta verificada</p>
                <h1 class="display verify__title" i18n="@@verifyEmail.already.title">Tu correo ya está verificado</h1>
                <div class="verify__actions">
                  <a class="btn btn--filled" [href]="continueHref" i18n="@@verifyEmail.continue">Continuar</a>
                </div>
              } @else if (auth.loggedIn()) {
                <p class="eyebrow" i18n="@@verifyEmail.eyebrow">Verificación de cuenta</p>
                <h1 class="display verify__title" i18n="@@verifyEmail.title">Confirma tu correo</h1>
                <p class="lead" i18n="@@verifyEmail.code.lead">
                  Te hemos enviado un correo a {{ auth.user()?.email }}. Escribe el código de 6 dígitos o pulsa el botón del correo.
                </p>
                <form class="verify__form" ngNativeValidate (ngSubmit)="confirmCode()">
                  <label for="verify-code" class="label-caps" i18n="@@auth.field.code">Código</label>
                  <input
                    id="verify-code"
                    class="input verify__code"
                    type="text"
                    name="code"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxlength="6"
                    required
                    [ngModel]="code()"
                    (ngModelChange)="code.set($event); codeError.set(null)"
                  />
                  @if (codeError(); as message) {
                    <p class="verify__error" role="alert">{{ message }}</p>
                  }
                  @if (resent()) {
                    <p class="verify__ok" role="status" i18n="@@verifyEmail.resent">Te hemos enviado un correo nuevo.</p>
                  }
                  <div class="verify__actions">
                    <button class="btn btn--filled" type="submit" [disabled]="busy()" i18n="@@verifyEmail.code.submit">Verificar</button>
                    <button class="btn" type="button" [disabled]="busy()" (click)="resend()" i18n="@@verifyEmail.resend">Reenviar correo</button>
                  </div>
                </form>
                <button class="link verify__logout" type="button" (click)="logout()" i18n="@@verifyEmail.otherAccount">Usar otra cuenta</button>
              } @else {
              <p class="eyebrow" i18n="@@verifyEmail.missing.eyebrow">Falta el enlace</p>
              <h1 class="display verify__title" i18n="@@verifyEmail.missing.title">Abre el enlace del correo</h1>
              <p class="lead" i18n="@@verifyEmail.missing.lead">
                Para verificar tu cuenta, abre el botón «Verificar mi correo» del email que te enviamos, o escribe el código en la app.
              </p>
              <div class="verify__actions">
                <a class="btn btn--filled" [href]="loginHref" i18n="@@verifyEmail.login">Entrar para escribir el código</a>
              </div>
              }
            }
            @default {
              <p class="eyebrow" i18n="@@verifyEmail.eyebrow">Verificación de cuenta</p>
              <h1 class="display verify__title" i18n="@@verifyEmail.title">Confirma tu correo</h1>
              <p class="lead" i18n="@@verifyEmail.lead">
                Un último paso para que tu yokai eclosione: confirma que este correo es tuyo.
              </p>
              @if (status() === 'limited') {
                <p class="verify__error" role="alert" i18n="@@verifyEmail.limited">Demasiados intentos. Espera unos minutos y vuelve a probar.</p>
              }
              @if (status() === 'error') {
                <p class="verify__error" role="alert" i18n="@@verifyEmail.error">No hemos podido conectar con el servidor. Inténtalo de nuevo en un momento.</p>
              }
              <div class="verify__actions">
                <button class="btn btn--filled" type="button" (click)="verify()" [disabled]="status() === 'sending'">
                  @if (status() === 'sending') {
                    <span i18n="@@verifyEmail.sending">Verificando…</span>
                  } @else {
                    <span i18n="@@verifyEmail.button">Verificar mi correo</span>
                  }
                </button>
              </div>
            }
          }
        </div>
      </div>
    </main>

    <app-site-footer />
  `,
  styles: `
    main:focus {
      outline: none;
    }
    .verify {
      position: relative;
      display: grid;
      place-items: center;
      min-block-size: min(760px, 90svh);
    }
    .spot {
      position: absolute;
      box-shadow: var(--shadow-pop);
    }
    .spot--a {
      inset: 18% auto auto 10%;
    }
    .spot--b {
      inset: auto 12% 16% auto;
    }
    @media (width < 640px) {
      .spot {
        display: none;
      }
    }
    .verify__inner {
      display: grid;
      place-items: center;
    }
    .verify__card {
      display: grid;
      gap: 16px;
      justify-items: center;
      max-inline-size: 620px;
      padding: clamp(24px, 5vw, 48px);
      border: var(--outline);
      border-radius: var(--radius-cards-elevated);
      background: var(--surface);
      text-align: center;
    }
    .verify__card .eyebrow,
    .verify__card .lead {
      margin: 0;
    }
    .verify__title {
      margin: 0;
      font-size: clamp(36px, 5.5vw, 64px);
    }
    .verify__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
      margin-block-start: 8px;
    }
    .verify__form {
      display: grid;
      gap: 10px;
      justify-items: center;
      inline-size: min(100%, 360px);
    }
    .verify__code {
      inline-size: 100%;
      font-size: 24px;
      letter-spacing: 0.4em;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .verify__ok {
      margin: 0;
      padding: 8px 16px;
      border: 2px solid var(--color-mint-pop);
      border-radius: var(--radius-2xl);
      font-weight: var(--font-weight-bold);
    }
    .verify__logout {
      border: 0;
      background: none;
      cursor: pointer;
    }
    .verify__error {
      margin: 0;
      padding: 8px 16px;
      border: 2px solid var(--color-ember);
      border-radius: var(--radius-2xl);
      font-weight: var(--font-weight-bold);
    }
  `,
})
export class VerifyEmail {
  protected readonly locale = inject(LOCALE_ID);
  protected readonly home = `/${this.locale}/`;
  protected readonly pages = navPages(this.locale);
  protected readonly cta: NavLink = { href: `${this.home}#descargar`, label: $localize`:@@nav.cta:Descargar` };
  protected readonly homeLabel = $localize`:@@nav.home:Pockai, inicio`;
  protected readonly navLabel = $localize`:@@nav.label:Principal`;

  protected readonly auth = inject(UserAuth);
  private readonly router = inject(Router);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly token = this.query.get('token') ?? '';
  /** Adónde volver una vez verificado (`?next=`, p. ej. la sección de descarga). */
  private readonly next = safeNext(this.query.get('next'));
  protected readonly continueHref = `/${this.locale}${this.next}`;
  protected readonly loginHref = `/${this.locale}/login?next=${encodeURIComponent('/verify-email')}`;
  protected readonly code = signal('');
  protected readonly codeError = signal<string | null>(null);
  protected readonly resent = signal(false);
  protected readonly busy = signal(false);
  protected readonly status = signal<VerifyStatus>(this.token ? 'idle' : 'missing');
  /** Cambiar de idioma conserva el token. */
  protected readonly langHrefs = {
    es: `/es/verify-email${this.token ? `?token=${encodeURIComponent(this.token)}` : ''}`,
    en: `/en/verify-email${this.token ? `?token=${encodeURIComponent(this.token)}` : ''}`,
  };

  constructor() {
    inject(Title).setTitle($localize`:@@verifyEmail.meta.title:Verifica tu correo · Pockai`);
    // Página de un solo uso con un token en la URL: fuera de buscadores y sin filtrar la URL.
    const meta = inject(Meta);
    meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    meta.updateTag({ name: 'referrer', content: 'no-referrer' });
  }

  protected async verify(): Promise<void> {
    if (!this.token || this.status() === 'sending') return;
    this.status.set('sending');
    try {
      const res = await fetch(VERIFY_EMAIL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...WEB_CLIENT_HEADERS },
        body: JSON.stringify({ token: this.token }),
      });
      this.status.set(statusFromResponse(res.status));
      // Si esta pestaña tiene la sesión de esa cuenta, se refresca para que la web la vea verificada.
      if (this.status() === 'verified' && this.auth.loggedIn()) await this.auth.fetchMe().catch(() => undefined);
    } catch {
      this.status.set('error');
    }
  }

  /** Verificación con el código de 6 dígitos (con sesión abierta en la web). */
  protected async confirmCode(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.resent.set(false);
    const error = await this.auth.confirmVerification(this.code());
    this.busy.set(false);
    if (error) {
      this.codeError.set(error);
      return;
    }
    await this.router.navigateByUrl(this.next);
  }

  protected async resend(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.codeError.set(null);
    const error = await this.auth.resendVerification();
    this.busy.set(false);
    if (error) this.codeError.set(error);
    else this.resent.set(true);
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login'], { queryParams: { next: '/verify-email' } });
  }
}
