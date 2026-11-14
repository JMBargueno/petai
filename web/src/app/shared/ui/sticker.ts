import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type StickerIcon = 'egg' | 'heart' | 'bolt' | 'star' | 'chat' | 'coin' | 'shield' | 'phone';
export type StickerColor =
  | 'electric-blue'
  | 'mint-pop'
  | 'lavender'
  | 'ember'
  | 'sunburst'
  | 'voltage-violet';

const PATHS: Record<StickerIcon, string> = {
  egg: 'M12 3c-3.5 0-6.5 5.2-6.5 10a6.5 6.5 0 0 0 13 0C18.5 8.2 15.5 3 12 3z',
  heart: 'M12 20s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.4C19 15.6 12 20 12 20z',
  bolt: 'M13 2 5 13.5h5.5L9.5 22 19 9.5h-6z',
  star: 'M12 2.8l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17l-5.6 3.1 1.2-6.3L3 9.4l6.3-.8z',
  chat: 'M4 5h16v11H10l-5 4v-4H4z',
  coin: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zm0 4.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  shield: 'M12 3l7 2.5v5.5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V5.5z',
  phone:
    'M8.5 3h7A1.5 1.5 0 0 1 17 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5v-15A1.5 1.5 0 0 1 8.5 3zm2 14.5h3',
};

/**
 * Pegatina decorativa: recorte plano con contorno negro, siempre oculta a lectores de pantalla.
 * El giro va en `rotate` y el "pop" en `scale`; así las clases de movimiento globales
 * (.float, .wiggle, .beat…), que usan `transform`, se pueden combinar con ambos.
 */
@Component({
  selector: 'app-sticker',
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        [attr.d]="path()"
        fill="#fff"
        stroke="#000"
        stroke-width="1.25"
        stroke-linejoin="round"
        fill-rule="evenodd"
      />
    </svg>
  `,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      inline-size: var(--sticker-size, 72px);
      aspect-ratio: 1;
      border: var(--outline);
      border-radius: var(--radius-cards);
      flex: none;
    }
    svg {
      inline-size: 62%;
      block-size: 62%;
    }
    @media (prefers-reduced-motion: no-preference) {
      :host {
        transition: scale var(--dur-2) var(--ease-bounce);
      }
      :host(:hover) {
        scale: 1.18;
      }
    }
  `,
  host: {
    'aria-hidden': 'true',
    '[style.background]': 'background()',
    '[style.rotate]': 'rotate() + "deg"',
    '[style.--sticker-size]': 'size() + "px"',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sticker {
  readonly icon = input.required<StickerIcon>();
  readonly color = input<StickerColor>('sunburst');
  readonly rotate = input(0);
  readonly size = input(72);

  protected readonly path = computed(() => PATHS[this.icon()]);
  protected readonly background = computed(() => `var(--color-${this.color()})`);
}
