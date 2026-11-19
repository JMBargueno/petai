/**
 * Arte de los minijuegos. Vite resuelve los archivos como URLs: el escritorio los sirve desde su
 * bundle y el embed los empaqueta en `dist/embed`, así Android los lleva dentro de la app.
 *
 * - Piezas y fondo propios de cada juego: `shared/assets/minigames/<juego>/` (los importa
 *   `pockai-minigame-architect`; `pnpm generate:minigames` los comprueba).
 * - Comida: los iconos de `shared/assets/items/` (los mismos de la tienda).
 *
 * Solo lo importan las vistas. La lógica no puede: el backend la compila sin navegador.
 */
const GAME_FILES = import.meta.glob('../../assets/minigames/*/*.{png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const ITEM_FILES = import.meta.glob('../../assets/items/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const byGame: Record<string, Record<string, string>> = {};
for (const [file, url] of Object.entries(GAME_FILES)) {
  const m = file.match(/minigames\/([^/]+)\/([^/]+)\.(png|webp)$/);
  if (m) (byGame[m[1]] ??= {})[m[2]] = url;
}
const items: Record<string, string> = {};
for (const [file, url] of Object.entries(ITEM_FILES)) {
  const m = file.match(/items\/([^/]+)\.png$/);
  if (m) items[m[1]] = url;
}

/** URL de una pieza del juego (`<pieza>.png`), o `undefined` si todavía no tiene arte. */
export const pieceUrl = (gameId: string, piece: string): string | undefined => byGame[gameId]?.[piece];
/** URL del fondo de arena del juego (`backdrop.webp`), o `undefined`. */
export const backdropUrl = (gameId: string): string | undefined => byGame[gameId]?.backdrop;
/** URL del icono de tarjeta del juego (`icon.png`, 32 px nativos a ×2), o `undefined` si aún no tiene. */
export const iconUrl = (gameId: string): string | undefined => byGame[gameId]?.icon;
/** URL del icono de un objeto de `foods.json`, o `undefined`. */
export const itemUrl = (itemId: string): string | undefined => items[itemId];

/**
 * Pieza de pixel art lista para colocar en la arena. Si el archivo no existe todavía, un recuadro del
 * color indicado ocupa su sitio: el juego se puede probar sin arte, y se nota que falta.
 */
export function piece(doc: Document, url: string | undefined, cls: string, fallbackColor = '#6b6485'): HTMLElement {
  if (url) {
    const img = doc.createElement('img');
    img.className = `pmg-piece ${cls}`;
    img.src = url;
    img.alt = '';
    img.draggable = false;
    img.setAttribute('aria-hidden', 'true');
    return img;
  }
  const box = doc.createElement('span');
  box.className = `pmg-piece pmg-piece--missing ${cls}`;
  box.style.background = fallbackColor;
  box.setAttribute('aria-hidden', 'true');
  return box;
}

/** Pone el fondo de arena del juego, si tiene. */
export function applyBackdrop(arena: HTMLElement, gameId: string) {
  const url = backdropUrl(gameId);
  if (!url) return;
  arena.style.backgroundImage = `url("${url}")`;
  arena.classList.add('pmg-arena--backdrop');
}
