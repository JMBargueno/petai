import * as fs from 'fs';
import * as path from 'path';
import { pickPattern, resolveRarity, rollByWeights } from './rarity.engine';

const read = (file: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data', file), 'utf8'));
const weights = read('balance.json').rarity;
const patterns: { id: string; rarity: string }[] = read('patterns.json');

describe('resolveRarity', () => {
  it('devuelve la rareza tirada si hay algo de esa rareza', () => {
    expect(resolveRarity('rare', ['normal', 'rare'])).toBe('rare');
  });

  it('sin nada de esa rareza baja a la más alta por debajo', () => {
    expect(resolveRarity('legendary', ['normal'])).toBe('normal');
    expect(resolveRarity('mythic', ['normal', 'super_rare'])).toBe('super_rare');
  });

  it('si no hay nada por debajo sube a la más baja por encima', () => {
    expect(resolveRarity('normal', ['rare', 'legendary'])).toBe('rare');
  });
});

describe('rollByWeights', () => {
  it('reparte según las probabilidades de balance.json', () => {
    expect(rollByWeights(weights, 0)).toBe('normal');
    expect(rollByWeights(weights, 0.59)).toBe('normal');
    expect(rollByWeights(weights, 0.6)).toBe('rare');
    expect(rollByWeights(weights, 0.86)).toBe('super_rare');
    expect(rollByWeights(weights, 0.96)).toBe('legendary');
    expect(rollByWeights(weights, 0.995)).toBe('mythic');
  });
});

describe('pickPattern', () => {
  it('elige un patrón de la rareza tirada, sea cual sea la especie', () => {
    const first = (n: number) => 0 * n;
    expect(pickPattern(patterns, weights, 0.1, first).rarity).toBe('normal');
    expect(pickPattern(patterns, weights, 0.7, first).rarity).toBe('rare');
    expect(pickPattern(patterns, weights, 0.9, first).rarity).toBe('super_rare');
    expect(pickPattern(patterns, weights, 0.97, first).rarity).toBe('legendary');
    expect(pickPattern(patterns, weights, 0.999, first).rarity).toBe('mythic');
  });

  it('entre los de una misma rareza elige con el dado', () => {
    const normals = patterns.filter((p) => p.rarity === 'normal');
    expect(normals.length).toBeGreaterThan(1);
    expect(pickPattern(patterns, weights, 0.1, () => 1).id).toBe(normals[1].id);
  });

  it('si no hay patrones de la rareza tirada usa la más cercana por debajo', () => {
    const few = [{ id: 'plain', rarity: 'normal' }, { id: 'gradient', rarity: 'rare' }];
    expect(pickPattern(few, weights, 0.999, () => 0).id).toBe('gradient');
  });

  it('todas las rarezas de balance.json tienen al menos un patrón', () => {
    for (const rarity of Object.keys(weights)) expect(patterns.some((p) => p.rarity === rarity)).toBe(true);
  });
});
