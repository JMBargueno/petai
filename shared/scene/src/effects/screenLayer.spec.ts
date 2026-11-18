import { beforeAll, describe, expect, it, vi } from 'vitest';

// Pixi de mentira: la capa solo cuelga un sprite y sube texturas.
vi.mock('pixi.js', () => {
  class Sprite {
    scale = { set() {} };
    alpha = 1;
    eventMode = 'auto';
    hitArea: unknown = null;
    parent: Container | null = null;
    constructor(public texture: unknown) {}
    removeFromParent() {
      if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
      this.parent = null;
    }
    destroy() {}
  }
  class Container {
    children: Sprite[] = [];
    addChild(s: Sprite) {
      this.children.push(s);
      s.parent = this;
    }
  }
  class Rectangle {
    constructor(public x: number, public y: number, public width: number, public height: number) {}
  }
  const Texture = { from: () => ({ source: { scaleMode: '', update() {} }, destroy() {} }) };
  return { Sprite, Texture, Container, Rectangle };
});

beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
});

async function layer(viewport = { width: 400, height: 760 }) {
  const { Container } = await import('pixi.js');
  const { PixiScreenFx, MAX_COVER_MS } = await import('./screenLayer');
  const { PixiEffects } = await import('./pixiLayer');
  const { flowPalette } = await import('./palettes');
  const events: string[] = [];
  const host = new Container() as unknown as { children: unknown[] };
  const fx = new PixiScreenFx(host as never, {
    palette: () => flowPalette('plant'),
    seed: () => 3,
    viewport: () => viewport,
    onCovered: () => events.push('covered'),
    onUncovered: () => events.push('uncovered'),
  });
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 50) fx.update(50);
  };
  const pet = new PixiEffects(new Container(), { palette: () => flowPalette('plant'), seed: () => 1 });
  return { fx, host, events, run, viewport, MAX_COVER_MS, pet };
}

describe('PixiScreenFx: velo que tapa la pantalla', () => {
  it('tapa, espera a uncover y se abre avisando en cada paso', async () => {
    const { fx, host, events, run } = await layer();
    expect(fx.cover('velo-eter')).toBe(true);
    expect(host.children).toHaveLength(1);
    run(500);
    expect(events).toEqual(['covered']);
    expect(fx.covered).toBe(true);
    run(2000);
    expect(events).toEqual(['covered']);
    fx.uncover();
    run(600);
    expect(events).toEqual(['covered', 'uncovered']);
    expect(fx.busy).toBe(false);
    expect(host.children).toHaveLength(0);
  });

  it('se abre solo si nadie lo destapa en MAX_COVER_MS', async () => {
    const { fx, events, run, MAX_COVER_MS } = await layer();
    fx.cover();
    run(500 + MAX_COVER_MS + 600);
    expect(events).toEqual(['covered', 'uncovered']);
  });

  it('un uncover antes de cerrarse del todo lo abre en cuanto llega al hold', async () => {
    const { fx, events, run } = await layer();
    fx.cover();
    run(100);
    fx.uncover();
    run(1000);
    expect(events).toEqual(['covered', 'uncovered']);
  });

  it('cover con la pantalla ya tapada vuelve a avisar sin reiniciar; uncover sin velo avisa ya', async () => {
    const { fx, events, run } = await layer();
    fx.uncover();
    expect(events).toEqual(['uncovered']);
    fx.cover();
    run(500);
    fx.cover();
    expect(events).toEqual(['uncovered', 'covered', 'covered']);
  });

  it('sigue al viewport aunque cambie de tamaño mientras está tapado', async () => {
    const { fx, host, events, run, viewport } = await layer();
    fx.cover();
    run(500);
    viewport.width = 900;
    viewport.height = 420;
    run(100);
    const sprite = host.children[0] as { hitArea: { width: number; height: number } };
    expect(sprite.hitArea).toMatchObject({ width: 225, height: 105 });
    fx.uncover();
    run(600);
    expect(events).toEqual(['covered', 'uncovered']);
  });

  it('rechaza efectos que no son de pantalla, y la capa del Pockai rechaza los de pantalla', async () => {
    const { fx, pet } = await layer();
    expect(fx.cover('portal-nexo')).toBe(false);
    expect(fx.cover('no-existe')).toBe(false);
    expect(pet.play('velo-eter')).toBe(false);
  });
});
