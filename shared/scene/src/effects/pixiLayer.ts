/**
 * Efectos dentro de la escena PixiJS (la que se incrusta en Android, iOS e iframes). Cada efecto
 * activo pinta su rejilla nativa en un canvas pequeño con el mismo motor que el escritorio
 * (`renderFrame` + `CanvasSink`), lo sube como textura y lo cuelga del Pockai: el origen del
 * `PetSprite` son sus pies, que es justo el anclaje de los efectos, así que el efecto sigue a la
 * mascota, a su escala y a su posición en la sala sin cuentas extra.
 *
 * Diferencias con el escritorio: aquí no hay flujos de mascota (viaje, altar), así que las fases
 * `hold` se sueltan solas a los `HOLD_MS`. Quien espera algo (el capullo, el re-horneado de la
 * nueva etapa) pasa un `holdMs` mayor y la suelta antes con `release(id)`.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { EFFECTS, phasesOf } from './index';
import { admitMoment } from './momentQueue';
import { soundsForEffectPhase } from './sounds';
import { CanvasSink, renderFrame } from './render';
import { EffectPlayer, quantize } from './timeline';
import type { EffectDef, FxPalette } from './types';

/** Lo que dura una fase de espera en la escena (no hay nada que esperar de la mascota). */
export const HOLD_MS = 600;
const MAX_MINORS = 3;

interface Active {
  def: EffectDef;
  id: string;
  player: EffectPlayer;
  params: Record<string, string | number>;
  canvas: HTMLCanvasElement;
  texture: Texture;
  sprite: Sprite;
  lastKey: string;
  releaseAt: number | null;
  holdMs: number;
  /** La fase `hold` ya terminó (o el efecto no la tiene todavía y ya se pidió soltarla). */
  released: boolean;
  minor: boolean;
}

export interface PixiEffectsOptions {
  reducedMotion?: boolean;
  /** Paleta del Flujo del Pockai actual (cambia con `setPet`). */
  palette: () => FxPalette;
  seed: () => number;
  onEnded?: (id: string) => void;
  /** Sonidos candidatos de una fase (spec 40); el anfitrión reproduce el primero que tenga. */
  onSound?: (ids: string[]) => void;
}

export class PixiEffects {
  private active: Active[] = [];
  /** Reloj propio: avanza con el ticker, así que una escena en pausa congela también sus efectos. */
  private now = 0;

  constructor(
    /** Contenedor del Pockai: los efectos de detrás van al fondo y los de delante, encima. */
    private readonly host: Container,
    private readonly opts: PixiEffectsOptions,
  ) {}

  /**
   * Lanza un efecto. Devuelve `false` si no existe o si la cola de momentos lo descarta.
   * `holdMs`: cuánto puede durar como mucho su fase `hold` (por defecto `HOLD_MS`).
   */
  play(id: string, params: Record<string, string | number> = {}, opts: { holdMs?: number } = {}): boolean {
    const def = EFFECTS[id];
    // Los de pantalla (transiciones) van por `PixiScreenFx`, no colgados del Pockai
    if (!def || def.space === 'screen') return false;
    const minor = def.channel === 'minor';
    if (minor) {
      if (this.active.filter((a) => a.minor).length >= MAX_MINORS) return false;
    } else {
      const moments = this.active.filter((a) => !a.minor);
      const verdict = admitMoment(moments, def);
      if (!verdict.play) {
        this.opts.onEnded?.(id);
        return false;
      }
      for (const i of verdict.replace) this.finish(moments[i]);
    }
    const reduced = !!this.opts.reducedMotion;
    const canvas = document.createElement('canvas');
    canvas.width = def.width;
    canvas.height = def.height;
    const texture = Texture.from(canvas);
    texture.source.scaleMode = 'nearest';
    const sprite = new Sprite(texture);
    // Rejilla nativa a ×scale, como el frame del Pockai (64 px nativos en un frame de 128).
    sprite.scale.set(def.scale);
    sprite.anchor.set((def.anchor.x + 0.5) / def.width, (def.anchor.y + 1) / def.height);
    const entry: Active = {
      def,
      id,
      params,
      canvas,
      texture,
      sprite,
      lastKey: '',
      releaseAt: null,
      holdMs: opts.holdMs ?? HOLD_MS,
      released: false,
      minor,
      player: null as unknown as EffectPlayer,
    };
    const phases = phasesOf(def, params, reduced);
    entry.player = new EffectPlayer(phases, (phase) => {
      const ids = soundsForEffectPhase(id, phases, phase, params);
      if (ids.length) this.opts.onSound?.(ids);
      if (phase === 'hold') entry.releaseAt = entry.released ? this.now : this.now + entry.holdMs;
      if (phase === 'done') this.finish(entry);
    });
    entry.player.start(this.now);
    this.active.push(entry);
    this.attach(entry);
    this.draw(entry);
    return true;
  }

  /** Avanza los efectos (llamar desde el ticker con su `deltaMS`). */
  update(deltaMS: number): void {
    this.now += deltaMS;
    for (const a of [...this.active]) {
      if (a.releaseAt !== null && this.now >= a.releaseAt) {
        a.releaseAt = null;
        a.released = true;
        a.player.release(this.now);
      }
      this.draw(a);
    }
  }

  /**
   * Suelta ya la fase `hold` del efecto `id` en curso (si aún no ha llegado a ella, la soltará
   * en cuanto llegue). Devuelve `false` si ese efecto no está en curso.
   */
  release(id: string): boolean {
    const a = this.active.find((e) => e.id === id && !e.released);
    if (!a) return false;
    a.released = true;
    if (a.releaseAt !== null) a.releaseAt = this.now;
    return true;
  }

  /** Efectos en curso (para tests y depuración). */
  get running(): string[] {
    return this.active.map((a) => a.id);
  }

  destroy(): void {
    for (const a of [...this.active]) this.finish(a, false);
  }

  private attach(a: Active): void {
    if (a.def.layer === 'front') this.host.addChild(a.sprite);
    else this.host.addChildAt(a.sprite, 0);
  }

  private draw(a: Active): void {
    if (!this.active.includes(a)) return;
    // Tiempo cuantizado a la cadencia del efecto: avanza a saltos, como un sprite.
    const elapsed = quantize(a.player.elapsed(this.now), a.def.fps);
    const state = a.player.tick(this.now - (a.player.elapsed(this.now) - elapsed));
    if (state.done) return; // `finish` ya lo retiró desde onPhase('done')
    const key = `${state.phase}:${elapsed}`;
    if (key === a.lastKey) return;
    a.lastKey = key;
    const ctx = a.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, a.canvas.width, a.canvas.height);
    const frame = renderFrame(
      a.def,
      new CanvasSink(ctx, a.def.width, a.def.height, 1),
      { phase: state.phase, t: state.t, elapsedMs: elapsed },
      this.opts.palette(),
      this.opts.seed(),
      !!this.opts.reducedMotion,
      a.params,
    );
    a.sprite.alpha = a.def.opacity ? a.def.opacity(frame) : 1;
    a.texture.source.update();
  }

  private finish(a: Active, notify = true): void {
    const i = this.active.indexOf(a);
    if (i < 0) return;
    this.active.splice(i, 1);
    a.sprite.removeFromParent();
    a.sprite.destroy();
    a.texture.destroy(true);
    if (notify) this.opts.onEnded?.(a.id);
  }
}
