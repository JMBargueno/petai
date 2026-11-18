// Iconos de los objetos consumibles (GUIA_ARTISTICA §7.7): pixel art de 32×32 px nativos, guardado
// a ×2 en shared/assets/items/<id>.png. Un objeto sin arte en este cliente devuelve `null` y quien
// lo pinta cae al icono genérico.
const PNGS = import.meta.glob('@shared/assets/items/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const ICONS: Record<string, string> = {};
for (const [file, url] of Object.entries(PNGS)) {
  const m = file.match(/items\/([^/]+)\.png$/);
  if (m) ICONS[m[1]] = url;
}

/** Lado del icono en px nativos: se enseña a múltiplos enteros (32, 64, 128). */
export const ITEM_ICON_SIZE = 32;

/** URL del icono de un objeto, o `null` si no tiene arte. */
export function itemIcon(id: string | null | undefined): string | null {
  return (id && ICONS[id]) || null;
}
