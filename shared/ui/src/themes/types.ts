/** Esquema de color resuelto: lo que se pinta (el "sistema" ya decidido). */
export type ColorScheme = 'light' | 'dark';

/**
 * Colores para lo que se dibuja en canvas o Pixi. Esos dibujos no pueden leer los tokens CSS
 * (`light-dark()` no se resuelve con getPropertyValue), así que cada tema los da en hex planos.
 */
export interface CanvasPalette {
  /** Chispas de una celebración grande (subida de nivel, objetivo cumplido). */
  sparkle: readonly string[];
  /** Confeti de una celebración pequeña (aportación, logro). */
  confetti: readonly string[];
  /** Luciérnagas del bosque. */
  firefly: string;
  /** Brasas de una hoguera. */
  ember: readonly string[];
  /** Destellos mágicos que flotan. */
  wisp: readonly string[];
  /** Estrellas y nieve. */
  star: string;
  /** Halo de luz (centro opaco) en "r, g, b". */
  glowRgb: string;
  /** Penumbra de la sala cuando el Pockai duerme con las luces apagadas. */
  nightTint: string;
  /** Resalte de lo seleccionado en un dibujo (mueble elegido). */
  accent: string;
  /** Velo de color del tema sobre la sala (sin él, la sala se ve tal cual). */
  ambient?: string;
}

export interface ThemeManifest {
  /** Valor de `data-theme` y nombre del fichero styles/themes/<id>.css (classic no tiene fichero). */
  id: string;
  name: string;
  description: string;
  /** Esquemas que admite. Con uno solo, el tema lo fuerza aunque el jugador pida el otro. */
  schemes: readonly ColorScheme[];
  /** Muestra del selector por esquema: fondo, superficie y acento. */
  swatch: Record<ColorScheme, readonly [bg: string, surface: string, accent: string]>;
  canvas: Record<ColorScheme, CanvasPalette>;
}
