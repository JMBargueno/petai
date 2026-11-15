import { ChangeDetectionStrategy, Component, LOCALE_ID, inject, signal } from '@angular/core';
import { PockaiSprite } from '../../shared/ui/pockai-sprite';
import { SPECIES } from '../content';

/** Las especies del catálogo compartido. Al pasar el ratón por una tarjeta, su pockai se alegra. */
@Component({
  selector: 'app-species',
  imports: [PockaiSprite],
  template: `
    <section id="especies" class="band band--white">
      <div class="band__inner">
        <div class="section-head section-head--center">
          <h2 class="display section-title section-title--sm reveal" i18n="@@species.title">
            Los primeros <span class="hl hl--mint">pockais</span>
          </h2>
          <p class="lead reveal" i18n="@@species.lead">Las especies con las que empieza el juego. Vendrán más.</p>
        </div>

        <ul class="species">
          @for (s of species; track s.id) {
            <li
              class="card species__card reveal"
              [style.background]="'var(--color-' + s.color + ')'"
              (pointerenter)="hovered.set(s.id)"
              (pointerleave)="hovered.set(null)"
            >
              <div class="species__art">
                <app-pockai-sprite
                  [species]="s.spriteKey"
                  [alt]="s.name"
                  [state]="hovered() === s.id ? 'happy' : 'idle'"
                />
              </div>
              <h3>{{ s.name }}</h3>
              <p class="species__tags">
                <span class="tag">{{ s.element }}</span>
                <span class="tag">{{ s.rarity }}</span>
              </p>
            </li>
          }
        </ul>
        <p class="species__note">
          <a class="link species__lore" [href]="loreHref" i18n="@@species.lore">¿De dónde vienen? Conoce el Éter Digital →</a>
        </p>
      </div>
    </section>
  `,
  styles: `
    ul,
    p {
      margin: 0;
    }
    .species {
      display: grid;
      gap: 20px;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
      padding: 0;
      list-style: none;
    }
    .species__card {
      display: grid;
      gap: 12px;
      border-radius: var(--radius-cards-elevated);
      transition:
        translate var(--dur-2) var(--ease-out),
        box-shadow var(--dur-2) var(--ease-out);
    }
    @media (prefers-reduced-motion: no-preference) {
      .species__card:hover {
        translate: 0 -4px;
        box-shadow: var(--shadow-3);
      }
    }
    .species__card h3 {
      margin: 0;
      font-size: var(--text-subheading);
    }
    .species__art {
      display: grid;
      place-items: center;
      border-radius: var(--radius-cards);
      background:
        radial-gradient(circle at 50% 70%, rgb(255 255 255 / 1) 0%, rgb(255 255 255 / 0.7) 60%),
        var(--surface);
      aspect-ratio: 4 / 3;
    }
    .species__art app-pockai-sprite {
      --sprite-size: min(62%, 190px);
    }
    .species__tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .species__note {
      margin-block-start: 40px;
      text-align: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Species {
  protected readonly species = SPECIES;
  protected readonly loreHref = `/${inject(LOCALE_ID).slice(0, 2)}/lore`;
  protected readonly hovered = signal<string | null>(null);
}
