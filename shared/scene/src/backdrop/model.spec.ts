import { describe, expect, it } from 'vitest';
import {
  LAYER_IDS,
  LOCATION_IDS,
  PAN,
  SCREEN_IDS,
  SLOTS,
  layerMargin,
  layerOffset,
  lifeParticles,
  locationComposition,
  particleAt,
  screenComposition,
  shade,
  silhouette,
  type LayerDef,
  type Prim,
} from './model';

const allCompositions = [...LOCATION_IDS.map((id) => locationComposition(id)!), ...SCREEN_IDS.map((id) => screenComposition(id)!)];
const allLayers = new Map<string, LayerDef>();
for (const comp of allCompositions) for (const slot of SLOTS) allLayers.set(comp.layers[slot].id, comp.layers[slot]);

const numbersOf = (p: Prim): number[] => (p.k === 'rect' ? [p.x, p.y, p.w, p.h] : p.k === 'circle' ? [p.x, p.y, p.r] : p.pts);

describe('fondos por capas: catálogo', () => {
  it('cada localización y cada pantalla resuelve sus 4 capas, cada una en su ranura', () => {
    expect(LOCATION_IDS).toContain('rotura-del-nexo');
    expect(SCREEN_IDS.sort()).toEqual(['arena', 'kitchen', 'raid', 'tournament', 'training']);
    for (const comp of allCompositions) {
      expect(comp).not.toBeNull();
      for (const slot of SLOTS) expect(comp.layers[slot].slot).toBe(slot);
      expect(comp.ground[1]).toBeGreaterThan(comp.ground[0]);
    }
    expect(locationComposition('no-existe')).toBeNull();
    expect(screenComposition('no-existe')).toBeNull();
  });

  it('todas las capas del catálogo se usan en algún escenario', () => {
    expect(LAYER_IDS.filter((id) => !allLayers.has(id))).toEqual([]);
  });

  it('el primer plano se mueve más que el suelo, y el suelo más que el fondo', () => {
    for (const comp of allCompositions) {
      const { bg, l1, l2, l3 } = comp.layers;
      expect(bg.parallax).toBeLessThan(l1.parallax);
      expect(l1.parallax).toBeLessThan(l2.parallax);
      expect(l2.parallax).toBeLessThan(l3.parallax);
    }
  });
});

