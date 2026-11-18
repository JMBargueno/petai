import { ChangeDetectionStrategy, Component, LOCALE_ID, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { UserAuth } from '../shared/auth/user-auth';
import { AUTH_FORM_STYLES, AuthShell, safeNext, setAuthTitle } from './auth-shell';

/** `/login`: cualquier cuenta entra en la web. Sin el correo verificado, se pasa a verificarlo. */
@Component({
  selector: 'app-login',
  imports: [FormsModule, AuthShell],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-shell path="login">
      <p class="eyebrow" i18n="@@login.eyebrow">Tu cuenta</p>
      <h1 class="display" i18n="@@login.title">Entrar</h1>
      <form ngNativeValidate (ngSubmit)="submit()">
        <div class="field">
          <label for="login-email" class="label-caps" i18n="@@auth.field.email">Correo</label>
          <input
            id="login-email"
            class="input"
            type="email"
            name="email"
            autocomplete="username"
            required
            [attr.aria-describedby]="error() ? 'login-error' : null"
            [ngModel]="email()"
            (ngModelChange)="email.set($event); error.set(null)"
          />
        </div>
        <div class="field">
          <label for="login-password" class="label-caps" i18n="@@auth.field.password">Contraseña</label>
          <input
            id="login-password"
            class="input"
            type="password"
            name="password"
            autocomplete="current-password"
            required
            [attr.aria-describedby]="error() ? 'login-error' : null"
            [ngModel]="password()"
            (ngModelChange)="password.set($event); error.set(null)"
          />
        </div>
        @if (error(); as message) {
          <p id="login-error" class="form-error" role="alert">{{ message }}</p>
        }
        <div class="actions">
          <button class="btn btn--filled" type="submit" [disabled]="busy()">
            @if (busy()) {
              <span i18n="@@login.busy">Entrando…</span>
            } @else {
              <span i18n="@@login.submit">Entrar</span>
            }
          </button>
          <a class="link" [href]="'/' + locale + '/forgot-password'" i18n="@@login.forgot">¿Has olvidado la contraseña?</a>
        </div>
      </form>
      <p class="alt">
        <span i18n="@@login.noAccount">¿Aún no tienes cuenta?</span>
        <a [href]="registerHref" i18n="@@login.toRegister">Crear cuenta</a>
      </p>
    </app-auth-shell>
  `,
  styles: AUTH_FORM_STYLES,
})
export class Login {
  private readonly auth = inject(UserAuth);
  private readonly router = inject(Router);
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  private readonly next = safeNext(inject(ActivatedRoute).snapshot.queryParamMap.get('next'));
  protected readonly registerHref = `/${this.locale}/register${this.next !== '/' ? `?next=${encodeURIComponent(this.next)}` : ''}`;

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    setAuthTitle(inject(Title), $localize`:@@login.title:Entrar`);
  }

  protected async submit() {
    if (this.busy()) return;
    this.busy.set(true);
    const error = await this.auth.login(this.email(), this.password());
    this.busy.set(false);
    if (error) {
      this.error.set(error);
      return;
    }
    if (!this.auth.verified()) {
      await this.router.navigate(['/verify-email'], { queryParams: this.next !== '/' ? { next: this.next } : {} });
      return;
    }
    await this.router.navigateByUrl(this.next);
  }
}
