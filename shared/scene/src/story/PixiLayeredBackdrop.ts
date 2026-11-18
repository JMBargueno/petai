/**
 * Pintor Pixi de los fondos por capas (`backdrop/model.ts`): lo usa la escena de la aventura.
 * `back` (bg, l1, l2, luz de la hora y partículas) va detrás del Pockai y `front` (l3) por delante.
 */
import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { SkyState } from '../ambience/sunClock';
import { layerUrl } from '../backdrop/layerUrls';
import { FLOW_GLOW, SLOTS, layerMargin, layerOffset, lifeParticles, particleAt, silhouette, type Composition, type LayerDef, type Particle, type Prim } from '../backdrop/model';

/** Traza primitivas normalizadas en un `Graphics`, dentro de un rectángulo de w×h con origen en 0,0. */
export function drawPrims(g: Graphics, prims: Prim[], w: number, h: number): void {
  for (const p of prims) {
    const alpha = p.alpha ?? 1;
    if (p.k === 'rect') g.rect(p.x * w, p.y * h, p.w * w, p.h * h).fill({ color: p.fill, alpha });
    else if (p.k === 'circle') g.circle(p.x * w, p.y * h, p.r * h).fill({ color: p.fill, alpha });
    else {
      const pts = p.pts.map((v, i) => (i % 2 === 0 ? v * w : v * h));
      if (p.k === 'poly') g.poly(pts).fill({ color: p.fill, alpha });
      else {
        g.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
        g.stroke({ color: p.stroke, width: Math.max(1, p.width * h), alpha, cap: 'round', join: 'round' });
      }
    }
  }
}

interface LayerNode {
  layer: LayerDef;
  box: Container;
  shape: Graphics;
  sprite: Sprite;
  texture: Texture | null;
  /** Origen de la capa sin desplazar (el lienzo más su margen). */
  x: number;
  y: number;
}

const textures = new Map<string, Promise<Texture | null>>();
function loadLayer(layerId: string): Promise<Texture | null> {
  const url = layerUrl(layerId);
  if (!url) return Promise.resolve(null);
  let p = textures.get(url);
  if (!p) {
    p = Assets.load<Texture>(url).catch(() => null);
    textures.set(url, p);
  }
  return p;
}

export class PixiLayeredBackdrop {
  readonly back = new Container();
  readonly front = new Container();
  private nodes: LayerNode[] = [];
  private readonly veil = new Graphics();
  private readonly life = new Graphics();
  private comp: Composition | null = null;
  private particles: Particle[] = [];
  private sky: SkyState | null = null;
  private w = 0;
  private h = 0;
  private seq = 0;

  constructor(private readonly reducedMotion: boolean) {
    this.back.eventMode = 'none';
    this.front.eventMode = 'none';
  }

  /** Cambia de escenario. Las capas pintadas llegan cuando cargan; entretanto se ve la silueta. */
  set(comp: Composition): void {
    if (this.comp?.id === comp.id) return;
    this.comp = comp;
    const seq = ++this.seq;
    for (const n of this.nodes) n.box.destroy({ children: true });
    this.back.removeChildren();
    this.front.removeChildren();
    this.nodes = SLOTS.map((slot) => {
      const layer = comp.layers[slot];
      const node: LayerNode = { layer, box: new Container(), shape: new Graphics(), sprite: new Sprite(), texture: null, x: 0, y: 0 };
      node.sprite.visible = false;
      node.box.addChild(node.shape, node.sprite);
      (slot === 'l3' ? this.front : this.back).addChild(node.box);
      void loadLayer(layer.id).then((texture) => {
        if (!texture || seq !== this.seq) return; // cambió el escenario mientras cargaba
        node.texture = texture;
        this.layoutNode(node);
      });
      return node;
    });
    this.back.addChild(this.veil, this.life);
    this.particles = lifeParticles(comp);
    this.layout();
  }

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.layout();
  }

  /** Luz de la hora sobre el escenario: el mismo velo de color que usan las salas. */
  setSky(sky: SkyState): void {
    this.sky = sky;
    this.drawVeil();
  }

  private layout(): void {
    for (const n of this.nodes) this.layoutNode(n);
    this.drawVeil();
    this.update(0, 0.5);
  }

  private layoutNode(n: LayerNode): void {
    const { w, h } = this;
    if (!w || !h) return;
    const m = layerMargin(n.layer);
    const lw = w * (1 + m.x * 2);
    const lh = h * (1 + m.y * 2);
    n.x = -m.x * w;
    n.y = -m.y * h;
    if (n.texture) {
      // Encaje «cover» anclado abajo: el suelo de la imagen coincide con el del lienzo
      const s = Math.max(lw / n.texture.width, lh / n.texture.height);
      n.sprite.texture = n.texture;
      n.sprite.scale.set(s);
      n.sprite.position.set((lw - n.texture.width * s) / 2, lh - n.texture.height * s);
      n.sprite.visible = true;
      n.shape.clear();
    } else {
      n.shape.clear();
      drawPrims(n.shape, silhouette(n.layer, lw / lh), lw, lh);
    }
  }

  private drawVeil(): void {
    const g = this.veil;
    g.clear();
    if (!this.sky || !this.w || this.sky.tintAlpha <= 0.005) return;
    g.rect(0, 0, this.w, this.h).fill({ color: this.sky.tint, alpha: this.sky.tintAlpha });
  }

  /** `t`: segundos desde que empezó la escena. `travel`: posición de la cámara (0-1). */
  update(t: number, travel: number): void {
    const { w, h, comp } = this;
    if (!comp || !w || !h) return;
    for (const n of this.nodes) {
      const off = layerOffset(n.layer, t, travel, this.reducedMotion);
      n.box.position.set(n.x + off.x * w, n.y + off.y * h);
    }
    const g = this.life;
    g.clear();
    const color = FLOW_GLOW[comp.flow];
    for (const p of this.particles) {
      const f = particleAt(p, comp.life, t, this.reducedMotion);
      if (f.alpha > 0.01) g.circle(f.x * w, f.y * h, Math.max(1, f.r * h)).fill({ color, alpha: f.alpha });
    }
  }

  destroy(): void {
    this.seq++;
    this.back.destroy({ children: true });
    this.front.destroy({ children: true });
  }
}
