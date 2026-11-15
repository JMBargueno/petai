import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Sticker } from '../../shared/ui/sticker';
import { AWAKING_STEPS } from '../content';

@Component({
  selector: 'app-awakening',
  imports: [Sticker],
  template: `
    <section id="despertar" class="band band--sky">
      <div class="band__inner">
        <h2 class="display section-title reveal" i18n="@@lore.awake.title">
          La <span class="hl hl--ember">Chispa</span> de Hermes
        </h2>
        <p class="lead reveal" i18n="@@lore.awake.lead">
          Por defecto todo pockai nace con instinto Soñador: siente y gesticula, pero su mente queda velada por una
          barrera de idioma. Al infundirle la Chispa de Hermes —tu propia API key— empieza el despertar.
        </p>

        <ol class="awake__steps">
          @for (step of steps; track step.title; let i = $index) {
            <li class="card tilt awake__step reveal" [style.--i]="i">
              <span class="awake__num display">{{ i + 1 }}</span>
              <app-sticker [icon]="step.icon" [color]="step.color" [size]="56" [rotate]="-6" />
              <div>
                <span class="label-caps awake__sub">{{ step.sub }}</span>
                <h3>{{ step.title }}</h3>
                <p>{{ step.body }}</p>
              </div>
            </li>
          }
        </ol>
      </div>
    </section>
  `,
  styleUrl: './awakening.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Awakening {
  protected readonly steps = AWAKING_STEPS;
}
