import { describe, expect, it } from 'vitest';
import { soundForClick, type UiSoundTarget } from './uiSounds';

/** Elemento mínimo: etiqueta, atributos, clases y padre; `matches`/`closest` con los selectores que usa uiSounds. */
function el(tag: string, attrs: Record<string, string> = {}, parent: FakeEl | null = null, disabled = false): FakeEl {
  return new FakeEl(tag, attrs, parent, disabled);
}

class FakeEl implements UiSoundTarget {
  constructor(
    public tag: string,
    public attrs: Record<string, string>,
    public parent: FakeEl | null,
    public disabled: boolean,
  ) {}
  getAttribute(name: string) {
    return this.attrs[name] ?? null;
  }
  private one(sel: string): boolean {
    sel = sel.trim();
    if (sel === ':disabled') return this.disabled;
    const attr = /^\[([a-z-]+)(?:="([^"]*)")?\]$/.exec(sel);
    if (attr) return attr[2] === undefined ? attr[1] in this.attrs : this.attrs[attr[1]] === attr[2];
    if (sel.startsWith('.')) return (this.attrs.class ?? '').split(' ').includes(sel.slice(1));
    if (sel === 'a[href]') return this.tag === 'a' && 'href' in this.attrs;
    return this.tag === sel;
  }
  matches(selectors: string): boolean {
    return selectors.split(',').some((s) => this.one(s));
  }
  closest(selectors: string): FakeEl | null {
    for (let n: FakeEl | null = this; n; n = n.parent) if (n.matches(selectors)) return n;
    return null;
  }
}

describe('sonido de un clic de interfaz', () => {
  it('botón normal, fantasma y de icono', () => {
    expect(soundForClick(el('button', { class: 'btn btn--primary' }))).toBe('ui.tap');
    expect(soundForClick(el('button', { class: 'btn btn--ghost' }))).toBe('ui.tap_soft');
    expect(soundForClick(el('button', { class: 'btn btn--icon' }))).toBe('ui.tap_soft');
  });

  it('el icono dentro de un botón suena como el botón', () => {
    const btn = el('button', { class: 'btn' });
    expect(soundForClick(el('svg', {}, btn))).toBe('ui.tap');
  });

  it('pestañas e interruptores', () => {
    expect(soundForClick(el('button', { role: 'tab' }))).toBe('ui.tab');
    expect(soundForClick(el('button', {}, el('nav', { class: 'nav-tabs' })))).toBe('ui.tab');
    expect(soundForClick(el('button', { role: 'switch' }), true)).toBe('ui.toggle_on');
    expect(soundForClick(el('button', { role: 'switch' }), false)).toBe('ui.toggle_off');
  });

  it('data-sound manda: un id propio o silencio', () => {
    expect(soundForClick(el('button', { 'data-sound': 'ui.confirm' }))).toBe('ui.confirm');
    expect(soundForClick(el('span', {}, el('div', { 'data-sound': 'none', role: 'button' })))).toBeNull();
  });

  it('nada clicable o deshabilitado no suena', () => {
    expect(soundForClick(el('p'))).toBeNull();
    expect(soundForClick(el('button', {}, null, true))).toBeNull();
    expect(soundForClick(null)).toBeNull();
  });
});
