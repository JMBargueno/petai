import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PockaiSprite } from '../../shared/ui/pockai-sprite';
import { Sticker } from '../../shared/ui/sticker';
import { DESKTOP_POINTS } from '../content';

/** Maqueta de un escritorio con un pockai paseando por la barra de tareas. Va dentro de la banda de Descarga. */
@Component({
  selector: 'app-desktop-scene',
  imports: [PockaiSprite, Sticker],
  template: `
    <div id="escritorio" class="layout">
        <div>
          <h3 class="display section-title reveal" i18n="@@desk.title">
            Vive en tu <span class="hl hl--blue">escritorio</span>
          </h3>
          <p class="lead reveal" i18n="@@desk.lead">Mientras trabajas, tu pockai anda por ahí a lo suyo.</p>
          <ul class="points">
            @for (point of points; track point) {
              <li class="reveal">
                <app-sticker icon="star" color="sunburst" [size]="32" />
                {{ point }}
              </li>
            }
          </ul>
        </div>

        <!-- Ilustración: no aporta información que no esté en el texto. -->
        <div class="screen reveal" aria-hidden="true">
          <div class="window window--a">
            <span class="bar"><i></i><i></i><i></i></span>
            <span class="line"></span>
            <span class="line line--short"></span>
            <span class="line"></span>
          </div>
          <div class="window window--b">
            <span class="bar"><i></i><i></i><i></i></span>
            <span class="line line--short"></span>
            <span class="line"></span>
            <app-pockai-sprite class="napper" species="florabud" state="sleep" />
          </div>
          <div class="walker"><app-pockai-sprite class="waddle" species="axolunar" /></div>
          <div class="taskbar"><i></i><i></i><i></i><i></i></div>
        </div>
    </div>
  `,
  styles: `
    .layout {
      display: grid;
      gap: 48px;
      margin-block-start: clamp(48px, 7vw, 88px);
      padding: clamp(24px, 4vw, 48px);
      border-radius: var(--radius-cards-elevated);
      background: var(--grad-band), var(--band-lavender);
      align-items: center;
      grid-template-columns: minmax(0, 1fr);
    }
    @media (width >= 960px) {
      .layout {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
      }
    }
    .section-title {
      /* Comparte fila con la ilustración: más pequeño para que «escritorio» quepa en su columna. */
      margin: 0;
      font-size: clamp(32px, 7vw, 64px);
    }
    @media (width >= 960px) {
      .section-title {
        font-size: clamp(32px, 3.6vw, 56px);
      }
    }
    .points {
      display: grid;
      gap: 12px;
      margin: 32px 0 0;
      padding: 0;
      list-style: none;
      font-size: 18px;
    }
    .points li {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .screen {
      position: relative;
      aspect-ratio: 16 / 10;
      overflow: hidden;
      border: var(--outline);
      border-radius: var(--radius-cards-elevated);
      background: var(--grain), var(--grad-hero);
      box-shadow: var(--shadow-4);
      container-type: inline-size;
    }
    .window {
      position: absolute;
      display: grid;
      gap: 8px;
      align-content: start;
      padding: 0 12px 12px;
      border: var(--outline);
      border-radius: var(--radius-2xl);
      background: var(--surface);
      box-shadow: var(--shadow-2);
    }
    .window--a {
      inset: 8% auto auto 6%;
      inline-size: 46%;
      block-size: 52%;
      rotate: -2deg;
    }
    .window--b {
      inset: 22% 6% auto auto;
      inline-size: 40%;
      block-size: 46%;
      background: var(--color-sunburst);
      color-scheme: light;
      color: var(--ink);
    }
    .bar {
      display: flex;
      gap: 4px;
      margin-inline: -12px;
      padding: 8px 12px;
      border-block-end: var(--outline);
    }
    .bar i,
    .taskbar i {
      inline-size: 10px;
      aspect-ratio: 1;
      border: var(--outline);
      border-radius: 50%;
      background: var(--surface);
    }
    .line {
      block-size: 8px;
      border-radius: var(--radius-pills);
      background: var(--surface-2);
    }
    .window--b .line {
      background: var(--surface);
    }
    .line--short {
      inline-size: 60%;
    }
    .napper {
      --sprite-size: 34cqi;
      position: absolute;
      inset: auto 4% -6% auto;
      inline-size: 46%;
    }
    .taskbar {
      position: absolute;
      inset: auto 4% 4% 4%;
      display: flex;
      align-items: center;
      gap: 8px;
      block-size: 9%;
      padding-inline: 12px;
      border-radius: var(--radius-pills);
      background: var(--color-carbon);
    }
    .walker {
      position: absolute;
      inset: auto auto 9% 4%;
      inline-size: 20%;
    }
    .walker app-pockai-sprite {
      inline-size: 100%;
    }

    @keyframes walk {
      to {
        translate: calc(92cqi - 100%) 0;
      }
    }
    @keyframes waddle {
      25% {
        rotate: -7deg;
      }
      75% {
        rotate: 7deg;
      }
    }
    @media (prefers-reduced-motion: no-preference) {
      .walker {
        animation: walk 9s ease-in-out infinite alternate;
      }
      .waddle {
        animation: waddle 0.7s ease-in-out infinite;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesktopScene {
  protected readonly points = DESKTOP_POINTS;
}
