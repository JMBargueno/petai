/**
 * Datos del sitio que aún no son definitivos.
 * - SITE_URL: dominio público. Es un marcador hasta que exista el dominio real; se usa en
 *   canonical/hreflang y debe coincidir con la variable SITE_URL de scripts/postbuild.mjs.
 * - DOWNLOADS: enlaces de descarga. Mientras valgan null, la landing muestra "Próximamente".
 */
export const SITE_URL = 'https://pockai.example';

export const DOWNLOADS: Record<'windows' | 'android' | 'ios', string | null> = {
  windows: null,
  android: null,
  ios: null,
};
