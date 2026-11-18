import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { PockaiSprite } from '../../shared/ui/pockai-sprite';
import { GLOSSARY, SPECIES } from '../content';

/** Quita tildes y pasa a minúsculas para buscar "eter" y encontrar "Éter". */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Códice del Éter (Aether Codex): dos subvistas con buscador unificado.
 * – Glosario: cada término técnico (dd) y su nombre en el lore (dt).
 * – Pockais: el compendio de especies con sprite, elemento, rareza y descripción.
 */
@Component({
  selector: 'app-glossary',
  imports: [PockaiSprite],
  template: `
    <section id="codice" class="band band--gray">
      <div class="band__inner">
        <div class="gloss__top">
          <div class="section-head gloss__head">
            <p class="eyebrow" style="--eyebrow-dot: var(--theme-lore)" i18n="@@lore.gloss.eyebrow">Aether Codex</p>
            <h2 class="display section-title section-title--sm reveal" i18n="@@lore.gloss.title">
              Códice del <span class="hl hl--lavender">Éter</span>
            </h2>
            <p class="lead reveal" i18n="@@lore.gloss.lead">
              Lo que dice la app y lo que significa en el Éter. Términos y especies, todo en un solo códice.
            </p>
          </div>

          <div class="gloss__tools" role="search">
            <label class="search">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4.5 4.5" />
              </svg>
              <span class="visually-hidden" i18n="@@lore.gloss.search">Buscar en el Códice del Éter</span>
              <input
                class="input search__input"
                type="search"
                autocomplete="off"
                placeholder="Huevo, shiny, API key…"
                i18n-placeholder="@@lore.gloss.placeholder"
                [value]="query()"
                (input)="query.set($any($event.target).value)"
              />
            </label>
            <p class="gloss__count" aria-live="polite" i18n="@@lore.gloss.count">
              {{ shownTerms().length }} de {{ terms.length }} términos
            </p>
          </div>
        </div>

        <div class="codex__tabs" role="tablist" aria-label="Secciones del Códice">
          <button
            class="codex__tab"
            role="tab"
            [attr.aria-selected]="activeTab() === 'glossary'"
            [class.codex__tab--active]="activeTab() === 'glossary'"
            (click)="activeTab.set('glossary')"
            i18n="@@lore.gloss.tab.glossary"
          >Glosario</button>
          <button
            class="codex__tab"
            role="tab"
            [attr.aria-selected]="activeTab() === 'species'"
            [class.codex__tab--active]="activeTab() === 'species'"
            (click)="activeTab.set('species')"
            i18n="@@lore.gloss.tab.species"
          >Pockais</button>
        </div>

        @if (activeTab() === 'glossary') {
          @if (shownTerms().length) {
            <dl class="glossary">
              @for (t of shownTerms(); track t.lore) {
                <div class="term">
                  <span class="term__initial" aria-hidden="true">{{ t.lore.charAt(0) }}</span>
                  <dt class="term__lore">{{ t.lore }}</dt>
                  <dd class="term__app">
                    <span class="term__label" i18n="@@lore.gloss.inApp">En la app</span>
                    <code>{{ t.app }}</code>
                  </dd>
                </div>
              }
            </dl>
          } @else {
            <p class="gloss__empty" i18n="@@lore.gloss.empty">Ningún término coincide. Prueba con otra palabra.</p>
          }
        }

        @if (activeTab() === 'species') {
          <p class="lead codex__species-lead" i18n="@@lore.codex.species.lead">
            Las especies que han emergido del Éter. Cada una con su elemento, rareza y naturaleza.
          </p>
          @if (shownSpecies().length) {
            <div class="codex__species">
              @for (s of shownSpecies(); track s.id) {
                <article class="codex__card">
                  <div class="codex__card-art">
                    <app-pockai-sprite [species]="s.spriteKey" stage="baby" [alt]="s.name" />
                  </div>
                  <h3 class="codex__card-name">{{ s.name }}</h3>
                  <p class="codex__card-desc">{{ s.description }}</p>
                  <div class="codex__card-tags">
                    <span class="tag"><span class="tag__label" i18n="@@lore.codex.species.element">Elemento</span> {{ s.element }}</span>
                    <span class="tag"><span class="tag__label" i18n="@@lore.codex.species.rarity">Rareza</span> {{ s.rarity }}</span>
                  </div>
                </article>
              }
            </div>
          } @else {
            <p class="gloss__empty" i18n="@@lore.codex.species.empty">Ningún pockai coincide. Prueba con otra palabra.</p>
          }
        }
      </div>
    </section>
  `,
  styleUrl: './glossary.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Glossary {
  protected readonly terms = GLOSSARY;
  protected readonly species = SPECIES;
  protected readonly query = signal('');
  protected readonly activeTab = signal<'glossary' | 'species'>('glossary');

  protected readonly shownTerms = computed(() => {
    const q = fold(this.query().trim());
    if (!q) return this.terms;
    return this.terms.filter((t) => fold(`${t.lore} ${t.app}`).includes(q));
  });

  protected readonly shownSpecies = computed(() => {
    const q = fold(this.query().trim());
    if (!q) return this.species;
    return this.species.filter((s) => fold(`${s.name} ${s.element} ${s.rarity} ${s.description}`).includes(q));
  });
}
