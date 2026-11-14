import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type PockaiState = 'idle' | 'happy' | 'eat' | 'sleep';

/**
 * Un pockai con vida, a partir de los sprites reales del juego (uno por estado).
 * El SVG trae su propia sombra dibujada; se recorta y se sustituye por una elipse aparte
 * para que el cuerpo pueda saltar sin llevarse la sombra consigo.
 */
@Component({
  selector: 'app-pockai-sprite',
  template: `
    <span class="ground"></span>
    <img [src]="src()" [alt]="alt()" width="128" height="128" decoding="async" />
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
      inline-size: var(--sprite-size, 160px);
      aspect-ratio: 1;
      flex: none;
    }
    img {
      position: relative;
      display: block;
      inline-size: 100%;
      block-size: 100%;
      clip-path: inset(0 0 13.5% 0); /* fuera la sombra del propio sprite */
      transform-origin: 50% 86%;
    }
    .ground {
      position: absolute;
      inset: auto 22% 3% 22%;
      block-size: 12%;
      border-radius: 50%;
      background: rgb(0 0 0 / 0.2);
    }

    @keyframes breathe {
      50% {
        transform: scale(1.03, 0.96);
      }
    }
    @keyframes hop {
      0%,
      100% {
        transform: translateY(0) scale(1.06, 0.92);
      }
      45% {
        transform: translateY(-24%) scale(0.96, 1.05);
      }
    }
    @keyframes hop-ground {
      45% {
        transform: scale(0.7);
        opacity: 0.6;
      }
    }
    @keyframes chomp {
      50% {
        transform: scale(1.07, 0.93);
      }
    }

    @media (prefers-reduced-motion: no-preference) {
      :host([data-state='idle']) img {
        animation: breathe 2.6s ease-in-out infinite;
      }
      :host([data-state='sleep']) img {
        animation: breathe 4.5s ease-in-out infinite;
      }
      :host([data-state='eat']) img {
        animation: chomp 0.36s ease-in-out infinite;
      }
      :host([data-state='happy']) img {
        animation: hop 0.62s ease-in-out infinite;
      }
      :host([data-state='happy']) .ground {
        animation: hop-ground 0.62s ease-in-out infinite;
      }
    }
  `,
  host: { '[attr.data-state]': 'state()', '[style.--sprite-size]': 'size() ? size() + "px" : null' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PockaiSprite {
  /** Clave de sprite de la especie (`spriteKey` en species.json). */
  readonly species = input.required<string>();
  readonly state = input<PockaiState>('idle');
  /** Texto alternativo; vacío si el sprite es decorativo. */
  readonly alt = input('');
  /** Tamaño en píxeles. Sin él manda la variable CSS `--sprite-size`. */
  readonly size = input<number | null>(null);

  protected readonly src = computed(() => `sprites/${this.species()}_${this.state()}.svg`);
}
