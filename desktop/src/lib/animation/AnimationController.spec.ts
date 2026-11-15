import { describe, expect, it, vi } from 'vitest';
import { AnimationController, frameAt, resolveBaseState, type AnimClip, type AnimLibrary } from './AnimationController';

const clip = (name: string, o: Partial<AnimClip> = {}): AnimClip => ({
  name,
  durations: [100, 100, 100, 100],
  loop: false,
  priority: 10,
  group: 'action',
  repeat: 1,
  ...o,
});

const lib: AnimLibrary = {
  idle: clip('idle', { loop: true, priority: 0, group: 'base' }),
  sleep: clip('sleep', { loop: true, priority: 0, group: 'base', durations: [400, 400] }),
  walk: clip('walk', { loop: true, priority: 10, group: 'motion' }),
  drag: clip('drag', { loop: true, priority: 90, group: 'motion' }),
  eat: clip('eat', { priority: 50 }),
  happy: clip('happy', { priority: 40, repeat: 2 }),
  level_up: clip('level_up', { priority: 95 }),
  hit: clip('hit', { priority: 75, durations: [80, 80] }),
};

describe('frameAt', () => {
  it('usa la duración de cada frame', () => {
    const c = clip('x', { durations: [100, 300, 100] });
    expect(frameAt(c, 0)).toBe(0);
    expect(frameAt(c, 99)).toBe(0);
    expect(frameAt(c, 100)).toBe(1);
    expect(frameAt(c, 399)).toBe(1);
    expect(frameAt(c, 400)).toBe(2);
  });

  it('en bucle vuelve a empezar y sin bucle se queda en el último frame', () => {
    expect(frameAt(clip('l', { loop: true }), 450)).toBe(0);
    expect(frameAt(clip('o'), 5000)).toBe(3);
  });
});

describe('AnimationController', () => {
  it('muestra la base cuando no hay movimiento ni acción', () => {
    const c = new AnimationController(lib);
    expect(c.update(16)).toEqual({ name: 'idle', frame: 0 });
    c.setBase('sleep');
    expect(c.update(16).name).toBe('sleep');
  });

  it('una acción termina, avisa con onFinish y vuelve a la base', () => {
    const c = new AnimationController(lib);
    const done = vi.fn();
    c.onFinish = done;
    c.play('eat');
    expect(c.update(0).name).toBe('eat');
    expect(c.update(250).frame).toBe(2);
    c.update(200); // 450 ms > 400 ms del clip
    expect(done).toHaveBeenCalledWith('eat');
    expect(c.current).toBe('idle');
  });

  it('respeta el número de repeticiones', () => {
    const c = new AnimationController(lib);
    c.play('happy');
    c.update(500);
    expect(c.current).toBe('happy'); // 2 × 400 ms
    c.update(400);
    expect(c.current).toBe('idle');
  });

  it('una acción de más prioridad interrumpe y la de menos entra en cola', () => {
    const c = new AnimationController(lib);
    c.play('eat');
    c.play('level_up');
    expect(c.current).toBe('level_up');
    c.play('happy'); // menor que level_up → cola
    c.update(400);
    expect(c.current).toBe('happy');
  });

  it('las secuencias de igual o menor prioridad se encadenan en orden', () => {
    const c = new AnimationController(lib);
    c.play('hit');
    c.play('eat');
    expect(c.current).toBe('hit');
    c.update(160);
    expect(c.current).toBe('eat');
  });

  it('el movimiento tapa acciones de menos prioridad pero no las de más', () => {
    const c = new AnimationController(lib);
    c.setMotion('walk');
    expect(c.update(16).name).toBe('walk');
    c.play('eat');
    expect(c.update(16).name).toBe('eat');
    c.setMotion('drag');
    expect(c.update(16).name).toBe('drag');
    c.play('level_up');
    expect(c.update(16).name).toBe('level_up');
  });

  it('resuelve alias y rechaza animaciones inexistentes', () => {
    const c = new AnimationController(lib, { hurt: 'hit' });
    expect(c.play('hurt')).toBe(true);
    expect(c.current).toBe('hit');
    expect(c.play('nope')).toBe(false);
  });

  it('stop corta la acción y vacía la cola', () => {
    const c = new AnimationController(lib);
    c.play('level_up');
    c.play('eat');
    c.stop();
    expect(c.update(16).name).toBe('idle');
  });
});

describe('resolveBaseState', () => {
  it('prioriza dormir, enfermedad y luego vitales bajos', () => {
    expect(resolveBaseState(null)).toBe('idle');
    expect(resolveBaseState({ sleeping: true, sick: true })).toBe('sleep');
    expect(resolveBaseState({ sick: true })).toBe('sick');
    expect(resolveBaseState({ hunger: 10, energy: 5 })).toBe('hungry');
    expect(resolveBaseState({ hunger: 80, energy: 5 })).toBe('tired');
    expect(resolveBaseState({ hunger: 80, energy: 80, happiness: 3 })).toBe('sad');
    expect(resolveBaseState({ hunger: 80, energy: 80, happiness: 80 })).toBe('idle');
  });
});
