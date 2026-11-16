import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTACT_ENDPOINT, Contact } from './contact';
import { SITE_URL } from '../site.config';

describe('Contact', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function render() {
    const fixture = TestBed.createComponent(Contact);
    await fixture.whenStable();
    return fixture;
  }

  function fill(el: HTMLElement) {
    const set = (name: string, value: string) => {
      (el.querySelector(`[name="${name}"]`) as HTMLInputElement).value = value;
    };
    set('name', 'Ana');
    set('email', 'ana@example.com');
    set('subject', 'Duda');
    set('message', 'Hola, tengo una duda sobre mi Pockai.');
  }

  async function submit(fixture: Awaited<ReturnType<typeof render>>) {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('muestra el formulario y el correo directo', async () => {
    const el: HTMLElement = (await render()).nativeElement;
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('form')).not.toBeNull();
    expect(el.querySelector('a[href="mailto:contact@pockai.world"]')).not.toBeNull();
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${SITE_URL}/es/contact`,
    );
  });

  it('antes del formulario remite a las preguntas frecuentes', async () => {
    const el: HTMLElement = (await render()).nativeElement;
    expect(el.querySelector('.contact__faq a')?.getAttribute('href')).toBe('/es/#faq');
  });

  it('resalta el icono de contacto de la cabecera como página actual', async () => {
    const el: HTMLElement = (await render()).nativeElement;
    expect(el.querySelector('.contact-link')?.getAttribute('aria-current')).toBe('page');
  });

  it('envía el formulario al backend y muestra la confirmación', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const fixture = await render();
    fill(fixture.nativeElement);
    await submit(fixture);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(CONTACT_ENDPOINT);
    expect(JSON.parse(init.body)).toMatchObject({ name: 'Ana', email: 'ana@example.com', subject: 'Duda', website: '' });
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector('[role="status"]')).not.toBeNull());
  });

  it('avisa si se supera el límite de envíos (429)', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 429 }));
    const fixture = await render();
    fill(fixture.nativeElement);
    await submit(fixture);
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('demasiados'));
  });
});
