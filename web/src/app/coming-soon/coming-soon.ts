import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { UserAuth } from '../shared/auth/user-auth';
import { SiteConfigService } from '../shared/site-config/site-config';
import { SOCIAL_LINKS } from '../shared/social';
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

/**
 * Landing «Coming soon»: portada a pantalla completa que tapa la web mientras el lanzamiento no está
 * abierto (ajuste del panel). Mucho movimiento y poca información: huevo a punto de eclosionar,
 * pockais orbitando, cuenta atrás opcional, entrar / crear cuenta y redes.
 * Sin animaciones con `prefers-reduced-motion: reduce`.
 */
@Component({
  selector: 'app-coming-soon',
  imports: [PockaiSprite],
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
          <p class="cta__note" i18n="@@soon.verify.note">Ya casi: verifica tu correo para entrar.</p>
          <a class="btn btn--filled btn--glow" [href]="'/' + locale + '/verify-email'" i18n="@@soon.verify">Verificar mi correo</a>
          <button class="btn btn--ghost-light" type="button" (click)="logout()" i18n="@@soon.logout">Usar otra cuenta</button>
        } @else {
          <a class="btn btn--filled btn--glow" [href]="'/' + locale + '/register'" i18n="@@soon.register">Crear cuenta</a>
          <a class="btn btn--ghost-light" [href]="'/' + locale + '/login'" i18n="@@soon.login">Ya tengo cuenta</a>
        }
      </div>
    </main>

    <footer class="bottom">
      <ul class="social" aria-label="Redes sociales" i18n-aria-label="@@soon.social">
        @for (s of social; track s.id) {
          <li>
            <a class="social__link" [href]="s.url" target="_blank" rel="noopener" [attr.aria-label]="s.name" [title]="s.name">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path [attr.d]="s.path" /></svg>
            </a>
          </li>
        }
      </ul>
      <p class="handle">&#64;pockais</p>
    </footer>
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
      position: relative;
      z-index: 1;
      inline-size: 52%;
      block-size: auto;
      filter: drop-shadow(0 20px 40px rgb(109 91 255 / 0.55));
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
      max-inline-size: 34ch;
      margin: 0;
      color: rgb(255 255 255 / 0.78);
      font-size: clamp(17px, 2.2vw, 21px);
    }

    /* ── Cuenta atrás ── */
    .countdown {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      margin-block: 6px;
    }
    .countdown__cell {
      display: grid;
      gap: 2px;
      min-inline-size: 76px;
      padding: 12px 10px 10px;
      border: 1px solid rgb(255 255 255 / 0.18);
      border-radius: 18px;
      background: rgb(255 255 255 / 0.07);
      box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.15);
      backdrop-filter: blur(12px);
    }
    .countdown__num {
      font-family: var(--font-lateral);
      font-size: clamp(28px, 5vw, 40px);
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .countdown__unit {
      color: rgb(255 255 255 / 0.65);
      font-weight: var(--font-weight-bold);
      font-size: 12px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    /* ── Acciones ── */
    .cta {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 12px;
      margin-block-start: 6px;
    }
    .cta__note {
      flex-basis: 100%;
      margin: 0;
      color: #ffd731;
      font-weight: var(--font-weight-bold);
    }
    .btn--glow {
      box-shadow:
        0 0 0 3px rgb(255 255 255 / 0.12),
        0 10px 30px rgb(109 91 255 / 0.55);
    }
    .btn--ghost-light {
      border-color: rgb(255 255 255 / 0.4);
      background: rgb(255 255 255 / 0.06);
      color: #fff;
    }
    .btn--ghost-light:hover {
      background: rgb(255 255 255 / 0.14);
    }

    /* ── Pie: redes ── */
    .bottom {
      display: grid;
      justify-items: center;
      gap: 6px;
      padding: 12px 16px 24px;
    }
    .social {
      display: flex;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .social__link {
      display: grid;
      place-items: center;
      inline-size: 44px;
      aspect-ratio: 1;
      border: 1px solid rgb(255 255 255 / 0.22);
      border-radius: 50%;
      background: rgb(255 255 255 / 0.06);
      color: #fff;
      transition:
        background var(--dur-2) var(--ease-out),
        scale var(--dur-2) var(--ease-bounce);
    }
    .social__link:hover {
      background: rgb(255 255 255 / 0.16);
      scale: 1.08;
    }
    .social__link svg {
      inline-size: 18px;
      fill: currentColor;
    }
    .handle {
      margin: 0;
      color: rgb(255 255 255 / 0.55);
      font-size: 13px;
      letter-spacing: 0.06em;
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
      70%,
      100% {
        transform: rotate(0);
      }
      74% {
        transform: rotate(-9deg);
      }
      80% {
        transform: rotate(8deg);
      }
      86% {
        transform: rotate(-5deg);
      }
      92% {
        transform: rotate(3deg);
      }
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    @keyframes counter-spin {
      to {
        transform: rotate(-360deg);
      }
    }
    @keyframes shimmer {
      to {
        background-position: 300% 0;
      }
    }
    @keyframes pulse {
      50% {
        transform: scale(1.06);
        opacity: 0.5;
      }
    }
    @keyframes enter {
      from {
        opacity: 0;
        transform: translateY(16px);
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
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly orbit = ORBIT;
  protected readonly social = SOCIAL_LINKS;

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
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  protected pad(n: number) {
    return String(n).padStart(2, '0');
  }

  protected async logout() {
    await this.auth.logout();
  }
}
