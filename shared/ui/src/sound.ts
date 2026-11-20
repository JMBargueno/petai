/**
 * Puerto de sonido de la biblioteca. Las pantallas que son un juego (la Cocina, los minijuegos…)
 * piden efectos por su id (`cook.serve`, `mg.countdown.go`…), pero no saben cómo suenan: cada app
 * instala aquí su motor con `setUiSound`. Sin motor instalado no suena nada, y la pantalla funciona
 * igual. Su forma es la de `SoundEngine` de `@pockai/audio` y la que piden los minijuegos.
 */
export interface UiSoundOptions {
  rate?: number;
  gainDb?: number;
  delayMs?: number;
  pan?: number;
  note?: number;
  step?: number;
}

export interface UiSound {
  /** Un efecto. Devuelve si ha sonado (un id sin fichero no suena). */
  sfx(id: string, opts?: UiSoundOptions): boolean;
  /** Un efecto en bucle; `key` lo identifica para pararlo (por defecto, su id). */
  loop(id: string, opts?: UiSoundOptions & { key?: string }): boolean;
  stopLoop(key: string, fadeMs?: number): void;
}

let installed: UiSound | null = null;

/** Lo llama cada app al arrancar. */
export function setUiSound(sound: UiSound | null): void {
  installed = sound;
}

/** Un fallo del motor nunca rompe la pantalla. */
export function uiSfx(id: string, opts?: UiSoundOptions): boolean {
  try {
    return installed?.sfx(id, opts) ?? false;
  } catch {
    return false;
  }
}

export function uiLoop(id: string, opts?: UiSoundOptions & { key?: string }): boolean {
  try {
    return installed?.loop(id, opts) ?? false;
  } catch {
    return false;
  }
}

export function uiStopLoop(key: string, fadeMs?: number): void {
  try {
    installed?.stopLoop(key, fadeMs);
  } catch {
    /* el sonido es un extra */
  }
}
