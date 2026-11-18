import { describe, expect, it } from 'vitest';
import { isNearBottom, stickToBottom } from './chatScroll';

const box = (scrollTop: number, scrollHeight = 1000, clientHeight = 300) => ({ scrollTop, scrollHeight, clientHeight });

describe('chatScroll', () => {
  it('detecta si el usuario está al final', () => {
    expect(isNearBottom(box(700))).toBe(true);
    expect(isNearBottom(box(660))).toBe(true);
    expect(isNearBottom(box(200))).toBe(false);
  });

  it('baja al final si ya estaba abajo', () => {
    const el = box(700);
    const settle = stickToBottom(el);
    el.scrollHeight = 1200;
    settle();
    expect(el.scrollTop).toBe(1200);
  });

  it('no mueve el scroll si el usuario estaba leyendo arriba', () => {
    const el = box(100);
    const settle = stickToBottom(el);
    el.scrollHeight = 1200;
    settle();
    expect(el.scrollTop).toBe(100);
  });

  it('se puede forzar (p. ej. al enviar un mensaje propio)', () => {
    const el = box(100);
    stickToBottom(el, true)();
    expect(el.scrollTop).toBe(1000);
  });

  it('tolera que no haya elemento', () => {
    expect(() => stickToBottom(null)()).not.toThrow();
  });
});
