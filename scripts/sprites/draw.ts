/**
 * Tipos de dibujo que comparten las poses y el rasterizador de pixel art (`pixel/`).
 *
 * Las hojas que hornean los clientes tienen dos imágenes:
 *  - base:  gris que multiplica al color (sombreado) o color literal;
 *  - mask:  canales de color — R = primario, G = secundario, B = zona de patrón.
 *           Negro puro (0,0,0) con alfa = "color literal": el cliente usa el color de base.png
 *           tal cual (ojos, boca y efectos como lágrimas, corazones, chispas o la comida).
 */
export interface Palette {
  primary: string;
  secondary: string;
}

export type Eyes =
  | 'open'
  | 'closed'
  | 'happy'
  | 'sad'
  | 'cry'
  | 'half'
  | 'x'
  | 'star'
  | 'wide'
  | 'angry'
  | 'heart';

export type Mouth =
  | 'smile'
  | 'grin'
  | 'open'
  | 'o'
  | 'frown'
  | 'flat'
  | 'chew'
  | 'wavy'
  | 'yawn';

/** Anclas de la cara en el espacio del frame de 128 px. */
export interface FaceAnchors {
  /** Ojo cercano (izquierda de la pantalla). */
  l: [number, number];
  /** Ojo lejano (derecha de la pantalla, junto al contorno). */
  r: [number, number];
  /** Radio del ojo. */
  er: number;
  mouth: [number, number];
}

export type FxKind =
  | 'zzz'
  | 'heart'
  | 'star'
  | 'sparkle'
  | 'note'
  | 'sweat'
  | 'drop'
  | 'bubble'
  | 'impact'
  | 'ring'
  | 'puff'
  | 'plus'
  | 'arrow'
  | 'swirl'
  | 'exclaim'
  | 'confetti'
  | 'speed'
  | 'thought'
  | 'glow'
  | 'crumb';

export interface Fx {
  k: FxKind;
  x: number;
  y: number;
  /** Escala (1 = tamaño normal). */
  s?: number;
  /** Opacidad. En pixel art no hay transparencias parciales: por debajo de 0,3 no se pinta. */
  a?: number;
  /** Parámetro libre: rotación, radio, color… según el efecto. */
  r?: number;
  c?: string;
  /** Dibujar detrás del personaje (halos de luz). */
  b?: boolean;
}
