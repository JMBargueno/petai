/**
 * Metadatos de hoja (`anim.json`, formato Aseprite que escribe scripts/generate-pet-sprites.ts) y
 * resolución de clips con alias y fallbacks.
 */
export interface FrameTag {
  name: string;
  from: number;
  to: number;
  direction?: string;
  loop?: boolean;
  repeat?: number;
  priority?: number;
  group?: 'base' | 'motion' | 'action';
}

export interface FrameData {
  frame: { x: number; y: number; w: number; h: number };
  duration: number;
}

export interface AnimMetadata {
  frames: FrameData[];
  meta: {
    frameTags: FrameTag[];
    size: { w: number; h: number };
    aliases?: Record<string, string>;
  };
}

/** Nombres antiguos o ausentes → clip existente. */
export const ANIM_FALLBACKS: Record<string, string> = {
  sit: 'perch',
  hurt: 'hit',
  faint: 'defeat',
  cast: 'attack',
};

export interface ResolvedClip {
  name: string;
  frames: FrameData[];
  loop: boolean;
  repeat: number;
  priority: number;
  group: 'base' | 'motion' | 'action';
}

/** Devuelve el clip pedido, su alias o `idle`. `null` solo si la hoja no tiene ni `idle`. */
export function resolveClip(anim: AnimMetadata, requested: string): ResolvedClip | null {
  const tags = anim.meta.frameTags;
  const find = (n: string | undefined) => (n ? tags.find((t) => t.name === n) : undefined);
  const tag =
    find(requested) ?? find(anim.meta.aliases?.[requested]) ?? find(ANIM_FALLBACKS[requested]) ?? find('idle') ?? tags[0];
  if (!tag) return null;
  const group = tag.group ?? 'base';
  return {
    name: tag.name,
    frames: anim.frames.slice(tag.from, tag.to + 1),
    loop: tag.loop ?? group !== 'action',
    repeat: tag.repeat ?? 1,
    priority: tag.priority ?? 0,
    group,
  };
}
