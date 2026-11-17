import { LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE_CONFIG, SiteConfig, SiteConfigService } from '../shared/site-config/site-config';
import { Maintenance, MaintenanceMode } from './maintenance';

describe('Maintenance', () => {
  async function render(mode: MaintenanceMode, message: { es: string | null; en: string | null }, locale = 'es') {
    const config = signal<SiteConfig>({
      ...DEFAULT_SITE_CONFIG,
      maintenance: { enabled: true, scope: 'all', message },
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCALE_ID, useValue: locale },
        { provide: SiteConfigService, useValue: { config, load: async () => config() } },
      ],
    });
    const fixture = TestBed.createComponent(Maintenance);
    fixture.componentRef.setInput('mode', mode);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('mantenimiento manual: mensaje del panel en el idioma de la página, formulario y acceso del equipo', async () => {
    const el = await render('maintenance', { es: 'Volvemos a las 18:00', en: 'Back at 6pm' }, 'en-US');
    expect(el.querySelector('.lead')?.textContent).toContain('Back at 6pm');
    expect(el.querySelector('.bottom__contact-btn')).not.toBeNull();
    expect(el.querySelector('dialog')).not.toBeNull();
    expect(el.querySelector('.staff')?.getAttribute('href')).toBe('admin/login');
  });

  it('sin mensaje en ese idioma: texto por defecto', async () => {
    const el = await render('maintenance', { es: 'Volvemos a las 18:00', en: null }, 'en');
    expect(el.querySelector('.lead')?.textContent).not.toContain('18:00');
    expect(el.querySelector('.lead')?.textContent?.trim().length).toBeGreaterThan(10);
  });

  it('backend caído: correo y redes, sin formulario ni acceso del equipo', async () => {
    const el = await render('down', { es: 'No debería verse', en: null });
    expect(el.querySelector('.lead')?.textContent).not.toContain('No debería verse');
    expect(el.querySelector<HTMLAnchorElement>('.bottom__email')?.getAttribute('href')).toBe('mailto:contact@pockai.world');
    expect(el.querySelectorAll('.social__link').length).toBeGreaterThan(0);
    expect(el.querySelector('.bottom__contact-btn')).toBeNull();
    expect(el.querySelector('dialog')).toBeNull();
    expect(el.querySelector('.staff')).toBeNull();
    expect(el.querySelector('button')).not.toBeNull(); // reintentar
  });
});
