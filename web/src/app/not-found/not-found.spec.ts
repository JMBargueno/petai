import { TestBed } from '@angular/core/testing';
import { NotFound } from './not-found';

describe('NotFound', () => {
  it('muestra el código 404 y el enlace de vuelta al inicio', async () => {
    const fixture = TestBed.createComponent(NotFound);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.error-code')?.textContent?.trim()).toBe('404');
    expect(el.querySelector('.actions a')?.getAttribute('href')).toMatch(/^\/[a-z]{2}\/$/);
  });

  it('no se indexa: noindex y sin canonical', async () => {
    const fixture = TestBed.createComponent(NotFound);
    await fixture.whenStable();

    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.title).toContain('Página no encontrada');
  });
});
