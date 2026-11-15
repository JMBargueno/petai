import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Sticker } from '../shared/ui/sticker';
import { AdminAuth } from './auth';

@Component({
  selector: 'app-admin-login',
  imports: [FormsModule, Sticker],
  template: `
    <main class="wrap">
      <form class="card box" ngNativeValidate (ngSubmit)="submit()">
        <app-sticker icon="shield" color="voltage-violet" [rotate]="-6" />
        <h1>Panel de Pockai</h1>
        <p class="tag">Acceso para el equipo</p>
        <div class="field">
          <label for="email" class="label-caps">Correo</label>
          <input
            id="email"
            class="input"
            type="email"
            name="email"
            autocomplete="username"
            required
            autofocus
            [attr.aria-describedby]="error() ? 'login-error' : null"
            [ngModel]="email()"
            (ngModelChange)="email.set($event); error.set(null)"
          />
        </div>
        <div class="field">
          <label for="password" class="label-caps">Contraseña</label>
          <input
            id="password"
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
          <p id="login-error" class="error" role="alert">{{ message }}</p>
        }
        <button class="btn btn--filled" type="submit" [disabled]="busy()">
          {{ busy() ? 'Entrando…' : 'Entrar' }}
        </button>
      </form>
    </main>
  `,
  styles: `
    .wrap {
      display: grid;
      place-items: center;
      min-block-size: 100dvh;
      padding: 16px;
      background: var(--grain), var(--grad-hero);
    }
    .box {
      display: grid;
      gap: 16px;
      justify-items: start;
      inline-size: min(420px, 100%);
      border-radius: var(--radius-cards-elevated);
      box-shadow: var(--shadow-4);
    }
    h1 {
      margin: 0;
      font-family: var(--font-lateral);
      font-size: 40px;
      line-height: 0.85;
      text-transform: uppercase;
    }
    p {
      margin: 0;
    }
    .field {
      display: grid;
      gap: 4px;
      inline-size: 100%;
    }
    .error {
      font-weight: var(--font-weight-bold);
    }
    .btn {
      inline-size: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly auth = inject(AdminAuth);
  private readonly router = inject(Router);
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    inject(Title).setTitle('Acceso · Panel de Pockai');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex, nofollow' });
    if (this.auth.authenticated()) void this.router.navigateByUrl('/admin');
  }

  protected async submit() {
    if (this.busy()) return;
    this.busy.set(true);
    const error = await this.auth.login(this.email(), this.password());
    this.busy.set(false);
    if (error) {
      this.error.set(error);
      this.password.set('');
    } else {
      void this.router.navigateByUrl('/admin');
    }
  }
}
