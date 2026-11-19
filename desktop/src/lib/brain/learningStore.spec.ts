import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { BEHAVIOR_LABEL, LEARNING_CONFIG, describeLearned, petLearned, rememberLearned, resetLearnedForTests, rewardBehavior, useLearnedOf } from './learningStore';
import { DESK_CONFIG } from './deskConfig';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('lo aprendido en el escritorio', () => {
  beforeEach(() => resetLearnedForTests());

  it('todas las conductas tienen nombre para enseñarlas', () => {
    for (const id of Object.keys(DESK_CONFIG.behaviors)) expect(BEHAVIOR_LABEL[id], id).toBeTruthy();
  });

  it('aplica el gesto al momento y lo envía al servidor, que manda', async () => {
    useLearnedOf('p1');
    const send = vi.fn(async () => ({ prefs: { dance: 0.5 } }));
    expect(rewardBehavior('dance', 'pet', send)).toBe(true);
    expect(get(petLearned).dance).toBeCloseTo(LEARNING_CONFIG.rate, 5);
    expect(send).toHaveBeenCalledWith('p1', 'dance', 'pet');
    await flush();
    expect(get(petLearned)).toEqual({ dance: 0.5 });
  });

  it('sin red lo aprendido sigue valiendo en la sesión', async () => {
    useLearnedOf('p1');
    rewardBehavior('dance', 'pet', async () => {
      throw new Error('sin red');
    });
    await flush();
    expect(get(petLearned).dance).toBeGreaterThan(0);
  });

  it('no aprende sin mascota, sin conducta o de una conducta inventada', () => {
    const send = vi.fn(async () => null);
    expect(rewardBehavior('dance', 'pet', send)).toBe(false);
    useLearnedOf('p1');
    expect(rewardBehavior(null, 'pet', send)).toBe(false);
    expect(rewardBehavior('inventada', 'pet', send)).toBe(false);
    expect(rewardBehavior('dance', 'gesto_raro', send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('al cambiar de mascota empieza de cero y una respuesta tardía de la anterior no se cuela', async () => {
    useLearnedOf('p1');
    let resolve: (v: { prefs: Record<string, number> }) => void = () => {};
    rewardBehavior('dance', 'pet', () => new Promise((r) => (resolve = r)));
    useLearnedOf('p2');
    expect(get(petLearned)).toEqual({});
    resolve({ prefs: { dance: 0.9 } });
    await flush();
    expect(get(petLearned)).toEqual({});
  });

  it('toma lo que dice el servidor de la mascota activa y descarta lo que no reconoce', () => {
    useLearnedOf('p1');
    rememberLearned('otra', { learned: { prefs: { dance: 0.4 } } });
    expect(get(petLearned)).toEqual({});
    rememberLearned('p1', { learned: { prefs: { dance: 0.4, inventada: 1 } } });
    expect(get(petLearned)).toEqual({ dance: 0.4 });
    rememberLearned('p1', { dimensions: {} });
    expect(get(petLearned)).toEqual({ dance: 0.4 });
  });

  it('lo cuenta en palabras: lo que gusta y lo que no', () => {
    expect(describeLearned({ dance: 0.5, climb: -0.4, stroll: 0.05 })).toEqual({ likes: ['bailar'], dislikes: ['trepar'] });
    expect(describeLearned(undefined)).toEqual({ likes: [], dislikes: [] });
  });
});
