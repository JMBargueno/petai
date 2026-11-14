import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  LOCALE_ID,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Marquee } from '../shared/ui/marquee';
import { PockaiSprite, PockaiState } from '../shared/ui/pockai-sprite';
import { Ribbon } from '../shared/ui/ribbon';
import { Sticker } from '../shared/ui/sticker';
import { SITE_URL } from '../site.config';
import { FAQ, FEATURES, MARQUEE, META, PLATFORMS, SPECIES } from './content';
import { PetDemo } from './demo/pet-demo';
import { DesktopScene } from './sections/desktop-scene';
import { HowItWorks } from './sections/how-it-works';
import { Rarities } from './sections/rarities';

const LOCALES = ['es', 'en'] as const;
const HERO_ROTATION_MS = 3800;
const HERO_GREETING_MS = 1500;

@Component({
  selector: 'app-landing',
  imports: [Marquee, Ribbon, Sticker, PockaiSprite, HowItWorks, Rarities, DesktopScene, PetDemo],
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
  protected readonly year = new Date().getFullYear();
  protected readonly letters = [...'Pockai'];

  /** Mascota del hero: va cambiando de especie y saluda al tocarla. */
  private readonly heroIndex = signal(0);
  protected readonly heroPet = computed(() => SPECIES[this.heroIndex() % SPECIES.length]);
  protected readonly heroState = signal<PockaiState>('idle');
  private greeting?: ReturnType<typeof setTimeout>;

  private readonly hero = viewChild.required<ElementRef<HTMLElement>>('hero');

  constructor() {
    this.setHead(inject(Title), inject(Meta), inject(DOCUMENT));

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
  private setHead(title: Title, meta: Meta, doc: Document) {
    const url = `${SITE_URL}/${this.locale}/`;
    title.setTitle(META.title);
    meta.updateTag({ name: 'description', content: META.description });
    meta.updateTag({ property: 'og:title', content: META.title });
    meta.updateTag({ property: 'og:description', content: META.description });
    meta.updateTag({ property: 'og:type', content: 'website' });
    meta.updateTag({ property: 'og:url', content: url });

    // En el navegador estos nodos ya vienen en el HTML prerenderizado.
    if (doc.head.querySelector('link[rel="canonical"]')) return;

    const link = (rel: string, href: string, hreflang?: string) => {
      const el = doc.createElement('link');
      el.rel = rel;
      el.href = href;
      if (hreflang) el.hreflang = hreflang;
      doc.head.appendChild(el);
    };
    link('canonical', url);
    for (const l of LOCALES) link('alternate', `${SITE_URL}/${l}/`, l);
    link('alternate', `${SITE_URL}/es/`, 'x-default');

    const ld = doc.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Pockai',
      applicationCategory: 'GameApplication',
      operatingSystem: 'Windows, Android',
      description: META.description,
      url,
    });
    doc.head.appendChild(ld);
  }
}
