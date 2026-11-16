import { renderEmailLayout } from './layout';
import { escapeHtml, htmlToText, stripDangerousHtml } from './html';

describe('plantilla de correo', () => {
  const base = { webUrl: 'https://pockai.world/', subject: 'Asunto', bodyHtml: '<p>Hola <strong>mundo</strong></p>' };

  it('escapa el titular, la etiqueta y la nota', () => {
    const { html } = renderEmailLayout({ ...base, title: '<b>x</b>', eyebrow: 'a&b', footerNote: '"nota"' });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('a&amp;b');
    expect(html).toContain('&quot;nota&quot;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('incluye logo absoluto, botón y enlace de baja', () => {
    const { html, text } = renderEmailLayout({
      ...base,
      cta: { label: 'Entrar', url: 'https://pockai.world/x?a=1&b=2' },
      unsubscribeUrl: 'https://api/unsub?t=1',
    });
    expect(html).toContain('src="https://pockai.world/icon-512.png"');
    expect(html).toContain('href="https://pockai.world/x?a=1&amp;b=2"');
    expect(html).toContain('Darme de baja');
    expect(text).toContain('Entrar: https://pockai.world/x?a=1&b=2');
    expect(text).toContain('https://api/unsub?t=1');
  });

  it('la parte de texto no lleva etiquetas', () => {
    const { text } = renderEmailLayout({ ...base, title: 'Título' });
    expect(text).toContain('TÍTULO');
    expect(text).toContain('Hola mundo');
    expect(text).not.toMatch(/<[a-z]/i);
  });
});

describe('utilidades HTML', () => {
  it('escapeHtml', () => expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'));

  it('htmlToText convierte enlaces, listas y entidades', () => {
    const t = htmlToText('<h2>Hola</h2><p>Mira <a href="https://x.y">esto</a> &amp; más</p><ul><li>uno</li><li>dos</li></ul>');
    expect(t).toContain('Hola');
    expect(t).toContain('esto (https://x.y)');
    expect(t).toContain('& más');
    expect(t).toContain('• uno');
  });

  it('stripDangerousHtml quita scripts, manejadores y javascript:', () => {
    const out = stripDangerousHtml(
      '<p onclick="alert(1)">a</p><script>alert(2)</script><a href="javascript:alert(3)">b</a><iframe src="x"></iframe><img src=x onerror=alert(4)>',
    );
    expect(out).not.toMatch(/script|onclick|onerror|javascript:|iframe/i);
    expect(out).toContain('<p>a</p>');
  });
});
