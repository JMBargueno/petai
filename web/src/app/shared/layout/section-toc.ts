import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  viewChild,
} from '@angular/core';

export interface TocSection {
  /** id del elemento de la página al que salta el chip. */
  id: string;
  label: string;
}

/**
 * Índice flotante de secciones (guía scrollspy): se queda fijo bajo la cabecera y marca la
 * sección visible. Va dentro de `<main>`, justo después del hero, para que el `sticky` dure
 * toda la página.
 */
@Component({
  selector: 'app-section-toc',
  template: `
    <nav #toc class="toc" aria-label="Secciones" i18n-aria-label="@@lore.nav.label">
      <ul class="toc__list">
        @for (s of sections(); track s.id) {
          <li><a class="toc__link" [href]="'#' + s.id">{{ s.label }}</a></li>
        }
      </ul>
    </nav>
  `,
  styles: `
    :host {
      display: contents;
    }
    .toc {
      position: sticky;
      inset-block-start: calc(var(--header-h) - 2px);
      z-index: 15;
      padding: 8px var(--gutter);
      pointer-events: none;
    }
    .toc__list {
      position: relative; /* referencia de offsetLeft para centrar el chip activo */
      display: flex;
      gap: 4px;
      inline-size: fit-content;
      max-inline-size: min(100%, var(--page-max-width));
      margin: 0 auto;
      padding: 5px;
      overflow-x: auto;
      scrollbar-width: none;
      list-style: none;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-pills);
      background: var(--surface-glass);
      box-shadow: var(--shadow-2);
      backdrop-filter: saturate(1.6) blur(14px);
      pointer-events: auto;
    }
    .toc__link {
      display: grid;
      place-items: center;
      min-block-size: 36px;
      padding: 0 14px;
      border-radius: var(--radius-pills);
      color: var(--ink-muted);
      font-weight: var(--font-weight-bold);
      font-size: 13px;
      text-decoration: none;
      white-space: nowrap;
      transition:
        background-color var(--dur-1),
        color var(--dur-1);
    }
    .toc__link:hover {
      color: var(--ink);
    }
    /* Estado activo: no solo color (fondo + peso) */
    .toc__link.target-current {
      background: var(--ink);
      color: var(--bg);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionToc {
  readonly sections = input.required<TocSection[]>();

  private readonly toc = viewChild.required<ElementRef<HTMLElement>>('toc');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const nav = this.toc().nativeElement;
      const list = nav.querySelector('ul')!;
      const links = [...nav.querySelectorAll<HTMLAnchorElement>('a')];
      const targets = this.sections()
        .map((s) => document.getElementById(s.id))
        .filter((el): el is HTMLElement => el !== null);
      let current: string | null = null;

      const setCurrent = (id: string | null) => {
        if (id === current) return;
        current = id;
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

      // Sección actual: la última cuyo inicio ya ha pasado por una línea en el tercio superior.
      // Funciona igual con bandas enteras que con bloques cortos y seguidos dentro de una banda
      // (al saltar a uno, el siguiente no se "cuela" aunque asome por debajo).
      const update = () => {
        const line = Math.max(window.innerHeight * 0.3, 180);
        const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
        let id: string | null = null;
        for (const el of targets) {
          const top = el.getBoundingClientRect().top;
          // Al final de la página, las secciones cortas que ya no pueden subir más cuentan si se ven.
          if (top <= line || (atBottom && top < window.innerHeight)) id = el.id;
        }
        setCurrent(id);
      };

      let frame = 0;
      const onScroll = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(update);
      };
      update();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      });
    });
  }
}
