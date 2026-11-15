import site from './site.json';

/**
 * Datos del sitio que aún no son definitivos.
 * - site.json es la única fuente del dominio y los idiomas: la leen también
 *   scripts/postbuild.mjs (sitemap, robots, llms.txt) y scripts/generate-og.mjs.
 *   El dominio es un marcador hasta que exista el real.
 * - DOWNLOADS: enlaces de descarga. Mientras valgan null, la landing muestra "Próximamente".
 *   Windows apunta al backend (`site.json` → `apiUrl`), que redirige al instalador del último release
 *   publicado en GitHub: al publicar una versión, el enlace la sirve sin redesplegar la web.
 */
export const SITE_URL = site.url.replace(/\/$/, '');
export const SITE_NAME = site.name;
export const LOCALES = site.locales as readonly string[];

/** URL canónica de una ruta pública: '' → /es/, 'lore' → /es/lore. */
export const pageUrl = (locale: string, path: string) => `${SITE_URL}/${locale}/${path}`;

/** Imagen social por defecto de cada idioma (ruta pública, sin barra inicial). */
export const OG_IMAGE = (locale: string, page = 'home') => `og/${page}-${locale}.png`;

export const DOWNLOADS: Record<'windows' | 'android' | 'ios', string | null> = {
  windows: `${site.apiUrl.replace(/\/$/, '')}/v1/desktop/download/windows`,
  android: null,
  ios: null,
};
