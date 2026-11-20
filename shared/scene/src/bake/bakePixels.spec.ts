import { describe, expect, it } from 'vitest';
import { bakePixels, patternTone, resolveBakeColors, shadeShift, type RgbaImage } from './bakePixels';
import { resolveClip, type AnimMetadata } from './anim';
import { createMulberry32, deriveVisualTraits, rgbToHsl } from '../prng';

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

  it('multiplica el color del rol por el sombreado de base, con la sombra girada de tono', () => {
    const out = bakePixels(img([[128, 128, 128, 255]]), img([[255, 0, 0, 255]]), { palette, visualSeed: 7 });
    const shaded = shadeShift(primary[0], primary[1], primary[2], (239 - 128) / 239);
    expect(px(out, 0)).toEqual([...shaded.map((c) => Math.round((c * 128) / 255)), 255]);
  });

  it('el tono base no gira: un gris claro solo multiplica', () => {
    const out = bakePixels(img([[239, 239, 239, 255]]), img([[255, 0, 0, 255]]), { palette, visualSeed: 7 });
    expect(px(out, 0)).toEqual([...primary.map((c) => Math.round((c * 239) / 255)), 255]);
  });

  it('un base.png con color propio multiplica sin girar', () => {
    const out = bakePixels(img([[128, 100, 60, 255]]), img([[255, 0, 0, 255]]), { palette, visualSeed: 7 });
    expect(px(out, 0)).toEqual([Math.round((primary[0] * 128) / 255), Math.round((primary[1] * 100) / 255), Math.round((primary[2] * 60) / 255), 255]);
  });

  it('la sombra gira hacia el violeta por el camino corto y gana saturación', () => {
    const hue = (c: number[]) => rgbToHsl(c[0], c[1], c[2])[0];
    // Amarillo (60°) → hacia el rojo; verde (120°) → hacia el azul; los grises no giran.
    expect(hue(shadeShift(230, 200, 40, 0.6))).toBeLessThan(hue([230, 200, 40]));
    expect(hue(shadeShift(60, 180, 90, 0.6))).toBeGreaterThan(hue([60, 180, 90]));
    expect(shadeShift(120, 120, 120, 0.8)).toEqual([120, 120, 120]);
    expect(rgbToHsl(...shadeShift(60, 180, 90, 0.6))[1]).toBeGreaterThan(rgbToHsl(60, 180, 90)[1]);
  });

  it('pinta el acento donde la máscara es azul puro, sin patrón', () => {
    const pattern: RgbaImage = { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) };
    const withAccent = { primary: '#ff0000', secondary: '#0000ff', accent: '#00ff00' };
    const { accent } = resolveBakeColors({ palette: withAccent, visualSeed: 7 });
    const out = bakePixels(img([[239, 239, 239, 255]]), img([[0, 0, 255, 255]]), { palette: withAccent, visualSeed: 7, pattern });
    expect(px(out, 0)).toEqual([...accent.map((c) => Math.round((c * 239) / 255)), 255]);
  });

  describe('patrón', () => {
    const lum = (o: ArrayLike<number>, i = 0) => 0.299 * o[i] + 0.587 * o[i + 1] + 0.114 * o[i + 2];
    const tone: RgbaImage = { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) };
    const body = (n: number) => img(Array.from({ length: n }, () => [255, 0, 255, 255]));
    const flat = (n: number) => img(Array.from({ length: n }, () => [239, 239, 239, 255]));

    it('aclara en una especie oscura y oscurece en una clara, sin irse a blanco', () => {
      for (const [primary, sign] of [['#223366', 1], ['#F4E8C0', -1]] as const) {
        const p = { primary, secondary: '#888888' };
        const plain = bakePixels(flat(1), body(1), { palette: p, visualSeed: 7 });
        const marked = bakePixels(flat(1), body(1), { palette: p, visualSeed: 7, pattern: tone });
        expect(Math.sign(lum(marked) - lum(plain))).toBe(sign);
        expect(lum(marked)).toBeLessThan(250);
      }
    });

    it('un píxel de patrón no blanco es un destello: aclara siempre y más que el tono', () => {
      const glint: RgbaImage = { width: 1, height: 1, data: new Uint8ClampedArray([80, 220, 255, 255]) };
      const p = { primary: '#F4E8C0', secondary: '#888888' };
      const plain = bakePixels(flat(1), body(1), { palette: p, visualSeed: 7 });
      const out = bakePixels(flat(1), body(1), { palette: p, visualSeed: 7, pattern: glint });
      expect(lum(out)).toBeGreaterThan(lum(plain));
    });

    it('un alfa por debajo de la mitad no pinta: no hay mezclas parciales', () => {
      const faint: RgbaImage = { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 100]) };
      const plain = bakePixels(flat(1), body(1), { palette, visualSeed: 7 });
      expect(Array.from(bakePixels(flat(1), body(1), { palette, visualSeed: 7, pattern: faint }))).toEqual(Array.from(plain));
    });

    it('cada píxel del patrón cubre un píxel nativo entero (pixelSize píxeles de hoja)', () => {
      // Damero de 2×2 píxeles de patrón sobre una fila de 4 píxeles de hoja a escala 2.
      const checker: RgbaImage = { width: 2, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]) };
      const out = bakePixels(flat(4), body(4), { palette, visualSeed: 7, pattern: checker, pixelSize: 2 });
      const px = (i: number) => Array.from(out.slice(i * 4, i * 4 + 3));
      expect(px(0)).toEqual(px(1));
      expect(px(2)).toEqual(px(3));
      expect(px(0)).not.toEqual(px(2));
    });

    it('patternTone conserva el tono del color', () => {
      const [r, g, b] = patternTone(40, 60, 160, true, false);
      expect(b).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(g);
    });
  });

  it('sin acento en la paleta usa el primario oscurecido', () => {
    const { accent } = resolveBakeColors({ palette, visualSeed: 7 });
    const dark = resolveBakeColors({ palette: { ...palette, accent: '#6b0000' }, visualSeed: 7 }).accent;
    expect(accent).toEqual(dark); // 255 × 0,42 = 107 = 0x6b
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
    expect(px(out, 0)).not.toEqual([...primary, 255]); // con B = 1 → marca de tono
    expect(px(out, 0)).not.toEqual([255, 255, 255, 255]); // …que ya no es blanco
    expect(px(out, 1)).toEqual([...primary, 255]); // sin B → color del rol
  });

  it('falla si base y mask no miden lo mismo', () => {
    expect(() => bakePixels(img([[0, 0, 0, 0]]), img([[0, 0, 0, 0], [0, 0, 0, 0]]), { palette, visualSeed: 1 })).toThrow();
  });
});

describe('prng', () => {
  it('Mulberry32 es determinista (misma secuencia que Swift)', () => {
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
