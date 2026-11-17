import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  LOCALE_ID,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HANDLE_MAX_LENGTH, handleFormatError, normalizeHandle } from '../account/handle';
import { UserAuth } from '../shared/auth/user-auth';
import { SiteConfigService } from '../shared/site-config/site-config';
import { ContactFooter } from '../shared/layout/contact-footer';
import { PockaiSprite } from '../shared/ui/pockai-sprite';

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Tiempo que falta hasta `target`, o null si ya ha pasado (o la fecha no es válida). */
export function countdownTo(target: string | null, now: number): Countdown | null {
  const end = target ? Date.parse(target) : NaN;
  if (Number.isNaN(end) || end <= now) return null;
  let left = Math.floor((end - now) / 1000);
  const days = Math.floor(left / 86_400);
  left -= days * 86_400;
  const hours = Math.floor(left / 3600);
  left -= hours * 3600;
  const minutes = Math.floor(left / 60);
  return { days, hours, minutes, seconds: left - minutes * 60 };
}

/** Pockais que orbitan alrededor del huevo (claves de sprite de species.json). */
const ORBIT = ['ignisaur', 'axolunar', 'florabud'] as const;

export type AuthMode = 'login' | 'register' | 'forgot' | 'verify';

/**
 * Landing «Coming soon»: portada a pantalla completa que tapa la web mientras el lanzamiento no está
 * abierto (ajuste del panel). Los procesos de acceso (login, registro, recuperación y verificación)
 * y de contacto se atienden en modales sobre la misma escena cósmica para no exponer la web.
 */
