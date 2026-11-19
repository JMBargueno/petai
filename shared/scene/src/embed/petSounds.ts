/**
 * Sonidos del Pockai en la escena incrustada (Android, iOS), spec 40 F1. Escucha los mensajes del
 * anfitrión y los eventos de la escena y dispara lo mismo que el escritorio:
 *
 *   - `petAction` → sonido del primer clip de la reacción + sus extras (burbujas al limpiar…);
 *   - `playClip`  → sonido de ese clip;
 *   - `setActivity: sleep` → ronquido en bucle (se para con cualquier otra actividad);
 *   - `petTapped` (evento de la escena) → boing de la caricia.
 *
 * La voz sale del último `setPet` (especie, etapa, shiny). La escena no conoce el estado base de la
 * mascota, así que aquí el humor es neutro.
 */
import type { LoopOptions, PlayOptions } from '@pockai/audio';
import { clipsForPetAction } from '../effects/clips';
import { extraSoundsForPetAction, soundForClip, voiceForPet } from '../effects/sounds';
import type { HostMessage, SceneEvent } from '../protocol';

export interface PetSoundSink {
  play(id: string, opts?: PlayOptions): boolean;
  loop(id: string, opts?: LoopOptions): boolean;
  stopLoop(key: string, fadeMs?: number): void;
}

const SNORE_KEY = 'pet-snore';

export class EmbedPetSounds {
  private voice: PlayOptions = {};
  private sleeping = false;

  constructor(private readonly sink: PetSoundSink) {}

  onHost(msg: HostMessage): void {
    switch (msg.type) {
      case 'setPet':
        this.voice = voiceForPet({ speciesId: msg.pet.species, stage: msg.pet.stage, shiny: msg.pet.shiny });
        if (this.sleeping) {
          // Nueva voz: el ronquido se rehace con ella.
          this.sink.stopLoop(SNORE_KEY, 200);
          this.sink.loop('pet.sleep.snore', { key: SNORE_KEY, ...this.voice });
        }
        break;
      case 'playClip': {
        const id = soundForClip(msg.clip);
        if (id) this.sink.play(id, this.voice);
        break;
      }
      case 'petAction': {
        const first = clipsForPetAction(msg.action, msg.context)?.[0];
        const id = first ? soundForClip(first) : null;
        if (id) this.sink.play(id, this.voice);
        extraSoundsForPetAction(msg.action, msg.context).forEach((extra, i) =>
          this.sink.play(extra, { ...this.voice, delayMs: 250 + i * 300 }),
        );
        break;
      }
      case 'setActivity': {
        const sleeping = msg.activity === 'sleep';
        if (sleeping === this.sleeping) break;
        this.sleeping = sleeping;
        if (sleeping) this.sink.loop('pet.sleep.snore', { key: SNORE_KEY, ...this.voice });
        else this.sink.stopLoop(SNORE_KEY);
        break;
      }
      default:
        break;
    }
  }

  onScene(event: SceneEvent): void {
    if (event.type === 'petTapped') this.sink.play('pet.squash.boing', this.voice);
  }
}
