import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { GLOSSARY } from '../content';

/** Quita tildes y pasa a minúsculas para buscar "eter" y encontrar "Éter". */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Diccionario del Éter: cada término del lore (dt) definido por su equivalente técnico (dd).
 * El buscador filtra en ambos sentidos; sin JS se ven todas las entradas.
 */
@Component({
  selector: 'app-glossary',
  template: `
    <section id="diccionario" class="band band--gray">
      <div class="band__inner">
        <div class="gloss__top">
          <div class="section-head gloss__head">
            <p class="eyebrow" style="--eyebrow-dot: var(--theme-lore)" i18n="@@lore.gloss.eyebrow">Glosario</p>
            <h2 class="display section-title section-title--sm reveal" i18n="@@lore.gloss.title">
              Diccionario del <span class="hl hl--lavender">Éter</span>
            </h2>
            <p class="lead reveal" i18n="@@lore.gloss.lead">
              Qué significa cada término técnico cuando lo traduce la mitología del juego.
            </p>
          </div>

          <div class="gloss__tools" role="search">
            <label class="search">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4.5 4.5" />
              </svg>
              <span class="visually-hidden" i18n="@@lore.gloss.search">Buscar en el diccionario</span>
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
              {{ shown().length }} de {{ terms.length }} términos
            </p>
          </div>
        </div>

        @if (shown().length) {
          <dl class="glossary">
            @for (t of shown(); track t.lore) {
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
      </div>
    </section>
  `,
  styleUrl: './glossary.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Glossary {
  protected readonly terms = GLOSSARY;
  protected readonly query = signal('');
  protected readonly shown = computed(() => {
    const q = fold(this.query().trim());
    if (!q) return this.terms;
    return this.terms.filter((t) => fold(`${t.lore} ${t.app}`).includes(q));
  });
}
