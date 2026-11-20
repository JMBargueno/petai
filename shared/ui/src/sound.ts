/**
 * Puerto de sonido de la biblioteca. Las pantallas que son un juego (la Cocina…) piden efectos por
 * su id (`cook.serve`, `cook.ambient`…), pero no saben cómo suenan: cada app instala aquí su motor
 * con `setUiSound`. Sin motor instalado no suena nada, y la pantalla funciona igual.
 */
export interface UiSoundOptions {
  rate?: number;
  gainDb?: number;
  delayMs?: number;
}

export interface UiSound {
  /** Un efecto. Devuelve si ha sonado (un id sin fichero no suena). */
  sfx(id: string, opts?: UiSoundOptions): boolean;
  /** Un efecto en bucle, identificado por su id. */
  loop(id: string): boolean;
  stopLoop(id: string): void;
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

export function uiLoop(id: string): void {
  try {
    installed?.loop(id);
  } catch {
    /* el sonido es un extra */
  }
}

export function uiStopLoop(id: string): void {
  try {
    installed?.stopLoop(id);
  } catch {
    /* el sonido es un extra */
  }
}
