import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type PockaiState = 'idle' | 'happy' | 'eat' | 'sleep';

/** Etapa evolutiva con sprites propios para la web (scripts/generate-web-stage-sprites.ts). */
export type PockaiStage = 'baby' | 'juvenile';

/**
 * Un pockai con vida, a partir de los sprites reales del juego (uno por estado).
 * La sombra es una elipse aparte para que el cuerpo pueda saltar sin llevársela consigo.
 * Sin `stage` usa los SVG de vista previa; con `stage` usa el PNG horneado de esa etapa.
 */
@Component({
  selector: 'app-pockai-sprite',
  template: `
    <span class="ground"></span>
    <img
      [src]="src()"
      [alt]="alt()"
      width="128"
      height="128"
      [attr.loading]="priority() ? null : 'lazy'"
      [attr.fetchpriority]="priority() ? 'high' : null"
      decoding="async"
    />
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
      transform-origin: 50% 86%;
    }
    /* Pixel art a 92 px ampliado: sin suavizado, y los pies tocan el borde inferior. */
    :host([data-stage]) img {
      image-rendering: pixelated;
      transform-origin: 50% 96%;
    }
    .ground {
      position: absolute;
      inset: auto 22% 3% 22%;
      block-size: 12%;
      border-radius: 50%;
      background: rgb(11 10 20 / 0.22);
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
  host: {
    '[attr.data-state]': 'state()',
    '[attr.data-stage]': 'stage()',
    '[style.--sprite-size]': 'size() ? size() + "px" : null',
  },
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
  /** Imagen del primer pantallazo: sin lazy y con prioridad alta (guía optimize-image-priority). */
  readonly priority = input(false);

  /** Etapa a mostrar; `null` = vista previa SVG sin etapa. */
  readonly stage = input<PockaiStage | null>(null);

  protected readonly src = computed(() => {
    const stage = this.stage();
    return stage
      ? `sprites/${this.species()}_${stage}_${this.state()}.png`
      : `sprites/${this.species()}_${this.state()}.svg`;
  });
}
