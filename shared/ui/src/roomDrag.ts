/** Llevar al Pockai en la mano dentro de una sala (la app decide qué hace con él al soltarlo). */
export interface RoomPetDrag {
  contains(x: number, y: number): boolean;
  grab(x: number, y: number): boolean;
  move(x: number, y: number): void;
  release(x: number, y: number): void;
  cancel(): void;
  setHidden(hidden: boolean): void;
}
