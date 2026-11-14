import {
  validateGameData,
  validateFile,
} from '../../../../backend/src/modules/game-data/game-data.schemas';
import { loadGameData } from '../lib/game-data';

describe('petai-devkit validate (offline, referencias cruzadas — SC-006)', () => {
  it('los game-data reales son válidos (0 errores)', () => {
    const data = loadGameData();
    const errors = validateGameData({
      balance: data.balance,
      species: data.species,
      patterns: data.patterns,
      foods: data.foods,
      skills: data.skills,
      missions: data.missions,
    });
    expect(errors).toEqual([]);
  });

  it('detecta favoriteFood inexistente', () => {
    const data = loadGameData();
    const bad = JSON.parse(JSON.stringify(data));
    bad.species[0].favoriteFood = 'no_existe';
    const errors = validateGameData(bad);
    expect(errors.some((e) => e.includes('favoriteFood'))).toBe(true);
  });

  it('detecta rareza inexistente en una especie', () => {
    const data = loadGameData();
    const bad = JSON.parse(JSON.stringify(data));
    bad.species[0].rarity = 'plasma';
    const errors = validateGameData(bad);
    expect(errors.some((e) => e.includes('Rareza'))).toBe(true);
  });

  it('detecta ligas desordenadas por minElo', () => {
    const data = loadGameData();
    const bad = JSON.parse(JSON.stringify(data));
    bad.balance.combats.leagues[1].minElo = bad.balance.combats.leagues[0].minElo;
    const errors = validateGameData(bad);
    expect(errors.some((e) => e.toLowerCase().includes('ligas'))).toBe(true);
  });

  it('detecta probabilidades de rareza que no suman 1.0', () => {
    const data = loadGameData();
    const bad = JSON.parse(JSON.stringify(data));
    bad.balance.rarity.normal.probability = 0.99;
    const errors = validateGameData(bad);
    expect(errors.some((e) => e.includes('sumar 1.0'))).toBe(true);
  });

  it('detecta elemento no reconocido (schema zod)', () => {
    const data = loadGameData();
    const badSpecies = JSON.parse(JSON.stringify(data.species));
    badSpecies[0] = { ...badSpecies[0], element: 'plasma' };
    const res = validateFile('species', badSpecies);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.path.includes('element'))).toBe(true);
  });
});