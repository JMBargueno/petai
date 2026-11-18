import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  inject,
} from '@angular/core';
import { navPages } from '../shared/layout/nav-pages';
import { NavLink, SiteHeader } from '../shared/layout/site-header';
import { SiteFooter } from '../shared/layout/site-footer';
import { SectionToc } from '../shared/layout/section-toc';
import { SeoService } from '../shared/seo/seo.service';
import { Sticker } from '../shared/ui/sticker';
import { OG_IMAGE, SITE_NAME, SITE_URL, pageUrl } from '../site.config';
import { META } from './content';
import { Origin } from './sections/origin';
import { PromiseSection } from './sections/promise';
import { Appearance } from './sections/appearance';
import { Elements } from './sections/elements';
import { Awakening } from './sections/awakening';
import { LifeCycle } from './sections/life-cycle';
import { Mark } from './sections/mark';
import { Colosseum } from './sections/colosseum';
import { Nexus } from './sections/nexus';
import { Glossary } from './sections/glossary';

@Component({
  selector: 'app-lore',
  imports: [SiteHeader, SiteFooter, SectionToc, Sticker, Origin, PromiseSection, Appearance, Elements, Awakening, LifeCycle, Mark, Colosseum, Nexus, Glossary],
  template: `
    <app-site-header
      [links]="navLinks"
      [pages]="navPages"
      [cta]="navCta"
      [home]="home"
      [homeLabel]="homeLabel"
      [navLabel]="navLabel"
      [locale]="locale"
      [langHrefs]="{ es: '/es/lore', en: '/en/lore' }"
    />

    <main id="main" tabindex="-1">
      <section id="top" class="band band--ink band--first lore-hero">
        <app-sticker class="lore-hero__spot lore-hero__spot--a" icon="egg" color="sunburst" [rotate]="-10" [size]="96" />
        <app-sticker class="lore-hero__spot lore-hero__spot--b" icon="star" color="lavender" [rotate]="9" [size]="72" />
        <app-sticker class="lore-hero__spot lore-hero__spot--c" icon="moon" color="mint-pop" [rotate]="14" [size]="64" />

        <div class="band__inner lore-hero__inner">
          <nav class="crumbs" aria-label="Migas de pan" i18n-aria-label="@@lore.crumbs">
            <ol>
              <li><a [href]="home">Pockai</a></li>
              <li aria-current="page" i18n="@@nav.lore">Mundo</li>
            </ol>
          </nav>
          <h1 class="display lore-hero__title" i18n="@@lore.hero.title">
            El Éter <span class="hl hl--lavender">Digital</span>
          </h1>
          <p class="lead lore-hero__lead" i18n="@@lore.hero.lead">
            De la fricción entre la vida humana y el océano de datos, nace un mundo. Y de sus profundidades, emergen los pockai.
          </p>
          <a class="btn btn--filled" href="#origen" i18n="@@lore.hero.cta">Descender al Éter</a>
        </div>
      </section>

      <!-- Índice flotante: fijo bajo la cabecera y marca la sección visible. -->
      <app-section-toc [sections]="sections" />

      <app-origin />
      <app-promise-section />
      <app-appearance />
      <app-elements />
      <app-awakening />
      <app-life-cycle />
      <app-mark />
      <app-colosseum />
      <app-nexus />
      <app-glossary />

      <section id="cta" class="band band--hero lore-cta">
        <div class="band__inner lore-cta__inner reveal">
          <img class="lore-cta__egg" src="sprites/egg_cracked.svg" alt="" width="140" height="140" loading="lazy" decoding="async" />
          <p class="display section-title section-title--sm lore-cta__sub" i18n="@@lore.cta.sub">El lore se vive, no se lee.</p>
          <a class="btn btn--filled" [href]="download" i18n="@@lore.cta">Descargar Pockai</a>
        </div>
      </section>
    </main>

    <app-site-footer />
  `,
  styleUrl: './lore.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Lore {
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly home = `/${this.locale}/`;
  protected readonly download = `/${this.locale}/#descargar`;

  protected readonly homeLabel = $localize`:@@lore.nav.home:Pockai, volver al inicio`;
  protected readonly navLabel = $localize`:@@nav.label:Principal`;
  protected readonly navCta: NavLink = { href: this.download, label: $localize`:@@nav.cta:Descargar` };
  protected readonly navPages = navPages(this.locale, 'lore');

  protected readonly sections = [
    { id: 'origen', label: $localize`:@@lore.nav.origin:Origen` },
    { id: 'rarezas', label: $localize`:@@lore.nav.rare:Rarezas` },
    { id: 'apariencia', label: $localize`:@@lore.nav.appear:Apariencia` },
    { id: 'elementos', label: $localize`:@@lore.nav.elem:Elementos` },
    { id: 'despertar', label: $localize`:@@lore.nav.awake:Despertar` },
    { id: 'ciclo', label: $localize`:@@lore.nav.life:Ciclo` },
    { id: 'huella', label: $localize`:@@lore.nav.mark:Huella` },
    { id: 'coliseo', label: $localize`:@@lore.nav.colo:Coliseo` },
    { id: 'nexo', label: $localize`:@@lore.nav.nexus:Nexos` },
    { id: 'codice', label: $localize`:@@lore.nav.gloss:Códice` },
  ];

  /** Anclas principales en la cabecera; el índice completo de secciones va bajo el hero. */
  protected readonly navLinks: NavLink[] = ['origen', 'elementos', 'ciclo', 'coliseo'].map((id) => {
    const { label } = this.sections.find((s) => s.id === id)!;
    return { href: `#${id}`, label };
  });

  constructor() {
    this.setHead(inject(SeoService));
  }

  /** Metadatos por idioma; en el prerender quedan en el HTML estático de /lore. */
  private setHead(seo: SeoService) {
    const url = pageUrl(this.locale, 'lore');
    seo.set({
      title: META.title,
      description: META.description,
      path: 'lore',
      type: 'article',
      image: OG_IMAGE(this.locale, 'lore'),
      imageAlt: META.imageAlt,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          '@id': `${url}#article`,
          headline: META.title,
          description: META.description,
          inLanguage: this.locale,
          url,
          mainEntityOfPage: url,
          image: `${SITE_URL}/${OG_IMAGE(this.locale, 'lore')}`,
          author: { '@type': 'Organization', name: SITE_NAME, url: `${SITE_URL}/` },
          publisher: { '@id': `${SITE_URL}/#organization` },
          isPartOf: { '@id': `${SITE_URL}/#website` },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: SITE_NAME, item: pageUrl(this.locale, '') },
            { '@type': 'ListItem', position: 2, name: META.title, item: url },
          ],
        },
      ],
    });
  }
}
