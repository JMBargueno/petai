// Arte de los platos de la Cocina del Santuario (spec 15): pixel art de 32×32 px nativos, guardado a
// ×2 en shared/assets/dishes/<recetaId>.png (Nano Banana → scripts/sprites/items/import.mjs
// --free-ids --out shared/assets/dishes). Una receta sin arte devuelve `null`.
const PNGS = import.meta.glob('../../assets/dishes/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const DISHES: Record<string, string> = {};
for (const [file, url] of Object.entries(PNGS)) {
  const m = file.match(/dishes\/([^/]+)\.png$/);
  if (m) DISHES[m[1]] = url;
}

/** URL del plato de una receta, o `null` si no tiene arte. */
export function dishArt(recipeId: string | null | undefined): string | null {
  return (recipeId && DISHES[recipeId]) || null;
}
