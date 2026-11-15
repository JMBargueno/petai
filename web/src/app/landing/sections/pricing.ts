import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Sticker } from '../../shared/ui/sticker';
import { PRICING_CARDS, PricingCard } from '../content';

@Component({
  selector: 'app-pricing',
  imports: [Sticker],
  template: `
    <section id="precios" class="band band--white">
      <div class="band__inner">
        <h2 class="display section-title reveal" i18n="@@price.title">
          Precios <span class="hl hl--mint">claros</span>
        </h2>
        <p class="lead reveal" i18n="@@price.lead">
          Sin trucos ni suscripciones sorpresa. Jugar es gratis y tú decides cómo avanzar.
        </p>

        <div class="pricing-grid">
          @for (card of cards; track card.title; let i = $index) {
            <div
              class="card pricing-card reveal"
              [style.--i]="i"
              [style.background]="'var(--color-' + card.color + ')'"
            >
              <div class="pricing-card__head">
                <app-sticker [icon]="card.icon" [color]="card.color" [size]="56" />
                <span class="tag tag--badge">{{ card.badge }}</span>
              </div>

              <h3>{{ card.title }}</h3>
              <p class="pricing-card__desc">{{ card.description }}</p>

              <div class="pricing-card__price">
                <span class="display amount">{{ card.price }}</span>
                <span class="period label-caps">{{ card.period }}</span>
              </div>

              <ul class="features-list">
                @for (feat of card.features; track feat) {
                  <li>
                    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path
                        fill-rule="evenodd"
                        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <span>{{ feat }}</span>
                  </li>
                }
              </ul>

              <div class="pricing-card__footer">
                <a
                  class="btn"
                  [class.btn--filled]="card.filled"
                  [href]="card.ctaLink"
                >
                  {{ card.ctaText }}
                </a>
              </div>
            </div>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    .pricing-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
      gap: 24px;
      margin-block-start: 24px;
    }
    .pricing-card {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 32px 28px;
      border-radius: var(--radius-cards-elevated);
      color: var(--ink);
    }
    .pricing-card__head {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .tag--badge {
      background: var(--surface);
      color: var(--ink);
      border: var(--outline);
    }
    .pricing-card h3 {
      margin: 0;
      font-family: var(--font-lateral);
      font-size: clamp(26px, 3.2vw, 36px);
      line-height: 0.9;
      text-transform: uppercase;
    }
    .pricing-card__desc {
      margin: 0;
      font-size: 15px;
      min-block-size: 44px;
    }
    .pricing-card__price {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-block: 8px;
    }
    .amount {
      font-size: clamp(48px, 6vw, 68px);
      line-height: 0.85;
    }
    .period {
      font-size: 13px;
      color: var(--ink);
    }
    .features-list {
      display: grid;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
      flex-grow: 1;
    }
    .features-list li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 14px;
      line-height: 1.35;
    }
    .features-list svg {
      inline-size: 18px;
      block-size: 18px;
      flex-shrink: 0;
      margin-block-start: 2px;
    }
    .pricing-card__footer {
      margin-block-start: 20px;
    }
    .pricing-card__footer .btn {
      inline-size: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pricing {
  protected readonly cards: PricingCard[] = PRICING_CARDS;
}
