import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ComingSoon } from './coming-soon';

describe('ComingSoon', () => {
  async function render() {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(ComingSoon);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('muestra el correo de contacto y el botón de formulario en el pie', async () => {
    const fixture = await render();
    const el: HTMLElement = fixture.nativeElement;
    const emailLink = el.querySelector<HTMLAnchorElement>('.bottom__email');
    expect(emailLink).not.toBeNull();
    expect(emailLink?.getAttribute('href')).toBe('mailto:contact@pockai.world');
    expect(emailLink?.textContent).toContain('contact@pockai.world');

    const contactBtn = el.querySelector<HTMLButtonElement>('.bottom__contact-btn');
    expect(contactBtn).not.toBeNull();
  });

  it('incluye los botones de crear cuenta y ya tengo cuenta', async () => {
    const fixture = await render();
    const el: HTMLElement = fixture.nativeElement;
    const buttons = Array.from(el.querySelectorAll('.cta button'));
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('contiene los diálogos modales para autenticación y contacto', async () => {
    const fixture = await render();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('dialog[class*="dialog--dark"]')).not.toBeNull();
    expect(el.querySelectorAll('dialog').length).toBe(2);
  });
});
