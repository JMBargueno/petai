/**
 * Imágenes pintadas de las capas (`shared/assets/story-layers/<id>.webp`, generadas con
 * `scripts/art/story-layers`). Vite resuelve las URLs en build, así que el bundle embed las lleva
 * consigo. Una capa sin imagen se dibuja con su silueta procedural (`model.ts`).
 */
const FILES = import.meta.glob('../../../assets/story-layers/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const BY_ID = new Map<string, string>();
for (const [file, url] of Object.entries(FILES)) {
  const id = /\/([a-z0-9-]+)\.webp$/.exec(file)?.[1];
  if (id) BY_ID.set(id, url);
}

/** URL de la imagen pintada de una capa, o `null` si aún no tiene. */
export function layerUrl(layerId: string): string | null {
  return BY_ID.get(layerId) ?? null;
}
