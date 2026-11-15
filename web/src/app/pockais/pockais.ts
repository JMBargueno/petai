import { ChangeDetectionStrategy, Component, LOCALE_ID, inject } from '@angular/core';
import { Rarities } from '../landing/sections/rarities';
import { Species } from '../landing/sections/species';
import { navPages } from '../shared/layout/nav-pages';
import { NavLink, SiteHeader } from '../shared/layout/site-header';
import { SiteFooter } from '../shared/layout/site-footer';
import { SeoService } from '../shared/seo/seo.service';
import { SITE_NAME, pageUrl } from '../site.config';

/** Especies, rarezas y patrones: todo lo que puede salir de un huevo, en una página. */
@Component({
  selector: 'app-pockais',
  imports: [SiteHeader, SiteFooter, Species, Rarities],
  template: `
    <app-site-header
      [pages]="pages"
      [cta]="cta"
      [home]="home"
      [homeLabel]="homeLabel"
      [navLabel]="navLabel"
      [locale]="locale"
      [langHrefs]="{ es: '/es/pockais', en: '/en/pockais' }"
    />

    <main id="main" tabindex="-1">
      <section class="band band--hero band--first">
        <div class="band__inner page-hero">
          <p class="eyebrow" style="--eyebrow-dot: var(--theme-social)" i18n="@@pockais.page.eyebrow">Criaturas</p>
          <h1 class="display section-title" i18n="@@pockais.page.title">
            Conoce a los <span class="hl hl--mint">pockais</span>
          </h1>
          <p class="lead" i18n="@@pockais.page.lead">
            Cada huevo esconde una criatura con especie, rareza, patrón y color propios. Estas son las que hay y lo que
            puede salir.
          </p>
        </div>
      </section>

      <app-species />
      <app-rarities />

      <section class="band band--gray band--compact">
        <div class="band__inner page-cta">
          <h2 class="display section-title section-title--sm" i18n="@@pockais.cta.title">¿Quieres el tuyo?</h2>
          <div class="page-hero__actions">
            <a class="btn btn--filled" [href]="home + '#descargar'" i18n="@@hero.cta.primary">Descargar Pockai</a>
            <a class="btn" [href]="home + '#demo'" i18n="@@hero.cta.demo">Probar la demo</a>
          </div>
        </div>
      </section>
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
export class Pockais {
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly home = `/${this.locale}/`;
  protected readonly pages = navPages(this.locale, 'pockais');
  protected readonly cta: NavLink = { href: `${this.home}#descargar`, label: $localize`:@@nav.cta:Descargar` };
  protected readonly homeLabel = $localize`:@@nav.home:Pockai, inicio`;
  protected readonly navLabel = $localize`:@@nav.label:Principal`;

  constructor() {
    const title = $localize`:@@pockais.meta.title:Los pockais: especies, rarezas y patrones`;
    const description = $localize`:@@pockais.meta.description:Conoce a los pockais: sus especies, las probabilidades reales de cada rareza, la variante shiny y los patrones que pueden salir de cada huevo.`;
    const url = pageUrl(this.locale, 'pockais');
    inject(SeoService).set({
      title,
      description,
      path: 'pockais',
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
