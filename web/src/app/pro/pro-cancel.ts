import { ChangeDetectionStrategy, Component, LOCALE_ID, inject } from '@angular/core';
import { navPages } from '../shared/layout/nav-pages';
import { NavLink, SiteHeader } from '../shared/layout/site-header';
import { SiteFooter } from '../shared/layout/site-footer';
import { Sticker } from '../shared/ui/sticker';

@Component({
  selector: 'app-pro-cancel',
  imports: [SiteHeader, SiteFooter, Sticker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-site-header
      [pages]="navPages"
      [cta]="navCta"
      [home]="homeUrl"
      [homeLabel]="homeLabel"
      [navLabel]="navLabel"
      [locale]="locale"
      [langHrefs]="{ es: '/es/pro/cancel', en: '/en/pro/cancel' }"
    />

    <main id="main" tabindex="-1" class="band band--hero band--first pro-status-page">
      <app-sticker class="spot spot--a" icon="moon" color="lavender" [size]="72" [rotate]="-12" />

      <div class="band__inner pro-status">
        <h1 class="display title">Suscripción cancelada</h1>
        <p class="lead text">
          No se ha realizado ningún cargo en tu cuenta. Puedes seguir disfrutando de Pockai en el modo gratuito
          (15 mensajes diarios con IA) o configurar tu propia API key sin coste adicional.
        </p>

        <div class="actions">
          <a class="btn btn--filled" [href]="homeUrl">Volver al inicio</a>
          <a class="btn" href="petai://pro-cancel">Abrir en la app de escritorio</a>
        </div>
      </div>
    </main>

    <app-site-footer />
  `,
  styles: `
    .pro-status-page {
      min-block-size: min(860px, 100svh);
      display: grid;
      place-items: center;
      position: relative;
      text-align: center;
      padding: 60px 20px;
    }
    .title {
      font-size: clamp(2rem, 5vw, 3rem);
      margin-bottom: 16px;
    }
    .text {
      max-width: 580px;
      margin: 0 auto 32px;
      line-height: 1.6;
    }
    .actions {
      display: flex;
      gap: 16px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 24px;
      border-radius: 9999px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn--filled {
      background: #6366f1;
      color: white;
    }
    .btn--filled:hover {
      background: #4f46e5;
    }
  `,
})
export class ProCancel {
  readonly locale = inject(LOCALE_ID);
  readonly homeUrl = `/${this.locale}/`;
  readonly homeLabel = 'Inicio';
  readonly navLabel = 'Navegación principal';
  readonly navPages = navPages;
  readonly navCta: NavLink = {
    label: 'Descargar',
    href: `${this.homeUrl}#descargas`,
  };
}
