/**
 * Sala de ejemplo para el panel de depuración (`index.html?demo=room`): simula al anfitrión con los
 * datos reales de habitats.json y aplica los movimientos que emite la escena (sin servidor).
 */
import habitats from '../../../game-data/habitats.json';
import type { RoomItem, RoomState } from '../protocol';

type Catalog = {
  rooms: { id: string; gridWidth: number; gridHeight: number; theme?: RoomState['theme'] }[];
  furniture: { id: string; name: string; room: string; footprint?: [number, number]; mount?: 'floor' | 'wall'; interaction?: string }[];
};
const data = habitats as unknown as Catalog;

/** Colocación de ejemplo por sala (celda ancla y giro). */
const SAMPLE: Record<string, Omit<RoomItem, 'id'>[]> = {
  sala: [
    { furnitureId: 'soft_bed', x: 1, y: 1, rotation: 0 },
    { furnitureId: 'wall_shelf', x: 6, y: 0, rotation: 0 },
    { furnitureId: 'fountain_water', x: 10, y: 6, rotation: 0 },
    { furnitureId: 'toy_ball', x: 5, y: 6, rotation: 0 },
    { furnitureId: 'food_bowl', x: 3, y: 4, rotation: 0 },
    { furnitureId: 'round_rug', x: 7, y: 4, rotation: 0 },
    { furnitureId: 'wall_clock', x: 10, y: 0, rotation: 0 },
  ],
  jardin: [
    { furnitureId: 'garden_pond', x: 8, y: 2, rotation: 0 },
    { furnitureId: 'garden_bench', x: 2, y: 6, rotation: 1 },
    { furnitureId: 'flower_pot', x: 1, y: 1, rotation: 0 },
    { furnitureId: 'flower_pot', x: 12, y: 8, rotation: 0 },
    { furnitureId: 'garden_swing', x: 4, y: 1, rotation: 0 },
    { furnitureId: 'stone_lantern', x: 11, y: 5, rotation: 0 },
  ],
  santuario: [
    { furnitureId: 'shrine_altar', x: 6, y: 2, rotation: 0 },
    { furnitureId: 'crystal_lamp', x: 3, y: 3, rotation: 0 },
    { furnitureId: 'crystal_lamp', x: 10, y: 3, rotation: 0 },
    { furnitureId: 'zen_cushion', x: 6, y: 6, rotation: 0 },
    { furnitureId: 'bonsai_tree', x: 2, y: 7, rotation: 0 },
    { furnitureId: 'hanging_scroll', x: 9, y: 0, rotation: 0 },
  ],
  citafinal: [
    { furnitureId: 'final_throne', x: 6, y: 1, rotation: 0 },
    { furnitureId: 'final_garden', x: 1, y: 6, rotation: 0 },
    { furnitureId: 'star_fountain', x: 9, y: 5, rotation: 0 },
    { furnitureId: 'constellation_frame', x: 2, y: 0, rotation: 0 },
  ],
};

export const DEMO_ROOMS = data.rooms.map((r) => r.id);

export function demoRoom(roomId: string): RoomState {
  const room = data.rooms.find((r) => r.id === roomId) ?? data.rooms[0];
  return {
    id: room.id,
    gridWidth: room.gridWidth,
    gridHeight: room.gridHeight,
    theme: room.theme ?? null,
    furniture: data.furniture.map((f) => ({
      id: f.id,
      name: f.name,
      footprint: f.footprint,
      mount: f.mount,
      interaction: f.interaction as never,
    })),
    items: (SAMPLE[room.id] ?? []).map((it, k) => ({ ...it, id: `${room.id}-${k}` })),
  };
}
