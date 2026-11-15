import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Sticker } from '../../shared/ui/sticker';
import { AETHER_PATTERNS, EARTH_PATTERNS, PATTERN_DEFS } from '../content';

/**
 * Las definiciones de textura reutilizan la cadena ya traducida (key `lore.appear.def.*`);
 * el nombre destacado se deriva del propio texto ("Nombre: resto") para no añadir más i18n-ids.
 */
const defParts = (body: string) => {
  const [name, ...rest] = body.split(': ');
  return { name, body: rest.join(': '), key: body };
};

@Component({
  selector: 'app-appearance',
  imports: [Sticker],
  template: `
    <section id="apariencia" class="band band--sky">
      <div class="band__inner">
        <h2 class="display section-title reveal" i18n="@@lore.appear.title">
          Firma de <span class="hl hl--lavender">Origen</span>
        </h2>
        <p class="lead reveal" i18n="@@lore.appear.lead">
          Cada pockai dibuja en su piel una Firma de Origen, única e irrepetible en todo el universo.
        </p>

        <div class="appear__panels">
          <article class="appear__panel appear__panel--earth reveal">
            <header class="appear__head">
              <app-sticker icon="leaf" color="mint-pop" [size]="48" [rotate]="-6" />
              <div>
                <h3 i18n="@@lore.appear.basic.t">Mimesis Terrestre</h3>
                <p i18n="@@lore.appear.basic">
                  Los recién nacidos de densidad común imitan la naturaleza que ven a través de la cámara de su Custodio:
                  pelaje, hojas, horizontes.
                </p>
              </div>
            </header>
            <ul class="patterns">
              @for (p of earth; track p.id) {
                <li class="pattern reveal">
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
          </article>

          <article class="appear__panel appear__panel--aether reveal">
            <header class="appear__head">
              <app-sticker icon="star" color="voltage-violet" [size]="48" [rotate]="6" />
              <div>
                <h3 i18n="@@lore.appear.sup.t">Textura del Éter</h3>
                <p i18n="@@lore.appear.sup">
                  Desde Super-raro en adelante, el cuerpo deja de imitar el mundo físico y muestra la textura real del Éter
                  Digital.
                </p>
              </div>
            </header>
            <ul class="patterns">
              @for (p of aether; track p.id) {
                <li class="pattern reveal">
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
          </article>
        </div>

        <div class="appear__defs card-grid">
          @for (def of aetherDefs; track def.key) {
            <article class="card appear__def reveal">
              <h3>{{ def.name }}</h3>
              <p>{{ def.body }}</p>
            </article>
          }
        </div>

        <article class="card appear__shiny reveal">
          <app-sticker icon="star" color="sunburst" [size]="56" [rotate]="-8" class="appear__shiny-icon" />
          <p i18n="@@lore.appear.shiny">
            Bendición del Prisma: justo en el instante en que el huevo cristaliza en el Telar, un Rayo Cósmico (un bit
            solar invertido) lo atraviesa y le revierte y electriza la paleta. Un ser tocado por las estrellas.
          </p>
        </article>
      </div>
    </section>
  `,
  styleUrl: './appearance.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Appearance {
  protected readonly earth = EARTH_PATTERNS;
  protected readonly aether = AETHER_PATTERNS;
  protected readonly aetherDefs = Object.values(PATTERN_DEFS).map(defParts);
}
