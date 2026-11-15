import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  LOCALE_ID,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { NavLink, SiteHeader } from '../shared/layout/site-header';
import { SiteFooter } from '../shared/layout/site-footer';
import { SeoService } from '../shared/seo/seo.service';
import { Marquee } from '../shared/ui/marquee';
import { Sticker } from '../shared/ui/sticker';
import { OG_IMAGE, SITE_NAME, SITE_URL, pageUrl } from '../site.config';
import { MARQUEE, META } from './content';
import { Origin } from './sections/origin';
import { PromiseSection } from './sections/promise';
import { Appearance } from './sections/appearance';
import { Elements } from './sections/elements';
import { Awakening } from './sections/awakening';
import { LifeCycle } from './sections/life-cycle';
import { Colosseum } from './sections/colosseum';
import { Glossary } from './sections/glossary';

@Component({
  selector: 'app-lore',
  imports: [SiteHeader, SiteFooter, Marquee, Sticker, Origin, PromiseSection, Appearance, Elements, Awakening, LifeCycle, Colosseum, Glossary],
  template: `
    <app-site-header
      [links]="navLinks"
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

      <app-marquee [text]="marquee" />

      <!-- Índice: se queda fijo bajo la cabecera y marca la sección visible (guía scrollspy). -->
      <nav #toc class="toc" aria-label="Secciones" i18n-aria-label="@@lore.nav.label">
        <ul class="toc__list">
          @for (s of sections; track s.id) {
            <li><a class="toc__link" [href]="'#' + s.id">{{ s.label }}</a></li>
          }
        </ul>
      </nav>

      <app-origin />
      <app-promise-section />
      <app-appearance />
      <app-elements />
      <app-awakening />
      <app-life-cycle />
      <app-colosseum />
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
  protected readonly marquee = MARQUEE;
  protected readonly home = `/${this.locale}/`;
  protected readonly download = `/${this.locale}/#descargar`;

  protected readonly homeLabel = $localize`:@@lore.nav.home:Pockai, volver al inicio`;
  protected readonly navLabel = $localize`:@@nav.label:Principal`;
  protected readonly navCta: NavLink = { href: this.download, label: $localize`:@@nav.cta:Descargar` };
  protected readonly navLinks: NavLink[] = [
    { href: this.home, label: $localize`:@@lore.nav.back:Inicio` },
    { href: `${this.home}#funciones`, label: $localize`:@@nav.features:Funciones` },
    { href: `${this.home}#arena-a-fondo`, label: $localize`:@@nav.arena:Arena` },
    { href: `${this.home}#pockais`, label: $localize`:@@nav.species:Pockais` },
    { href: `${this.home}#demo`, label: $localize`:@@nav.demo:Pruébalo` },
  ];

  protected readonly sections = [
    { id: 'origen', label: $localize`:@@lore.nav.origin:Origen` },
    { id: 'rarezas', label: $localize`:@@lore.nav.rare:Rarezas` },
    { id: 'apariencia', label: $localize`:@@lore.nav.appear:Apariencia` },
    { id: 'elementos', label: $localize`:@@lore.nav.elem:Elementos` },
    { id: 'despertar', label: $localize`:@@lore.nav.awake:Despertar` },
    { id: 'ciclo', label: $localize`:@@lore.nav.life:Ciclo` },
    { id: 'coliseo', label: $localize`:@@lore.nav.colo:Coliseo` },
  ];

  private readonly toc = viewChild.required<ElementRef<HTMLElement>>('toc');

  constructor() {
    this.setHead(inject(SeoService));

    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const nav = this.toc().nativeElement;
      const list = nav.querySelector('ul')!;
      const links = [...nav.querySelectorAll<HTMLAnchorElement>('a')];
      const setCurrent = (id: string | null) => {
        for (const link of links) {
          const on = link.hash === `#${id}`;
          link.classList.toggle('target-current', on);
          if (on) {
            link.setAttribute('aria-current', 'true');
            // Mantener visible el chip activo en el índice desplazable (sin mover la página).
            list.scrollTo({ left: link.offsetLeft - list.clientWidth / 2 + link.offsetWidth / 2, behavior: 'smooth' });
          } else link.removeAttribute('aria-current');
        }
      };
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) if (entry.isIntersecting) setCurrent(entry.target.id);
        },
        { rootMargin: '-45% 0px -50% 0px' },
      );
      for (const s of this.sections) {
        const el = document.getElementById(s.id);
        if (el) observer.observe(el);
      }
      destroyRef.onDestroy(() => observer.disconnect());
    });
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
