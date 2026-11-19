/**
 * Control de saturación: que un mismo sonido no se dispare en ráfaga (cooldown por id), que un bus
 * no acumule demasiadas voces a la vez y que las tomas se roten sin repetir la anterior.
 * Puro (el reloj se pasa) para poder probarlo sin WebAudio.
 */
import type { Bus } from './manifest';

export const MAX_VOICES: Record<Bus, number> = { ui: 4, sfx: 8, pet: 3, ambient: 6, music: 1 };

export class PlayGate {
  private lastPlayed = new Map<string, number>();
  private voices = new Map<Bus, number>();

  constructor(private readonly maxVoices: Record<Bus, number> = MAX_VOICES) {}

  canPlay(id: string, bus: Bus, cooldownMs: number, now: number): boolean {
    const last = this.lastPlayed.get(id);
    if (last !== undefined && now - last < cooldownMs) return false;
    return (this.voices.get(bus) ?? 0) < this.maxVoices[bus];
  }

  started(id: string, bus: Bus, now: number): void {
    this.lastPlayed.set(id, now);
    this.voices.set(bus, (this.voices.get(bus) ?? 0) + 1);
  }

  ended(bus: Bus): void {
    this.voices.set(bus, Math.max(0, (this.voices.get(bus) ?? 0) - 1));
  }

  activeVoices(bus: Bus): number {
    return this.voices.get(bus) ?? 0;
  }
}

/** Elige una toma de `count` evitando repetir `last` cuando hay más de una. */
export function pickVariant(count: number, last: number | undefined, rand: () => number = Math.random): number {
  if (count <= 1) return 0;
  let n = Math.floor(rand() * (count - 1));
  if (last !== undefined && n >= last) n += 1;
  else if (last === undefined) n = Math.floor(rand() * count);
  return Math.min(count - 1, n);
}
