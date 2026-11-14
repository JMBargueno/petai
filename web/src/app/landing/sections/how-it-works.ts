import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Ribbon } from '../../shared/ui/ribbon';
import { Sticker } from '../../shared/ui/sticker';
import { STEPS } from '../content';

@Component({
  selector: 'app-how-it-works',
  imports: [Ribbon, Sticker],
  template: `
    <section id="como-funciona" class="band band--white">
      <app-ribbon shape="dip" />
      <div class="band__inner">
        <h2 class="display section-title reveal" i18n="@@how.title">
          Así <span class="hl hl--mint">funciona</span>
        </h2>
        <p class="lead reveal" i18n="@@how.lead">Tres pasos y ya tienes compañía.</p>

        <ol class="steps">
          @for (step of steps; track step.title; let i = $index) {
            <li class="card step reveal reveal--tilt hover-lift" [style.--i]="i">
              <span class="display step__n" aria-hidden="true">{{ i + 1 }}</span>
              <app-sticker [class]="step.motion" [icon]="step.icon" [color]="step.color" [size]="88" />
              <h3>{{ step.title }}</h3>
              <p>{{ step.body }}</p>
            </li>
          }
        </ol>
      </div>
    </section>
  `,
  styles: `
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .step {
      position: relative;
      display: grid;
      gap: 12px;
      align-content: start;
      justify-items: start;
      padding: 32px 24px;
      border-radius: var(--radius-cards-elevated);
      /* Collage: cada tarjeta gira y pisa a la anterior. */
      rotate: calc((var(--i) - 1) * 3deg);
      margin: calc(var(--i) * 20px) -6px 0;
      z-index: calc(3 - var(--i));
    }
    .step:nth-child(1) {
      background: var(--color-sunburst);
    }
    .step:nth-child(2) {
      background: var(--color-lavender);
    }
    .step:nth-child(3) {
      background: var(--color-sky-wash);
    }
    .step:hover {
      z-index: 4;
    }
    .step__n {
      position: absolute;
      inset: 4px 20px auto auto;
      font-size: 140px;
      line-height: 0.85;
      -webkit-text-stroke: 1px var(--color-carbon);
      color: var(--color-paper-white);
    }
    h3 {
      margin: 0;
      font-family: var(--font-lateral);
      font-size: clamp(32px, 4vw, 52px);
      line-height: 0.85;
      text-transform: uppercase;
    }
    p {
      margin: 0;
    }
    @media (width < 700px) {
      .step {
        rotate: calc((var(--i) - 1) * 1.5deg);
        margin: 0 0 -12px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HowItWorks {
  protected readonly steps = STEPS;
}
