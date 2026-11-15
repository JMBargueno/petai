import { TestBed } from '@angular/core/testing';
import { SiteHeader } from './site-header';

describe('SiteHeader', () => {
  async function render() {
    const fixture = TestBed.createComponent(SiteHeader);
    fixture.componentRef.setInput('links', [
      { href: '#a', label: 'A' },
      { href: '#b', label: 'B' },
    ]);
    fixture.componentRef.setInput('cta', { href: '#descargar', label: 'Descargar' });
    fixture.componentRef.setInput('home', '/es/');
    fixture.componentRef.setInput('homeLabel', 'Pockai, inicio');
    fixture.componentRef.setInput('navLabel', 'Principal');
    fixture.componentRef.setInput('locale', 'es');
    fixture.componentRef.setInput('langHrefs', { es: '/es/', en: '/en/' });
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('empieza con el skip link hacia #main', async () => {
    const el = await render();
    const first = el.querySelector('a');
    expect(first?.classList).toContain('skip-link');
    expect(first?.getAttribute('href')).toBe('#main');
  });

  it('la lista de navegación es un popover que abre el botón Menú (sin JS)', async () => {
    const el = await render();
    expect(el.querySelector('#site-menu')?.getAttribute('popover')).toBe('auto');
    expect(el.querySelector('button[popovertarget="site-menu"]')).not.toBeNull();
    expect(el.querySelectorAll('.site-menu__link').length).toBe(2);
  });

  it('marca el idioma actual', async () => {
    const el = await render();
    const current = [...el.querySelectorAll('.lang a[aria-current]')].map((a) => a.textContent?.trim());
    expect(new Set(current)).toEqual(new Set(['ES']));
  });
});
