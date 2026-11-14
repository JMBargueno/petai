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
        <p class="tag">Datos de demostración</p>
        <div class="field">
          <label for="code" class="label-caps">Código de acceso</label>
          <input
            id="code"
            class="input"
            type="password"
            name="code"
            autocomplete="off"
            required
            autofocus
            [attr.aria-describedby]="failed() ? 'code-error' : null"
            [ngModel]="code()"
            (ngModelChange)="code.set($event); failed.set(false)"
          />
        </div>
        @if (failed()) {
          <p id="code-error" class="error" role="alert">Código incorrecto.</p>
        }
        <button class="btn btn--filled" type="submit">Entrar</button>
      </form>
    </main>
  `,
  styles: `
    .wrap {
      display: grid;
      place-items: center;
      min-block-size: 100dvh;
      padding: 16px;
      background: var(--color-sky-wash);
    }
    .box {
      display: grid;
      gap: 16px;
      justify-items: start;
      inline-size: min(420px, 100%);
      border-radius: var(--radius-cards-elevated);
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
  protected readonly code = signal('');
  protected readonly failed = signal(false);

  constructor() {
    inject(Title).setTitle('Acceso · Panel de Pockai');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex, nofollow' });
    if (this.auth.authenticated()) void this.router.navigateByUrl('/admin');
  }

  protected submit() {
    if (this.auth.login(this.code())) void this.router.navigateByUrl('/admin');
    else this.failed.set(true);
  }
}
