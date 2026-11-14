import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PATTERNS, RARITY_ODDS, SHINY_NOTE } from '../content';

/** Rarezas con su probabilidad real y patrones. La única banda oscura de la página. */
@Component({
  selector: 'app-rarities',
  template: `
    <section id="rarezas" class="band band--ink">
      <div class="band__inner">
        <h2 class="display section-title reveal" i18n="@@rar.title">
          Ninguno sale <span class="hl hl--ember">igual</span>
        </h2>
        <p class="lead reveal" i18n="@@rar.lead">
          Cada huevo tira rareza, patrón y color. Estas son las probabilidades reales del juego.
        </p>

        <ul
          class="odds"
          tabindex="0"
          role="group"
          aria-label="Probabilidad de cada rareza"
          i18n-aria-label="@@rar.odds.label"
        >
          @for (r of odds; track r.id; let i = $index) {
            <li
              class="odd reveal reveal--pop hover-lift"
              [style.background]="'var(--color-' + r.color + ')'"
              [style.--i]="i"
            >
              <span class="label-caps">{{ r.name }}</span>
              <strong class="display">{{ r.percent }}<small>%</small></strong>
            </li>
          }
        </ul>
        <p class="shiny reveal">{{ shiny }}</p>

        <h3 class="label-caps patterns__title" i18n="@@rar.patterns">Patrones</h3>
        <ul class="patterns">
          @for (p of patterns; track p.id) {
            <li class="pattern reveal reveal--pop">
              <span class="swatch" [style.background]="'var(--color-' + p.color + ')'">
                @if (p.sprite) {
                  <img [src]="p.sprite" alt="" width="64" height="64" loading="lazy" decoding="async" />
                }
              </span>
              <span>
                <strong>{{ p.name }}</strong>
                <small>{{ p.minRarity }}+</small>
              </span>
            </li>
          }
        </ul>
      </div>
    </section>
  `,
  styles: `
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .odds {
      display: flex;
      gap: 12px;
      padding: 12px 4px 20px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scrollbar-color: var(--color-paper-white) transparent;
    }
    .odd {
      flex: 1 0 180px;
      display: grid;
      gap: 12px;
      padding: 24px;
      border: 1px solid var(--color-paper-white);
      border-radius: var(--radius-cards-elevated);
      color: var(--color-carbon);
      scroll-snap-align: start;
      rotate: calc((var(--i) - 2) * 1.5deg);
    }
    .odd strong {
      font-size: clamp(56px, 7vw, 104px);
    }
    .odd small {
      font-size: 0.45em;
    }
    .shiny {
      margin: 16px 0 0;
      font-size: 18px;
      font-weight: var(--font-weight-bold);
    }
    .patterns__title {
      margin: 48px 0 16px;
    }
    .patterns {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pattern {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 20px 8px 8px;
      border: 1px solid var(--color-paper-white);
      border-radius: var(--radius-pills);
    }
    .pattern > span:last-child {
      display: grid;
      line-height: 1.2;
    }
    .pattern small {
      font-size: var(--text-caption);
      opacity: 0.8;
    }
    .swatch {
      display: grid;
      place-items: center;
      inline-size: 48px;
      aspect-ratio: 1;
      overflow: hidden;
      border: 1px solid var(--color-paper-white);
      border-radius: 50%;
      color: var(--color-carbon);
    }
    .swatch img {
      inline-size: 150%;
      max-inline-size: none;
      block-size: auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rarities {
  protected readonly odds = RARITY_ODDS;
  protected readonly patterns = PATTERNS;
  protected readonly shiny = SHINY_NOTE;
}