@Component({
  selector: 'app-coming-soon',
  imports: [FormsModule, PockaiSprite, ContactFooter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sky" aria-hidden="true">
      <span class="blob blob--a"></span>
      <span class="blob blob--b"></span>
      <span class="blob blob--c"></span>
      <span class="stars"></span>
      <span class="stars stars--far"></span>
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
      <div class="hatch" aria-hidden="true">
        <span class="ring"></span>
        <span class="ring ring--2"></span>
        <img class="egg" src="sprites/egg_closed.svg" alt="" width="200" height="200" fetchpriority="high" />
        @for (key of orbit; track key; let i = $index) {
          <span class="orbit" [style.--i]="i">
            <span class="orbit__pet">
              <app-pockai-sprite [species]="key" state="happy" [size]="76" />
            </span>
          </span>
        }
      </div>

      <p class="kicker" i18n="@@soon.kicker">Muy pronto</p>
      <h1 class="title">
        <span i18n="@@soon.title.1">Algo está</span>
        <span class="title__hl" i18n="@@soon.title.2">eclosionando</span>
      </h1>
      <p class="lead" i18n="@@soon.lead">Tu yokai de bolsillo con IA está a punto de salir del huevo.</p>

      @if (countdown(); as c) {
        <div class="countdown" role="timer" aria-live="off" [attr.aria-label]="countdownLabel()">
          <div class="countdown__cell">
            <span class="countdown__num">{{ c.days }}</span>
            <span class="countdown__unit" i18n="@@soon.days">días</span>
          </div>
          <div class="countdown__cell">
            <span class="countdown__num">{{ pad(c.hours) }}</span>
            <span class="countdown__unit" i18n="@@soon.hours">horas</span>
          </div>
          <div class="countdown__cell">
            <span class="countdown__num">{{ pad(c.minutes) }}</span>
            <span class="countdown__unit" i18n="@@soon.minutes">min</span>
          </div>
          <div class="countdown__cell">
            <span class="countdown__num">{{ pad(c.seconds) }}</span>
            <span class="countdown__unit" i18n="@@soon.seconds">seg</span>
          </div>
        </div>
      }

      <div class="cta">
        @if (auth.loggedIn()) {
          @if (auth.verified()) {
            <p class="cta__note" i18n="@@verifyEmail.done.title">¡Correo verificado!</p>
          } @else {
            <p class="cta__note" i18n="@@soon.verify.note">Ya casi: verifica tu correo para entrar.</p>
            <button class="btn btn--filled btn--glow" type="button" (click)="openAuth('verify')" i18n="@@soon.verify">Verificar mi correo</button>
            <button class="btn btn--ghost-light" type="button" (click)="logout()" i18n="@@soon.logout">Usar otra cuenta</button>
          }
        } @else {
          <button class="btn btn--filled btn--glow" type="button" (click)="openAuth('register')" i18n="@@soon.register">Crear cuenta</button>
          <button class="btn btn--ghost-light" type="button" (click)="openAuth('login')" i18n="@@soon.login">Ya tengo cuenta</button>
        }
      </div>
    </main>

    <app-contact-footer (closed)="cleanUrlIfSubroute()" />

    <!-- Diálogo Modal de Autenticación (Login, Registro, Recuperación, Verificación) -->
    <dialog #authDialog class="dialog dialog--dark" (close)="onAuthDialogClose()">
      <button type="button" class="dialog__close" aria-label="Cerrar" (click)="closeAuthDialog()" i18n-aria-label="@@dialog.close">✕</button>

      @switch (authMode()) {
        @case ('login') {
          <h2 class="dialog__title" i18n="@@login.title">Entrar</h2>
          <p class="dialog__eyebrow" i18n="@@login.eyebrow">Tu cuenta</p>
          <form class="dialog__form" ngNativeValidate (ngSubmit)="submitLogin()">
            <div class="dialog__field">
              <label for="soon-login-email" i18n="@@auth.field.email">Correo</label>
              <input
                id="soon-login-email"
                class="dialog__input"
                type="email"
                name="email"
                autocomplete="username"
                required
                [ngModel]="loginEmail()"
                (ngModelChange)="loginEmail.set($event); loginError.set(null)"
              />
            </div>
            <div class="dialog__field">
              <label for="soon-login-password" i18n="@@auth.field.password">Contraseña</label>
              <input
                id="soon-login-password"
                class="dialog__input"
                type="password"
                name="password"
                autocomplete="current-password"
                required
                [ngModel]="loginPassword()"
                (ngModelChange)="loginPassword.set($event); loginError.set(null)"
              />
            </div>
            @if (loginError(); as err) {
              <p class="dialog__error" role="alert">{{ err }}</p>
            }
            <div class="dialog__actions">
              <button class="btn btn--filled btn--glow" type="submit" [disabled]="loginBusy()">
                @if (loginBusy()) {
                  <span i18n="@@login.busy">Entrando…</span>
                } @else {
                  <span i18n="@@login.submit">Entrar</span>
                }
              </button>
              <button class="btn--link" type="button" (click)="setAuthMode('forgot')" i18n="@@login.forgot">¿Has olvidado la contraseña?</button>
            </div>
          </form>
          <p class="dialog__alt">
            <span i18n="@@login.noAccount">¿Aún no tienes cuenta?</span>
            <button class="btn--link" type="button" (click)="setAuthMode('register')" i18n="@@login.toRegister">Crear cuenta</button>
          </p>
        }

        @case ('register') {
          <h2 class="dialog__title" i18n="@@register.title">Crear cuenta</h2>
          <p class="dialog__eyebrow" i18n="@@register.eyebrow">Tu primer huevo te espera</p>
          <form class="dialog__form" ngNativeValidate (ngSubmit)="submitRegister()">
            <div class="dialog__field">
              <label for="soon-reg-email" i18n="@@auth.field.email">Correo</label>
              <input
                id="soon-reg-email"
                class="dialog__input"
                type="email"
                name="email"
                autocomplete="email"
                required
                [ngModel]="regEmail()"
                (ngModelChange)="regEmail.set($event); regError.set(null)"
              />
            </div>
            <div class="dialog__field">
              <label for="soon-reg-handle" i18n="@@register.field.handle">Nickname</label>
              <input
                id="soon-reg-handle"
                class="dialog__input"
                type="text"
                name="handle"
                autocomplete="nickname"
                autocapitalize="none"
                spellcheck="false"
                required
                placeholder="tu_nickname"
                [attr.maxlength]="handleMax + 1"
                [ngModel]="regHandleRaw()"
                (ngModelChange)="onHandleChange($event)"
              />
              <p class="dialog__hint" [class.dialog__hint--ok]="handleStatus() === 'ok'" [class.dialog__hint--bad]="handleStatus() === 'error'">
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
            <div class="dialog__field">
              <label for="soon-reg-password" i18n="@@auth.field.password">Contraseña</label>
              <input
                id="soon-reg-password"
                class="dialog__input"
                type="password"
                name="password"
                autocomplete="new-password"
                minlength="8"
                maxlength="128"
                required
                [ngModel]="regPassword()"
                (ngModelChange)="regPassword.set($event); regError.set(null)"
              />
              <p class="dialog__hint" i18n="@@register.password.hint">Mínimo 8 caracteres.</p>
            </div>
            <div class="dialog__field">
              <label for="soon-reg-invite">
                @if (inviteRequired()) {
                  <span i18n="@@register.field.invite">Código de invitación</span>
                } @else {
                  <span i18n="@@register.field.inviteOptional">Código de invitación (opcional)</span>
                }
              </label>
              <input
                id="soon-reg-invite"
                class="dialog__input"
                type="text"
                name="inviteCode"
                autocapitalize="characters"
                spellcheck="false"
                [required]="inviteRequired()"
                [ngModel]="regInviteCode()"
                (ngModelChange)="regInviteCode.set($event); regError.set(null)"
              />
            </div>
            @if (regError(); as err) {
              <p class="dialog__error" role="alert">{{ err }}</p>
            }
            <div class="dialog__actions">
              <button class="btn btn--filled btn--glow" type="submit" [disabled]="regBusy()">
                @if (regBusy()) {
                  <span i18n="@@register.busy">Creando cuenta…</span>
                } @else {
                  <span i18n="@@register.submit">Crear cuenta</span>
                }
              </button>
            </div>
          </form>
          <p class="dialog__alt">
            <span i18n="@@register.haveAccount">¿Ya tienes cuenta?</span>
            <button class="btn--link" type="button" (click)="setAuthMode('login')" i18n="@@register.toLogin">Entrar</button>
          </p>
        }

        @case ('forgot') {
          <h2 class="dialog__title" i18n="@@forgot.title">Cambiar contraseña</h2>
          <p class="dialog__eyebrow" i18n="@@forgot.eyebrow">Tu cuenta</p>
          @switch (fpStep()) {
            @case ('request') {
              <p class="dialog__lead" i18n="@@forgot.request.lead">Te enviaremos un código de 6 dígitos a tu correo.</p>
              <form class="dialog__form" ngNativeValidate (ngSubmit)="submitFpRequest()">
                <div class="dialog__field">
                  <label for="soon-fp-email" i18n="@@auth.field.email">Correo</label>
                  <input
                    id="soon-fp-email"
                    class="dialog__input"
                    type="email"
                    name="email"
                    autocomplete="email"
                    required
                    [ngModel]="fpEmail()"
                    (ngModelChange)="fpEmail.set($event); fpError.set(null)"
                  />
                </div>
                @if (fpError(); as err) {
                  <p class="dialog__error" role="alert">{{ err }}</p>
                }
                <div class="dialog__actions">
                  <button class="btn btn--filled btn--glow" type="submit" [disabled]="fpBusy()" i18n="@@forgot.request.submit">Enviar código</button>
                </div>
              </form>
            }
            @case ('confirm') {
              <p class="dialog__lead" i18n="@@forgot.confirm.lead">Si {{ fpEmail() }} tiene cuenta, te habrá llegado un código. Caduca en 15 minutos.</p>
              <form class="dialog__form" ngNativeValidate (ngSubmit)="submitFpConfirm()">
                <div class="dialog__field">
                  <label for="soon-fp-code" i18n="@@auth.field.code">Código</label>
                  <input
                    id="soon-fp-code"
                    class="dialog__input"
                    type="text"
                    name="code"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxlength="6"
                    required
                    [ngModel]="fpCode()"
                    (ngModelChange)="fpCode.set($event); fpError.set(null)"
                  />
                </div>
                <div class="dialog__field">
                  <label for="soon-fp-password" i18n="@@forgot.field.newPassword">Contraseña nueva</label>
                  <input
                    id="soon-fp-password"
                    class="dialog__input"
                    type="password"
                    name="newPassword"
                    autocomplete="new-password"
                    minlength="8"
                    maxlength="128"
                    required
                    [ngModel]="fpPassword()"
                    (ngModelChange)="fpPassword.set($event); fpError.set(null)"
                  />
                  <p class="dialog__hint" i18n="@@register.password.hint">Mínimo 8 caracteres.</p>
                </div>
                @if (fpError(); as err) {
                  <p class="dialog__error" role="alert">{{ err }}</p>
                }
                <div class="dialog__actions">
                  <button class="btn btn--filled btn--glow" type="submit" [disabled]="fpBusy()" i18n="@@forgot.confirm.submit">Cambiar contraseña</button>
                  <button class="btn btn--ghost-light" type="button" (click)="fpStep.set('request')" i18n="@@forgot.confirm.back">Usar otro correo</button>
                </div>
              </form>
            }
            @case ('done') {
              <p class="dialog__ok" role="status" i18n="@@forgot.done">Contraseña cambiada. Ya puedes entrar con la nueva.</p>
              <div class="dialog__actions">
                <button class="btn btn--filled btn--glow" type="button" (click)="setAuthMode('login')" i18n="@@forgot.done.login">Entrar</button>
              </div>
            }
          }
          <p class="dialog__alt">
            <button class="btn--link" type="button" (click)="setAuthMode('login')" i18n="@@register.toLogin">Volver a Entrar</button>
          </p>
        }

        @case ('verify') {
          <h2 class="dialog__title" i18n="@@verifyEmail.title">Confirma tu correo</h2>
          <p class="dialog__eyebrow" i18n="@@verifyEmail.eyebrow">Verificación de cuenta</p>
          <p class="dialog__lead" i18n="@@verifyEmail.code.lead">
            Te hemos enviado un correo a {{ auth.user()?.email }}. Escribe el código de 6 dígitos o pulsa el botón del correo.
          </p>
          <form class="dialog__form" ngNativeValidate (ngSubmit)="submitVerify()">
            <div class="dialog__field">
              <label for="soon-verify-code" i18n="@@auth.field.code">Código</label>
              <input
                id="soon-verify-code"
                class="dialog__input dialog__code"
                type="text"
                name="code"
                inputmode="numeric"
                autocomplete="one-time-code"
                pattern="[0-9]{6}"
                maxlength="6"
                required
                [ngModel]="verifyCode()"
                (ngModelChange)="verifyCode.set($event); verifyError.set(null)"
              />
            </div>
            @if (verifyError(); as err) {
              <p class="dialog__error" role="alert">{{ err }}</p>
            }
            @if (verifyResent()) {
              <p class="dialog__ok" role="status" i18n="@@verifyEmail.resent">Te hemos enviado un correo nuevo.</p>
            }
            <div class="dialog__actions">
              <button class="btn btn--filled btn--glow" type="submit" [disabled]="verifyBusy()" i18n="@@verifyEmail.code.submit">Verificar</button>
              <button class="btn btn--ghost-light" type="button" [disabled]="verifyBusy()" (click)="resendVerifyCode()" i18n="@@verifyEmail.resend">Reenviar correo</button>
            </div>
          </form>
          <p class="dialog__alt">
            <button class="btn--link" type="button" (click)="logoutFromVerify()" i18n="@@verifyEmail.otherAccount">Usar otra cuenta</button>
          </p>
        }
      }
    </dialog>

  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: grid;
      grid-template-rows: auto 1fr auto;
      overflow: auto;
      color: #fff;
      background: #0b0a14;
      color-scheme: dark;
      isolation: isolate;
    }

    /* ── Fondo: manchas de color que derivan y estrellas que titilan ── */
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
      opacity: 0.55;
    }
    .blob--a {
      inset: -25vmax auto auto -20vmax;
      background: radial-gradient(circle, #6d5bff 0%, transparent 65%);
    }
    .blob--b {
      inset: auto -25vmax -30vmax auto;
      background: radial-gradient(circle, #3f8cff 0%, transparent 65%);
    }
    .blob--c {
      inset: 35% auto auto 45%;
      inline-size: 45vmax;
      background: radial-gradient(circle, #fb4903 0%, transparent 60%);
      opacity: 0.28;
    }
    .stars {
      position: absolute;
      inset: -50%;
      background-image:
        radial-gradient(2px 2px at 20% 30%, #fff 50%, transparent 51%),
        radial-gradient(1.5px 1.5px at 70% 20%, #ffd731 50%, transparent 51%),
        radial-gradient(2px 2px at 40% 80%, #55db9c 50%, transparent 51%),
        radial-gradient(1.5px 1.5px at 85% 65%, #e9ccff 50%, transparent 51%),
        radial-gradient(1px 1px at 10% 90%, #fff 50%, transparent 51%),
        radial-gradient(1.5px 1.5px at 55% 50%, #fff 50%, transparent 51%);
      background-size: 260px 260px;
      opacity: 0.8;
    }
    .stars--far {
      background-size: 170px 170px;
      opacity: 0.45;
    }

    /* ── Cabecera mínima ── */
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
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .lang {
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      border: 1px solid rgb(255 255 255 / 0.2);
      border-radius: var(--radius-pills);
      background: rgb(255 255 255 / 0.06);
      backdrop-filter: blur(10px);
    }
    .lang a {
      padding: 4px 10px;
      border-radius: var(--radius-pills);
      color: #fff;
      font-weight: var(--font-weight-bold);
      font-size: 13px;
      text-decoration: none;
    }
    .lang a[aria-current='true'] {
      background: #fff;
      color: #0b0a14;
    }

    /* ── Escenario ── */
    .stage {
      display: grid;
      align-content: center;
      justify-items: center;
      gap: 18px;
      padding: 8px 16px 24px;
      text-align: center;
    }
    .hatch {
      position: relative;
      display: grid;
      place-items: center;
      inline-size: min(78vw, 340px, 40svh);
      aspect-ratio: 1;
      margin-block-end: 4px;
    }
    .egg {
      inline-size: 58%;
      block-size: auto;
      filter: drop-shadow(0 14px 28px rgb(255 215 49 / 0.35));
      transform-origin: 50% 85%;
    }
    .ring {
      position: absolute;
      inset: 14%;
      border: 2px dashed rgb(255 255 255 / 0.25);
      border-radius: 50%;
    }
    .ring--2 {
      inset: 0;
      border: 1px solid rgb(255 255 255 / 0.12);
    }
    .orbit {
      position: absolute;
      inset: 0;
      rotate: calc(var(--i) * 120deg);
    }
    .orbit__pet {
      position: absolute;
      inset-block-start: -6%;
      inset-inline-start: 50%;
      translate: -50% 0;
      display: block;
      rotate: calc(var(--i) * -120deg);
    }

    .kicker {
      margin: 0;
      padding: 6px 14px;
      border: 1px solid rgb(255 255 255 / 0.25);
      border-radius: var(--radius-pills);
      background: rgb(255 255 255 / 0.08);
      font-weight: var(--font-weight-bold);
      font-size: 13px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .title {
      display: grid;
      margin: 0;
      font-family: var(--font-lateral);
      font-weight: var(--font-weight-extrabold);
      font-size: clamp(40px, 9vw, 104px);
      line-height: 0.95;
      letter-spacing: -0.01em;
      text-transform: uppercase;
    }
    .title__hl {
      background: linear-gradient(90deg, #ffd731, #fb4903, #e9ccff, #55db9c, #4da2ff, #ffd731);
      background-size: 300% 100%;
      background-clip: text;
      -webkit-background-clip: text;
      color: transparent;
    }
    .lead {
      max-inline-size: 48ch;
      margin: 0;
      font-size: clamp(16px, 2.4vw, 20px);
      line-height: 1.4;
      color: rgb(255 255 255 / 0.82);
    }

    /* ── Cuenta atrás ── */
    .countdown {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      margin-block: 4px;
    }
    .countdown__cell {
      display: grid;
      place-items: center;
      min-inline-size: 72px;
      padding: 10px 14px;
      border: 1px solid rgb(255 255 255 / 0.2);
      border-radius: var(--radius-cards);
      background: rgb(255 255 255 / 0.06);
      backdrop-filter: blur(12px);
    }
    .countdown__num {
      font-family: var(--font-lateral);
      font-size: clamp(26px, 4vw, 36px);
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .countdown__unit {
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgb(255 255 255 / 0.65);
    }

    /* ── Botones principales ── */
    .cta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-block-start: 6px;
    }
    .cta__note {
      inline-size: 100%;
      margin: 0 0 -4px;
      font-size: 14px;
      color: #ffd731;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 14px 28px;
      border: 2px solid transparent;
      border-radius: var(--radius-pills);
      font-family: inherit;
      font-weight: var(--font-weight-extrabold);
      font-size: 15px;
      text-decoration: none;
      cursor: pointer;
      transition:
        scale var(--dur-2) var(--ease-bounce),
        background var(--dur-2) var(--ease-out),
        box-shadow var(--dur-2) var(--ease-out);
    }
    .btn:hover {
      scale: 1.04;
    }
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      scale: 1;
    }
    .btn--filled {
      background: #fff;
      color: #0b0a14;
    }
    .btn--glow {
      box-shadow: 0 0 32px rgb(255 215 49 / 0.45);
    }
    .btn--ghost-light {
      border-color: rgb(255 255 255 / 0.35);
      background: rgb(255 255 255 / 0.08);
      color: #fff;
    }
    .btn--ghost-light:hover {
      background: rgb(255 255 255 / 0.14);
    }

    /* ── Modales oscuros en modo Coming Soon ── */
    dialog.dialog--dark {
      position: fixed;
      inset: 0;
      margin: auto;
      inline-size: min(480px, calc(100vw - 32px));
      max-block-size: min(90svh, 720px);
      overflow-y: auto;
      padding: clamp(24px, 5vw, 36px);
      border: 1px solid rgb(255 255 255 / 0.18);
      border-radius: 24px;
      background: #141322;
      color: #fff;
      box-shadow: 0 24px 64px rgb(0 0 0 / 0.7);
      text-align: start;
    }
    dialog.dialog--dark::backdrop {
      background-color: rgb(11 10 20 / 0.75);
      backdrop-filter: blur(8px);
    }
    .dialog__title {
      margin: 0;
      font-family: var(--font-lateral);
      font-size: clamp(24px, 4vw, 32px);
      letter-spacing: -0.01em;
      line-height: 1.1;
    }
    .dialog__eyebrow {
      margin: 4px 0 0;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #ffd731;
    }
    .dialog__lead {
      margin: 10px 0 0;
      font-size: 14px;
      line-height: 1.45;
      color: rgb(255 255 255 / 0.75);
    }
    .dialog__close {
      position: absolute;
      inset-block-start: 18px;
      inset-inline-end: 18px;
      display: grid;
      place-items: center;
      inline-size: 34px;
      block-size: 34px;
      padding: 0;
      border: 1px solid rgb(255 255 255 / 0.15);
      border-radius: 50%;
      background: rgb(255 255 255 / 0.06);
      color: #fff;
      font-size: 16px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .dialog__close:hover {
      background: rgb(255 255 255 / 0.16);
      border-color: #ffd731;
    }
    .dialog__form {
      display: grid;
      gap: 14px;
      margin-block-start: 16px;
    }
    .dialog__field {
      display: grid;
      gap: 6px;
    }
    .dialog__field label {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: rgb(255 255 255 / 0.75);
    }
    .dialog__input {
      inline-size: 100%;
      box-sizing: border-box;
      padding: 10px 14px;
      border: 1px solid rgb(255 255 255 / 0.2);
      border-radius: 12px;
      background: rgb(255 255 255 / 0.08);
      color: #fff;
      font-family: inherit;
      font-size: 15px;
      outline: none;
      transition: border-color 0.15s, background-color 0.15s;
    }
    .dialog__input:focus {
      border-color: #ffd731;
      background: rgb(255 255 255 / 0.12);
    }
    .dialog__textarea {
      resize: vertical;
      min-block-size: 100px;
    }
    .dialog__code {
      font-family: var(--font-lateral);
      font-size: 22px;
      letter-spacing: 0.25em;
      text-align: center;
    }
    .dialog__hint {
      margin: 0;
      font-size: 12px;
      color: rgb(255 255 255 / 0.6);
    }
    .dialog__hint--ok {
      color: #55db9c;
    }
    .dialog__hint--bad,
    .dialog__error {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: #fb4903;
    }
    .dialog__ok {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #55db9c;
    }
    .dialog__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-block-start: 6px;
    }
    .dialog__alt {
      margin: 16px 0 0;
      font-size: 14px;
      color: rgb(255 255 255 / 0.7);
      text-align: center;
    }
    .btn--link {
      background: none;
      border: none;
      color: #ffd731;
      font-family: inherit;
      font-size: inherit;
      font-weight: 700;
      text-decoration: underline;
      cursor: pointer;
      padding: 0 4px;
    }
    .btn--link:hover {
      color: #fff;
    }
    /* ── Movimiento (solo si el sistema lo permite) ── */
    @keyframes drift {
      50% {
        transform: translate(8vmax, 6vmax) scale(1.15);
      }
    }
    @keyframes twinkle {
      50% {
        opacity: 0.25;
      }
    }
    @keyframes rise {
      to {
        transform: translateY(-260px);
      }
    }
    @keyframes wobble {
      0%,
      100% {
        transform: rotate(0deg);
      }
      25% {
        transform: rotate(-3deg) scale(1.02);
      }
      75% {
        transform: rotate(3deg) scale(0.98);
      }
    }
    @keyframes spin {
      to {
        rotate: 360deg;
      }
    }
    @keyframes counter-spin {
      to {
        rotate: -360deg;
      }
    }
    @keyframes pulse {
      50% {
        scale: 1.08;
        opacity: 0.4;
      }
    }
    @keyframes shimmer {
      to {
        background-position: -300% 0;
      }
    }
    @keyframes enter {
      from {
        opacity: 0;
        transform: translateY(18px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    @media (prefers-reduced-motion: no-preference) {
      .blob--a {
        animation: drift 18s ease-in-out infinite;
      }
      .blob--b {
        animation: drift 22s ease-in-out infinite reverse;
      }
      .blob--c {
        animation: drift 26s ease-in-out infinite;
      }
      .stars {
        animation:
          twinkle 4s ease-in-out infinite,
          rise 90s linear infinite;
      }
      .stars--far {
        animation:
          twinkle 6s ease-in-out infinite 1s,
          rise 140s linear infinite;
      }
      .egg {
        animation: wobble 3.2s ease-in-out infinite;
      }
      .ring {
        animation: spin 40s linear infinite;
      }
      .ring--2 {
        animation: pulse 4s ease-in-out infinite;
      }
      .hatch .orbit {
        animation: spin 24s linear infinite;
      }
      .orbit__pet app-pockai-sprite {
        display: block;
        animation: counter-spin 24s linear infinite;
      }
      .title__hl {
        animation: shimmer 8s linear infinite;
      }
      .stage > * {
        animation: enter 0.7s var(--ease-out) both;
      }
      .stage > :nth-child(2) {
        animation-delay: 0.08s;
      }
      .stage > :nth-child(3) {
        animation-delay: 0.16s;
      }
      .stage > :nth-child(4) {
        animation-delay: 0.24s;
      }
      .stage > :nth-child(n + 5) {
        animation-delay: 0.32s;
      }
    }
  `,
})
export class ComingSoon {
  protected readonly auth = inject(UserAuth);
  private readonly site = inject(SiteConfigService);
  private readonly router = inject(Router);
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly orbit = ORBIT;

  private readonly authDialog = viewChild<ElementRef<HTMLDialogElement>>('authDialog');
  private readonly contactFooter = viewChild(ContactFooter);

  protected readonly authMode = signal<AuthMode>('login');

  // Estado formulario de Login
  protected readonly loginEmail = signal('');
  protected readonly loginPassword = signal('');
  protected readonly loginError = signal<string | null>(null);
  protected readonly loginBusy = signal(false);

  // Estado formulario de Registro
  protected readonly regEmail = signal('');
  protected readonly regHandleRaw = signal('');
  protected readonly regPassword = signal('');
  protected readonly regInviteCode = signal('');
  protected readonly regError = signal<string | null>(null);
  protected readonly regBusy = signal(false);
  protected readonly handleStatus = signal<'idle' | 'checking' | 'ok' | 'error'>('idle');
  protected readonly handleMessage = signal('');
  protected readonly handleMax = HANDLE_MAX_LENGTH;
  protected readonly inviteRequired = computed(() => this.site.config().inviteRequired);
  private handleSeq = 0;
  private handleTimer: ReturnType<typeof setTimeout> | null = null;

  // Estado formulario de Recuperación de contraseña
  protected readonly fpStep = signal<'request' | 'confirm' | 'done'>('request');
  protected readonly fpEmail = signal('');
  protected readonly fpCode = signal('');
  protected readonly fpPassword = signal('');
  protected readonly fpError = signal<string | null>(null);
  protected readonly fpBusy = signal(false);

  // Estado formulario de Verificación de código
  protected readonly verifyCode = signal('');
  protected readonly verifyError = signal<string | null>(null);
  protected readonly verifyBusy = signal(false);
  protected readonly verifyResent = signal(false);

  private readonly now = signal(Date.now());
  protected readonly countdown = computed(() => {
    const { enabled, launchAt } = this.site.config().comingSoon.countdown;
    return enabled ? countdownTo(launchAt, this.now()) : null;
  });
  protected readonly countdownLabel = computed(() => {
    const c = this.countdown();
    return c
      ? $localize`:@@soon.countdown.label:Faltan ${c.days}:days: días, ${c.hours}:hours: horas y ${c.minutes}:minutes: minutos`
      : null;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const timer = setInterval(() => this.now.set(Date.now()), 1000);
      destroyRef.onDestroy(() => {
        clearInterval(timer);
        if (this.handleTimer) clearTimeout(this.handleTimer);
      });

      this.checkInitialRoute();
    });
  }

  private checkInitialRoute() {
    if (typeof window === 'undefined') return;
    const path = this.router.url.split(/[?#]/)[0].replace(/^\/+[a-z]{2}\/?/, '').replace(/^\/+/, '');
    if (path === 'login') {
      if (this.auth.loggedIn() && !this.auth.verified()) {
        this.openAuth('verify');
      } else {
        this.openAuth('login');
      }
    } else if (path === 'register') {
      this.openAuth('register');
    } else if (path === 'forgot-password') {
      this.openAuth('forgot');
    } else if (path === 'verify-email') {
      this.openAuth('verify');
    } else if (path === 'contact') {
      this.contactFooter()?.openContactDialog();
    }
  }

  protected cleanUrlIfSubroute() {
    if (typeof window === 'undefined') return;
    const path = this.router.url.split(/[?#]/)[0].replace(/^\/+[a-z]{2}\/?/, '').replace(/^\/+/, '');
    if (['login', 'register', 'forgot-password', 'verify-email', 'contact'].includes(path)) {
      window.history.replaceState(window.history.state, '', `/${this.locale}/`);
    }
  }

  protected pad(n: number) {
    return String(n).padStart(2, '0');
  }

  protected async logout() {
    await this.auth.logout();
  }

  // ── Gestión del Diálogo de Autenticación ──
  protected openAuth(mode: AuthMode) {
    this.authMode.set(mode);
    this.loginError.set(null);
    this.regError.set(null);
    this.fpError.set(null);
    this.verifyError.set(null);
    this.authDialog()?.nativeElement.showModal();
  }

  protected setAuthMode(mode: AuthMode) {
    this.authMode.set(mode);
    this.loginError.set(null);
    this.regError.set(null);
    this.fpError.set(null);
    this.verifyError.set(null);
    if (mode === 'forgot') {
      this.fpStep.set('request');
    }
  }

  protected closeAuthDialog() {
    this.authDialog()?.nativeElement.close();
  }

  protected onAuthDialogClose() {
    this.cleanUrlIfSubroute();
  }

  protected async submitLogin() {
    if (this.loginBusy()) return;
    this.loginBusy.set(true);
    const error = await this.auth.login(this.loginEmail(), this.loginPassword());
    this.loginBusy.set(false);
    if (error) {
      this.loginError.set(error);
      return;
    }
    if (!this.auth.verified()) {
      this.authMode.set('verify');
      return;
    }
    this.closeAuthDialog();
    this.cleanUrlIfSubroute();
  }

  protected onHandleChange(raw: string) {
    this.regHandleRaw.set(raw);
    this.regError.set(null);
    if (this.handleTimer) clearTimeout(this.handleTimer);
    const handle = normalizeHandle(raw);
    if (!handle) {
      this.handleStatus.set('idle');
      this.handleMessage.set('');
      return;
    }
    const formatError = handleFormatError(handle);
    if (formatError) {
      this.handleStatus.set('error');
      this.handleMessage.set(formatError);
      return;
    }
    this.handleStatus.set('checking');
    const seq = ++this.handleSeq;
    this.handleTimer = setTimeout(async () => {
      try {
        const res = await this.auth.checkHandle(handle);
        if (seq !== this.handleSeq) return;
        this.handleStatus.set(res.available ? 'ok' : 'error');
        this.handleMessage.set(
          res.available
            ? $localize`:@@register.handle.free:@${res.handle}:handle: está libre`
            : res.reason || $localize`:@@register.handle.taken:No disponible`,
        );
      } catch {
        if (seq !== this.handleSeq) return;
        this.handleStatus.set('idle');
      }
    }, 350);
  }

  protected async submitRegister() {
    if (this.regBusy()) return;
    const handle = normalizeHandle(this.regHandleRaw());
    const formatError = handleFormatError(handle);
    if (formatError || this.handleStatus() === 'error') {
      this.regError.set(formatError ?? this.handleMessage());
      return;
    }
    if (this.inviteRequired() && !this.regInviteCode().trim()) {
      this.regError.set($localize`:@@register.invite.required:Necesitas un código de invitación para registrarte.`);
      return;
    }
    this.regBusy.set(true);
    const error = await this.auth.register({
      email: this.regEmail(),
      password: this.regPassword(),
      handle,
      inviteCode: this.regInviteCode(),
    });
    this.regBusy.set(false);
    if (error) {
      this.regError.set(error);
      void this.site.load(true);
      return;
    }
    this.authMode.set('verify');
  }

  protected async submitFpRequest() {
    if (this.fpBusy()) return;
    this.fpBusy.set(true);
    const error = await this.auth.requestPasswordReset(this.fpEmail());
    this.fpBusy.set(false);
    if (error) {
      this.fpError.set(error);
      return;
    }
    this.fpStep.set('confirm');
  }

  protected async submitFpConfirm() {
    if (this.fpBusy()) return;
    this.fpBusy.set(true);
    const error = await this.auth.confirmPasswordReset(this.fpEmail(), this.fpCode(), this.fpPassword());
    this.fpBusy.set(false);
    if (error) {
      this.fpError.set(error);
      return;
    }
    this.fpStep.set('done');
  }

  protected async submitVerify() {
    if (this.verifyBusy()) return;
    this.verifyBusy.set(true);
    const error = await this.auth.confirmVerification(this.verifyCode());
    this.verifyBusy.set(false);
    if (error) {
      this.verifyError.set(error);
      return;
    }
    this.closeAuthDialog();
    this.cleanUrlIfSubroute();
  }

  protected async resendVerifyCode() {
    this.verifyBusy.set(true);
    const error = await this.auth.resendVerification();
    this.verifyBusy.set(false);
    if (error) {
      this.verifyError.set(error);
    } else {
      this.verifyResent.set(true);
      setTimeout(() => this.verifyResent.set(false), 4000);
    }
  }

  protected async logoutFromVerify() {
    await this.auth.logout();
    this.setAuthMode('login');
  }
}
