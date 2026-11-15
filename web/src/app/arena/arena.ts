import { ChangeDetectionStrategy, Component, LOCALE_ID, inject } from '@angular/core';
import { ArenaShowcase } from '../landing/sections/arena-showcase';
import { navPages } from '../shared/layout/nav-pages';
import { NavLink, SiteHeader } from '../shared/layout/site-header';
import { SiteFooter } from '../shared/layout/site-footer';
import { SeoService } from '../shared/seo/seo.service';
import { SITE_NAME, pageUrl } from '../site.config';

/** La Arena a fondo, en su propia página (antes era una banda más de la home). */
@Component({
  selector: 'app-arena',
  imports: [SiteHeader, SiteFooter, ArenaShowcase],
  template: `
    <app-site-header
      [pages]="pages"
      [cta]="cta"
      [home]="home"
      [homeLabel]="homeLabel"
      [navLabel]="navLabel"
      [locale]="locale"
      [langHrefs]="{ es: '/es/arena', en: '/en/arena' }"
    />

    <main id="main" tabindex="-1">
      <section class="band band--hero band--first">
        <div class="band__inner page-hero">
          <p class="eyebrow" style="--eyebrow-dot: var(--theme-arena)" i18n="@@arena.page.eyebrow">Combate</p>
          <h1 class="display section-title" i18n="@@arena.page.title">La <span class="hl hl--blue">Arena</span></h1>
          <p class="lead" i18n="@@arena.page.lead">
            Combates asíncronos contra las mascotas de otros jugadores: eliges estrategia, el servidor simula el duelo y
            después ves la repetición.
          </p>
          <div class="page-hero__actions">
            <a class="btn btn--filled" [href]="download" i18n="@@hero.cta.primary">Descargar Pockai</a>
            <a class="link" [href]="home + 'lore#coliseo'" i18n="@@arena.page.lore">El Coliseo de Resonancia en el lore →</a>
          </div>
        </div>
      </section>

      <app-arena-showcase />
    </main>

    <app-site-footer />
  `,
  styles: `
    main:focus {
      outline: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Arena {
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly home = `/${this.locale}/`;
  protected readonly download = `${this.home}#descargar`;
  protected readonly pages = navPages(this.locale, 'arena');
  protected readonly cta: NavLink = { href: this.download, label: $localize`:@@nav.cta:Descargar` };
  protected readonly homeLabel = $localize`:@@nav.home:Pockai, inicio`;
  protected readonly navLabel = $localize`:@@nav.label:Principal`;

  constructor() {
    const title = $localize`:@@arena.meta.title:La Arena de Pockai: combates, elementos y ligas`;
    const description = $localize`:@@arena.meta.description:Combates asíncronos entre pockais: ventajas elementales, estrategias, habilidades y ligas de Bronce a Mítica. Así funciona la Arena de Pockai.`;
    const url = pageUrl(this.locale, 'arena');
    inject(SeoService).set({
      title,
      description,
      path: 'arena',
      jsonLd: [
        { '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${url}#webpage`, name: title, description, url, inLanguage: this.locale },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: SITE_NAME, item: pageUrl(this.locale, '') },
            { '@type': 'ListItem', position: 2, name: title, item: url },
          ],
        },
      ],
    });
  }
}