describe('fondos por capas: siluetas procedurales', () => {
  it('toda capa tiene una silueta propia (ninguna cae en la forma de reserva) con números finitos', () => {
    for (const layer of allLayers.values()) {
      for (const aspect of [16 / 10, 3.2]) {
        const prims = silhouette(layer, aspect);
        expect(prims.length, layer.id).toBeGreaterThan(1);
        for (const p of prims) {
          for (const n of numbersOf(p)) expect(Number.isFinite(n), `${layer.id}/${p.k}`).toBe(true);
          expect('fill' in p ? p.fill : p.stroke).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
      }
    }
  });

  it('es determinista: misma capa, mismo dibujo', () => {
    const layer = allLayers.get('l1-rotura')!;
    expect(silhouette(layer, 1.6)).toEqual(silhouette(layer, 1.6));
  });

  it('el fondo lejano deja ver el cielo y el suelo lo tapa', () => {
    for (const comp of allCompositions) {
      // Ninguna primitiva del fondo cubre el lienzo entero con opacidad total
      const full = silhouette(comp.layers.bg, 1.6).some((p) => p.k === 'rect' && p.w >= 1 && p.h >= 1 && (p.alpha ?? 1) >= 1);
      expect(full, comp.layers.bg.id).toBe(false);
      // El suelo es una banda opaca de lado a lado bajo los pies del Pockai
      const floor = silhouette(comp.layers.l2, 1.6).find((p) => p.k === 'rect' && p.w >= 1 && (p.alpha ?? 1) >= 1) as Extract<Prim, { k: 'rect' }>;
      expect(floor, comp.layers.l2.id).toBeDefined();
      expect(floor.y).toBeLessThan(comp.ground[1]);
    }
  });

  it('el primer plano no tapa el centro, donde ocurre el evento', () => {
    for (const layer of allLayers.values()) {
      if (layer.slot !== 'l3') continue;
      for (const p of silhouette(layer, 1.6)) {
        const xs = p.k === 'rect' ? [p.x, p.x + p.w] : p.k === 'circle' ? [p.x] : p.pts.filter((_, i) => i % 2 === 0);
        for (const x of xs) expect(x < 0.3 || x > 0.7, `${layer.id}: x=${x.toFixed(2)}`).toBe(true);
      }
    }
  });

  it('los edificios no se estiran en un lienzo apaisado', () => {
    const coliseo = allLayers.get('l1-coliseo')!;
    const widthOf = (aspect: number) => {
      const xs = silhouette(coliseo, aspect)
        .filter((p): p is Extract<Prim, { k: 'poly' }> => p.k === 'poly')
        .slice(1, 5) // las gradas
        .flatMap((p) => p.pts.filter((_, i) => i % 2 === 0));
      return (Math.max(...xs) - Math.min(...xs)) * aspect; // ancho medido en altos
    };
    expect(widthOf(3.2)).toBeCloseTo(widthOf(1.6), 5);
  });
});

describe('fondos por capas: movimiento', () => {
  const l3 = allLayers.get('l3-hebras-colgantes')!;
  const bg = allLayers.get('bg-eter-abisal')!;

  it('la cámara desplaza cada capa según su parallax, en sentido contrario al paseo', () => {
    expect(layerOffset(l3, 0, 0.5, true)).toEqual({ x: -0, y: 0 });
    expect(layerOffset(l3, 0, 1, true).x).toBeCloseTo(-(PAN * l3.parallax) / 2);
    expect(layerOffset(l3, 0, 0, true).x).toBeCloseTo((PAN * l3.parallax) / 2);
    expect(Math.abs(layerOffset(bg, 0, 1, true).x)).toBeLessThan(Math.abs(layerOffset(l3, 0, 1, true).x));
  });

  it('ninguna capa se desplaza más que su margen: nunca enseña el borde', () => {
    for (const layer of allLayers.values()) {
      const m = layerMargin(layer);
      for (let t = 0; t < 40; t += 0.37) {
        for (const travel of [-0.2, 0, 0.5, 1, 1.3]) {
          const off = layerOffset(layer, t, travel);
          expect(Math.abs(off.x), layer.id).toBeLessThanOrEqual(m.x);
          expect(Math.abs(off.y), layer.id).toBeLessThanOrEqual(m.y);
        }
      }
    }
  });

  it('con movimiento reducido las capas y las partículas se quedan quietas', () => {
    expect(layerOffset(l3, 3, 0.5, true)).toEqual(layerOffset(l3, 11, 0.5, true));
    const comp = locationComposition('paramo-de-ascuas')!;
    const p = lifeParticles(comp)[0];
    expect(particleAt(p, comp.life, 2, true)).toEqual(particleAt(p, comp.life, 9, true));
    expect(particleAt(p, comp.life, 2)).not.toEqual(particleAt(p, comp.life, 9));
  });

  it('las partículas son deterministas, se quedan en el lienzo y se pueden recortar', () => {
    for (const comp of allCompositions) {
      const ps = lifeParticles(comp);
      expect(ps).toEqual(lifeParticles(comp));
      expect(lifeParticles(comp, 0)).toHaveLength(0);
      expect(lifeParticles(comp, 0.5).length).toBeLessThanOrEqual(ps.length);
      for (const p of ps) {
        for (const t of [0, 3.3, 17, 120]) {
          const f = particleAt(p, comp.life, t);
          expect(f.alpha).toBeGreaterThanOrEqual(0);
          expect(f.alpha).toBeLessThanOrEqual(1);
          expect(f.y).toBeGreaterThan(-0.1);
          expect(f.y).toBeLessThan(1.1);
        }
      }
    }
  });

  it('shade aclara y oscurece sin salirse del rango', () => {
    expect(shade('#808080', 0)).toBe('#808080');
    expect(shade('#808080', 1)).toBe('#ffffff');
    expect(shade('#808080', -1)).toBe('#000000');
    expect(shade('#102030', 0.5)).toBe('#889098');
  });
});
