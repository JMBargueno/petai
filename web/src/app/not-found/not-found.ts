import { ChangeDetectionStrategy, Component, LOCALE_ID, inject } from '@angular/core';
import { NavLink, SiteHeader } from '../shared/layout/site-header';
import { SiteFooter } from '../shared/layout/site-footer';
import { SeoService } from '../shared/seo/seo.service';
import { Sticker } from '../shared/ui/sticker';

@Component({
  selector: 'app-not-found',
  imports: [SiteHeader, SiteFooter, Sticker],
  template: `
    <app-site-header
      [links]="navLinks"
      [cta]="navCta"
      [home]="homeUrl"
      [homeLabel]="homeLabel"
      [navLabel]="navLabel"
      [locale]="locale"
      [langHrefs]="{ es: '/es/', en: '/en/' }"
    />

    <main id="main" tabindex="-1" class="band band--hero band--first not-found-page">
      <app-sticker class="spot spot--a" icon="star" color="sunburst" [size]="72" [rotate]="-12" />
      <app-sticker class="spot spot--b" icon="moon" color="lavender" [size]="60" [rotate]="10" />

      <div class="band__inner not-found">
        <div class="pet-sleep" aria-hidden="true">
          <span class="zzz">z</span><span class="zzz">z</span><span class="zzz">z</span>
          <img src="sprites/axolunar_sleep.svg" alt="" width="200" height="200" />
        </div>

        <p class="display error-code" aria-hidden="true">404</p>
        <h1 class="display title" i18n="@@404.title">Página no encontrada</h1>
        <p class="lead text" i18n="@@404.desc">
          Zzz... Tu pockai se ha quedado dormido o el enlace que has seguido ya no existe.
        </p>

        <div class="actions">
          <a class="btn btn--filled" [href]="homeUrl" i18n="@@404.back">Volver al inicio</a>
          <a class="btn" [href]="homeUrl + '#demo'" i18n="@@hero.cta.demo">Probar la demo</a>
        </div>
      </div>
    </main>

    <app-site-footer />
  `,
  styles: `
    .not-found-page {
      min-block-size: min(860px, 100svh);
      display: grid;
      place-items: center;
    }
    .not-found-page:focus {
      outline: none;
    }
    .not-found {
      display: grid;
      justify-items: center;
      text-align: center;
    }
    .pet-sleep {
      position: relative;
      display: grid;
      place-items: center;
      inline-size: 240px;
      aspect-ratio: 1;
      margin-block-end: 8px;
      border-radius: 50%;
      background: var(--surface);
      box-shadow: var(--shadow-4), inset 0 8px 30px rgb(38 30 110 / 0.12);
    }
    .pet-sleep img {
      inline-size: 78%;
      block-size: auto;
    }
    .zzz {
      position: absolute;
      inset: 14% 16% auto auto;
      color: var(--accent-ink);
      font-family: var(--font-lateral);
      font-size: 28px;
    }
    .zzz:nth-child(2) {
      inset: 2% 6% auto auto;
      font-size: 22px;
    }
    .zzz:nth-child(3) {
      inset: -8% 0 auto auto;
      font-size: 16px;
    }
    @media (prefers-reduced-motion: no-preference) {
      @keyframes drift {
        0% {
          opacity: 0;
          translate: 0 10px;
        }
        30% {
          opacity: 1;
        }
        100% {
          opacity: 0;
          translate: 14px -26px;
        }
      }
      .zzz {
        animation: drift 3s ease-out infinite;
      }
      .zzz:nth-child(2) {
        animation-delay: 1s;
      }
      .zzz:nth-child(3) {
        animation-delay: 2s;
      }
    }
    .error-code {
      margin: 0;
      font-size: clamp(88px, 16vw, 180px);
      line-height: 0.8;
      background: var(--grad-accent);
      background-clip: text;
      color: transparent;
    }
    .title {
      margin-block-start: 12px;
      font-size: clamp(28px, 5vw, 48px);
    }
    .text {
      margin-inline: auto;
      max-inline-size: 38ch;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      margin-block-start: 32px;
    }
    .spot {
      position: absolute;
      box-shadow: var(--shadow-pop);
    }
    .spot--a {
      inset: 22% auto auto 10%;
    }
    .spot--b {
      inset: auto 12% 18% auto;
    }
    @media (width < 640px) {
      .spot {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound {
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly homeUrl = `/${this.locale}/`;

  protected readonly homeLabel = $localize`:@@nav.home:Pockai, inicio`;
  protected readonly navLabel = $localize`:@@nav.label:Principal`;
  protected readonly navCta: NavLink = { href: `${this.homeUrl}#descargar`, label: $localize`:@@nav.cta:Descargar` };
  protected readonly navLinks: NavLink[] = [
    { href: this.homeUrl, label: $localize`:@@lore.nav.back:Inicio` },
    { href: `/${this.locale}/lore`, label: $localize`:@@nav.lore:Mundo` },
    { href: `${this.homeUrl}#faq`, label: 'FAQ' },
  ];

  constructor() {
    inject(SeoService).set({
      title: $localize`:@@404.meta.title:Página no encontrada · Pockai`,
      description: $localize`:@@404.meta.description:Esta página no existe o ha cambiado de sitio. Vuelve al inicio de Pockai para conocer la mascota virtual con IA.`,
      path: '404',
      noindex: true,
    });
  }
}
