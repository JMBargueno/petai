import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const SHAPES = {
  wave: 'M-80 430 C 180 110, 430 580, 720 330 S 1150 40, 1520 290',
  arc: 'M-80 140 C 300 420, 620 -60, 900 200 S 1300 520, 1520 260',
  loop: 'M-80 300 C 240 60, 520 60, 640 300 S 380 560, 620 420 S 1180 80, 1520 360',
} as const;

/**
 * Cinta tubular azul: el motivo que acompaña a cada titular display.
 * Color plano con contorno negro (sin degradados); puramente decorativa.
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
      <path [attr.d]="d()" fill="none" stroke="#000" stroke-width="124" stroke-linecap="round" />
      <path [attr.d]="d()" fill="none" stroke="#4da2ff" stroke-width="120" stroke-linecap="round" />
      <path
        [attr.d]="d()"
        fill="none"
        stroke="#000"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-dasharray="2 14"
        transform="translate(0 -34)"
      />
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
  `,
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Ribbon {
  readonly shape = input<keyof typeof SHAPES>('wave');
  protected readonly d = computed(() => SHAPES[this.shape()]);
}
