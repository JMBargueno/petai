import { TestBed } from '@angular/core/testing';
import { SectionToc } from './section-toc';

describe('SectionToc', () => {
  it('pinta un chip por sección enlazando a su ancla', async () => {
    const fixture = TestBed.createComponent(SectionToc);
    fixture.componentRef.setInput('sections', [
      { id: 'uno', label: 'Uno' },
      { id: 'dos', label: 'Dos' },
    ]);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('nav.toc')?.getAttribute('aria-label')).toBe('Secciones');
    expect([...el.querySelectorAll('.toc__link')].map((a) => a.getAttribute('href'))).toEqual(['#uno', '#dos']);
  });
});
