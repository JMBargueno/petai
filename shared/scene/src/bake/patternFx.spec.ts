import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { RgbaImage } from './bakePixels';
import { bakeFxMap, FX_BODY, FX_GLINT, FX_STEP_MS, FX_TONE, hasFx, PATTERN_FX, renderFx, type PatternFx } from './patternFx';

const img = (w: number, h: number, px: number[][]): RgbaImage => ({ width: w, height: h, data: new Uint8ClampedArray(px.flat()) });
const BODY = [255, 0, 255, 255];
const BELLY = [0, 255, 0, 255];
const OUT = [0, 0, 0, 0];
const TONE: RgbaImage = img(1, 1, [[255, 255, 255, 255]]);
const GLINT: RgbaImage = img(1, 1, [[80, 220, 255, 255]]);

/** Hoja de 8×8 toda de cuerpo, con todos los píxeles marcados por `pattern`. */
const sheet = (pattern: RgbaImage | null) => {
  const mask = img(8, 8, Array.from({ length: 64 }, () => BODY));
  return { map: bakeFxMap(mask, { pattern, visualSeed: 7 }), frame: { x: 0, y: 0, w: 8, h: 8 } };
};
const lit = (buf: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 3; i < buf.length; i += 4) if (buf[i] > 0) n++;
  return n;
};

describe('bakeFxMap', () => {
  it('marca la silueta y distingue cuerpo, tono y destello', () => {
    const mask = img(4, 1, [BODY, BELLY, OUT, BODY]);
    const tone = bakeFxMap(mask, { pattern: TONE, visualSeed: 7 });
    expect(tone[3]).toBe(255);
    expect(tone[2]).toBe(FX_TONE);
    expect(tone[4 + 2]).toBe(FX_BODY); // el vientre no lleva patrón
    expect(tone[8 + 3]).toBe(0); // fuera de la silueta
    expect(bakeFxMap(mask, { pattern: GLINT, visualSeed: 7 })[2]).toBe(FX_GLINT);
    expect(bakeFxMap(mask, { pattern: null, visualSeed: 7 })[2]).toBe(FX_BODY);
  });

  it('dos píxeles de hoja del mismo píxel nativo caen en el mismo punto del patrón', () => {
    const mask = img(4, 1, [BODY, BODY, BODY, BODY]);
    const map = bakeFxMap(mask, { pattern: null, visualSeed: 7, pixelSize: 2 });
    expect(map[0]).toBe(map[4]);
    expect(map[8]).toBe(map[12]);
    expect(map[0]).not.toBe(map[8]);
  });
});

describe('renderFx', () => {
  it('sin efecto ni shiny no pinta nada', () => {
    const { map, frame } = sheet(TONE);
    expect(lit(renderFx(map, 8, frame, { time: 500 }))).toBe(0);
  });

  it('nunca pinta fuera de la silueta con un efecto de patrón', () => {
    const mask = img(2, 1, [BODY, OUT]);
    const map = bakeFxMap(mask, { pattern: TONE, visualSeed: 7, pixelSize: 1 });
    for (let t = 0; t < 6000; t += FX_STEP_MS) {
      const out = renderFx(map, 2, { x: 0, y: 0, w: 2, h: 1 }, { fx: 'aurora', time: t, pixelSize: 1 });
      expect(out[7]).toBe(0);
    }
  });

  it('el tiempo va a saltos: dentro de un mismo paso la capa no cambia', () => {
    const { map, frame } = sheet(TONE);
    const a = renderFx(map, 8, frame, { fx: 'aurora', time: FX_STEP_MS * 10 });
    const b = renderFx(map, 8, frame, { fx: 'aurora', time: FX_STEP_MS * 10 + FX_STEP_MS - 1 });
    const c = renderFx(map, 8, frame, { fx: 'aurora', time: FX_STEP_MS * 11 });
    expect(Array.from(b)).toEqual(Array.from(a));
    expect(Array.from(c)).not.toEqual(Array.from(a));
  });

  it('la intensidad sigue a la rareza: el superraro descansa, el mítico no para', () => {
    // Fracción del tiempo con algo encendido, sobre un cuerpo todo de marcas (o todo de destellos).
    const busy = (fx: PatternFx, pattern: RgbaImage) => {
      const { map, frame } = sheet(pattern);
      let on = 0;
      let total = 0;
      for (let t = 0; t < 12000; t += FX_STEP_MS) {
        total++;
        if (lit(renderFx(map, 8, frame, { fx, time: t })) > 0) on++;
      }
      return on / total;
    };
    expect(busy('sheen', TONE)).toBeLessThan(0.4);
    expect(busy('starfield', TONE)).toBe(1);
    expect(busy('flash', GLINT)).toBe(1);
    expect(busy('aurora', TONE)).toBe(1);
  });

  it('el shiny brilla sobre el cuerpo liso, y el barrido enciende más que los destellos sueltos', () => {
    const { map, frame } = sheet(null);
    const counts: number[] = [];
    for (let t = 0; t < 4000; t += FX_STEP_MS) counts.push(lit(renderFx(map, 8, frame, { shiny: true, time: t, pixelSize: 1 })));
    expect(Math.max(...counts)).toBeGreaterThan(Math.min(...counts));
    expect(counts.filter((n) => n > 0).length).toBeGreaterThan(counts.length / 2);
  });
});

describe('catálogo de patrones', () => {
  const patterns = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../game-data/patterns.json'), 'utf8')) as {
    id: string;
    rarity: string;
    group: string;
    fx?: string;
  }[];
  const of = (rarity: string) => patterns.filter((p) => p.rarity === rarity);

  it('tiene 3 normales, 3 raros, 3 superraros, 2 legendarios y 1 mítico', () => {
    expect([of('normal').length, of('rare').length, of('super_rare').length, of('legendary').length, of('mythic').length]).toEqual([3, 3, 3, 2, 1]);
  });

  it('normal y raro son Mímesis Terrestre sin efecto; el resto, Textura del Éter con efecto', () => {
    for (const p of patterns) {
      const aether = ['super_rare', 'legendary', 'mythic'].includes(p.rarity);
      expect(p.group).toBe(aether ? 'aether' : 'terrestrial');
      expect(!!p.fx).toBe(aether);
    }
  });

  it('el efecto de cada patrón es el mismo en los datos y en el código', () => {
    expect(Object.fromEntries(patterns.filter((p) => p.fx).map((p) => [p.id, p.fx]))).toEqual(PATTERN_FX);
  });

  it('cada patrón, salvo el liso, tiene su mosaico', () => {
    for (const p of patterns) {
      if (p.id === 'plain') continue;
      expect(fs.existsSync(path.resolve(__dirname, `../../../assets/patterns/${p.id}.png`))).toBe(true);
    }
  });

  it('hasFx: solo los patrones del Éter y los shiny llevan capa de efectos', () => {
    expect(hasFx('spots', false)).toBe(false);
    expect(hasFx('aurora', false)).toBe(true);
    expect(hasFx(null, true)).toBe(true);
  });
});
