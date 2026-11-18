/**
 * Pockai en la escena: una hoja horneada troceada en texturas por frame y un reproductor de clips
 * que respeta la duración de cada frame de `anim.json`, bucles, repeticiones y vuelta al clip base.
 * Encima y debajo del cuerpo pinta las prendas equipadas, cada una en el ancla de su ranura.
 */
import { Container, Graphics, Rectangle, Sprite, Texture, type Ticker } from 'pixi.js';
import { resolveClip, type AnimMetadata, type ResolvedClip } from '../bake/anim';
import {
  BEHIND_SLOTS,
  FRONT_SLOTS,
  placeAccessory,
  type AccessoryMeta,
  type AccessorySlot,
  type AnchorsFile,
} from '../bake/accessories';
import { FX_STEP_MS, renderFx, type PatternFx } from '../bake/patternFx';

export const FRAME = 128;
/** Pies del Pockai dentro del frame (GUIA_ARTISTICA §7.1/§7.4). */
export const FOOT_Y = 120;

export interface PetSpriteOptions {
  reducedMotion?: boolean;
  onClipEnded?: (clip: string) => void;
}

/** Prenda lista para pintar: su hoja y sus medidas. */
export interface AccessoryLayer {
  slot: AccessorySlot;
  canvas: HTMLCanvasElement | HTMLImageElement;
  meta: AccessoryMeta;
}

interface Worn {
  layer: AccessoryLayer;
  sprite: Sprite;
  source: Texture;
  frames: Texture[];
}

export class PetSprite extends Container {
  private readonly body = new Sprite();
  private readonly shadow = new Graphics();
  /** Cuerpo y prendas: se voltean juntos al cambiar de orientación. */
  private readonly rig = new Container();
  private readonly behind = new Container();
  private readonly front = new Container();
  private frames = new Map<string, Texture[]>();
  private anim: AnimMetadata | null = null;
  private source: Texture | null = null;
  private anchors: AnchorsFile | null = null;
  private worn: Worn[] = [];
  private accessoryTime = 0;

