import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Sticker, StickerIcon } from '../../shared/ui/sticker';
import { LIFE_SLEEP, LIFE_STAGES, LIFE_WELCOME } from '../content';

const STAGE_ICONS: StickerIcon[] = ['egg', 'heart', 'leaf', 'shield', 'star'];

/**
 * Vínculo Simbiótico: el camino de crecimiento (cada etapa "pesa" más que la anterior)
 * y el ritmo del vínculo, de noche (Desfragmentación) y en ausencia (Letargo Melancólico).
 */
@Component({
  selector: 'app-life-cycle',
  imports: [Sticker],
  template: `
    <section id="ciclo" class="band band--white">
      <div class="band__inner">
        <div class="section-head">
          <p class="eyebrow" style="--eyebrow-dot: var(--theme-social)" i18n="@@lore.nav.life">Ciclo</p>
          <h2 class="display section-title reveal" i18n="@@lore.life.title">
            Vínculo <span class="hl hl--mint">Simbiótico</span>
          </h2>
          <p class="lead reveal" i18n="@@lore.life.lead">
            Los pockai no son programas fríos: tienen vida propia, pero se alimentan de tu atención y de tu ritmo
            circadiano.
          </p>
        </div>

        <!-- Camino de crecimiento -->
        <ol class="growth">
          @for (s of stages; track s.name; let i = $index) {
            <li class="stage reveal" [style.--i]="i">
              <span class="stage__node" aria-hidden="true">
                <app-sticker [icon]="s.icon" [color]="i === stages.length - 1 ? 'sunburst' : 'mint-pop'" [size]="s.size" />
              </span>
              <span class="label-caps stage__n" aria-hidden="true">{{ i + 1 }}/{{ stages.length }}</span>
              <strong class="stage__name">{{ s.name }}</strong>
              @if (s.level) {
                <span class="tag stage__level">{{ s.level }}</span>
              }
            </li>
          }
        </ol>
        <p class="life__note reveal" i18n="@@lore.life.stages.note">
          Cada etapa es una estabilización de su forma en el Éter: del boceto inestable a la Apoteosis, la manifestación
          perfecta de su linaje.
        </p>

        <!-- El ritmo del vínculo -->
        <div class="rhythm">
          <article class="life__card life__card--sleep reveal">
            <span class="life__sky" aria-hidden="true">
              <i></i><i></i><i></i><i></i><i></i>
            </span>
            <app-sticker [icon]="sleep.icon" color="lavender" [size]="64" [rotate]="-6" />
            <span class="label-caps life__kicker" i18n="@@lore.life.sleep.k">Cuando cae la noche</span>
            <h3>{{ sleep.title }}</h3>
            <p>{{ sleep.body }}</p>
          </article>
          <article class="life__card life__card--welcome reveal">
            <app-sticker [icon]="welcome.icon" [color]="welcome.color" [size]="64" [rotate]="6" />
            <span class="label-caps life__kicker" i18n="@@lore.life.welcome.k">Si te ausentas</span>
            <h3>{{ welcome.title }}</h3>
            <p>{{ welcome.body }}</p>
            <span class="life__thaw" aria-hidden="true">
              <span i18n="@@lore.life.thaw.cold">Frío</span>
              <span class="life__thaw-bar"></span>
              <span i18n="@@lore.life.thaw.warm">Vuelves</span>
            </span>
          </article>
        </div>
      </div>
    </section>
  `,
  styleUrl: './life-cycle.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifeCycle {
  /** "Joven · nv 10" → nombre y nivel por separado; el nodo crece con cada etapa. */
  protected readonly stages = LIFE_STAGES.map((label, i) => {
    const [name, level] = label.split(' · ');
    return { name, level: level ?? null, icon: STAGE_ICONS[i] ?? 'star', size: 44 + i * 10 };
  });
  protected readonly sleep = LIFE_SLEEP;
  protected readonly welcome = LIFE_WELCOME;
}
