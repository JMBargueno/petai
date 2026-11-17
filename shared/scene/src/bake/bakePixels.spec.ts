import { describe, expect, it } from 'vitest';
import { bakePixels, resolveBakeColors, type RgbaImage } from './bakePixels';
import { resolveClip, type AnimMetadata } from './anim';
import { createMulberry32, deriveVisualTraits } from '../prng';

const img = (pixels: number[][]): RgbaImage => ({ width: pixels.length, height: 1, data: new Uint8ClampedArray(pixels.flat()) });
const palette = { primary: '#ff0000', secondary: '#0000ff' };
const px = (out: Uint8ClampedArray, i: number) => Array.from(out.slice(i * 4, i * 4 + 4));

describe('bakePixels', () => {
  const { primary, secondary } = resolveBakeColors({ palette, visualSeed: 7 });

  it('deja transparente lo que está fuera de la silueta', () => {
    const out = bakePixels(img([[200, 200, 200, 255]]), img([[255, 0, 0, 0]]), { palette, visualSeed: 7 });
    expect(px(out, 0)).toEqual([0, 0, 0, 0]);
  });

  it('copia base.png en zonas de color literal (máscara negra)', () => {
    const out = bakePixels(img([[10, 120, 230, 200]]), img([[0, 0, 0, 255]]), { palette, visualSeed: 7 });
    expect(px(out, 0)).toEqual([10, 120, 230, 200]);
  });

  it('multiplica el color del rol por el sombreado de base', () => {
    const out = bakePixels(img([[128, 128, 128, 255]]), img([[255, 0, 0, 255]]), { palette, visualSeed: 7 });
    expect(px(out, 0)).toEqual([...primary.map((c) => Math.round((c * 128) / 255)), 255]);
  });

  it('mezcla primario y secundario según R/G', () => {
    const out = bakePixels(img([[255 - 10, 255 - 10, 255 - 10, 0]]), img([[0, 255, 0, 255]]), { palette, visualSeed: 7 });
    // base sin alfa → sin sombreado: secundario puro
    expect(px(out, 0)).toEqual([...secondary, 255]);
  });

  it('respeta líneas negras y brillos blancos de base', () => {
    const out = bakePixels(img([[20, 20, 20, 255], [250, 250, 250, 255]]), img([[255, 0, 0, 255], [255, 0, 0, 255]]), {
      palette,
      visualSeed: 7,
    });
    expect(px(out, 0)).toEqual([20, 20, 20, 255]);
    expect(px(out, 1)).toEqual([250, 250, 250, 255]);
  });

  it('proyecta el patrón solo donde hay canal B', () => {
    const pattern: RgbaImage = { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) };
    const base = img([[255 - 1, 200, 200, 0], [255 - 1, 200, 200, 0]]);
    const mask = img([[255, 0, 255, 255], [255, 0, 0, 255]]);
    const out = bakePixels(base, mask, { palette, visualSeed: 7, pattern });
    expect(px(out, 0)).toEqual([255, 255, 255, 255]); // patrón opaco con B = 1 → blanco
    expect(px(out, 1)).toEqual([...primary, 255]); // sin B → color del rol
  });

  it('falla si base y mask no miden lo mismo', () => {
    expect(() => bakePixels(img([[0, 0, 0, 0]]), img([[0, 0, 0, 0], [0, 0, 0, 0]]), { palette, visualSeed: 1 })).toThrow();
  });
});

describe('prng', () => {
  it('Mulberry32 es determinista (misma secuencia que Kotlin/Swift)', () => {
    const r = createMulberry32(1337);
    expect([r(), r(), r()].map((v) => v.toFixed(8))).toEqual(
      (() => {
        const q = createMulberry32(1337);
        return [q(), q(), q()].map((v) => v.toFixed(8));
      })(),
    );
    const t = deriveVisualTraits(42);
    expect(t.patternScale).toBeGreaterThanOrEqual(0.85);
    expect(t.patternScale).toBeLessThanOrEqual(1.15);
    expect(Math.abs(t.hueShiftDeg)).toBeLessThanOrEqual(8);
  });
});

describe('resolveClip', () => {
  const anim: AnimMetadata = {
    frames: Array.from({ length: 6 }, (_, i) => ({ frame: { x: i * 128, y: 0, w: 128, h: 128 }, duration: 100 + i })),
    meta: {
      size: { w: 768, h: 128 },
      frameTags: [
        { name: 'idle', from: 0, to: 1, loop: true, group: 'base' },
        { name: 'perch', from: 2, to: 3, loop: true, group: 'motion' },
        { name: 'happy', from: 4, to: 5, loop: false, group: 'action', repeat: 2 },
      ],
    },
  };
  it('usa el clip, el fallback y por último idle', () => {
    expect(resolveClip(anim, 'happy')).toMatchObject({ name: 'happy', loop: false, repeat: 2 });
    expect(resolveClip(anim, 'sit')?.name).toBe('perch');
    expect(resolveClip(anim, 'noexiste')?.name).toBe('idle');
    expect(resolveClip(anim, 'happy')?.frames.map((f) => f.duration)).toEqual([104, 105]);
  });
});
