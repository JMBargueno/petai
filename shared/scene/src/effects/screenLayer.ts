/**
 * Efectos de PANTALLA en la escena PixiJS (`space: 'screen'`, p. ej. `velo-eter`): cubren todo el
 * lienzo para tapar un cambio brusco de lo que hay detrás (la app pasa a «solo hábitat», la sala
 * cambia de tamaño…).
 *
 * Contrato con quien lo usa:
 * 1. `cover(id)` lanza el efecto. Cuando llega a su fase `hold` (lienzo tapado) avisa con
 *    `onCovered`. Ahí el anfitrión hace su cambio.
 * 2. `uncover()` suelta el `hold`; al terminar de abrirse avisa con `onUncovered`.
 * Si nadie llama a `uncover`, se abre solo a los `MAX_COVER_MS` para no dejar la escena tapada.
 *
 * La rejilla sigue al viewport: si el lienzo cambia de tamaño (justo lo que se tapa), el canvas se
 * rehace con las celdas nuevas en el siguiente frame. Mientras está activo se traga los toques.
 */
import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { EFFECTS, phasesOf } from './index';
import { CanvasSink, renderFrame } from './render';
import { soundsForEffectPhase } from './sounds';
import { EffectPlayer, quantize } from './timeline';
import type { EffectDef, FxPalette } from './types';

/** Lo que puede quedarse tapada la escena como mucho si el anfitrión no la destapa. */
export const MAX_COVER_MS = 4000;

export interface PixiScreenFxOptions {
  reducedMotion?: boolean;
  palette: () => FxPalette;
  seed: () => number;
  /** Tamaño del lienzo en px de CSS (el `app.screen` de Pixi). */
  viewport: () => { width: number; height: number };
  onCovered?: () => void;
  /** Sonidos candidatos de una fase (spec 40); el anfitrión reproduce el primero que tenga. */
  onSound?: (ids: string[]) => void;
  onUncovered?: () => void;
}

interface Active {
  def: EffectDef;
  player: EffectPlayer;
  canvas: HTMLCanvasElement;
  texture: Texture;
  sprite: Sprite;
  cols: number;
  rows: number;
  lastKey: string;
  covered: boolean;
  coveredAt: number;
  released: boolean;
}

function makeTexture(cols: number, rows: number): { canvas: HTMLCanvasElement; texture: Texture } {
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return { canvas, texture };
}

export class PixiScreenFx {
  private active: Active | null = null;
  private now = 0;

  constructor(
    /** Capa por encima de todo lo demás de la escena. */
    private readonly layer: Container,
    private readonly opts: PixiScreenFxOptions,
  ) {}

  /** ¿Hay un velo en curso (cerrándose, cerrado o abriéndose)? */
  get busy(): boolean {
    return this.active !== null;
  }

  /** ¿Está ahora mismo tapado del todo? */
  get covered(): boolean {
    return !!this.active?.covered && !this.active.released;
  }

  /**
   * Tapa la pantalla con el efecto `id`. Devuelve `false` si no existe o no es de pantalla.
   * Si ya está tapada, vuelve a avisar con `onCovered`; si se estaba abriendo, se reinicia.
   */
  cover(id = 'velo-eter'): boolean {
    const def = EFFECTS[id];
    if (!def || def.space !== 'screen') return false;
    if (this.covered) {
      this.opts.onCovered?.();
      return true;
    }
    if (this.active) this.finish(false);
    const { canvas, texture } = makeTexture(1, 1);
    const sprite = new Sprite(texture);
    sprite.scale.set(def.scale);
    // Se traga los toques mientras dura: nada de arrastrar muebles a ciegas
    sprite.eventMode = 'static';
    const a: Active = {
      def,
      canvas,
      texture,
      sprite,
      cols: 0,
      rows: 0,
      lastKey: '',
      covered: false,
      coveredAt: 0,
      released: false,
      player: null as unknown as EffectPlayer,
    };
    const phases = phasesOf(def, {}, !!this.opts.reducedMotion);
    a.player = new EffectPlayer(phases, (phase) => {
      const ids = soundsForEffectPhase(id, phases, phase);
      if (ids.length) this.opts.onSound?.(ids);
      if (phase === 'hold') {
        a.covered = true;
        a.coveredAt = this.now;
        this.opts.onCovered?.();
      }
      if (phase === 'done') this.finish(true);
    });
    a.player.start(this.now);
    this.active = a;
    this.layer.addChild(sprite);
    this.draw(a);
    return true;
  }

  /** Destapa (suelta el `hold`). Si no hay nada que destapar, avisa ya con `onUncovered`. */
  uncover(): void {
    const a = this.active;
    if (!a) {
      this.opts.onUncovered?.();
      return;
    }
    if (a.released) return;
    a.released = true;
    a.player.release(this.now);
  }

  /** Avanza (llamar desde el ticker con su `deltaMS`). */
  update(deltaMS: number): void {
    this.now += deltaMS;
    const a = this.active;
    if (!a) return;
    if (a.covered && !a.released && this.now - a.coveredAt >= MAX_COVER_MS) this.uncover();
    this.draw(a);
  }

  destroy(): void {
    if (this.active) this.finish(false);
  }

  private draw(a: Active): void {
    const elapsed = quantize(a.player.elapsed(this.now), a.def.fps);
    const state = a.player.tick(this.now - (a.player.elapsed(this.now) - elapsed));
    if (state.done || this.active !== a) return;
    const { width, height } = this.opts.viewport();
    const cols = Math.max(1, Math.ceil(width / a.def.scale));
    const rows = Math.max(1, Math.ceil(height / a.def.scale));
    const resized = cols !== a.cols || rows !== a.rows;
    if (resized) {
      a.cols = cols;
      a.rows = rows;
      // Lienzo y textura nuevos con la rejilla nueva (la anterior se queda corta o sobra)
      const old = a.texture;
      ({ canvas: a.canvas, texture: a.texture } = makeTexture(cols, rows));
      a.sprite.texture = a.texture;
      old.destroy(true);
      a.sprite.hitArea = new Rectangle(0, 0, cols, rows);
    }
    const key = `${state.phase}:${elapsed}`;
    if (!resized && key === a.lastKey) return;
    a.lastKey = key;
    const ctx = a.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cols, rows);
    const frame = renderFrame(
      a.def,
      new CanvasSink(ctx, cols, rows, 1),
      { phase: state.phase, t: state.t, elapsedMs: elapsed },
      this.opts.palette(),
      this.opts.seed(),
      !!this.opts.reducedMotion,
    );
    a.sprite.alpha = a.def.opacity ? a.def.opacity(frame) : 1;
    a.texture.source.update();
  }

  private finish(notify: boolean): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    a.sprite.removeFromParent();
    a.sprite.destroy();
    a.texture.destroy(true);
    if (notify) this.opts.onUncovered?.();
  }
}
