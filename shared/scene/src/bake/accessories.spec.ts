import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCESSORY_SLOTS, anchorAt, parseEquipped, placeAccessory, type AccessoryMeta, type AnchorsFile } from './accessories';

const asset = (p: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../assets', p), 'utf8'));
const adult: AnchorsFile = asset('species/ignisaur/anchors.json');
const baby: AnchorsFile = asset('species/ignisaur/baby/anchors.json');
const gorro: AccessoryMeta = asset('accessories/acc_gorro_lana_azul/meta.json');
const corona: AccessoryMeta = asset('accessories/ach_item_care_crown/meta.json');

describe('anchorAt', () => {
  it('devuelve el ancla base en el frame 0 de idle', () => {
    for (const slot of ACCESSORY_SLOTS) expect(anchorAt(adult, slot, 'idle', 0)).toEqual(adult.base[slot]);
  });

  it('suma el desplazamiento del frame, por ranura', () => {
    const list = (adult.frames.sleep as Record<string, [number, number][]>).head;
    const [bx, by] = adult.base.head;
    expect(anchorAt(adult, 'head', 'sleep', 1)).toEqual([bx + list[1][0], by + list[1][1]]);
  });

  it('una animación sin entrada o un frame fuera de rango no rompen', () => {
    expect(anchorAt(adult, 'neck', 'no_existe', 3)).toEqual(adult.base.neck);
    const list = (adult.frames.sleep as Record<string, [number, number][]>).head;
    const last = list[list.length - 1];
    expect(anchorAt(adult, 'head', 'sleep', 99)).toEqual([adult.base.head[0] + last[0], adult.base.head[1] + last[1]]);
  });
});

describe('placeAccessory', () => {
  it('coloca el punto de anclaje de la prenda sobre el ancla, en la talla de la etapa', () => {
    // La talla la fija la hoja de la etapa: una especie de cabeza pequeña no lleva la L de adulta.
    const big = gorro.sizes[adult.size.toLowerCase() as 's' | 'm' | 'l'];
    const l = placeAccessory(adult, gorro, 'idle', 0);
    expect(l).toMatchObject({ x: adult.base.head[0] - big.anchor[0], y: adult.base.head[1] - big.anchor[1], w: big.w, h: big.h });
    const s = placeAccessory(baby, gorro, 'idle', 0);
    expect(baby.size).toBe('S');
    expect(s).toMatchObject({ w: gorro.sizes.s.w, h: gorro.sizes.s.h });
  });

  it('la prenda queda dentro del frame en todas las especies, etapas y animaciones', () => {
    for (const sp of ['ignisaur', 'axolunar', 'florabud']) {
      for (const st of ['baby/', 'juvenile/', '', 'final/']) {
        const anchors: AnchorsFile = asset(`species/${sp}/${st}anchors.json`);
        const anim = asset(`species/${sp}/${st}anim.json`);
        for (const tag of anim.meta.frameTags) {
          for (let f = 0; f <= tag.to - tag.from; f++) {
            for (const slot of ACCESSORY_SLOTS) {
              const [x, y] = anchorAt(anchors, slot, tag.name, f);
              expect(x, `${sp}/${st}${tag.name}#${f} ${slot}`).toBeGreaterThanOrEqual(0);
              expect(x).toBeLessThan(64);
              expect(y).toBeGreaterThanOrEqual(0);
              expect(y).toBeLessThan(64);
            }
          }
        }
      }
    }
  });

  it('una prenda animada avanza con el tiempo; una quieta, no', () => {
    expect(corona.frames).toBe(2);
    expect(placeAccessory(adult, corona, 'idle', 0, 0).frame).toBe(0);
    expect(placeAccessory(adult, corona, 'idle', 0, corona.frameMs).frame).toBe(1);
    expect(placeAccessory(adult, corona, 'idle', 0, corona.frameMs * 2).frame).toBe(0);
    expect(placeAccessory(adult, gorro, 'idle', 0, 10_000).frame).toBe(0);
  });
});

describe('parseEquipped', () => {
  it('se queda con las cuatro ranuras y con ids válidos', () => {
    expect(parseEquipped({ head: 'acc_gorro_lana_azul', back: 'acc_capa_gala', mano: 'x', neck: 3, face: '../x' })).toEqual({
      head: 'acc_gorro_lana_azul',
      back: 'acc_capa_gala',
    });
    expect(parseEquipped(null)).toEqual({});
    expect(parseEquipped(['acc_gorro_lana_azul'])).toEqual({});
  });
});
