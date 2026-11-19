import site from './site.json';

/**
 * Datos del sitio que aún no son definitivos.
 * - site.json es la única fuente del dominio y los idiomas: la leen también
 *   scripts/postbuild.mjs (sitemap, robots, llms.txt) y scripts/generate-og.mjs.
 *   El dominio es un marcador hasta que exista el real.
 * - DOWNLOADS: enlaces de las apps móviles. Mientras valgan null, la landing muestra "Próximamente".
 *   Los instaladores de escritorio (Windows y macOS) no tienen enlace fijo: solo se descargan con
 *   sesión y el correo verificado (`GET {apiUrl}/v1/desktop/download/:platform`, ver DownloadAction),
 *   que sirve siempre el último release publicado en GitHub sin redesplegar la web.
 */
export const SITE_URL = site.url.replace(/\/$/, '');
export const SITE_NAME = site.name;
export const LOCALES = site.locales as readonly string[];

/** URL canónica de una ruta pública: '' → /es/, 'lore' → /es/lore. */
export const pageUrl = (locale: string, path: string) => `${SITE_URL}/${locale}/${path}`;

/**
 * Imagen social de una página (ruta pública, sin barra inicial), en inglés para todos los
 * idiomas. La genera scripts/generate-og.mjs; `ogVersion` va en el nombre para que las redes no sirvan la caché vieja.
 */
export const OG_IMAGE = (page = 'home') => `og/${page}-v${site.ogVersion}.png`;

export const DOWNLOADS: Record<'android' | 'ios', string | null> = {
  android: null,
  ios: null,
};
