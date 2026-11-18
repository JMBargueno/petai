import { describe, expect, it } from 'vitest';
import { ACTIVE_PET_KEY, loadActivePetId, pickActivePet, saveActivePetId } from './activePet';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  };
}

const pets = [{ id: 'a' }, { id: 'b' }];

describe('activePet', () => {
  it('elige la mascota guardada si existe', () => {
    expect(pickActivePet(pets, 'b')).toEqual({ id: 'b' });
  });

  it('cae en la primera si la guardada ya no existe o no hay ninguna guardada', () => {
    expect(pickActivePet(pets, 'zzz')).toEqual({ id: 'a' });
    expect(pickActivePet(pets, null)).toEqual({ id: 'a' });
  });

  it('devuelve null sin mascotas', () => {
    expect(pickActivePet([], 'a')).toBeNull();
  });

  it('guarda, lee y borra la elección', () => {
    const storage = fakeStorage();
    saveActivePetId('b', storage);
    expect(storage.data[ACTIVE_PET_KEY]).toBe('b');
    expect(loadActivePetId(storage)).toBe('b');
    saveActivePetId(null, storage);
    expect(loadActivePetId(storage)).toBeNull();
  });

  it('no falla si el almacenamiento lanza', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(loadActivePetId(broken)).toBeNull();
  });
});
