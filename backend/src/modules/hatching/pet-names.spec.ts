import { PET_NAMES, randomPetName } from './pet-names';
import { MAX_PET_NAME_LENGTH } from '../../common/pet-name';

describe('PET_NAMES', () => {
  it('tiene exactamente 300 nombres', () => {
    expect(PET_NAMES.length).toBe(300);
  });

  it('todos son únicos', () => {
    expect(new Set(PET_NAMES).size).toBe(PET_NAMES.length);
  });

  it('todos tienen longitud entre 3 y 16 caracteres', () => {
    for (const name of PET_NAMES) {
      expect(name.length).toBeGreaterThanOrEqual(3);
      expect(name.length).toBeLessThanOrEqual(MAX_PET_NAME_LENGTH);
    }
  });

  it('randomPetName() devuelve siempre un nombre del pool', () => {
    for (let i = 0; i < 100; i++) {
      expect(PET_NAMES).toContain(randomPetName());
    }
  });
});