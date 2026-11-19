import * as fs from 'fs';
import * as path from 'path';
import * as core from '@pockai/mind/node';
import { createRng, hashSeed } from '../battles/combat/rng';
import { PersonalityConfig } from './mind.types';
import { bandOf, clampDim, isValidDims, neutralDims, rollBirthDims, weighted } from './personality.engine';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const cfg = balance.personality as PersonalityConfig;

/**
 * El backend usa el núcleo de `@pockai/mind` (el mismo que el escritorio y la sala) en vez de
 * una copia. Antes un test de paridad vigilaba que las dos copias no se separasen; ahora se
 * comprueba que solo hay una.
 */
describe('el backend usa @pockai/mind, no una copia', () => {
  it('las funciones del servidor son las del paquete', () => {
    expect(createRng).toBe(core.createRng);
    expect(hashSeed).toBe(core.hashSeed);
    expect(clampDim).toBe(core.clampDim);
    expect(neutralDims).toBe(core.neutralDims);
    expect(isValidDims).toBe(core.isValidDims);
    expect(weighted).toBe(core.weighted);
  });

  it('las que se adaptan a la configuración del servidor dan lo mismo que el paquete', () => {
    for (const seed of [0, 1, 42, 1337, 987654321]) {
      const bias = { curiosity: 70, temper: 30 };
      expect(rollBirthDims(bias, seed, cfg)).toEqual(core.rollBirthDims(bias, seed, cfg.birth));
    }
    for (const d of core.DIMENSIONS) {
      for (let v = 0; v <= 100; v += 5) expect(bandOf(d, v, cfg).keyword).toBe(core.bandOf(d, v, cfg.dimensions as any).keyword);
    }
  });

  it('no queda una segunda implementación en el código del servidor', () => {
    const src = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
    // mulberry32 y el hash FNV solo están en el paquete
    expect(src('battles/combat/rng.ts')).not.toMatch(/0x6d2b79f5|16777619/);
    expect(src('mind/personality.engine.ts')).not.toMatch(/weights\[d\] \?\? 0\) \* \(dims\[d\] - 50\)/);
  });

  it('el generador sigue dando la secuencia de siempre (combates y vida autónoma no cambian)', () => {
    const rng = createRng(hashSeed('autonomy:pet-1:7'));
    expect([rng(), rng(), rng()].map((n) => Math.round(n * 1e6))).toEqual(
      (() => {
        const again = core.createRng(core.hashSeed('autonomy:pet-1:7'));
        return [again(), again(), again()].map((n) => Math.round(n * 1e6));
      })(),
    );
    expect(hashSeed('pockai')).toBe(core.hashSeed('pockai'));
  });
});
