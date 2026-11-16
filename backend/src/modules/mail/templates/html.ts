/** Utilidades de HTML para los correos: escape, limpieza básica y versión en texto plano. */

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para insertarlo en HTML (contenido o atributo entre comillas). */
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ENTITIES[c]);

/**
 * Higiene mínima del HTML libre que escribe el staff en el panel: los clientes de correo ya
 * ignoran scripts, pero así el HTML guardado tampoco los lleva (y la vista previa del panel se
 * pinta en un iframe sin scripts de todas formas). No es un sanitizador completo: el autor es staff.
 */
export function stripDangerousHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/<(iframe|object|embed|form|base|meta|link)\b[^>]*>([\s\S]*?<\/\1\s*>)?/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["']?)\s*(javascript|vbscript|data):[^"'\s>]*\2/gi, '$1="#"');
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/** Convierte HTML en texto plano legible (parte text/plain del correo). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi, (_m, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
      return text && text !== href ? `${text} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|blockquote)\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+|#39);/gi, (m, e: string) => {
      if (NAMED[e.toLowerCase()] !== undefined) return NAMED[e.toLowerCase()];
      if (e.startsWith('#x') || e.startsWith('#X')) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10));
      return m;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
