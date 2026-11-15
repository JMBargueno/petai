/**
 * Navegación sin recarga para la web pública.
 *
 * Los enlaces siguen siendo `<a href="/es/arena">` normales: así funcionan sin JavaScript, en
 * una pestaña nueva y para los buscadores. Al hacer clic, si el destino es una página de este
 * mismo idioma, se cancela la navegación del navegador y la hace el router de Angular: no se
 * descarga ni arranca la app otra vez y se aplica la transición de vista.
 */

/** Rutas que no pasan por el router público (el panel tiene su propio shell). */
const EXCLUDED = /^\/admin(\/|$)/;

/**
 * Convierte el `href` absoluto de un enlace en una URL del router, o devuelve `null` si el
 * navegador debe encargarse (otro origen, otro idioma, el panel, un fichero…).
 *
 * @param href  `HTMLAnchorElement.href`, ya resuelto (p. ej. `https://pockai.example/es/arena#ligas`).
 * @param origin  Origen de la página actual.
 * @param base  Base del idioma servido, con barras (p. ej. `/es/`).
 */
export function toRouterUrl(href: string, origin: string, base: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  // Otro idioma = otra compilación: hay que cargarla entera.
  if (!url.pathname.startsWith(base) && url.pathname !== base.replace(/\/$/, '')) return null;

  const path = '/' + url.pathname.slice(base.length).replace(/^\/+/, '');
  if (EXCLUDED.test(path)) return null;
  // Ficheros estáticos (sitemap.xml, imágenes…) no son rutas de la app.
  if (/\.[a-z0-9]+$/i.test(path)) return null;
  return path + url.search + url.hash;
}

/** ¿Es un clic "normal" que el router puede atender? (sin modificadores ni destino especial). */
export function isPlainClick(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    (!anchor.target || anchor.target === '_self') &&
    !anchor.hasAttribute('download') &&
    !anchor.hasAttribute('hreflang') && // el selector de idioma cambia de compilación
    anchor.getAttribute('rel')?.includes('external') !== true
  );
}
