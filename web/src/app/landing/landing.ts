import { ChangeDetectionStrategy, Component, DestroyRef, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { navPages } from '../shared/layout/nav-pages';
import { NavLink, SiteHeader } from '../shared/layout/site-header';
import { SiteFooter } from '../shared/layout/site-footer';
import { SeoService } from '../shared/seo/seo.service';
import { SOCIAL_LINKS } from '../shared/social';
import { Marquee } from '../shared/ui/marquee';
import { PockaiSprite, PockaiState } from '../shared/ui/pockai-sprite';
import { Sticker } from '../shared/ui/sticker';
import { OG_IMAGE, SITE_NAME, SITE_URL, pageUrl } from '../site.config';
import { FAQ, FEATURES, MARQUEE, META, PLATFORMS, STARTER_SPECIES } from './content';
import { PetDemo } from './demo/pet-demo';
import { DesktopScene } from './sections/desktop-scene';
import { HowItWorks } from './sections/how-it-works';
import { Pricing } from './sections/pricing';
import { SectionToc, TocSection } from '../shared/layout/section-toc';
import { DownloadAction } from '../shared/download/download-action';

const HERO_GREETING_MS = 1500;

/**
 * Home corta: hero, cómo funciona, funciones, demo, precios, descarga y FAQ.
 * Especies y rarezas viven en /pockais, la Arena en /arena y el lore en /lore.
 */
@Component({
  selector: 'app-landing',
  imports: [SiteHeader, SiteFooter, SectionToc, Marquee, Sticker, PockaiSprite, HowItWorks, DesktopScene, Pricing, PetDemo, DownloadAction],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Landing {
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly marquee = MARQUEE;
  protected readonly features = FEATURES;
  protected readonly platforms = PLATFORMS;
  protected readonly faq = FAQ;
  protected readonly loreHref = `/${this.locale}/lore`;
  protected readonly contactHref = `/${this.locale}/contact`;
  protected readonly letters = [...'Pockai'];

  protected readonly homeLabel = $localize`:@@nav.home:Pockai, inicio`;
  protected readonly navLabel = $localize`:@@nav.label:Principal`;
  protected readonly navCta: NavLink = { href: '#descargar', label: $localize`:@@nav.cta:Descargar` };
  /** Anclas de esta página; el resto del sitio va en el grupo "Páginas". */
  protected readonly navLinks: NavLink[] = [
    { href: '#funciones', label: $localize`:@@nav.features:Funciones` },
    { href: '#demo', label: $localize`:@@nav.demo:Pruébalo` },
    { href: '#precios', label: $localize`:@@nav.pricing:Precios` },
    { href: '#faq', label: 'FAQ' },
  ];
  protected readonly navPages = navPages(this.locale, 'home');
  /** Índice flotante: todas las bandas de la home, en orden. */
  protected readonly sections: TocSection[] = [
    { id: 'como-funciona', label: $localize`:@@nav.how:Cómo funciona` },
    { id: 'funciones', label: $localize`:@@nav.features:Funciones` },
    { id: 'demo', label: $localize`:@@nav.demo:Pruébalo` },
    { id: 'precios', label: $localize`:@@nav.pricing:Precios` },
    { id: 'descargar', label: $localize`:@@nav.cta:Descargar` },
    { id: 'faq', label: 'FAQ' },
  ];

  /** Mascota del hero: una inicial (rareza normal) en etapa joven; al tocarla saluda y cambia de especie. */
  private readonly heroIndex = signal(0);
  protected readonly heroPet = computed(() => STARTER_SPECIES[this.heroIndex() % STARTER_SPECIES.length]);
  protected readonly heroState = signal<PockaiState>('idle');
  private greeting?: ReturnType<typeof setTimeout>;

  constructor() {
    this.setHead(inject(SeoService));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.greeting));
  }

  protected greet() {
    clearTimeout(this.greeting);
    this.heroState.set('happy');
    this.greeting = setTimeout(() => {
      this.heroState.set('idle');
      this.heroIndex.update((i) => i + 1);
    }, HERO_GREETING_MS);
  }

  /** Metadatos por idioma. Se ejecuta en el prerender, así que quedan en el HTML estático. */
  private setHead(seo: SeoService) {
    const url = pageUrl(this.locale, '');
    const org = `${SITE_URL}/#organization`;
    seo.set({
      title: META.title,
      description: META.description,
      path: '',
      imageAlt: META.imageAlt,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              '@id': org,
              name: SITE_NAME,
              url: `${SITE_URL}/`,
              logo: `${SITE_URL}/icon-512.png`,
              sameAs: SOCIAL_LINKS.map((s) => s.url),
            },
            {
              '@type': 'WebSite',
              '@id': `${SITE_URL}/#website`,
              name: SITE_NAME,
              url: `${SITE_URL}/`,
              inLanguage: ['es', 'en'],
              publisher: { '@id': org },
            },
            {
              '@type': 'SoftwareApplication',
              '@id': `${url}#app`,
              name: SITE_NAME,
              description: META.description,
              url,
              image: `${SITE_URL}/${OG_IMAGE()}`,
              applicationCategory: 'GameApplication',
              operatingSystem: 'Windows 10, Windows 11, Android 8.0+',
              inLanguage: this.locale,
              publisher: { '@id': org },
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
            },
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: this.faq.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        },
      ],
    });
  }
}
