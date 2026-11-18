import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Sticker } from '../../shared/ui/sticker';
import { MARK_CARDS } from '../content';

/**
 * La Huella del Custodio: cada pockai forja su carácter con la crianza, atesora recuerdos y
 * sigue viviendo en el Éter cuando no estás. Texto para jugadores: sin mecánica interna.
 */
@Component({
  selector: 'app-mark',
  imports: [Sticker],
  template: `
    <section id="huella" class="band band--white">
      <div class="band__inner">
        <div class="section-head">
          <p class="eyebrow" style="--eyebrow-dot: var(--theme-social)" i18n="@@lore.nav.mark">Huella</p>
          <h2 class="display section-title reveal" i18n="@@lore.mark.title">
            La Huella del <span class="hl hl--mint">Custodio</span>
          </h2>
          <p class="lead reveal" i18n="@@lore.mark.lead">
            Ningún pockai es una copia de su especie. Nace con el temperamento de su linaje, pero cada gesto tuyo deja
            una huella en su núcleo.
          </p>
        </div>

        <ul class="mark">
          @for (c of cards; track c.title; let i = $index) {
            <li class="mark__card reveal" [style.--i]="i">
              <app-sticker [icon]="c.icon" [color]="c.color" [size]="56" [rotate]="i % 2 ? 6 : -6" />
              <span class="label-caps mark__kicker">{{ c.kicker }}</span>
              <h3>{{ c.title }}</h3>
              <p>{{ c.body }}</p>
            </li>
          }
        </ul>
        <p class="mark__saying reveal" i18n="@@lore.mark.saying">
          «Dos huevos iguales, dos Custodios distintos, dos pockai que ya no se parecen.»
        </p>
      </div>
    </section>
  `,
  styleUrl: './mark.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Mark {
  protected readonly cards = MARK_CARDS;
}
