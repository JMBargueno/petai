import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Sticker } from '../../shared/ui/sticker';
import { STEPS } from '../content';

@Component({
  selector: 'app-how-it-works',
  imports: [Sticker],
  template: `
    <section id="como-funciona" class="band band--white">
      <div class="band__inner">
        <div class="section-head">
          <h2 class="display section-title reveal" i18n="@@how.title">
            Así <span class="hl hl--mint">funciona</span>
          </h2>
          <p class="lead reveal" i18n="@@how.lead">Tres pasos y ya tienes compañía.</p>
        </div>

        <ol class="steps">
          @for (step of steps; track step.title; let i = $index) {
            <li class="card step reveal">
              <span class="display step__n" aria-hidden="true">{{ i + 1 }}</span>
              <app-sticker [icon]="step.icon" [color]="step.color" [size]="88" />
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
      gap: 16px;
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
      box-shadow: var(--shadow-pop), var(--shadow-3);
    }
    .step:nth-child(1) {
      background: var(--color-sunburst);
      color-scheme: light;
      color: var(--ink);
    }
    .step:nth-child(2) {
      background: var(--color-lavender);
      color-scheme: light;
      color: var(--ink);
    }
    .step:nth-child(3) {
      background: var(--color-sky-wash);
      color-scheme: light;
      color: var(--ink);
    }
    .step__n {
      position: absolute;
      inset: 4px 20px auto auto;
      font-size: 140px;
      line-height: 0.85;
      -webkit-text-stroke: 1px var(--line);
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HowItWorks {
  protected readonly steps = STEPS;
}
