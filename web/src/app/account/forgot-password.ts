import { ChangeDetectionStrategy, Component, LOCALE_ID, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { UserAuth } from '../shared/auth/user-auth';
import { AUTH_FORM_STYLES, AuthShell, setAuthTitle } from './auth-shell';

type Step = 'request' | 'confirm' | 'done';

/**
 * `/forgot-password`: dos pasos, igual que en las apps. Se pide un código de 6 dígitos al correo y
 * con él se elige una contraseña nueva. El backend no revela si el correo tiene cuenta.
 */
@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, AuthShell],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-shell path="forgot-password">
      <p class="eyebrow" i18n="@@forgot.eyebrow">Tu cuenta</p>
      <h1 class="display" i18n="@@forgot.title">Cambiar contraseña</h1>

      @switch (step()) {
        @case ('request') {
          <p class="lead" i18n="@@forgot.request.lead">Te enviaremos un código de 6 dígitos a tu correo.</p>
          <form ngNativeValidate (ngSubmit)="request()">
            <div class="field">
              <label for="fp-email" class="label-caps" i18n="@@auth.field.email">Correo</label>
              <input
                id="fp-email"
                class="input"
                type="email"
                name="email"
                autocomplete="email"
                required
                [ngModel]="email()"
                (ngModelChange)="email.set($event); error.set(null)"
              />
            </div>
            @if (error(); as message) {
              <p class="form-error" role="alert">{{ message }}</p>
            }
            <div class="actions">
              <button class="btn btn--filled" type="submit" [disabled]="busy()" i18n="@@forgot.request.submit">Enviar código</button>
            </div>
          </form>
        }
        @case ('confirm') {
          <p class="lead" i18n="@@forgot.confirm.lead">Si {{ email() }} tiene cuenta, te habrá llegado un código. Caduca en 15 minutos.</p>
          <form ngNativeValidate (ngSubmit)="confirm()">
            <div class="field">
              <label for="fp-code" class="label-caps" i18n="@@auth.field.code">Código</label>
              <input
                id="fp-code"
                class="input code-input"
                type="text"
                name="code"
                inputmode="numeric"
                autocomplete="one-time-code"
                pattern="[0-9]{6}"
                maxlength="6"
                required
                [ngModel]="code()"
                (ngModelChange)="code.set($event); error.set(null)"
              />
            </div>
            <div class="field">
              <label for="fp-password" class="label-caps" i18n="@@forgot.field.newPassword">Contraseña nueva</label>
              <input
                id="fp-password"
                class="input"
                type="password"
                name="newPassword"
                autocomplete="new-password"
                minlength="8"
                maxlength="128"
                required
                [ngModel]="password()"
                (ngModelChange)="password.set($event); error.set(null)"
              />
              <p class="field__hint" i18n="@@register.password.hint">Mínimo 8 caracteres.</p>
            </div>
            @if (error(); as message) {
              <p class="form-error" role="alert">{{ message }}</p>
            }
            <div class="actions">
              <button class="btn btn--filled" type="submit" [disabled]="busy()" i18n="@@forgot.confirm.submit">Cambiar contraseña</button>
              <button class="btn btn--ghost" type="button" (click)="step.set('request')" i18n="@@forgot.confirm.back">Usar otro correo</button>
            </div>
          </form>
        }
        @case ('done') {
          <p class="form-ok" role="status" i18n="@@forgot.done">Contraseña cambiada. Ya puedes entrar con la nueva.</p>
          <div class="actions">
            <a class="btn btn--filled" [href]="'/' + locale + '/login'" i18n="@@forgot.done.login">Entrar</a>
          </div>
        }
      }

      @if (step() !== 'done') {
        <p class="alt">
          <a [href]="'/' + locale + '/login'" i18n="@@forgot.backToLogin">Volver a entrar</a>
        </p>
      }
    </app-auth-shell>
  `,
  styles: AUTH_FORM_STYLES,
})
export class ForgotPassword {
  private readonly auth = inject(UserAuth);
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);

  protected readonly step = signal<Step>('request');
  protected readonly email = signal('');
  protected readonly code = signal('');
  protected readonly password = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    setAuthTitle(inject(Title), $localize`:@@forgot.title:Cambiar contraseña`);
  }

  protected async request() {
    if (this.busy()) return;
    this.busy.set(true);
    const error = await this.auth.requestPasswordReset(this.email());
    this.busy.set(false);
    if (error) this.error.set(error);
    else this.step.set('confirm');
  }

  protected async confirm() {
    if (this.busy()) return;
    this.busy.set(true);
    const error = await this.auth.confirmPasswordReset(this.email(), this.code(), this.password());
    this.busy.set(false);
    if (error) this.error.set(error);
    else this.step.set('done');
  }
}
