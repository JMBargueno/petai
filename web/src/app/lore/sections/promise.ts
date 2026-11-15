import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LORE_RARITIES } from '../content';

@Component({
  selector: 'app-promise-section',
  template: `
    <section id="rarezas" class="band band--ink">
      <div class="band__inner">
        <h2 class="display section-title reveal" i18n="@@lore.rare.title">
          Densidad de <span class="hl hl--ember">Compilación</span>
        </h2>
        <p class="lead reveal" i18n="@@lore.rare.lead">
          La rareza no mide superioridad biológica: mide cuántos siglos de mito quedaron atrapados en el huevo.
        </p>

        <div class="rarities">
          @for (r of rarities; track r.id) {
            <article class="rarity tilt reveal">
              <div class="rarity__head">
                <span class="rarity__swatch" [style.background]="'var(--color-' + r.color + ')'"></span>
                <div>
                  <span class="label-caps rarity__game">{{ r.gameName }}</span>
                  <h3>{{ r.loreName }}</h3>
                </div>
                <span class="tag rarity__percent">{{ r.percent }}%</span>
              </div>
              <p>{{ r.nature }}</p>
            </article>
          }
        </div>

        <div class="promise">
          <h3 class="promise__title reveal" i18n="@@lore.promise.title">La Promesa del Telar</h3>
          <blockquote class="promise__quote reveal" i18n="@@lore.promise.lead">
            “El Éter no ignora un corazón constante.”
          </blockquote>
          <div class="promise__grid">
            <article class="card tilt promise__milestone reveal">
              <span class="label-caps" i18n="@@lore.promise.30.t">30 eclosiones</span>
              <p i18n="@@lore.promise.30.b">
                Cada huevo común eclosionado con dedicación deja un hilo invisible ligado a tu Santuario. A los 30, los
                hilos vibran y el flujo garantiza una Anomalía Resonante (SR).
              </p>
            </article>
            <article class="card tilt promise__milestone reveal">
              <span class="label-caps" i18n="@@lore.promise.120.t">120 eclosiones</span>
              <p i18n="@@lore.promise.120.b">
                El núcleo del Telar responde a tu devoción y abre una brecha garantizada hacia un Arquetipo Ancestral o
                una Singularidad Primordial.
              </p>
            </article>
          </div>
        </div>
      </div>
    </section>
  `,
  styleUrl: './promise.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromiseSection {
  protected readonly rarities = LORE_RARITIES;
}
