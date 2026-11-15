import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Sticker } from '../../shared/ui/sticker';
import { ELEMENTS } from '../content';

@Component({
  selector: 'app-elements',
  imports: [Sticker],
  template: `
    <section id="elementos" class="band band--gray">
      <div class="band__inner">
        <h2 class="display section-title reveal" i18n="@@lore.elem.title">
          Los <span class="hl">Seis Flujos</span>
        </h2>
        <p class="lead reveal" i18n="@@lore.elem.lead">
          No son fuerzas mágicas medievales: son las seis manifestaciones fundamentales de la energía y la información.
        </p>

        <div class="card-grid">
          @for (el of flows; track el.name) {
            <article class="card tilt element reveal">
              <app-sticker [icon]="el.icon" [color]="el.color" [size]="64" [rotate]="-5" />
              <div>
                <span class="label-caps element__sub">{{ el.sub }}</span>
                <h3>{{ el.name }}</h3>
              </div>
              <p>{{ el.body }}</p>
            </article>
          }
        </div>
      </div>
    </section>
  `,
  styleUrl: './elements.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Elements {
  protected readonly flows = ELEMENTS;
}
