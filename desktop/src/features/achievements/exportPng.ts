/**
 * Exportación de la constelación a PNG (feature 008 / US6). Rasteriza el SVG ya renderizado por
 * `ConstellationView` a una imagen PNG que refleja SOLO las estrellas iluminadas (logros
 * desbloqueados), junto con el nombre del jugador. No incluye datos privados ni progreso no
 * desbloqueado.
 */

export interface ExportOptions {
  svgId: string;
  playerName: string;
  categoryLabel: string;
  width?: number;
  height?: number;
  background?: string;
}

/**
 * Genera el PNG y dispara la descarga. Devuelve la URL `data:` resultante (útil para tests).
 *
 * Proceso:
 *  1. Localiza el `<svg>` por `id` en el DOM y clona su contenido.
 *  2. Oculta las estrellas no desbloqueadas (solo `data-status="unlocked"` queda visible).
 *  3. Serializa el SVG a `image/svg+xml`, lo dibuja en un `<canvas>` con un encabezado (nombre +
 *     categoría) y lo convierte a `image/png`.
 */
export async function exportConstellationToPng(opts: ExportOptions): Promise<string> {
  const { svgId, playerName, categoryLabel } = opts;
  const width = opts.width ?? 900;
  const height = opts.height ?? 600;
  const background = opts.background ?? '#0a0d15';

  const svgEl = document.getElementById(svgId);
  if (!svgEl) throw new Error(`SVG no encontrado: ${svgId}`);

  const clone = svgEl.cloneNode(true) as SVGSVGElement;

  // Solo se exportan las estrellas iluminadas.
  clone.querySelectorAll('[data-status]').forEach((node) => {
    if (node.getAttribute('data-status') !== 'unlocked') {
      (node as Element).style.display = 'none';
    }
  });

  // Asegura namespace y tamaño para la serialización.
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const svgData = new XMLSerializer().serializeToString(clone);
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`;

  const img = await loadImage(svgUrl);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo obtener el contexto 2D del canvas');

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  // Encabezado con nombre del jugador y categoría (datos no privados).
  ctx.fillStyle = '#e7eaf2';
  ctx.font = `bold ${Math.round(width * 0.05)}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(playerName || 'Jugador', Math.round(width * 0.05), Math.round(height * 0.05));
  ctx.font = `${Math.round(width * 0.03)}px sans-serif`;
  ctx.fillStyle = '#8a90a6';
  ctx.fillText(categoryLabel, Math.round(width * 0.05), Math.round(height * 0.12));

  // Dibuja la constelación (centrada).
  const margin = Math.round(height * 0.2);
  ctx.drawImage(img, 0, margin, width, height - margin);

  return canvas.toDataURL('image/png');
}

/** Descarga un `data:` PNG con el nombre de archivo indicado. */
export function downloadPng(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e instanceof Error ? e : new Error('Error al cargar el SVG'));
    img.src = src;
  });
}
