/**
 * Motor de efectos del escritorio (skill pockai-effect-architect).
 *
 * Un efecto es pixel art procedural: se dibuja en una rejilla nativa (como los sprites, a 64 px de
 * base) y se escala ×`scale` entero con `image-rendering: pixelated`. No depende de assets: se tiñe
 * con la rampa del Flujo del Éter del Pockai (`palettes.ts`).
 *
 * El tiempo va por fases con nombre. Una fase con `ms: 'hold'` no tiene duración fija: dura hasta
 * que quien lo controla llama a `release()` (p. ej. hasta que la mascota termina de entrar).
 */

/** Rampa de 5 tonos + los dos del vacío del Éter (iguales para todos los elementos). */
export interface FxPalette {
  outline: string;
  deep: string;
  mid: string;
  light: string;
  glow: string;
  void0: string;
  void1: string;
}

export interface FxPhase {
  name: string;
  /** Duración en ms, o `'hold'` para esperar a `release()`. */
  ms: number | 'hold';
}

/** Dónde se pinta: `set(x, y, color)` en coordenadas nativas. Lo que queda fuera se ignora. */
export interface PixelSink {
  readonly width: number;
  readonly height: number;
  set(x: number, y: number, color: string): void;
}

export interface FxFrame {
  phase: string;
  /** Progreso 0..1 dentro de la fase (en una fase `hold` siempre 0). */
  t: number;
  /** ms desde el inicio del efecto, cuantizados a la cadencia del efecto (aspecto pixel art). */
  time: number;
  palette: FxPalette;
  seed: number;
  /** Datos del momento (nivel alcanzado, etapa…); cada efecto documenta los suyos. */
  params: Record<string, string | number>;
  /** Movimiento reducido: el dibujo debe quedarse quieto (solo cambia la opacidad). */
  reduced: boolean;
}

export interface EffectDef {
  id: string;
  /** Qué representa en el lore, en una frase (lo lee check_effects). */
  lore: string;
  /** Tamaño nativo de la rejilla. */
  width: number;
  height: number;
  /** Escala entera al pintarlo en pantalla. */
  scale: number;
  /** Punto de anclaje (nativo): se coloca sobre la coordenada que pida quien lo lanza. */
  anchor: { x: number; y: number };
  /** Puntos con nombre (nativos) para sincronizar a la mascota: boca del portal, etc. */
  points: Record<string, { x: number; y: number }>;
  phases: FxPhase[];
  /** Fases cortas para `prefers-reduced-motion` (mismos nombres). */
  reducedPhases: FxPhase[];
  /**
   * Fases según los datos del momento (p. ej. saltar la Promesa si no hubo garantía). Mismos nombres
   * que `phases`; las que no tocan, con `ms: 0`. Si no está, se usan `phases` / `reducedPhases`.
   */
  phasesFor?(params: Record<string, string | number>, reduced: boolean): FxPhase[];
  /** Cadencia del dibujo (fps). 12 da el tacto de los sprites. */
  fps: number;
  draw(sink: PixelSink, frame: FxFrame): void;
  /**
   * Canal en PetView: `moment` (por defecto) = uno grande a la vez; `minor` = pequeño y frecuente,
   * convive con otros y no bloquea a la mascota; `ambient` = bucle que dura mientras su condición.
   */
  channel?: 'moment' | 'minor' | 'ambient';
  /** Delante o detrás de la mascota (por defecto, detrás). */
  layer?: 'behind' | 'front';
  /**
   * Peso del momento: si hay otro efecto de la mascota en curso, el de más peso se queda y el de
   * menos se descarta (evolución > subida de nivel). Por defecto 1.
   */
  priority?: number;
  /** Opacidad global por fase (para el fundido con movimiento reducido). Por defecto 1. */
  opacity?(frame: FxFrame): number;
}
