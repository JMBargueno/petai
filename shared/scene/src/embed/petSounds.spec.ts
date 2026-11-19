import { describe, expect, it } from 'vitest';
import type { LoopOptions, PlayOptions } from '@pockai/audio';
import { EmbedPetSounds, type PetSoundSink } from './petSounds';

function sink() {
  const log: string[] = [];
  const opts: PlayOptions[] = [];
  const s: PetSoundSink = {
    play: (id: string, o?: PlayOptions) => {
      log.push(`play ${id}`);
      opts.push(o ?? {});
      return true;
    },
    loop: (id: string, o?: LoopOptions) => {
      log.push(`loop ${id} ${o?.key}`);
      return true;
    },
    stopLoop: (key: string) => {
      log.push(`stop ${key}`);
    },
  };
  return { s, log, opts };
}

const PET = { species: 'axolunar', stage: 'baby' as const, palette: { primary: '#000', secondary: '#fff' }, visualSeed: 1 };

describe('sonidos del Pockai en la escena incrustada', () => {
  it('petAction suena con la voz del último setPet', () => {
    const { s, log, opts } = sink();
    const ps = new EmbedPetSounds(s);
    ps.onHost({ type: 'setPet', pet: PET });
    ps.onHost({ type: 'petAction', action: 'fed' });
    expect(log).toEqual(['play pet.eat.crunch']);
    expect(opts[0]).toMatchObject({ species: 'axolunar', stage: 'baby', element: 'water' });
  });

  it('limpiar añade las burbujas después del clip', () => {
    const { s, log, opts } = sink();
    new EmbedPetSounds(s).onHost({ type: 'petAction', action: 'cleaned' });
    expect(log).toEqual(['play pet.clean.scrub', 'play pet.clean.bubbles']);
    expect(opts[1].delayMs).toBeGreaterThan(0);
  });

  it('playClip y avisos sin reacción', () => {
    const { s, log } = sink();
    const ps = new EmbedPetSounds(s);
    ps.onHost({ type: 'playClip', clip: 'love' });
    ps.onHost({ type: 'playClip', clip: 'idle' });
    ps.onHost({ type: 'petAction', action: 'vitals_critical' });
    expect(log).toEqual(['play pet.love.purr']);
  });

  it('ronca solo mientras duerme y no duplica el bucle', () => {
    const { s, log } = sink();
    const ps = new EmbedPetSounds(s);
    ps.onHost({ type: 'setActivity', activity: 'sleep' });
    ps.onHost({ type: 'setActivity', activity: 'sleep' });
    ps.onHost({ type: 'setActivity', activity: 'idle' });
    expect(log).toEqual(['loop pet.sleep.snore pet-snore', 'stop pet-snore']);
  });

  it('tocar al Pockai suena', () => {
    const { s, log } = sink();
    const ps = new EmbedPetSounds(s);
    ps.onScene({ type: 'petTapped' });
    ps.onScene({ type: 'clipEnded', clip: 'eat' });
    expect(log).toEqual(['play pet.squash.boing']);
  });
});
