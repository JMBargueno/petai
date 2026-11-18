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

  it('enlaza el formulario de contacto con un icono de correo junto al CTA', async () => {
    const el = await render();
    const link = el.querySelector('.header-end a.contact-link');
    expect(link?.getAttribute('href')).toBe('/es/contact');
    expect(link?.getAttribute('aria-label')).toBe('Contacto');
    expect(link?.querySelector('svg')).not.toBeNull();
    expect(link?.hasAttribute('aria-current')).toBe(false);
  });

  it('marca el idioma actual', async () => {
    const el = await render();
    const current = [...el.querySelectorAll('.lang a[aria-current]')].map((a) => a.textContent?.trim());
    expect(new Set(current)).toEqual(new Set(['ES']));
  });
});

describe('SiteHeader — páginas', () => {
  it('separa las páginas del sitio de las anclas y marca la actual', async () => {
    const fixture = TestBed.createComponent(SiteHeader);
    fixture.componentRef.setInput('links', [{ href: '#a', label: 'A' }]);
    fixture.componentRef.setInput('pages', [
      { href: '/es/', label: 'Inicio' },
      { href: '/es/lore', label: 'Mundo', current: true },
    ]);
    fixture.componentRef.setInput('cta', { href: '#d', label: 'Descargar' });
    fixture.componentRef.setInput('home', '/es/');
    fixture.componentRef.setInput('homeLabel', 'Pockai, inicio');
    fixture.componentRef.setInput('navLabel', 'Principal');
    fixture.componentRef.setInput('locale', 'es');
    fixture.componentRef.setInput('langHrefs', { es: '/es/', en: '/en/' });
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const lists = el.querySelectorAll('.site-menu__list');
    expect(lists.length).toBe(2);
    expect([...lists[1].querySelectorAll('a')].map((a) => a.textContent?.trim())).toEqual(['Inicio', 'Mundo']);
    expect(el.querySelector('.site-menu__page[aria-current="page"]')?.textContent?.trim()).toBe('Mundo');
    expect(lists[0].querySelector('a[aria-current]')).toBeNull();
  });
});
