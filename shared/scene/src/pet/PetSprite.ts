/**
 * Pockai en la escena: una hoja horneada troceada en texturas por frame y un reproductor de clips
 * que respeta la duración de cada frame de `anim.json`, bucles, repeticiones y vuelta al clip base.
 */
import { Container, Graphics, Rectangle, Sprite, Texture, type Ticker } from 'pixi.js';
import { resolveClip, type AnimMetadata, type ResolvedClip } from '../bake/anim';

export const FRAME = 128;
/** Pies del Pockai dentro del frame (GUIA_ARTISTICA §7.1/§7.4). */
export const FOOT_Y = 120;

export interface PetSpriteOptions {
  reducedMotion?: boolean;
  onClipEnded?: (clip: string) => void;
}

export class PetSprite extends Container {
  private readonly body = new Sprite();
  private readonly shadow = new Graphics();
  private frames = new Map<string, Texture[]>();
  private anim: AnimMetadata | null = null;
  private source: Texture | null = null;

  private baseClip = 'idle';
  private clip: ResolvedClip | null = null;
  private oneShot = false;
  private frameIdx = 0;
  private elapsed = 0;
  private plays = 0;

  constructor(private readonly opts: PetSpriteOptions = {}) {
    super();
    // Sombra de suelo isométrica (elipse 2:1) bajo los pies; el origen del contenedor son los pies.
    this.shadow.ellipse(0, -6, 24, 12).fill({ color: 0x000000, alpha: 0.2 });
    this.body.anchor.set(0.5, FOOT_Y / FRAME);
    this.addChild(this.shadow, this.body);
  }

  /** Sustituye la hoja (al cambiar de especie, etapa o paleta). Conserva el clip base. */
  setSheet(canvas: HTMLCanvasElement, anim: AnimMetadata): void {
    this.source?.destroy(true);
    this.frames.clear();
    this.anim = anim;
    this.source = Texture.from(canvas);
    this.play(this.baseClip);
  }

  /** Orientación: 1 = abajo-derecha (como se dibuja), -1 = espejo. Solo afecta al cuerpo. */
  setFacing(facing: 1 | -1): void {
    this.body.scale.x = Math.abs(this.body.scale.x) * facing;
  }

  setBaseClip(name: string): void {
    this.baseClip = name;
    if (!this.oneShot) this.play(name);
  }

  /** Reproduce un clip. `once`: al terminar sus repeticiones vuelve al clip base. */
  play(name: string, once = false): void {
    if (!this.anim) return;
    const clip = resolveClip(this.anim, name);
    if (!clip) return;
    this.clip = clip;
    this.oneShot = once;
    this.frameIdx = 0;
    this.elapsed = 0;
    this.plays = 0;
    this.showFrame();
  }

  /** Textura del frame actual (`null` hasta que se carga la hoja). */
  get texture(): Texture | null {
    return this.source ? this.body.texture : null;
  }

  get currentClip(): string | null {
    return this.clip?.name ?? null;
  }

  update(ticker: Ticker): void {
    const clip = this.clip;
    if (!clip || clip.frames.length === 0) return;
    // Movimiento reducido: los bucles de fondo se quedan quietos; las acciones pedidas sí avanzan.
    if (this.opts.reducedMotion && !this.oneShot) return;
    this.elapsed += ticker.deltaMS;
    let dur = clip.frames[this.frameIdx].duration || 150;
    while (this.elapsed >= dur) {
      this.elapsed -= dur;
      this.frameIdx++;
      if (this.frameIdx >= clip.frames.length) {
        this.plays++;
        const done = this.oneShot ? this.plays >= clip.repeat : !clip.loop;
        if (done) {
          const ended = clip.name;
          this.oneShot = false;
          this.opts.onClipEnded?.(ended);
          this.play(this.baseClip);
          return;
        }
        this.frameIdx = 0;
      }
      dur = clip.frames[this.frameIdx].duration || 150;
    }
    this.showFrame();
  }

  private showFrame(): void {
    if (!this.clip || !this.source) return;
    let list = this.frames.get(this.clip.name);
    if (!list) {
      list = this.clip.frames.map(
        ({ frame }) => new Texture({ source: this.source!.source, frame: new Rectangle(frame.x, frame.y, frame.w, frame.h) }),
      );
      this.frames.set(this.clip.name, list);
    }
    this.body.texture = list[this.frameIdx] ?? list[0];
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    for (const list of this.frames.values()) list.forEach((t) => t.destroy(false));
    this.source?.destroy(true);
    super.destroy(options);
  }
}
