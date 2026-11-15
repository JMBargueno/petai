import { ChangeDetectionStrategy, Component, DestroyRef, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { navPages } from '../shared/layout/nav-pages';
import { NavLink, SiteHeader } from '../shared/layout/site-header';
import { SiteFooter } from '../shared/layout/site-footer';
import { SeoService } from '../shared/seo/seo.service';
import { Marquee } from '../shared/ui/marquee';
import { PockaiSprite, PockaiState } from '../shared/ui/pockai-sprite';
import { Sticker } from '../shared/ui/sticker';
import { OG_IMAGE, SITE_NAME, SITE_URL, pageUrl } from '../site.config';
import { FAQ, FEATURES, MARQUEE, META, PLATFORMS, SPECIES } from './content';
import { PetDemo } from './demo/pet-demo';
import { DesktopScene } from './sections/desktop-scene';
import { HowItWorks } from './sections/how-it-works';
import { Pricing } from './sections/pricing';

const HERO_GREETING_MS = 1500;

/**
 * Home corta: hero, cómo funciona, funciones, demo, precios, descarga y FAQ.
 * Especies y rarezas viven en /pockais, la Arena en /arena y el lore en /lore.
 */
@Component({
  selector: 'app-landing',
  imports: [SiteHeader, SiteFooter, Marquee, Sticker, PockaiSprite, HowItWorks, DesktopScene, Pricing, PetDemo],
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

  /** Mascota del hero: quieta hasta que la tocas; entonces saluda y cambia de especie. */
  private readonly heroIndex = signal(0);
  protected readonly heroPet = computed(() => SPECIES[this.heroIndex() % SPECIES.length]);
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
              image: `${SITE_URL}/${OG_IMAGE(this.locale)}`,
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
