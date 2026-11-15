import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GLOSSARY } from '../content';

@Component({
  selector: 'app-glossary',
  imports: [],
  template: `
    <section id="diccionario" class="band band--gray">
      <div class="band__inner">
        <h2 class="display section-title reveal" i18n="@@lore.dict.title">
          Diccionario del <span class="hl hl--lavender">Éter</span>
        </h2>
        <p class="lead reveal" i18n="@@lore.dict.lead">
          Qué significa cada término técnico cuando lo traduce la mitología del juego.
        </p>

        <dl class="glossary">
          @for (t of terms; track t.lore) {
            <div class="term reveal">
              <dt class="term__app">{{ t.app }}</dt>
              <dd class="term__lore">{{ t.lore }}</dd>
            </div>
          }
        </dl>
      </div>
    </section>
  `,
  styleUrl: './glossary.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Glossary {
  protected readonly terms = GLOSSARY;
}
