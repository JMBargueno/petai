/**
 * Modelos del panel. Siguen los nombres de campo del esquema Prisma del backend
 * (Item, Species, Pet, User) para que sustituir el mock por la API sea un cambio de proveedor.
 */

export interface Entity {
  id: string;
}

export type ItemKind = 'food' | 'medicine' | 'evolution' | 'egg' | 'pass';

export interface CatalogItem extends Entity {
  name: string;
  kind: ItemKind;
  description: string;
  priceCoins: number;
  priceGems: number;
  active: boolean;
}

export type EventType = 'festival' | 'season' | 'tournament' | 'raid';

export interface GameEvent extends Entity {
  name: string;
  type: EventType;
  /** Fechas ISO (YYYY-MM-DD), ambas inclusive. */
  startDate: string;
  endDate: string;
  enabled: boolean;
  notes: string;
}

export interface AdminUser extends Entity {
  email: string;
  displayName: string;
  coins: number;
  gems: number;
  accountXp: number;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface SpeciesEntry extends Entity {
  name: string;
  description: string;
  element: string;
  rarity: string;
  hp: number;
  atk: number;
  def: number;
  vel: number;
  esp: number;
  favoriteFood: string;
  spriteKey: string;
}

export interface PetEntry extends Entity {
  nickname: string;
  speciesId: string;
  owner: string;
  rarity: string;
  level: number;
  stage: 'baby' | 'juvenile' | 'adult' | 'final';
  shiny: boolean;
  sick: boolean;
}

export const ITEM_KINDS: Record<ItemKind, string> = {
  food: 'Comida',
  medicine: 'Medicina',
  evolution: 'Evolución',
  egg: 'Huevo',
  pass: 'Pase',
};

export const EVENT_TYPES: Record<EventType, string> = {
  festival: 'Festividad',
  season: 'Temporada',
  tournament: 'Torneo',
  raid: 'Raid',
};

export const ELEMENTS: Record<string, string> = {
  fire: 'Fuego',
  water: 'Agua',
  plant: 'Planta',
  electric: 'Eléctrico',
  shadow: 'Sombra',
  light: 'Luz',
};

export const RARITIES: Record<string, string> = {
  normal: 'Normal',
  rare: 'Raro',
  super_rare: 'Super-raro',
  legendary: 'Legendario',
  mythic: 'Mítico',
};

export const STAGES: Record<PetEntry['stage'], string> = {
  baby: 'Bebé',
  juvenile: 'Joven',
  adult: 'Adulto',
  final: 'Forma final',
};

export const USER_STATUS: Record<AdminUser['status'], string> = {
  active: 'Activo',
  suspended: 'Suspendido',
};

export const options = (map: Record<string, string>) =>
  Object.entries(map).map(([value, label]) => ({ value, label }));

/** Estado de un evento según sus fechas y su interruptor. */
export function eventStatus(event: GameEvent, today = new Date().toISOString().slice(0, 10)) {
  if (!event.enabled) return 'Desactivado';
  if (today < event.startDate) return 'Programado';
  if (today > event.endDate) return 'Finalizado';
  return 'Activo';
}
