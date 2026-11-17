import { ChangeDetectionStrategy, Component, DestroyRef, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { UserAuth } from '../shared/auth/user-auth';
import { SiteConfigService } from '../shared/site-config/site-config';
import { AUTH_FORM_STYLES, AuthShell, safeNext, setAuthTitle } from './auth-shell';
import { HANDLE_MAX_LENGTH, handleFormatError, normalizeHandle } from './handle';

type HandleStatus = 'idle' | 'checking' | 'ok' | 'error';

/**
 * `/register`: alta en la web con correo, contraseña y nickname. El código de invitación es obligatorio
 * u opcional según el ajuste del panel («solo con invitación»), igual que en la app de escritorio.
 * Al terminar, la cuenta queda con sesión pero sin verificar: se pasa a /verify-email.
 */
@Component({
  selector: 'app-register',
  imports: [FormsModule, AuthShell],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-shell path="register">
      <p class="eyebrow" i18n="@@register.eyebrow">Tu primer huevo te espera</p>
      <h1 class="display" i18n="@@register.title">Crear cuenta</h1>
      <form ngNativeValidate (ngSubmit)="submit()">
        <div class="field">
          <label for="reg-email" class="label-caps" i18n="@@auth.field.email">Correo</label>
          <input
            id="reg-email"
            class="input"
            type="email"
            name="email"
            autocomplete="email"
            required
            [ngModel]="email()"
            (ngModelChange)="email.set($event); error.set(null)"
          />
        </div>
        <div class="field">
          <label for="reg-handle" class="label-caps" i18n="@@register.field.handle">Nickname</label>
          <input
            id="reg-handle"
            class="input"
            type="text"
            name="handle"
            autocomplete="nickname"
            autocapitalize="none"
            spellcheck="false"
            required
            placeholder="tu_nickname"
            [attr.maxlength]="handleMax + 1"
            aria-describedby="reg-handle-hint"
            [attr.aria-invalid]="handleStatus() === 'error' ? 'true' : null"
            [ngModel]="handleRaw()"
            (ngModelChange)="onHandle($event)"
          />
          <p
            id="reg-handle-hint"
            class="field__hint"
            [class.field__hint--ok]="handleStatus() === 'ok'"
            [class.field__hint--bad]="handleStatus() === 'error'"
            aria-live="polite"
          >
            @switch (handleStatus()) {
              @case ('idle') {
                <span i18n="@@register.handle.hint">Así te encontrarán tus amigos. No podrás cambiarlo después.</span>
              }
              @case ('checking') {
                <span i18n="@@register.handle.checking">Comprobando…</span>
              }
              @default {
                {{ handleMessage() }}
              }
            }
          </p>
        </div>
        <div class="field">
          <label for="reg-password" class="label-caps" i18n="@@auth.field.password">Contraseña</label>
          <input
            id="reg-password"
            class="input"
            type="password"
            name="password"
            autocomplete="new-password"
            minlength="8"
            maxlength="128"
            required
            aria-describedby="reg-password-hint"
            [ngModel]="password()"
            (ngModelChange)="password.set($event); error.set(null)"
          />
          <p id="reg-password-hint" class="field__hint" i18n="@@register.password.hint">Mínimo 8 caracteres.</p>
        </div>
        <div class="field">
          <label for="reg-invite" class="label-caps">
            @if (inviteRequired()) {
              <span i18n="@@register.field.invite">Código de invitación</span>
            } @else {
              <span i18n="@@register.field.inviteOptional">Código de invitación (opcional)</span>
            }
          </label>
          <input
            id="reg-invite"
            class="input"
            type="text"
            name="inviteCode"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            placeholder="XXXX-XXXX"
            maxlength="20"
            [required]="inviteRequired()"
            [ngModel]="inviteCode()"
            (ngModelChange)="inviteCode.set($event); error.set(null)"
          />
          @if (inviteRequired()) {
            <p class="field__hint" i18n="@@register.invite.hint">Ahora mismo el registro es solo con invitación.</p>
          }
        </div>
        @if (error(); as message) {
          <p class="form-error" role="alert">{{ message }}</p>
        }
        <div class="actions">
          <button class="btn btn--filled" type="submit" [disabled]="busy()">
            @if (busy()) {
              <span i18n="@@register.busy">Creando cuenta…</span>
            } @else {
              <span i18n="@@register.submit">Crear cuenta</span>
            }
          </button>
        </div>
      </form>
      <p class="alt">
        <span i18n="@@register.haveAccount">¿Ya tienes cuenta?</span>
        <a [href]="loginHref" i18n="@@register.toLogin">Entrar</a>
      </p>
    </app-auth-shell>
  `,
  styles: AUTH_FORM_STYLES,
})
export class Register {
  private readonly auth = inject(UserAuth);
  private readonly router = inject(Router);
  private readonly site = inject(SiteConfigService);
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  private readonly next = safeNext(inject(ActivatedRoute).snapshot.queryParamMap.get('next'));
  protected readonly loginHref = `/${this.locale}/login${this.next !== '/' ? `?next=${encodeURIComponent(this.next)}` : ''}`;
  protected readonly handleMax = HANDLE_MAX_LENGTH;

  protected readonly inviteRequired = computed(() => this.site.config().inviteRequired);
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly inviteCode = signal('');
  protected readonly handleRaw = signal('');
  protected readonly handleStatus = signal<HandleStatus>('idle');
  protected readonly handleMessage = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  private timer?: ReturnType<typeof setTimeout>;
  private seq = 0;

  constructor() {
    setAuthTitle(inject(Title), $localize`:@@register.title:Crear cuenta`);
    // El ajuste puede haber cambiado desde la última visita: se vuelve a pedir.
    void this.site.load(true);
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /** Comprobación del nickname en vivo, con espera para no consultar en cada tecla. */
  protected onHandle(raw: string) {
    this.handleRaw.set(raw);
    this.error.set(null);
    clearTimeout(this.timer);
    const handle = normalizeHandle(raw);
    const mine = ++this.seq;
    if (!handle) {
      this.handleStatus.set('idle');
      return;
    }
    const formatError = handleFormatError(handle);
    if (formatError) {
      this.handleStatus.set('error');
      this.handleMessage.set(formatError);
      return;
    }
    this.handleStatus.set('checking');
    this.timer = setTimeout(async () => {
      try {
        const res = await this.auth.checkHandle(handle);
        if (mine !== this.seq) return; // llegó tarde: ya se ha escrito otra cosa
        this.handleStatus.set(res.available ? 'ok' : 'error');
        this.handleMessage.set(
          res.available ? $localize`:@@register.handle.free:@${res.handle}:handle: está libre` : res.reason || $localize`:@@register.handle.taken:No disponible`,
        );
      } catch {
        if (mine !== this.seq) return;
        // Sin respuesta: se deja enviar y el servidor decide.
        this.handleStatus.set('idle');
      }
    }, 350);
  }

  protected async submit() {
    if (this.busy()) return;
    const handle = normalizeHandle(this.handleRaw());
    const formatError = handleFormatError(handle);
    if (formatError || this.handleStatus() === 'error') {
      this.error.set(formatError ?? this.handleMessage());
      return;
    }
    if (this.inviteRequired() && !this.inviteCode().trim()) {
      this.error.set($localize`:@@register.invite.required:Necesitas un código de invitación para registrarte.`);
      return;
    }
    this.busy.set(true);
    const error = await this.auth.register({
      email: this.email(),
      password: this.password(),
      handle,
      inviteCode: this.inviteCode(),
    });
    this.busy.set(false);
    if (error) {
      this.error.set(error);
      // Puede que el ajuste de invitación haya cambiado: se refresca para el siguiente intento.
      void this.site.load(true);
      return;
    }
    await this.router.navigate(['/verify-email'], { queryParams: this.next !== '/' ? { next: this.next } : {} });
  }
}
