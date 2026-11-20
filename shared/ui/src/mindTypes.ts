/** Tipos del cerebro del Pockai (spec 36), compartidos por las apps. */

export type MindDimension = 'curiosity' | 'sociability' | 'bravery' | 'affection' | 'temper';
export type MemoryLayer = 'episodic' | 'semantic' | 'emotional';

export interface MindDimensionView {
  /** 0-100. */
  value: number;
  /** Tramo de 20 puntos (p. ej. `curious`). */
  keyword: string;
  /** Nombre del tramo en castellano (p. ej. `Curioso`). */
  label: string;
}

export interface MindLifeEntry {
  id: string;
  kind: string;
  content: string;
  createdAt: string;
}

export interface PetMind {
  petId: string;
  dimensions: Record<MindDimension, MindDimensionView>;
  legacy: { trait: string; temperament: string };
  mood: string;
  /** Ánimo de corto plazo: lo que le acaba de pasar. Ausente con un servidor anterior. */
  feeling?: { label: string; valence: number; arousal: number } | null;
  /** Lo que ha aprendido que te gusta verle hacer: conducta → de -1 a 1. Ausente con un servidor anterior. */
  learned?: { prefs: Record<string, number> };
  bondingTier: string;
  intelligenceTier: 'chat' | 'memory' | 'agent';
  memory: { counts: Record<MemoryLayer, number>; capacity: Record<MemoryLayer, number> | null };
  recentLife: MindLifeEntry[];
}

export interface PetMemoryItem {
  id: string;
  /** fact, summary, habit, event, encounter, relation… */
  kind: string;
  /** Recuerdos anteriores a la spec 36 pueden no traerla: se deduce de `kind`. */
  layer?: string | null;
  importance?: number;
  /** -1 (negativo) … 1 (positivo); solo tiene sentido en la capa emocional. */
  valence?: number | null;
  subject?: string | null;
  content: string;
  createdAt: string;
}