  /** Capa de efectos (patrón del Éter y shiny), encima del cuerpo y debajo de las prendas de delante. */
  private readonly fxSprite = new Sprite();
  private readonly fxCanvas = document.createElement('canvas');
  private fxTexture: Texture | null = null;
  private fx: { map: Uint8ClampedArray; width: number; fx: PatternFx | null; shiny: boolean } | null = null;
  private fxTime = 0;
  private fxDrawn = '';
  private fxBuf: Uint8ClampedArray | undefined;

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
    this.fxSprite.anchor.set(0.5, FOOT_Y / FRAME);
    this.fxSprite.visible = false;
    this.rig.addChild(this.behind, this.body, this.fxSprite, this.front);
    this.addChild(this.shadow, this.rig);
  }

  /** Sustituye la hoja (al cambiar de especie, etapa o paleta). Conserva el clip base. */
  setSheet(canvas: HTMLCanvasElement, anim: AnimMetadata): void {
    this.source?.destroy(true);
    this.frames.clear();
    this.anim = anim;
    this.source = Texture.from(canvas);
    // Pixel art (GUIA_ARTISTICA §7.5): vecino más próximo, sin suavizado al escalar.
    this.source.source.scaleMode = 'nearest';
    this.play(this.baseClip);
  }

  /**
   * Efectos animados de la hoja actual: `map` es su mapa de efectos (`bakeFxMap`). Sin efecto de
   * patrón ni shiny, o con movimiento reducido, la capa no se pinta.
   */
  setFx(map: Uint8ClampedArray | null, width: number, fx: PatternFx | null, shiny: boolean): void {
    this.fx = map && (fx || shiny) && !this.opts.reducedMotion ? { map, width, fx, shiny } : null;
    this.fxSprite.visible = false;
    this.fxDrawn = '';
    this.drawFx();
  }

  private drawFx(): void {
    const rect = this.clip?.frames[this.frameIdx]?.frame;
    if (!this.fx || !rect) return;
    const key = `${rect.x}:${rect.y}:${Math.floor(this.fxTime / FX_STEP_MS)}`;
    if (key === this.fxDrawn) return;
    this.fxDrawn = key;
    if (this.fxCanvas.width !== rect.w || this.fxCanvas.height !== rect.h) {
      this.fxCanvas.width = rect.w;
      this.fxCanvas.height = rect.h;
    }
    this.fxBuf = renderFx(this.fx.map, this.fx.width, rect, { fx: this.fx.fx, shiny: this.fx.shiny, time: this.fxTime }, this.fxBuf);
    this.fxCanvas.getContext('2d')!.putImageData(new ImageData(this.fxBuf as Uint8ClampedArray<ArrayBuffer>, rect.w, rect.h), 0, 0);
    if (!this.fxTexture) {
      this.fxTexture = Texture.from(this.fxCanvas);
      this.fxTexture.source.scaleMode = 'nearest';
      this.fxSprite.texture = this.fxTexture;
    } else {
      this.fxTexture.source.update();
    }
    this.fxSprite.visible = true;
  }

  /**
   * Prendas equipadas y anclas de la hoja actual. Sin anclas (huevo, especie con placeholder) no se
   * pinta ninguna prenda.
   */
  setAccessories(layers: AccessoryLayer[], anchors: AnchorsFile | null): void {
    for (const w of this.worn) {
      w.sprite.destroy();
      w.frames.forEach((t) => t.destroy(false));
      w.source.destroy(true);
    }
    this.worn = [];
    this.anchors = anchors;
    if (!anchors) return;
    const size = anchors.size.toLowerCase() as 's' | 'm' | 'l';
    for (const layer of layers) {
      const dims = layer.meta.sizes[size];
      if (!dims) continue;
      const source = Texture.from(layer.canvas);
      source.source.scaleMode = 'nearest';
      const k = layer.meta.scale;
      const frames = Array.from(
        { length: layer.meta.frames },
        (_, f) => new Texture({ source: source.source, frame: new Rectangle(f * dims.w * k, 0, dims.w * k, dims.h * k) }),
      );
      const sprite = new Sprite(frames[0]);
      (BEHIND_SLOTS.includes(layer.slot) ? this.behind : this.front).addChild(sprite);
      this.worn.push({ layer, sprite, source, frames });
    }
    // Delante, de dentro afuera: cuello, cara y cabeza.
    this.front.children.sort(
      (a, b) => FRONT_SLOTS.indexOf(this.slotOf(a as Sprite)) - FRONT_SLOTS.indexOf(this.slotOf(b as Sprite)),
    );
    this.placeAccessories();
  }

  private slotOf(sprite: Sprite): AccessorySlot {
    return this.worn.find((w) => w.sprite === sprite)!.layer.slot;
  }

  /** Orientación: 1 = abajo-derecha (como se dibuja), -1 = espejo. Voltea cuerpo y prendas. */
  setFacing(facing: 1 | -1): void {
    this.rig.scale.x = facing;
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
    if (this.fx) {
      this.fxTime += ticker.deltaMS;
      this.drawFx();
    }
    // Movimiento reducido: los bucles de fondo se quedan quietos; las acciones pedidas sí avanzan.
    if (this.opts.reducedMotion && !this.oneShot) return;
    if (!this.opts.reducedMotion) this.accessoryTime += ticker.deltaMS;
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
    this.drawFx();
    this.placeAccessories();
  }

  /** Coloca cada prenda en el ancla de su ranura para el frame actual, a píxel entero. */
  private placeAccessories(): void {
    if (!this.anchors || this.worn.length === 0) return;
    const clip = this.clip?.name ?? 'idle';
    for (const w of this.worn) {
      const p = placeAccessory(this.anchors, w.layer.meta, clip, this.frameIdx, this.accessoryTime);
      const k = w.layer.meta.scale;
      // El origen del rig son los pies: el frame empieza en (-FRAME/2, -FOOT_Y).
      w.sprite.position.set(p.x * k - FRAME / 2, p.y * k - FOOT_Y);
      w.sprite.texture = w.frames[p.frame] ?? w.frames[0];
    }
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    for (const list of this.frames.values()) list.forEach((t) => t.destroy(false));
    for (const w of this.worn) {
      w.frames.forEach((t) => t.destroy(false));
      w.source.destroy(true);
    }
    this.source?.destroy(true);
    this.fxTexture?.destroy(true);
    super.destroy(options);
  }
}
