import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const SHAPES = {
  wave: 'M-80 430 C 180 110, 430 580, 720 330 S 1150 40, 1520 290',
  arc: 'M-80 140 C 300 420, 620 -60, 900 200 S 1300 520, 1520 260',
  loop: 'M-80 300 C 240 60, 520 60, 640 300 S 380 560, 620 420 S 1180 80, 1520 360',
  dip: 'M-80 120 C 260 60, 420 520, 760 420 S 1240 120, 1520 440',
} as const;

/**
 * Cinta tubular azul: el motivo que acompaña a cada titular display.
 * Color plano con contorno negro (sin degradados); puramente decorativa.
 *
 * Se dibuja sola: `draw="scroll"` (por defecto) la traza según entra en pantalla y
 * `draw="load"` al cargar la página (para el hero, que ya está a la vista).
 */
@Component({
  selector: 'app-ribbon',
  template: `
    <svg
      viewBox="0 0 1440 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <path class="tube" pathLength="1" [attr.d]="d()" stroke="#000" stroke-width="124" />
      <path class="tube" pathLength="1" [attr.d]="d()" stroke="#4da2ff" stroke-width="120" />
      <path class="stitch" [attr.d]="d()" stroke="#000" stroke-width="1.5" transform="translate(0 -34)" />
    </svg>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    }
    svg {
      inline-size: 100%;
      block-size: 100%;
    }
    path {
      fill: none;
      stroke-linecap: round;
    }
    .stitch {
      stroke-dasharray: 2 14;
    }

    @keyframes draw {
      from {
        stroke-dashoffset: 1;
      }
    }
    @keyframes stitch {
      to {
        stroke-dashoffset: -16;
      }
    }
    @media (prefers-reduced-motion: no-preference) {
      .tube {
        stroke-dasharray: 1;
      }
      .stitch {
        animation: stitch 1.6s linear infinite;
      }
      :host([data-draw='load']) .tube {
        animation: draw 1.6s var(--ease-out) 0.2s backwards;
      }
      @supports ((animation-timeline: view()) and (animation-range: entry)) {
        :host([data-draw='scroll']) {
          view-timeline: --ribbon block;
        }
        :host([data-draw='scroll']) .tube {
          animation: draw auto linear backwards;
          animation-timeline: --ribbon;
          animation-range: entry 0% cover 55%;
        }
      }
    }
  `,
  host: { 'aria-hidden': 'true', '[attr.data-draw]': 'draw()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Ribbon {
  readonly shape = input<keyof typeof SHAPES>('wave');
  readonly draw = input<'scroll' | 'load'>('scroll');
  protected readonly d = computed(() => SHAPES[this.shape()]);
}
