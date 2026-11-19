/**
 * Sonidos del Pockai (spec 40, F1). Hermana de `clipsForPetAction`: cada clip de reacción tiene su
 * sonido, así suena igual en el escritorio (PetView) y en la escena incrustada (Android, iOS), venga
 * la reacción de un aviso del backend o de un gesto local (dar de comer, soltarlo, acariciarlo).
 *
 * Los ids son de shared/game-data/sounds.json. Un id sin fichero todavía no suena (no falla).
 * La voz se varía con `voiceForPet` (etapa, especie, elemento, rareza, humor).
 */
import type { Element, Rarity, VoiceMood, VoiceStage, VoiceTraits } from '@pockai/audio/profiles';
import speciesData from '../../../game-data/species.json';

/** Clip de reacción → sonido. Los clips de bucle (idle, walk, sleep…) no van aquí. */
export const CLIP_SOUNDS: Record<string, string> = {
  eat: 'pet.eat.crunch',
  clean: 'pet.clean.scrub',
  heal: 'pet.heal.relief',
  wake: 'pet.wake.stretch',
  happy: 'pet.happy.chirp',
  love: 'pet.love.purr',
  sad: 'pet.sad.whimper',
  cry: 'pet.cry',
  surprised: 'pet.surprised',
  tired: 'pet.tired.sigh',
  talk: 'pet.talk.babble',
  dance: 'pet.dance.steps',
  celebrate: 'pet.laugh',
  victory: 'pet.victory.cheer',
  defeat: 'pet.defeat.groan',
  attack: 'pet.attack.grunt',
  hit: 'pet.hit.hurt',
  land: 'pet.land',
  climb: 'pet.climb.scrabble',
  drag: 'pet.drag.lift',
};

/** Sonido de un clip al empezar (o `null` si no tiene). */
export function soundForClip(clip: string): string | null {
  return CLIP_SOUNDS[clip] ?? null;
}

/** Sonidos que acompañan a un aviso `pet:action` además de los de sus clips. */
const ACTION_EXTRAS: Record<string, (c: Record<string, unknown> | null | undefined) => string[]> = {
  cleaned: () => ['pet.clean.bubbles'],
  sick: () => ['pet.sick.cough'],
  slept: () => ['pet.sleep.yawn'],
};

export function extraSoundsForPetAction(action: string, context?: Record<string, unknown> | null): string[] {
  return ACTION_EXTRAS[action]?.(context) ?? [];
}

const SPECIES = new Map(
  (speciesData as Array<{ id: string; element?: string; rarity?: string }>).map((s) => [s.id, s]),
);

const ELEMENTS = new Set(['fire', 'water', 'plant', 'electric', 'shadow', 'light']);
const RARITIES = new Set(['normal', 'rare', 'super_rare', 'legendary', 'mythic']);
const STAGES = new Set(['egg', 'baby', 'juvenile', 'adult', 'final']);

/** Estado base de la mascota (AnimationController) → humor de la voz. */
export function moodForBase(base: string | null | undefined): VoiceMood {
  switch (base) {
    case 'sick':
      return 'sick';
    case 'sad':
    case 'hungry':
      return 'sad';
    case 'tired':
    case 'sleep':
      return 'sleepy';
    default:
      return 'neutral';
  }
}

/** Rasgos de voz de un Pockai a partir de lo que saben los clientes (id de especie, etapa, shiny). */
export function voiceForPet(p: { speciesId?: string | null; stage?: string | null; shiny?: boolean | null; mood?: VoiceMood }): VoiceTraits {
  const sp = p.speciesId ? SPECIES.get(p.speciesId) : undefined;
  const traits: VoiceTraits = {};
  if (p.speciesId) traits.species = p.speciesId;
  if (p.stage && STAGES.has(p.stage)) traits.stage = p.stage as VoiceStage;
  if (sp?.element && ELEMENTS.has(sp.element)) traits.element = sp.element as Element;
  if (sp?.rarity && RARITIES.has(sp.rarity)) traits.rarity = sp.rarity as Rarity;
  if (p.shiny) traits.shiny = true;
  if (p.mood) traits.mood = p.mood;
  return traits;
}
