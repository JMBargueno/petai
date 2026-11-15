import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Ribbon } from '../../shared/ui/ribbon';
import { Sticker } from '../../shared/ui/sticker';
import {
  ARENA_LEAGUES,
  COMBAT_STRATEGIES,
  ELEMENT_RELATIONS,
  ElementRelation,
  SKILLS_CATALOG,
  SkillItem,
} from '../content';

type SkillFilter = 'all' | 'attack' | 'guard' | 'heal';

@Component({
  selector: 'app-arena-showcase',
  imports: [Ribbon, Sticker],
  template: `
    <section id="arena-a-fondo" class="band band--sky">
      <app-ribbon shape="wave" />
      <div class="band__inner">
        <h2 class="display section-title reveal" i18n="@@arena.title">
          Arena <span class="hl hl--blue">a fondo</span>
        </h2>
        <p class="lead reveal" i18n="@@arena.lead">
          Combates asíncronos justos y estratégicos. Elige elemento, aprende habilidades y escala la liga.
        </p>

        <!-- 1. Rueda Elemental interactiva -->
        <div class="card element-wheel reveal reveal--pop">
          <div class="element-wheel__header">
            <app-sticker icon="shield" color="electric-blue" [size]="64" />
            <div>
              <h3 i18n="@@arena.wheel.title">Ventajas elementales</h3>
              <p i18n="@@arena.wheel.desc">
                Atacar con ventaja elemental multiplica el daño por 1,5; con desventaja, se reduce a 0,67.
              </p>
            </div>
          </div>

          <div class="element-selector" role="tablist" aria-label="Elementos" i18n-aria-label="@@arena.wheel.tablist">
            @for (el of elements; track el.id) {
              <button
                type="button"
                role="tab"
                class="btn btn--sm"
                [class.btn--filled]="selectedElement().id === el.id"
                [attr.aria-selected]="selectedElement().id === el.id"
                (click)="selectElement(el)"
              >
                {{ el.name }}
              </button>
            }
          </div>

          <div class="element-detail" [style.background]="'var(--color-' + selectedElement().color + ')'">
            <div class="element-detail__info">
              <span class="label-caps" i18n="@@arena.element.selected">Elemento seleccionado</span>
              <h4>{{ selectedElement().name }}</h4>
              <p>{{ selectedElement().multiplierText }}</p>
            </div>

            <div class="element-detail__matrix">
              @if (selectedElement().advantage) {
                <div class="badge-item">
                  <span class="label-caps" i18n="@@arena.strong.against">Fuerte contra</span>
                  <span class="tag tag--strong">{{ selectedElement().advantage }} (x1,5)</span>
                </div>
              }
              @if (selectedElement().disadvantage) {
                <div class="badge-item">
                  <span class="label-caps" i18n="@@arena.weak.against">Débil contra</span>
                  <span class="tag tag--weak">{{ selectedElement().disadvantage }} (x0,67)</span>
                </div>
              }
              @if (!selectedElement().advantage && !selectedElement().disadvantage) {
                <div class="badge-item">
                  <span class="label-caps" i18n="@@arena.neutral.balance">Balance puro</span>
                  <span class="tag" i18n="@@arena.neutral.note">Sin multiplicadores elementales</span>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- 2. Estrategias -->
        <h3 class="label-caps block-title reveal" i18n="@@arena.strategies.title">Elige tu estrategia</h3>
        <div class="strategies-grid">
          @for (s of strategies; track s.id; let i = $index) {
            <div class="card strategy-card reveal reveal--tilt hover-lift" [style.--i]="i">
              <app-sticker [icon]="s.icon" [color]="s.color" [size]="56" />
              <h4>{{ s.title }}</h4>
              <p>{{ s.desc }}</p>
            </div>
          }
        </div>

        <!-- 3. Catálogo de Habilidades -->
        <div class="skills-section reveal">
          <div class="skills-section__top">
            <div>
              <h3 class="label-caps block-title" i18n="@@arena.skills.title">Catálogo de Habilidades</h3>
              <p i18n="@@arena.skills.subtitle">14 habilidades reales del juego con desbloqueo progresivo.</p>
            </div>

            <div class="skills-filter" role="group" aria-label="Filtrar habilidades" i18n-aria-label="@@arena.skills.filter.label">
              <button
                type="button"
                class="btn btn--sm"
                [class.btn--filled]="currentFilter() === 'all'"
                (click)="setFilter('all')"
                i18n="@@arena.skills.filter.all"
              >
                Todas
              </button>
              <button
                type="button"
                class="btn btn--sm"
                [class.btn--filled]="currentFilter() === 'attack'"
                (click)="setFilter('attack')"
                i18n="@@arena.skills.filter.attack"
              >
                Ataque
              </button>
              <button
                type="button"
                class="btn btn--sm"
                [class.btn--filled]="currentFilter() === 'guard'"
                (click)="setFilter('guard')"
                i18n="@@arena.skills.filter.guard"
              >
                Guardia
              </button>
              <button
                type="button"
                class="btn btn--sm"
                [class.btn--filled]="currentFilter() === 'heal'"
                (click)="setFilter('heal')"
                i18n="@@arena.skills.filter.heal"
              >
                Curación
              </button>
            </div>
          </div>

          <div class="skills-grid">
            @for (skill of filteredSkills(); track skill.id) {
              <div class="card skill-card hover-lift">
                <div class="skill-card__head">
                  <span class="tag" [style.background]="'var(--color-' + skill.color + ')'">{{ skill.elementName }}</span>
                  <span class="tag tag--kind">{{ skill.kindName }}</span>
                  <span class="skill-level"><span i18n="@@arena.skill.lv">Nv.</span> {{ skill.unlockLevel }}</span>
                </div>
                <h4>{{ skill.name }}</h4>
                <p class="skill-desc">{{ skill.description }}</p>
                <div class="skill-stats">
                  @if (skill.power > 0) {
                    <span><strong i18n="@@arena.skill.power">Potencia:</strong> {{ skill.power }}</span>
                  }
                  <span><strong i18n="@@arena.skill.acc">Precisión:</strong> {{ skill.accuracy }}%</span>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- 4. Escalera de Ligas y Juego Limpio -->
        <div class="leagues-card card reveal">
          <div class="leagues-card__header">
            <div>
              <h3 i18n="@@arena.leagues.title">Escalera de Ligas</h3>
              <p i18n="@@arena.leagues.lead">Puntuación Elo oficial de la Arena:</p>
            </div>
            <div class="fairplay-pill">
              <span class="label-caps" i18n="@@arena.fairplay.tag">Juego Limpio</span>
              <span i18n="@@arena.fairplay.text">Simulación determinista en servidor</span>
            </div>
          </div>

          <ol class="leagues-list">
            @for (league of leagues; track league.id) {
              <li class="league-item">
                <span class="tag league-badge">{{ league.name }}</span>
                <span class="league-elo">{{ league.minElo }} <small>Elo</small></span>
              </li>
            }
          </ol>
        </div>
      </div>
    </section>
  `,
  styles: `
    .element-wheel {
      margin-block-end: 48px;
      display: grid;
      gap: 24px;
      padding: 32px;
      border-radius: var(--radius-cards-elevated);
    }
    .element-wheel__header {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .element-wheel__header h3 {
      margin: 0;
      font-family: var(--font-lateral);
      font-size: clamp(24px, 3.5vw, 40px);
      line-height: 0.9;
      text-transform: uppercase;
    }
    .element-wheel__header p {
      margin: 8px 0 0;
    }
    .element-selector {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .element-detail {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
      padding: 24px;
      border: var(--outline);
      border-radius: var(--radius-cards);
      color: var(--ink);
    }
    .element-detail h4 {
      margin: 4px 0 8px;
      font-family: var(--font-lateral);
      font-size: 32px;
      line-height: 0.9;
      text-transform: uppercase;
    }
    .element-detail p {
      margin: 0;
      font-weight: var(--font-weight-bold);
    }
    .element-detail__matrix {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .badge-item {
      display: grid;
      gap: 4px;
    }
    .tag--strong {
      background: var(--color-mint-pop);
      color-scheme: light;
      color: var(--ink);
    }
    .tag--weak {
      background: var(--color-ember);
      color-scheme: light;
      color: var(--ink);
      color: var(--color-paper-white);
    }

    .block-title {
      margin-block: 40px 16px;
      display: block;
      color: var(--ink);
      font-size: 14px;
      letter-spacing: 0.05em;
    }

    .strategies-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
      gap: 20px;
      margin-block-end: 48px;
    }
    .strategy-card {
      display: grid;
      gap: 12px;
      align-content: start;
      justify-items: start;
      padding: 28px 24px;
      border-radius: var(--radius-cards-elevated);
      rotate: calc((var(--i) - 1) * 2deg);
    }
    .strategy-card h4 {
      margin: 0;
      font-family: var(--font-lateral);
      font-size: 28px;
      line-height: 0.9;
      text-transform: uppercase;
    }
    .strategy-card p {
      margin: 0;
    }

    .skills-section {
      margin-block-end: 48px;
    }
    .skills-section__top {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      margin-block-end: 24px;
    }
    .skills-section__top p {
      margin: 4px 0 0;
    }
    .skills-filter {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .skills-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
      gap: 16px;
    }
    .skill-card {
      display: grid;
      gap: 10px;
      padding: 20px;
      border-radius: var(--radius-cards);
    }
    .skill-card__head {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .tag--kind {
      background: var(--surface-2);
    }
    .skill-level {
      margin-inline-start: auto;
      font-size: 12px;
      font-weight: var(--font-weight-bold);
      color: var(--ink-muted);
    }
    .skill-card h4 {
      margin: 0;
      font-family: var(--font-lateral);
      font-size: 22px;
      line-height: 1;
      text-transform: uppercase;
    }
    .skill-desc {
      margin: 0;
      font-size: 14px;
    }
    .skill-stats {
      display: flex;
      gap: 16px;
      font-size: 13px;
      padding-block-start: 6px;
      border-block-start: 1px dashed var(--color-concrete-gray);
    }

    .leagues-card {
      padding: 32px;
      border-radius: var(--radius-cards-elevated);
      background: var(--surface);
    }
    .leagues-card__header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-block-end: 24px;
    }
    .leagues-card__header h3 {
      margin: 0;
      font-family: var(--font-lateral);
      font-size: 32px;
      line-height: 0.9;
      text-transform: uppercase;
    }
    .leagues-card__header p {
      margin: 4px 0 0;
    }
    .fairplay-pill {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      padding: 8px 16px;
      border: var(--outline);
      border-radius: var(--radius-cards);
      background: var(--color-lavender);
      color-scheme: light;
      color: var(--ink);
      font-size: 13px;
    }
    .leagues-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .league-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 16px 12px;
      border: var(--outline);
      border-radius: var(--radius-cards);
      background: var(--surface-2);
      text-align: center;
    }
    .league-badge {
      font-size: 11px;
    }
    .league-elo {
      font-weight: var(--font-weight-bold);
      font-size: 18px;
    }
    .league-elo small {
      font-size: 12px;
      font-weight: normal;
    }

    @media (width < 640px) {
      .element-wheel, .leagues-card {
        padding: 20px;
      }
      .strategy-card {
        rotate: 0deg;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArenaShowcase {
  protected readonly elements = ELEMENT_RELATIONS;
  protected readonly strategies = COMBAT_STRATEGIES;
  protected readonly skills = SKILLS_CATALOG;
  protected readonly leagues = ARENA_LEAGUES;

  protected readonly selectedElement = signal<ElementRelation>(ELEMENT_RELATIONS[0]);
  protected readonly currentFilter = signal<SkillFilter>('all');

  protected readonly filteredSkills = computed<SkillItem[]>(() => {
    const filter = this.currentFilter();
    if (filter === 'all') return this.skills;
    return this.skills.filter((s) => s.kind === filter);
  });

  protected selectElement(el: ElementRelation) {
    this.selectedElement.set(el);
  }

  protected setFilter(filter: SkillFilter) {
    this.currentFilter.set(filter);
  }
}
