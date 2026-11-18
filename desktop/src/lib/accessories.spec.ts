import { describe, expect, it } from 'vitest';
import type { AccessoryMeta, AnchorsFile } from '@pockai/scene/bake';
import { accessoryPreview, drawWorn, type WornSet } from './accessories';

const anchors: AnchorsFile = {
  size: 'L',
  base: { head: [32, 16], face: [38, 28], neck: [32, 39], back: [18, 36] },
  eyeGap: 7,
  frames: { walk: [[0, 0], [0, -1]] },
};
const meta = (slot: AccessoryMeta['slot'], w: number, h: number, anchor: [number, number], frames = 1): AccessoryMeta => ({
  slot,
  scale: 2,
  sizes: { s: { w, h, anchor }, m: { w, h, anchor }, l: { w, h, anchor } },
  frames,
  frameMs: 200,
});
const img = (name: string) => ({ name }) as unknown as HTMLImageElement;

function fakeCtx() {
  const calls: { image: string; args: number[] }[] = [];
  const ctx = {
    imageSmoothingEnabled: true,
    drawImage: (image: { name: string }, ...args: number[]) => calls.push({ image: image.name, args }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, raw: ctx };
}

const set: WornSet = {
  anchors,
  layers: [
    { slot: 'head', image: img('gorro'), meta: meta('head', 20, 15, [10, 12]) },
    { slot: 'back', image: img('capa'), meta: meta('back', 23, 29, [13, 5], 2) },
    { slot: 'neck', image: img('bufanda'), meta: meta('neck', 25, 13, [12, 3]) },
  ],
};

describe('drawWorn', () => {
  it('detrás solo pinta la espalda; delante, cuello y luego cabeza', () => {
    const behind = fakeCtx();
    drawWorn(behind.ctx, set, 'behind', 'idle', 0, 0);
    expect(behind.calls.map((c) => c.image)).toEqual(['capa']);
    const front = fakeCtx();
    drawWorn(front.ctx, set, 'front', 'idle', 0, 0);
    expect(front.calls.map((c) => c.image)).toEqual(['bufanda', 'gorro']);
    expect(front.raw.imageSmoothingEnabled).toBe(false);
  });

  it('coloca la prenda en su ancla, a ×2, y sigue el desplazamiento del frame', () => {
    const a = fakeCtx();
    drawWorn(a.ctx, set, 'front', 'idle', 0, 0);
    // Gorro: ancla (32, 16) menos su punto de anclaje (10, 12) = (22, 4) nativo → (44, 8) en pantalla.
    expect(a.calls[1].args).toEqual([0, 0, 40, 30, 44, 8, 40, 30]);
    const b = fakeCtx();
    drawWorn(b.ctx, set, 'front', 'walk', 1, 0);
    expect(b.calls[1].args.slice(4, 6)).toEqual([44, 6]);
  });

  it('una prenda animada cambia de frame con el tiempo', () => {
    const a = fakeCtx();
    drawWorn(a.ctx, set, 'behind', 'idle', 0, 0);
    expect(a.calls[0].args[0]).toBe(0);
    const b = fakeCtx();
    drawWorn(b.ctx, set, 'behind', 'idle', 0, 200);
    expect(b.calls[0].args[0]).toBe(46); // segundo frame: 23 px nativos × 2
  });

  it('sin prendas no pinta nada', () => {
    const a = fakeCtx();
    drawWorn(a.ctx, null, 'front', 'idle', 0, 0);
    expect(a.calls).toEqual([]);
  });
});

describe('accessoryPreview', () => {
  it('da la hoja y el tamaño de un frame de una prenda con arte, y null si no existe', () => {
    expect(accessoryPreview('ach_item_care_crown')).toMatchObject({ frames: 2 });
    expect(accessoryPreview('acc_gorro_lana_azul')?.w).toBeGreaterThan(0);
    expect(accessoryPreview('no_existe')).toBeNull();
  });
});
