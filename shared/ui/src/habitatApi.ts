/**
 * Hábitat: cómo habla la pantalla con el servidor (`HabitatApi`) y lo que cada app puede añadirle
 * (`HabitatHooks`). Como Clanes, la pantalla tiene mucha lógica entre llamadas (edición de la sala,
 * compra y retirada de muebles, movimientos agrupados), así que vive entera en la biblioteca y cada
 * app le pasa este puerto.
 */
import type { Readable, Writable } from 'svelte/store';

/** Muebles que valen para cualquier sala. */
export const ANY_ROOM = '*';

export interface HabitatApi {
  getHabitatCatalog(): Promise<any>;
  getHabitat(): Promise<any>;
  getHabitatBuffs(): Promise<any>;
  /** Compra y coloca un mueble; devuelve dónde quedó (`itemId`). */
  placeHabitatFurniture(furnitureId: string, at?: { roomId: string }): Promise<{ itemId?: string } & Record<string, any>>;
  moveHabitatItem(itemId: string, to: { roomId?: string; x?: number; y?: number; rotation?: number }): Promise<{ itemId?: string } & Record<string, any>>;
  removeHabitatItem(itemId: string): Promise<unknown>;
  /** Lleva a la mascota a su hábitat o la saca; devuelve la mascota. */
  setPetInHabitat(petId: string, inHabitat: boolean): Promise<any>;
  /** Un error, en una frase para el jugador. */
  errorText(e: unknown, fallback?: string): string;
}

/** Lo que solo tiene el escritorio: todo opcional. */
export interface HabitatHooks {
  /** Muebles que tiene el jugador (desbloquean habilidades del escritorio). */
  ownedFurniture?(ids: string[]): void;
  /** Se empieza a arrastrar a la mascota fuera de la sala (hacia el escritorio). */
  petPress?(detail: any): void;
  /** Abre la sala a pantalla completa. */
  enterHabitatMode?(roomId: string | undefined): void;
  /** Fondo de la sala: paisaje pintado o solo cielo. */
  backdrop?: Writable<'painted' | 'plain'>;
  /** Lo último que dijo el entrenador visitante (`visitorId`, `line`). */
  visitorTalk?: Readable<{ visitorId: string; line: string } | null>;
}
