/**
 * Forma de una sala (celdas sin suelo). La manda el anfitrión en `setRoom.room.blocked`; si no la
 * manda (apps o backends anteriores a las formas), se usa la de habitats.json para ese id de sala,
 * que es la misma que valida el servidor.
 */
import habitats from '../../../game-data/habitats.json';
import type { BlockedRect } from '../iso/layout';

const CATALOG = new Map(
  (habitats.rooms as { id: string; blocked?: number[][] }[]).map((r) => [r.id, (r.blocked ?? []) as BlockedRect[]]),
);

export function blockedOf(room: { id: string; blocked?: BlockedRect[] | null }): BlockedRect[] {
  return room.blocked ?? CATALOG.get(room.id) ?? [];
}
