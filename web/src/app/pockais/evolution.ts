import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PockaiSprite } from '../shared/ui/pockai-sprite';
import { STARTER_SPECIES } from '../landing/content';
import { EVO_SPECIES, EVO_STAGES, EVO_STAGE_LABELS, EVO_WHY, EvoStage } from './evolution-content';

/** `evolution_<especie>.json` (scripts/generate-web-evolution-reels.ts). */
interface ReelData {
  frameWidth: number;
  frameHeight: number;
  columns: number;
  fps: number;
  /** Línea de tiempo: índice en la hoja de cada frame. */
  frames: number[];
  stages: { id: EvoStage; start: number }[];
  /** Un frame quieto de cada etapa (movimiento reducido y pausa). */
  portraits: Record<EvoStage, number>;
}
interface Reel {
  data: ReelData;
  sheet: HTMLImageElement;
}

/** Pausa sobre la forma final antes de volver a empezar. */
const END_HOLD_MS = 1600;

/**
 * Cómo crece un pockai: se elige una de las especies iniciales y su bobina pregrabada recorre las cinco
 * etapas con los efectos del escritorio (la Revelación al eclosionar y el Capullo del Telar en cada
 * salto). A la derecha, qué cambia en esa etapa y por qué madura.
 */
@Component({
  selector: 'app-evolution',
  imports: [PockaiSprite],
  template: `
    <section id="evolucion" class="band band--lavender">
      <div class="band__inner">
        <div class="section-head section-head--center">
          <p class="eyebrow" style="--eyebrow-dot: var(--color-voltage-violet)" i18n="@@evo.eyebrow">Evolución</p>
          <h2 class="display section-title section-title--sm reveal" i18n="@@evo.title">
            De huevo a <span class="hl hl--lavender">Forma Final</span>
          </h2>
          <p class="lead reveal" i18n="@@evo.lead">
            Un pockai no nace terminado: su forma en el Éter se estabiliza a medida que lo cuidas. En cada salto, el
            Telar de Mulberry lo envuelve en un capullo de hebras de su elemento y lo vuelve a tejer.
          </p>
        </div>

        <div class="picker" role="group" aria-label="Elige un pockai" i18n-aria-label="@@evo.pick.label">
          @for (s of species; track s.id) {
            <button
              type="button"
              class="picker__opt"
              [class.is-on]="selected() === s.spriteKey"
              [attr.aria-pressed]="selected() === s.spriteKey"
              [style.--opt]="'var(--color-' + s.color + ')'"
              (click)="select(s.spriteKey)"
            >
              <app-pockai-sprite [species]="s.spriteKey" stage="baby" [size]="56" />
              <span>{{ s.name }}</span>
            </button>
          }
        </div>

        <div class="evo">
          <figure class="stage-view">
            <div class="stage-view__ether">
              <canvas
                #canvas
                class="stage-view__canvas"
                width="64"
                height="80"
                role="img"
                [attr.aria-label]="canvasLabel()"
              ></canvas>
              @if (!ready()) {
                <app-pockai-sprite class="stage-view__fallback" [species]="selected()" stage="baby" [size]="160" />
              }
            </div>
            <figcaption class="stage-view__bar">
              <button type="button" class="btn btn--sm" (click)="toggle()" [disabled]="!ready()">
                @if (playing()) {
                  <span i18n="@@evo.pause">Pausar</span>
                } @else {
                  <span i18n="@@evo.play">Reproducir</span>
                }
              </button>
              <span class="label-caps stage-view__count">{{ stageIndex() + 1 }}/{{ stages.length }}</span>
            </figcaption>
          </figure>

          <div class="caption">
            <ol class="steps" aria-label="Etapas" i18n-aria-label="@@evo.steps.label">
              @for (st of stages; track st; let i = $index) {
                <li>
                  <button
                    type="button"
                    class="steps__btn"
                    [class.is-done]="i < stageIndex()"
                    [attr.aria-current]="i === stageIndex() ? 'step' : null"
                    (click)="goTo(st)"
                  >
                    <span class="steps__dot" aria-hidden="true"></span>
                    <span class="steps__name">{{ labels[i].name }}</span>
                  </button>
                </li>
              }
            </ol>

            <div class="caption__body">
              <p class="caption__head">
                <strong class="caption__title">{{ labels[stageIndex()].name }}</strong>
                @if (labels[stageIndex()].level; as level) {
                  <span class="tag">{{ level }}</span>
                }
              </p>
              @if (speciesLine(); as line) {
                <p class="caption__species">{{ line }}</p>
              }
              <p class="caption__why">{{ why() }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: `
    p {
      margin: 0;
    }
    .picker {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
      margin-block-end: 32px;
    }
    .picker__opt {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-block-size: var(--hit-min);
      padding: 4px 18px 4px 6px;
      border: 2px solid var(--line);
      border-radius: var(--radius-pills);
      background: var(--surface);
      color: var(--ink);
      font: inherit;
      font-weight: var(--font-weight-bold);
      cursor: pointer;
      transition:
        border-color var(--dur-2) var(--ease-out),
        background var(--dur-2) var(--ease-out);
    }
    .picker__opt app-pockai-sprite {
      border-radius: 50%;
      background: var(--opt);
    }
    .picker__opt:hover {
      border-color: var(--ink-muted);
    }
    .picker__opt.is-on {
      border-color: var(--ink);
      background: color-mix(in srgb, var(--opt) 35%, var(--surface));
    }
    .picker__opt:focus-visible {
      outline: var(--focus-ring);
      outline-offset: 2px;
    }

    .evo {
      display: grid;
      gap: 24px;
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
    }
    @media (min-width: 840px) {
      .evo {
        grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
        gap: 40px;
      }
    }

    .stage-view {
      display: grid;
      gap: 12px;
      inline-size: 100%;
      max-inline-size: 360px;
      margin: 0;
      justify-self: center;
    }
    @media (min-width: 840px) {
      .stage-view {
        max-inline-size: none;
      }
    }
    .stage-view__ether {
      position: relative;
      display: grid;
      place-items: center;
      aspect-ratio: 1;
      border-radius: var(--radius-cards-elevated);
      background:
        radial-gradient(circle at 50% 78%, rgb(255 255 255 / 0.95) 0%, rgb(255 255 255 / 0.55) 45%, transparent 70%),
        var(--color-lavender);
      box-shadow: var(--shadow-2);
      overflow: hidden;
    }
    .stage-view__canvas {
      /* 64×80 nativos a escala entera: el pixel art sin suavizado. */
      inline-size: auto;
      block-size: 90%;
      aspect-ratio: 4 / 5;
      image-rendering: pixelated;
    }
    .stage-view__fallback {
      position: absolute;
    }
    .stage-view__bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .stage-view__count {
      color: var(--ink-muted);
    }

    .caption {
      display: grid;
      gap: 24px;
    }
    .steps {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .steps__btn {
      position: relative;
      display: grid;
      justify-items: center;
      gap: 6px;
      inline-size: 100%;
      min-block-size: var(--hit-min);
      padding: 4px 2px;
      border: 0;
      background: none;
      color: var(--ink-muted);
      font: inherit;
      font-size: var(--text-caption);
      cursor: pointer;
    }
    /* La línea entre etapas: se rellena hasta la actual. */
    .steps li:not(:first-child) .steps__btn::before {
      content: '';
      position: absolute;
      inset-block-start: 11px;
      inset-inline: -50% 50%;
      block-size: 2px;
      margin-inline: 12px;
      background: var(--line);
    }
    .steps li:not(:first-child) .steps__btn:is(.is-done, [aria-current])::before {
      background: var(--color-voltage-violet);
    }
    .steps__dot {
      position: relative;
      inline-size: 16px;
      block-size: 16px;
      margin-block-start: 3px;
      border: 2px solid var(--line);
      border-radius: 50%;
      background: var(--surface);
      transition:
        background var(--dur-2) var(--ease-out),
        transform var(--dur-2) var(--ease-out);
    }
    .steps__btn.is-done .steps__dot {
      border-color: var(--color-voltage-violet);
      background: var(--color-voltage-violet);
    }
    .steps__btn[aria-current] {
      color: var(--ink);
      font-weight: var(--font-weight-bold);
    }
    .steps__btn[aria-current] .steps__dot {
      border-color: var(--color-voltage-violet);
      background: var(--color-sunburst);
      transform: scale(1.3);
    }
    .steps__btn:focus-visible {
      outline: var(--focus-ring);
      outline-offset: 2px;
      border-radius: var(--radius-sm);
    }
    .steps__name {
      overflow-wrap: anywhere;
      text-align: center;
    }

    .caption__body {
      display: grid;
      gap: 12px;
      padding: var(--card-padding, 24px);
      border-radius: var(--radius-cards-elevated);
      background: var(--surface);
      box-shadow: var(--shadow-1);
    }
    .caption__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .caption__title {
      font-size: var(--text-subheading);
    }
    .caption__species {
      font-size: var(--text-body-lg);
      font-weight: var(--font-weight-medium);
    }
    .caption__why {
      color: var(--ink-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Evolution {
  protected readonly species = STARTER_SPECIES;
  protected readonly stages = EVO_STAGES;
  protected readonly labels = EVO_STAGE_LABELS;

  protected readonly selected = signal(STARTER_SPECIES[0]?.spriteKey ?? '');
  protected readonly stage = signal<EvoStage>('egg');
  protected readonly playing = signal(false);
  protected readonly ready = signal(false);

  protected readonly stageIndex = computed(() => EVO_STAGES.indexOf(this.stage()));
  protected readonly why = computed(() => EVO_WHY[this.stage()]);
  protected readonly speciesLine = computed(() => EVO_SPECIES[this.selected()]?.[this.stage()] ?? null);
  private readonly name = computed(() => this.species.find((s) => s.spriteKey === this.selected())?.name ?? '');
  protected readonly canvasLabel = computed(() => {
    const name = this.name();
    const stage = this.labels[this.stageIndex()].name;
    return $localize`:@@evo.canvas.label:${name}:name: en la etapa ${stage}:stage:`;
  });

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly reels = new Map<string, Promise<Reel>>();
  private reel: Reel | null = null;
  private cursor = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private visible = false;
  private reduced = false;

  constructor() {
    if (!this.browser) return;
    const destroy = inject(DestroyRef);

    afterNextRender(() => {
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.playing.set(!this.reduced);
      const io = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        this.schedule();
      });
      io.observe(this.host.nativeElement);
      const onVisibility = () => this.schedule();
      document.addEventListener('visibilitychange', onVisibility);
      destroy.onDestroy(() => {
        io.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        cancelAnimationFrame(this.raf);
      });
    });

    // Cambio de especie: carga su bobina y empieza desde el huevo.
    effect(() => {
      const key = this.selected();
      this.ready.set(false);
      this.reel = null;
      this.load(key).then(
        (reel) => {
          if (this.selected() !== key) return;
          this.reel = reel;
          this.cursor = 0;
          this.acc = 0;
          this.stage.set('egg');
          this.ready.set(true);
          this.paint();
          this.schedule();
        },
        () => this.ready.set(false), // sin bobina se queda el bebé estático
      );
    });
  }

  protected select(key: string): void {
    this.selected.set(key);
  }

  protected toggle(): void {
    this.playing.update((p) => !p);
    if (!this.playing()) this.paint();
    this.schedule();
  }

  /** Salta a una etapa: en marcha, desde su inicio; en pausa, su retrato quieto. */
  protected goTo(stage: EvoStage): void {
    this.stage.set(stage);
    const start = this.reel?.data.stages.find((s) => s.id === stage)?.start;
    if (start !== undefined) {
      this.cursor = start;
      this.acc = 0;
    }
    this.paint();
  }

  private load(key: string): Promise<Reel> {
    let reel = this.reels.get(key);
    if (!reel) {
      reel = Promise.all([
        fetch(`sprites/evolution_${key}.json`).then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<ReelData>;
        }),
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = `sprites/evolution_${key}.png`;
        }),
      ]).then(([data, sheet]) => ({ data, sheet }));
      reel.catch(() => this.reels.delete(key));
      this.reels.set(key, reel);
    }
    return reel;
  }

  /** Arranca o para el bucle según si se ve, si está en marcha y si la pestaña está visible. */
  private schedule(): void {
    cancelAnimationFrame(this.raf);
    if (!this.reel || !this.playing() || !this.visible || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((now) => this.tick(now));
  }

  private tick(now: number): void {
    const reel = this.reel;
    if (!reel) return;
    const { frames, fps } = reel.data;
    this.acc += now - this.last;
    this.last = now;
    const step = 1000 / fps;
    let moved = false;
    while (this.acc >= step) {
      const atEnd = this.cursor >= frames.length - 1;
      if (atEnd && this.acc < END_HOLD_MS) break;
      this.acc -= atEnd ? END_HOLD_MS : step;
      this.cursor = atEnd ? 0 : this.cursor + 1;
      moved = true;
    }
    if (moved) {
      this.syncStage();
      this.paint();
    }
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  private syncStage(): void {
    const stages = this.reel?.data.stages ?? [];
    let current: EvoStage = 'egg';
    for (const s of stages) if (this.cursor >= s.start) current = s.id;
    if (current !== this.stage()) this.stage.set(current);
  }

  private paint(): void {
    const reel = this.reel;
    const ctx = this.canvas().nativeElement.getContext('2d');
    if (!reel || !ctx) return;
    const { frameWidth: w, frameHeight: h, columns, frames, portraits } = reel.data;
    const k = this.playing() ? frames[this.cursor] : portraits[this.stage()];
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(reel.sheet, (k % columns) * w, Math.floor(k / columns) * h, w, h, 0, 0, w, h);
  }
}
