/**
 * Modelos del panel. Son las respuestas de `/v1/admin/*` del backend, que siguen los nombres de
 * campo del esquema Prisma (Item, Pet, User) y del game-data (especies, festividades, temporadas).
 */

export interface Entity {
  id: string;
}

/** Tipos de objeto de la tienda (`foods.json`); el backend puede añadir otros. */
export type ItemKind = 'food' | 'medicine' | 'evolution' | (string & {});

export interface CatalogItem extends Entity {
  name: string;
  kind: ItemKind;
  description: string;
  priceCoins: number;
  priceGems: number;
}

export type EventSource = 'festival' | 'season' | 'tournament' | 'raid';

export interface GameEvent extends Entity {
  name: string;
  source: EventSource;
  /** Fechas ISO (YYYY-MM-DD), ambas inclusive. */
  startDate: string;
  endDate: string;
  enabled: boolean;
  /** Ya terminó por su estado (torneo resuelto, raid liquidada…), aunque las fechas digan otra cosa. */
  finished: boolean;
  detail: string;
}

/** Entrada del registro de auditoría del servidor (`AuditLog`). */
export interface AuditEntry {
  id: string;
  userId: string;
  userEmail: string | null;
  event: string;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminStats {
  users: { total: number; byRole: Record<string, number> };
  pets: { total: number; byRarity: Record<string, number> };
  items: number;
  upcomingEvents: GameEvent[];
}

export interface AdminUser extends Entity {
  email: string;
  displayName: string;
  coins: number;
  gems: number;
  accountXp: number;
  role: AdminRole;
  createdAt: string;
}

/** Roles del backend (`User.role`). Los permisos de cada uno los decide el servidor. */
export type AdminRole = 'superadmin' | 'admin' | 'moderator' | 'user';

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
  stage: string;
  shiny: boolean;
  sick: boolean;
  createdAt: string;
}

export const ITEM_KINDS: Record<string, string> = {
  food: 'Comida',
  medicine: 'Medicina',
  evolution: 'Evolución',
};

export const EVENT_SOURCES: Record<EventSource, string> = {
  festival: 'Festividad',
  season: 'Temporada',
  tournament: 'Torneo',
  raid: 'Raid',
};

/** Nombres legibles de `AuditLog.event`; los que no estén aquí se muestran tal cual. */
export const AUDIT_EVENTS: Record<string, string> = {
  login: 'Inicio de sesión',
  role_change: 'Cambio de rol',
  item_price_change: 'Cambio de precio',
  item_price_bulk: 'Ajuste de precios',
  invite_create: 'Invitaciones creadas',
  invite_revoke: 'Invitación revocada',
  registration_settings_change: 'Ajuste de registro',
  account_deleted: 'Cuenta borrada',
  key_created: 'Clave creada',
  key_revoked: 'Clave revocada',
  ip_change: 'Cambio de IP',
  refresh: 'Renovación de sesión',
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

export const STAGES: Record<string, string> = {
  baby: 'Bebé',
  juvenile: 'Joven',
  adult: 'Adulto',
  final: 'Forma final',
};

export const ROLES: Record<AdminRole, string> = {
  superadmin: 'SuperAdmin',
  admin: 'Admin',
  moderator: 'Moderador',
  user: 'Usuario',
};

export const options = (map: Record<string, string>) =>
  Object.entries(map).map(([value, label]) => ({ value, label }));

/** Estado de un evento según su estado en el juego y sus fechas. */
export function eventStatus(
  event: Pick<GameEvent, 'enabled' | 'finished' | 'startDate' | 'endDate'>,
  today = new Date().toISOString().slice(0, 10),
) {
  if (!event.enabled) return 'Cancelado';
  if (event.finished || today > event.endDate) return 'Finalizado';
  if (today < event.startDate) return 'Programado';
  return 'Activo';
}
