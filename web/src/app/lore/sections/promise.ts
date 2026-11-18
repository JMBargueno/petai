import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Sticker } from '../../shared/ui/sticker';
import { LORE_RARITIES } from '../content';

/**
 * Densidad de Compilación: las cinco rarezas como estratos, de la más común a la más densa,
 * con su probabilidad real y un espectro proporcional. Debajo, la Promesa del Telar como un hilo
 * con sus dos hitos (30 y 120 eclosiones).
 */
@Component({
  selector: 'app-promise-section',
  imports: [Sticker],
  template: `
    <section id="rarezas" class="band band--ink">
      <div class="band__inner">
        <div class="density">
          <div class="section-head density__head">
            <p class="eyebrow" style="--eyebrow-dot: var(--color-ember)" i18n="@@lore.nav.rare">Rarezas</p>
            <h2 class="display section-title section-title--sm reveal" i18n="@@lore.rare.title">
              Densidad de <span class="hl hl--ember">Compilación</span>
            </h2>
            <p class="lead reveal" i18n="@@lore.rare.lead">
              La rareza no mide superioridad biológica: mide cuántos siglos de mito carga un linaje. Todos los ejemplares de
              una especie la comparten.
            </p>

            <!-- Espectro: cada franja ocupa su probabilidad real. -->
            <figure class="spectrum">
              <div class="spectrum__bar" role="img" [attr.aria-label]="spectrumLabel">
                @for (r of rarities; track r.id) {
                  <span
                    class="spectrum__seg"
                    [style.flex-grow]="r.percent"
                    [style.background]="'var(--color-' + r.color + ')'"
                  ></span>
                }
              </div>
              <figcaption class="spectrum__caption">
                <span class="label-caps" i18n="@@lore.rare.spectrum">Probabilidad real de cada huevo</span>
                <span class="spectrum__ends" aria-hidden="true">
                  <span i18n="@@lore.rare.common">Más común</span>
                  <span i18n="@@lore.rare.dense">Más densa</span>
                </span>
              </figcaption>
            </figure>
          </div>

          <ol class="strata">
            @for (r of rarities; track r.id; let i = $index) {
              <li
                class="rarity reveal"
                [style.--tone]="'var(--color-' + r.color + ')'"
                [style.--level]="i + 1"
              >
                <span class="rarity__meter" aria-hidden="true">
                  @for (pip of pips; track pip) {
                    <span class="rarity__pip" [class.is-on]="pip <= i + 1"></span>
                  }
                </span>
                <div class="rarity__body">
                  <p class="rarity__meta">
                    <span class="tag rarity__game">{{ r.gameName }}</span>
                    <span class="visually-hidden" i18n="@@lore.rare.level">Densidad {{ i + 1 }} de 5</span>
                  </p>
                  <h3>{{ r.loreName }}</h3>
                  <p class="rarity__nature">{{ r.nature }}</p>
                </div>
                <p class="rarity__odds">
                  <strong class="display">{{ r.percent }}</strong><small>%</small>
                </p>
              </li>
            }
          </ol>
        </div>

        <!-- ───── La Promesa del Telar: un hilo con dos hitos ───── -->
        <div class="promise">
          <div class="promise__head">
            <h3 class="display promise__title reveal" i18n="@@lore.promise.title">La Promesa del Telar</h3>
            <blockquote class="promise__quote reveal" i18n="@@lore.promise.lead">
              “El Éter no ignora un corazón constante.”
            </blockquote>
          </div>

          <ol class="thread">
            <li class="thread__start">
              <span class="thread__node thread__node--start" aria-hidden="true">
                <app-sticker icon="egg" color="mint-pop" [size]="44" [rotate]="-8" />
              </span>
              <span class="label-caps" i18n="@@lore.promise.start">Primer huevo</span>
            </li>
            <li class="promise__milestone reveal">
              <span class="thread__node" aria-hidden="true"><span class="display">30</span></span>
              <article class="card promise__card">
                <span class="label-caps promise__kicker" i18n="@@lore.promise.30.t">30 eclosiones</span>
                <p i18n="@@lore.promise.30.b">
                  Cada huevo común eclosionado con dedicación deja un hilo invisible ligado a tu Santuario. A los 30, los
                  hilos vibran y el flujo garantiza un linaje de Anomalía Resonante (SR). Si ninguno ha despertado todavía, la
                  promesa sigue en pie.
                </p>
              </article>
            </li>
            <li class="promise__milestone promise__milestone--final reveal">
              <span class="thread__node" aria-hidden="true"><span class="display">120</span></span>
              <article class="card promise__card">
                <span class="label-caps promise__kicker" i18n="@@lore.promise.120.t">120 eclosiones</span>
                <p i18n="@@lore.promise.120.b">
                  El núcleo del Telar responde a tu devoción y abre una brecha garantizada hacia un linaje de Arquetipo
                  Ancestral o de Singularidad Primordial. Tu hilo no se pierde: espera a que ese linaje despierte.
                </p>
              </article>
            </li>
          </ol>
        </div>
      </div>
    </section>
  `,
  styleUrl: './promise.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromiseSection {
  protected readonly rarities = LORE_RARITIES;
  protected readonly pips = [1, 2, 3, 4, 5];
  /** Texto alternativo del espectro: "Eco Cotidiano 60 %, …". */
  protected readonly spectrumLabel = LORE_RARITIES.map((r) => `${r.loreName} ${r.percent} %`).join(', ');
}
