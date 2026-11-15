import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from '../../app';
import { isPlainClick, toRouterUrl } from './internal-links';

const ORIGIN = 'https://pockai.example';

describe('toRouterUrl', () => {
  it('convierte enlaces del mismo idioma en rutas del router', () => {
    expect(toRouterUrl(`${ORIGIN}/es/arena`, ORIGIN, '/es/')).toBe('/arena');
    expect(toRouterUrl(`${ORIGIN}/es/`, ORIGIN, '/es/')).toBe('/');
    expect(toRouterUrl(`${ORIGIN}/es`, ORIGIN, '/es/')).toBe('/');
    expect(toRouterUrl(`${ORIGIN}/es/lore#coliseo`, ORIGIN, '/es/')).toBe('/lore#coliseo');
    expect(toRouterUrl(`${ORIGIN}/es/?a=1#descargar`, ORIGIN, '/es/')).toBe('/?a=1#descargar');
  });

  it('deja al navegador otro idioma, otro origen, el panel y los ficheros', () => {
    expect(toRouterUrl(`${ORIGIN}/en/arena`, ORIGIN, '/es/')).toBeNull();
    expect(toRouterUrl('https://otro.example/es/arena', ORIGIN, '/es/')).toBeNull();
    expect(toRouterUrl(`${ORIGIN}/es/admin/login`, ORIGIN, '/es/')).toBeNull();
    expect(toRouterUrl(`${ORIGIN}/es/og/home-es.png`, ORIGIN, '/es/')).toBeNull();
    expect(toRouterUrl('mailto:hola@pockai.example', ORIGIN, '/es/')).toBeNull();
  });
});

describe('isPlainClick', () => {
  const anchor = (attrs: Record<string, string> = {}) => {
    const a = document.createElement('a');
    a.href = '/es/arena';
    for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
    return a;
  };
  const click = (init: MouseEventInit = {}) => new MouseEvent('click', { button: 0, ...init });

  it('acepta un clic normal y rechaza modificadores, pestañas nuevas y el selector de idioma', () => {
    expect(isPlainClick(click(), anchor())).toBe(true);
    expect(isPlainClick(click({ ctrlKey: true }), anchor())).toBe(false);
    expect(isPlainClick(click({ metaKey: true }), anchor())).toBe(false);
    expect(isPlainClick(click({ button: 1 }), anchor())).toBe(false);
    expect(isPlainClick(click(), anchor({ target: '_blank' }))).toBe(false);
    expect(isPlainClick(click(), anchor({ download: '' }))).toBe(false);
    expect(isPlainClick(click(), anchor({ hreflang: 'en' }))).toBe(false);
  });
});

describe('App — navegación sin recarga', () => {
  it('navega con el router al pulsar un enlace interno y no recarga la página', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const base = document.baseURI.replace(/[^/]*$/, '');
    const a = document.createElement('a');
    a.href = `${base}arena`;
    document.body.appendChild(a);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    a.dispatchEvent(event);
    a.remove();

    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/arena');
  });
});
