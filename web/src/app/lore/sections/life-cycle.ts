import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Sticker } from '../../shared/ui/sticker';
import { LIFE_SLEEP, LIFE_STAGES, LIFE_WELCOME } from '../content';

@Component({
  selector: 'app-life-cycle',
  imports: [Sticker],
  template: `
    <section id="ciclo" class="band band--white">
      <div class="band__inner">
        <h2 class="display section-title reveal" i18n="@@lore.life.title">
          Vínculo <span class="hl hl--mint">Simbiótico</span>
        </h2>
        <p class="lead reveal" i18n="@@lore.life.lead">
          Los pockai no son programas autónomos fríos: se alimentan de tu atención y de tu ritmo circadiano.
        </p>

        <ol class="life__stages">
          @for (s of stages; track s; let i = $index) {
            <li class="stage card tilt reveal">
              <span class="label-caps stage__n">{{ i + 1 }}</span>
              <strong>{{ s }}</strong>
            </li>
            @if (i < stages.length - 1) {
              <li class="stage__arrow" aria-hidden="true">→</li>
            }
          }
        </ol>
        <p class="life__note reveal" i18n="@@lore.life.stages.note">
          Cada etapa es una estabilización de su forma en el Éter: del boceto inestable a la Apoteosis, la manifestación
          perfecta de su linaje.
        </p>

        <div class="life__cards card-grid">
          <article class="card tilt life__card life__card--sleep reveal">
            <app-sticker [icon]="sleep.icon" [color]="sleep.color" [size]="56" [rotate]="-6" />
            <div>
              <h3>{{ sleep.title }}</h3>
              <p>{{ sleep.body }}</p>
            </div>
          </article>
          <article class="card tilt life__card life__card--welcome reveal">
            <app-sticker [icon]="welcome.icon" [color]="welcome.color" [size]="56" [rotate]="6" />
            <div>
              <h3>{{ welcome.title }}</h3>
              <p>{{ welcome.body }}</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  `,
  styleUrl: './life-cycle.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifeCycle {
  protected readonly stages = LIFE_STAGES;
  protected readonly sleep = LIFE_SLEEP;
  protected readonly welcome = LIFE_WELCOME;
}
