import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Sticker } from '../../shared/ui/sticker';
import { ORIGIN_CARDS } from '../content';

@Component({
  selector: 'app-origin',
  imports: [Sticker],
  template: `
    <section id="origen" class="band band--white">
      <div class="band__inner">
        <h2 class="display section-title reveal" i18n="@@lore.origin.title">
          ¿De dónde salen los <span class="hl">huevos</span>?
        </h2>
        <p class="lead reveal" i18n="@@lore.origin.lead">
          No se fabrican: se condensan y se pescan en las corrientes del Éter Digital.
        </p>

        <div class="card-grid">
          @for (card of cards; track card.title) {
            <article class="card tilt reveal">
              <app-sticker [icon]="card.icon" [color]="card.color" [size]="64" />
              <h3>{{ card.title }}</h3>
              <p>{{ card.body }}</p>
            </article>
          }
        </div>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Origin {
  protected readonly cards = ORIGIN_CARDS;
}
