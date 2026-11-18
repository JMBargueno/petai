import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Sticker } from '../../shared/ui/sticker';
import { NEXUS_CARDS, NEXUS_RANKS } from '../content';

/**
 * Los Nexos de Resonancia (clanes): por qué los Custodios se trenzan
 * y los cuatro rangos que mantienen el trenzado en orden.
 */
@Component({
  selector: 'app-nexus',
  imports: [Sticker],
  template: `
    <section id="nexo" class="band band--sky">
      <div class="band__inner">
        <h2 class="display section-title reveal" i18n="@@lore.nexo.title">
          Los Nexos de <span class="hl hl--mint">Resonancia</span>
        </h2>
        <p class="lead reveal" i18n="@@lore.nexo.lead">
          Una hebra se rompe; un trenzado sostiene el Éter. Por eso los Custodios se unen en hermandades.
        </p>

        <div class="card-grid nexus__grid">
          @for (c of cards; track c.title) {
            <article class="card nexus__card reveal">
              <app-sticker [icon]="c.icon" [color]="c.color" [size]="64" [rotate]="-5" />
              <h3>{{ c.title }}</h3>
              <p>{{ c.body }}</p>
            </article>
          }
        </div>

        <h3 class="display nexus__ranks-title reveal" i18n="@@lore.nexo.ranks.title">Los cuatro rangos del Nexo</h3>
        <p class="nexus__ranks-lead reveal" i18n="@@lore.nexo.ranks.lead">
          Si una hebra tira demasiado fuerte, deshilacha a las demás: nadie puede actuar sobre una hebra de su mismo rango o superior.
        </p>
        <ol class="nexus__ranks">
          @for (r of ranks; track r.title; let i = $index) {
            <li class="nexus__rank reveal" [style.--i]="i">
              <app-sticker [icon]="r.icon" [color]="r.color" [size]="48" [rotate]="i % 2 ? 6 : -6" />
              <div>
                <strong class="nexus__rank-name">{{ r.title }}</strong>
                <p>{{ r.body }}</p>
              </div>
            </li>
          }
        </ol>
      </div>
    </section>
  `,
  styleUrl: './nexus.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Nexus {
  protected readonly cards = NEXUS_CARDS;
  protected readonly ranks = NEXUS_RANKS;
}
