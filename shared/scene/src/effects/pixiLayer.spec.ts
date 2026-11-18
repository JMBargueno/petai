import { beforeAll, describe, expect, it, vi } from 'vitest';

// Pixi de mentira: la capa solo necesita colgar sprites y subir texturas.
vi.mock('pixi.js', () => {
  class Sprite {
    scale = { set() {} };
    anchor = { set() {} };
    alpha = 1;
    removeFromParent() {}
    destroy() {}
  }
  const Texture = { from: () => ({ source: { scaleMode: '', update() {} }, destroy() {} }) };
  class Container {
    addChild() {}
    addChildAt() {}
  }
  return { Sprite, Texture, Container };
});

beforeAll(() => {
  // Canvas sin contexto: la capa se salta el pintado y solo avanza la línea de tiempo.
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
});

async function layer() {
  const { Container } = await import('pixi.js');
  const { PixiEffects, HOLD_MS } = await import('./pixiLayer');
  const { flowPalette } = await import('./palettes');
  const ended: string[] = [];
  const fx = new PixiEffects(new Container(), { palette: () => flowPalette('fire'), seed: () => 1, onEnded: (id) => ended.push(id) });
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 50) fx.update(50);
  };
  return { fx, ended, run, HOLD_MS };
}

// Capullo: gather 600 + weave 700 → hold → burst 560 + vanish 560
describe('PixiEffects: fases hold', () => {
  it('por defecto se sueltan solas a los HOLD_MS', async () => {
    const { fx, ended, run, HOLD_MS } = await layer();
    fx.play('capullo-telar');
    run(1300 + HOLD_MS + 1500);
    expect(ended).toEqual(['capullo-telar']);
  });

  it('con holdMs espera hasta release (la nueva etapa ya horneada)', async () => {
    const { fx, ended, run } = await layer();
    fx.play('capullo-telar', {}, { holdMs: 5000 });
    run(3000);
    expect(fx.running).toEqual(['capullo-telar']);
    expect(fx.release('capullo-telar')).toBe(true);
    run(1500);
    expect(ended).toEqual(['capullo-telar']);
  });

  it('un release antes de llegar al hold lo suelta en cuanto llega', async () => {
    const { fx, ended, run } = await layer();
    fx.play('capullo-telar', {}, { holdMs: 5000 });
    run(200);
    fx.release('capullo-telar');
    run(1300 + 1500);
    expect(ended).toEqual(['capullo-telar']);
  });

  it('sin release se abre igualmente al agotar holdMs', async () => {
    const { fx, ended, run } = await layer();
    fx.play('capullo-telar', {}, { holdMs: 2000 });
    run(1300 + 2000 + 1500);
    expect(ended).toEqual(['capullo-telar']);
    expect(fx.release('capullo-telar')).toBe(false);
  });
});
