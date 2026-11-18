import { describe, expect, it } from 'vitest';
import { DIMENSIONS, bandOf, createRng, hashSeed, rollBirthDims, weighted, type Dims } from '@pockai/mind';
import balance from '@shared/game-data/balance.json';
// Motor del servidor: funciones puras, sin dependencias de Nest (mismo truco que desktopIntelligence.spec)
import * as server from '../../../../backend/src/modules/mind/personality.engine';
import * as serverRng from '../../../../backend/src/modules/battles/combat/rng';

/**
 * `@pockai/mind` copia el núcleo de personalidad del servidor para poder usarlo en el escritorio
 * y en la sala. Hasta que el servidor importe el paquete, este test impide que se separen.
 */
const cfg = (balance as any).personality;

const GRID: Dims[] = [];
for (const a of [0, 25, 50, 75, 100]) {
  for (const b of [0, 50, 100]) {
    GRID.push({ curiosity: a, sociability: b, bravery: 100 - a, affection: b, temper: a });
  }
}

describe('paridad de @pockai/mind con el motor del servidor', () => {
  it('el generador sembrado da la misma secuencia', () => {
    const mine = createRng(hashSeed('autonomy:pet-1:7'));
    const theirs = serverRng.createRng(serverRng.hashSeed('autonomy:pet-1:7'));
    for (let i = 0; i < 50; i++) expect(mine()).toBe(theirs());
  });

  it('weighted coincide en toda la rejilla', () => {
    const weights = { curiosity: 0.04, temper: -0.03, affection: 0.02 };
    for (const dims of GRID) {
      for (const base of [0.5, 1, 3]) {
        expect(weighted(base, weights, dims)).toBe(server.weighted(base, weights, dims));
      }
    }
  });

  it('bandOf coincide con las bandas de balance.json', () => {
    for (const d of DIMENSIONS) {
      for (let v = 0; v <= 100; v += 5) {
        expect(bandOf(d, v, cfg.dimensions).keyword).toBe(server.bandOf(d, v, cfg).keyword);
      }
    }
  });

  it('rollBirthDims coincide para varias semillas y sesgos', () => {
    for (const seed of [1, 42, 99_999]) {
      for (const bias of [undefined, { bravery: 90, temper: 10 }]) {
        expect(rollBirthDims(bias, seed, cfg.birth)).toEqual(server.rollBirthDims(bias, seed, cfg));
      }
    }
  });
});
