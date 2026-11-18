import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { PATTERNS, RARITY_ODDS, SHINY_NOTE, SHINY_PROBABILITY } from '../content';

const BATCH = 100;

/** Generador determinista (Mulberry32, el mismo "Telar" del juego) para la tanda inicial. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Egg {
  /** Índice en RARITY_ODDS. */
  rarity: number;
  shiny: boolean;
}

/** Una tanda de huevos tirada con las probabilidades reales de balance.json. */
export function rollBatch(random: () => number, size = BATCH): Egg[] {
  return Array.from({ length: size }, () => {
    let roll = random();
    let rarity = RARITY_ODDS.length - 1;
    for (let i = 0; i < RARITY_ODDS.length; i++) {
      if (roll < RARITY_ODDS[i].probability) {
        rarity = i;
        break;
      }
      roll -= RARITY_ODDS[i].probability;
    }
    return { rarity, shiny: random() < SHINY_PROBABILITY };
  });
}

/**
 * Ninguno sale igual: una tanda de 100 huevos para ver las probabilidades en acción, las cinco
 * rarezas con su porcentaje real, la variante shiny y los patrones.
 */
@Component({
  selector: 'app-rarities',
  template: `
    <section id="rarezas" class="band band--ink">
      <div class="band__inner">
        <div class="intro">
          <div class="section-head intro__head">
            <p class="eyebrow" style="--eyebrow-dot: var(--color-ember)" i18n="@@rar.eyebrow">Rareza, patrón y color</p>
            <h2 class="display section-title reveal" i18n="@@rar.title">
              Ninguno sale <span class="hl hl--ember">igual</span>
            </h2>
            <p class="lead reveal" i18n="@@rar.lead">
              La rareza es de la especie. El patrón y el color se tiran en cada huevo, con estas mismas probabilidades.
            </p>
          </div>

          <!-- Tanda de 100 huevos -->
          <figure class="batch reveal">
            <figcaption class="batch__head">
              <span class="label-caps" i18n="@@rar.batch.title">Una tanda de 100 huevos</span>
              <button class="btn btn--sm batch__roll" type="button" (click)="reroll()">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />
                </svg>
                <span i18n="@@rar.batch.cta">Eclosionar otra tanda</span>
              </button>
            </figcaption>
            <div class="batch__grid" aria-hidden="true">
              @for (egg of eggs(); track $index) {
                <span
                  class="batch__egg"
                  [class.is-shiny]="egg.shiny"
                  [style.background]="'var(--color-' + odds[egg.rarity].color + ')'"
                  [style.--d]="($index % 10) + floor($index / 10)"
                ></span>
              }
            </div>
            <ul class="batch__legend" aria-live="polite">
              @for (r of odds; track r.id; let i = $index) {
                <li>
                  <span class="batch__dot" [style.background]="'var(--color-' + r.color + ')'"></span>
                  {{ r.name }} <strong>{{ counts()[i] }}</strong>
                </li>
              }
              <li>
                <span class="batch__dot batch__dot--shiny"></span>
                Shiny <strong>{{ shinies() }}</strong>
              </li>
            </ul>
            <p class="batch__note" i18n="@@rar.batch.note">Cada huevo se colorea por la rareza de su patrón, con las probabilidades del juego.</p>
          </figure>
        </div>

        <!-- Las cinco rarezas -->
        <ul class="odds" role="group" aria-label="Probabilidad de cada rareza" i18n-aria-label="@@rar.odds.label">
          @for (r of odds; track r.id; let i = $index) {
            <li class="odd reveal" [style.background]="'var(--color-' + r.color + ')'" [style.--i]="i">
              <span class="label-caps">{{ r.name }}</span>
              <strong class="display">{{ r.percent }}<small>%</small></strong>
              <span class="odd__bar" aria-hidden="true"><span [style.inline-size.%]="r.percent"></span></span>
            </li>
          }
        </ul>

        <p class="shiny reveal">
          <span class="shiny__badge" aria-hidden="true">✦</span>
          <span>{{ shiny }}</span>
        </p>

        <!-- Patrones -->
        <h3 id="patrones" class="label-caps patterns__title" i18n="@@rar.patterns">Patrones</h3>
        <ul class="patterns">
          @for (p of patterns; track p.id) {
            <li class="pattern reveal">
              <span class="swatch" [style.background]="'var(--color-' + p.color + ')'">
                @if (p.sprite) {
                  <img [src]="p.sprite" alt="" width="64" height="64" loading="lazy" decoding="async" />
                }
              </span>
              <strong>{{ p.name }}</strong>
              <span class="pattern__min" [style.--tone]="'var(--color-' + p.color + ')'">{{ p.rarity }}</span>
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

    /* ───── Intro: titular + tanda de huevos ───── */
    .intro {
      display: grid;
      gap: 40px 64px;
      align-items: center;
      margin-block-end: clamp(40px, 6vw, 72px);
    }
    @media (width >= 960px) {
      .intro {
        grid-template-columns: minmax(0, 1fr) minmax(0, 480px);
      }
    }
    .intro__head {
      margin-block-end: 0;
    }
    .batch {
      display: grid;
      gap: 16px;
      justify-self: center;
      inline-size: 100%;
      max-inline-size: 480px;
      margin: 0;
      padding: 20px;
      border: 1px solid rgb(255 255 255 / 0.14);
      border-radius: var(--radius-cards-elevated);
      background: rgb(255 255 255 / 0.05);
      box-shadow: 0 24px 60px rgb(0 0 0 / 0.35);
      backdrop-filter: blur(8px);
    }
    .batch__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .batch__roll svg {
      inline-size: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .batch__grid {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      gap: clamp(4px, 0.8vw, 7px);
    }
    /* Cada punto, con forma de huevo */
    .batch__egg {
      aspect-ratio: 4 / 5;
      border-radius: 50% 50% 46% 46% / 60% 60% 40% 40%;
      box-shadow: inset 0 -3px 0 rgb(0 0 0 / 0.18);
    }
    .batch__egg.is-shiny {
      outline: 2px solid #fff;
      outline-offset: 2px;
      box-shadow: 0 0 12px #fff, inset 0 -3px 0 rgb(0 0 0 / 0.18);
    }
    @media (prefers-reduced-motion: no-preference) {
      @keyframes egg-in {
        from {
          opacity: 0;
          scale: 0.3;
        }
      }
      .batch__egg {
        animation: egg-in 0.35s var(--ease-bounce) calc(var(--d) * 18ms) backwards;
      }
    }
    .batch__legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      color: var(--ink-muted);
      font-size: 13px;
    }
    .batch__legend li {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .batch__legend strong {
      color: var(--ink);
      font-variant-numeric: tabular-nums;
    }
    .batch__dot {
      inline-size: 10px;
      aspect-ratio: 1;
      border-radius: 50%;
    }
    .batch__dot--shiny {
      background: conic-gradient(#e9ccff, #4da2ff, #55db9c, #ffd731, #fb4903, #e9ccff);
    }
    .batch__note {
      margin: 0;
      color: var(--ink-muted);
      font-size: 12px;
    }

    /* ───── Rarezas ───── */
    .odds {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 124px), 1fr));
    }
    .odd {
      display: grid;
      gap: 10px;
      align-content: start;
      padding: 22px;
      overflow: hidden;
      border: 1px solid rgb(255 255 255 / 0.55);
      border-radius: var(--radius-cards-elevated);
      color: var(--ink);
      /* Cuanto más rara, más brilla */
      box-shadow:
        0 16px 44px rgb(0 0 0 / 0.35),
        inset 0 1px 0 rgb(255 255 255 / 0.5),
        0 0 calc(var(--i) * 12px) rgb(255 255 255 / calc(var(--i) * 0.07));
    }
    .odd strong {
      font-size: clamp(44px, 5.4vw, 84px);
    }
    .odd small {
      font-size: 0.45em;
    }
    .odd__bar {
      display: block;
      block-size: 6px;
      border-radius: 6px;
      background: rgb(11 10 20 / 0.15);
    }
    .odd__bar span {
      display: block;
      min-inline-size: 6px;
      block-size: 100%;
      border-radius: inherit;
      background: rgb(11 10 20 / 0.7);
    }

    /* Shiny: tarjeta prisma */
    .shiny {
      display: flex;
      align-items: center;
      gap: 14px;
      inline-size: fit-content;
      max-inline-size: 100%;
      margin: 28px 0 0;
      padding: 14px 22px 14px 14px;
      border: 1px solid transparent;
      border-radius: var(--radius-pills);
      background:
        linear-gradient(#141327, #141327) padding-box,
        conic-gradient(from 90deg, #e9ccff, #4da2ff, #55db9c, #ffd731, #fb4903, #e9ccff) border-box;
      font-size: 17px;
      font-weight: var(--font-weight-bold);
    }
    .shiny__badge {
      flex: none;
      display: grid;
      place-items: center;
      inline-size: 36px;
      aspect-ratio: 1;
      border-radius: 50%;
      background: conic-gradient(#e9ccff, #4da2ff, #55db9c, #ffd731, #fb4903, #e9ccff);
      color: #0b0a14;
      font-size: 18px;
    }

    /* ───── Patrones ───── */
    .patterns__title {
      margin: clamp(48px, 6vw, 72px) 0 16px;
      color: var(--ink-muted);
    }
    .patterns {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr));
    }
    .pattern {
      display: grid;
      justify-items: center;
      gap: 8px;
      padding: 18px 12px 14px;
      border: 1px solid rgb(255 255 255 / 0.12);
      border-radius: var(--radius-cards);
      background: rgb(255 255 255 / 0.05);
      text-align: center;
      transition:
        translate var(--dur-2) var(--ease-bounce),
        background-color var(--dur-2);
    }
    .pattern:hover {
      background: rgb(255 255 255 / 0.09);
    }
    @media (prefers-reduced-motion: no-preference) {
      .pattern:hover {
        translate: 0 -4px;
      }
    }
    .swatch {
      display: grid;
      place-items: center;
      inline-size: 64px;
      aspect-ratio: 1;
      overflow: hidden;
      border: 2px solid rgb(255 255 255 / 0.7);
      border-radius: 50%;
      box-shadow: 0 8px 20px rgb(0 0 0 / 0.35);
    }
    .swatch img {
      inline-size: 100%;
      block-size: 100%;
      object-fit: cover;
    }
    .pattern__min {
      padding: 2px 10px;
      border-radius: var(--radius-pills);
      background: color-mix(in srgb, var(--tone) 25%, transparent);
      color: var(--ink-muted);
      font-size: var(--text-caption);
      font-weight: var(--font-weight-bold);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rarities {
  protected readonly odds = RARITY_ODDS;
  protected readonly patterns = PATTERNS;
  protected readonly shiny = SHINY_NOTE;
  protected readonly floor = Math.floor;

  /** Tanda inicial con semilla fija: el prerender y la hidratación pintan lo mismo. */
  protected readonly eggs = signal<Egg[]>(rollBatch(mulberry32(7)));
  protected readonly counts = computed(() => {
    const counts = RARITY_ODDS.map(() => 0);
    for (const egg of this.eggs()) counts[egg.rarity]++;
    return counts;
  });
  protected readonly shinies = computed(() => this.eggs().filter((e) => e.shiny).length);

  protected reroll() {
    this.eggs.set(rollBatch(Math.random));
  }
}
