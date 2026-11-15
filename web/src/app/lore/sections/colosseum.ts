import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Sticker } from '../../shared/ui/sticker';
import { COLISEUM_CARDS } from '../content';

@Component({
  selector: 'app-colosseum',
  imports: [Sticker],
  template: `
    <section id="coliseo" class="band band--ink">
      <div class="band__inner">
        <h2 class="display section-title reveal" i18n="@@lore.colo.title">
          El Coliseo de <span class="hl hl--blue">Resonancia</span>
        </h2>
        <p class="lead reveal" i18n="@@lore.colo.lead">
          No es un baño de sangre: es un Duelo de Proyección Astral, parte arte marcial y parte debate energético.
        </p>

        <div class="card-grid colo__grid">
          @for (c of cards; track c.title) {
            <article class="card colo__card reveal">
              <app-sticker [icon]="c.icon" [color]="c.color" [size]="64" [rotate]="-5" />
              <h3>{{ c.title }}</h3>
              <p>{{ c.body }}</p>
            </article>
          }
        </div>
      </div>
    </section>
  `,
  styleUrl: './colosseum.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Colosseum {
  protected readonly cards = COLISEUM_CARDS;
}
