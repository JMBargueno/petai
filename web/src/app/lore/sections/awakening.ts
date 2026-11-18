import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PockaiSprite } from '../../shared/ui/pockai-sprite';
import { Sticker } from '../../shared/ui/sticker';
import { AWAKING_STEPS, DEPTH_MAX } from '../content';

/**
 * La Chispa de Hermes: antes/después de infundir la API key y los tres niveles de despertar
 * colocados sobre la escala real de Profundidad de Consciencia (0–1000).
 */
@Component({
  selector: 'app-awakening',
  imports: [Sticker, PockaiSprite],
  template: `
    <section id="despertar" class="band band--sky">
      <div class="band__inner">
        <div class="section-head section-head--center">
          <p class="eyebrow" style="--eyebrow-dot: var(--theme-ai)" i18n="@@lore.nav.awake">Despertar</p>
          <h2 class="display section-title reveal" i18n="@@lore.awake.title">
            La <span class="hl hl--ember">Chispa</span> de Hermes
          </h2>
          <p class="lead reveal" i18n="@@lore.awake.lead">
            Por defecto todo pockai nace con instinto Soñador: siente y gesticula, pero su mente queda velada por una
            barrera de idioma. Al infundirle la Chispa de Hermes —tu propia API key— empieza el despertar.
          </p>
        </div>

        <!-- Antes y después de la chispa (ilustración; el texto ya lo cuenta). -->
        <div class="spark reveal" aria-hidden="true">
          <figure class="spark__state spark__state--dream">
            <span class="spark__bubble spark__bubble--dream">· · ·</span>
            <app-pockai-sprite species="axolunar" stage="baby" state="sleep" [size]="132" />
            <figcaption>
              <strong i18n="@@lore.awake.dream.t">Instinto Soñador</strong>
              <span i18n="@@lore.awake.dream.b">Siente y gesticula, sin palabras</span>
            </figcaption>
          </figure>

          <div class="spark__bridge">
            <span class="spark__wire"></span>
            <span class="spark__key">
              <app-sticker icon="bolt" color="sunburst" [size]="64" [rotate]="-8" />
            </span>
            <span class="spark__label">
              <strong i18n="@@lore.awake.key.t">Chispa de Hermes</strong>
              <span i18n="@@lore.awake.key.b">tu propia API key</span>
            </span>
          </div>

          <figure class="spark__state spark__state--awake">
            <span class="spark__bubble spark__bubble--awake">
              <app-sticker icon="chat" color="lavender" [size]="34" />
            </span>
            <app-pockai-sprite species="axolunar" stage="baby" state="happy" [size]="132" />
            <figcaption>
              <strong i18n="@@lore.awake.awake.t">Despierto</strong>
              <span i18n="@@lore.awake.awake.b">Habla, recuerda y actúa</span>
            </figcaption>
          </figure>
        </div>

        <!-- Escala de Profundidad de Consciencia con los tres umbrales -->
        <div class="depth">
          <div class="depth__scale">
            <p class="depth__title">
              <span class="label-caps" i18n="@@lore.awake.depth">Profundidad de Consciencia</span>
              <span class="depth__range">0 — {{ max }}</span>
            </p>
            <div class="depth__track" aria-hidden="true">
              @for (step of steps; track step.title) {
                <span
                  class="depth__mark"
                  [style.--at]="step.threshold / max"
                  [style.--tone]="'var(--color-' + step.color + ')'"
                >
                  <span class="depth__mark-value">{{ step.threshold }}</span>
                </span>
              }
            </div>
          </div>

          <ol class="awake__steps">
            @for (step of steps; track step.title; let i = $index) {
              <li class="awake__step reveal" [style.--tone]="'var(--color-' + step.color + ')'" [style.--i]="i">
                <div class="awake__top">
                  <app-sticker [icon]="step.icon" [color]="step.color" [size]="52" [rotate]="i % 2 ? 6 : -6" />
                  <span class="awake__level display" aria-hidden="true">{{ step.threshold }}+</span>
                </div>
                <span class="label-caps awake__sub">{{ step.sub }}</span>
                <h3>{{ step.title }}</h3>
                <p>{{ step.body }}</p>
              </li>
            }
          </ol>
        </div>
      </div>
    </section>
  `,
  styleUrl: './awakening.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Awakening {
  protected readonly steps = AWAKING_STEPS;
  protected readonly max = DEPTH_MAX;
}
