/**
 * Tipos comunes del generador de sprites: la pose de un frame y las etapas.
 *
 * El dibujo de cada especie vive en `pixel/species.ts` (pixel art, GUIA_ARTISTICA §7.5). La pose
 * (`Pose`) mueve cuerpo, extremidades, cola, apéndices y cara; los efectos van aparte. Sus
 * distancias están en el espacio del frame de 128 px: el rasterizador las pasa a px nativos.
 */
import type { Eyes, FaceAnchors, Fx, Mouth } from './draw';

export interface Pose {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  rot: number;
  eyes: Eyes;
  mouth: Mouth;
  look: number;
  /** Ángulo del brazo trasero y delantero (grados; positivo = levantar). */
  armL: number;
  armR: number;
  /** Fase de piernas (-1..1) para andar/colgar. */
  leg: number;
  /** Sentado (piernas hacia delante). */
  sit: boolean;
  /** Giro de la cola (grados). */
  tail: number;
  /** Escala y giro de apéndices (branquias, pétalos, llama). */
  app: number;
  appRot: number;
  blush: boolean;
  tears: number;
  /** Comida delante de la boca: -1 = ninguna, 0..3 = mordiscos. */
  food: number;
  fx: Fx[];
}

export const pose = (o: Partial<Pose> = {}): Pose => ({
  dx: 0,
  dy: 0,
  sx: 1,
  sy: 1,
  rot: 0,
  eyes: 'open',
  mouth: 'smile',
  look: 0,
  armL: 0,
  armR: 0,
  leg: 0,
  sit: false,
  tail: 0,
  app: 1,
  appRot: 0,
  blush: false,
  tears: 0,
  food: -1,
  fx: [],
  ...o,
});

export type Stage = 'baby' | 'juvenile' | 'adult' | 'final';
export const STAGES: Stage[] = ['baby', 'juvenile', 'adult', 'final'];

/**
 * Lo que las poses necesitan saber de una especie para colocar efectos, en el espacio de 128 px.
 * Lo calcula `poseArt` (`pixel/species.ts`) a partir de la geometría de cada etapa.
 */
export interface SpeciesArt {
  id: string;
  /** Anclas de la cara. */
  face: FaceAnchors;
  /** Punto sobre la cabeza (para efectos como zzz o anillos). */
  top: [number, number];
}
