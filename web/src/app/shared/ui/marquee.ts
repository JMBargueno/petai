import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Banda negra con texto en bucle. Se detiene con prefers-reduced-motion. */
@Component({
  selector: 'app-marquee',
  template: `
    <p class="visually-hidden">{{ text() }}</p>
    <div class="track" aria-hidden="true">
      @for (i of copies; track i) {
        <span>{{ text() }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      overflow: hidden;
      background: var(--color-carbon);
      color: var(--color-paper-white);
    }
    .track {
      display: flex;
      inline-size: max-content;
      animation: slide 40s linear infinite;
    }
    span {
      padding: 8px 16px;
      font-weight: var(--font-weight-bold);
      font-size: var(--text-caption);
      letter-spacing: 0.032em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    @keyframes slide {
      to {
        translate: -50% 0;
      }
    }
    :host(:hover) .track {
      animation-play-state: paused;
    }
    @media (prefers-reduced-motion: reduce) {
      .track {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Marquee {
  readonly text = input.required<string>();
  protected readonly copies = [0, 1, 2, 3, 4, 5, 6, 7];
}
