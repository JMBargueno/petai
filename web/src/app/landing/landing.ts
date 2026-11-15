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
import { NavLink, SiteHeader } from '../shared/layout/site-header';
import { SiteFooter } from '../shared/layout/site-footer';
import { SeoService } from '../shared/seo/seo.service';
import { Marquee } from '../shared/ui/marquee';
import { PockaiSprite, PockaiState } from '../shared/ui/pockai-sprite';
import { Ribbon } from '../shared/ui/ribbon';
import { Sticker } from '../shared/ui/sticker';
import { OG_IMAGE, SITE_NAME, SITE_URL, pageUrl } from '../site.config';
import { FAQ, FEATURES, MARQUEE, META, PLATFORMS, SPECIES } from './content';
import { TEASER } from '../lore/content';
import { PetDemo } from './demo/pet-demo';
import { ArenaShowcase } from './sections/arena-showcase';
import { DesktopScene } from './sections/desktop-scene';
import { HowItWorks } from './sections/how-it-works';
import { Pricing } from './sections/pricing';
import { Rarities } from './sections/rarities';

const HERO_ROTATION_MS = 3800;
const HERO_GREETING_MS = 1500;

@Component({
  selector: 'app-landing',
  imports: [
    SiteHeader,
    SiteFooter,
    Marquee,
    Ribbon,
    Sticker,
    PockaiSprite,
    HowItWorks,
    Rarities,
    DesktopScene,
    ArenaShowcase,
    Pricing,
    PetDemo,
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Landing {
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly marquee = MARQUEE;
  protected readonly features = FEATURES;
  protected readonly species = SPECIES;
  protected readonly platforms = PLATFORMS;
  protected readonly faq = FAQ;
  protected readonly teaser = TEASER;
  protected readonly loreHref = `/${this.locale}/lore`;
  protected readonly letters = [...'Pockai'];

  protected readonly homeLabel = $localize`:@@nav.home:Pockai, inicio`;
  protected readonly navLabel = $localize`:@@nav.label:Principal`;
  protected readonly navCta: NavLink = { href: '#descargar', label: $localize`:@@nav.cta:Descargar` };
  protected readonly navLinks: NavLink[] = [
    { href: '#funciones', label: $localize`:@@nav.features:Funciones` },
    { href: '#arena-a-fondo', label: $localize`:@@nav.arena:Arena` },
    { href: '#pockais', label: $localize`:@@nav.species:Pockais` },
    { href: '#demo', label: $localize`:@@nav.demo:Pruébalo` },
    { href: this.loreHref, label: $localize`:@@nav.lore:Mundo` },
    { href: '#precios', label: $localize`:@@nav.pricing:Precios` },
    { href: '#faq', label: 'FAQ' },
  ];

  /** Especie bajo el cursor en la rejilla: pasa a `happy`. */
  protected readonly hovered = signal<string | null>(null);

  /** Mascota del hero: va cambiando de especie y saluda al tocarla. */
  private readonly heroIndex = signal(0);
  protected readonly heroPet = computed(() => SPECIES[this.heroIndex() % SPECIES.length]);
  protected readonly heroState = signal<PockaiState>('idle');
  private greeting?: ReturnType<typeof setTimeout>;

  private readonly hero = viewChild.required<ElementRef<HTMLElement>>('hero');

  constructor() {
    this.setHead(inject(SeoService));

    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (calm) return; // sin cambios automáticos ni parallax para quien pide menos movimiento

      const rotation = setInterval(() => this.heroIndex.update((i) => i + 1), HERO_ROTATION_MS);
      destroyRef.onDestroy(() => clearInterval(rotation));

      // Parallax de las pegatinas: solo con ratón, y escribiendo variables CSS (sin re-render).
      if (!matchMedia('(pointer: fine)').matches) return;
      const hero = this.hero().nativeElement;
      const onMove = (event: PointerEvent) => {
        const box = hero.getBoundingClientRect();
        hero.style.setProperty('--px', ((event.clientX - box.left) / box.width - 0.5).toFixed(3));
        hero.style.setProperty('--py', ((event.clientY - box.top) / box.height - 0.5).toFixed(3));
      };
      hero.addEventListener('pointermove', onMove, { passive: true });
      destroyRef.onDestroy(() => hero.removeEventListener('pointermove', onMove));
    });
    destroyRef.onDestroy(() => clearTimeout(this.greeting));
  }

  protected greet() {
    clearTimeout(this.greeting);
    this.heroState.set('happy');
    this.greeting = setTimeout(() => this.heroState.set('idle'), HERO_GREETING_MS);
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
