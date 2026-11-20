/** Tipos de lo social (amigos, visitas, clanes, presencia), compartidos por las apps. */

// ── Amistad + Co-op ─────────────────────────────────────────────────────────
export interface CoopFriend {
  id: string;
  status: 'pending' | 'accepted' | 'revoked';
  direction: 'incoming' | 'outgoing';
  otherUserId: string;
  otherDisplayName: string;
  /** Nickname público del otro jugador (null si aún no lo ha elegido). */
  otherHandle?: string | null;
  otherPet: { petId: string; nickname: string; speciesName: string } | null;
  updatedAt: string;
}

export interface CoopVisitLog {
  /** Campos nuevos (backend ≥ 0.24): opcionales para tolerar un backend antiguo. */
  id?: string;
  kind?: 'care' | 'habitat';
  /** `in` = visitaron a mis pets; `out` = visité yo. */
  direction?: 'in' | 'out';
  otherUserId?: string;
  otherName?: string;
  otherHandle?: string | null;
  ownerId?: string;
  endedAt?: string | null;
  visitorId: string;
  /** feed | play | clean, o `habitat` para visitas en vivo. */
  action: string;
  petId: string;
  xpGained: number;
  createdAt: string;
}

export interface CoopVisitResult {
  success: boolean;
  message: string;
  xpGained: number;
  petState: { hunger: number; happiness: number; hygiene: number };
}

// ── Presencia + Clanes ──────────────────────────────────────────────────────
/** Dispositivos de un jugador; la forma concreta la decide el backend (lo que importa es `active`). */
export interface PresenceDevice {
  deviceId: string;
  platform?: string;
  lastSeenAt?: string;
  active?: boolean;
}

export interface PresenceInfo {
  userId: string;
  devices: PresenceDevice[];
  hasActiveDevices: boolean;
}

/**
 * Rango dentro del clan (lore: Nexo de Resonancia): creator = Forjador, admin = Guardián,
 * moderator = Vigía, member = Hermano.
 */
export type ClanRole = 'creator' | 'admin' | 'moderator' | 'member';

export interface ClanMember {
  userId: string;
  displayName: string;
  handle?: string | null;
  role: ClanRole;
  isOnline: boolean;
  joinedAt: string;
}

export interface ClanSummary {
  id: string;
  name: string;
  tag: string;
  description: string;
  leaderId: string;
  xp: number;
  memberCount: number;
  leader: { userId: string; displayName: string; handle?: string | null };
  members: ClanMember[];
}

/** Pockai de un residente del hábitat del clan (misma forma que espera `PetMiniAvatar`). */
export interface ClanHabitatPet {
  id: string;
  nickname: string;
  species: { id: string; name: string };
  pattern: { id: string };
  rarity: string;
  stage: string;
  palette: Record<string, string>;
  visualSeed: number;
  shiny: boolean;
  accessories: Record<string, string>;
  level: number;
  sleeping: boolean;
  sick: boolean;
  hunger: number;
  happiness: number;
  energy: number;
  hygiene: number;
  health: number;
}

export interface ClanHabitatResident {
  userId: string;
  displayName: string;
  handle: string | null;
  role: ClanRole;
  isMe: boolean;
  pet: ClanHabitatPet;
}

/** `GET /v1/clans/:id/habitat`: nivel visual 1–5 y residentes sorteados. */
export interface ClanHabitat {
  clanId: string;
  xp: number;
  tier: number;
  tierId: string;
  nextTierXp: number | null;
  residents: ClanHabitatResident[];
}

/** Evento de socket `clan:xp`: el Nexo ganó Resonancia. */
export interface ClanXpEvent {
  clanId: string;
  xp: number;
  delta: number;
  tier: number;
  leveledUp: boolean;
  byUserId: string;
}

/** Mensaje del chat de clan (feature 021). */
export interface ClanMessage {
  id: string;
  clanId: string;
  userId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

/** Métrica que alimenta el progreso de un objetivo de clan. */
export type ClanGoalMetric = 'xp' | 'visits' | 'generic' | string;

/** Estado de un objetivo de clan (feature 021). */
export interface ClanGoal {
  id: string;
  clanId: string;
  title: string;
  description: string;
  metric: ClanGoalMetric;
  target: number;
  progress: number;
  status: 'active' | 'completed' | string;
  createdAt: string;
  completedAt?: string | null;
}

// ── Visitas en vivo al hábitat ─────────────────────────────────────────────
/** Identidad de la mascota de un amigo (suficiente para dibujar su sprite). */
export interface PetIdentity {
  petId: string;
  nickname: string;
  speciesName: string;
  speciesId: string;
  /** Referencia del sprite del backend (p. ej. `sprites/ignisaur_idle`); puede no resolver. */
  spriteRef: string;
  /** Etapa evolutiva; si falta (backend antiguo) se dibuja la de bebé. */
  stage?: string;
  /** Aspecto con el que se dibuja en la sala del anfitrión (backend antiguo: no viene). */
  look?: PetLook;
}

/** Aspecto de la mascota de un visitante. Solo apariencia: nada de su estado ni de su memoria. */
export interface PetLook {
  palette: { primary: string; secondary: string; accent?: string };
  pattern: string | null;
  visualSeed: number;
  shiny: boolean;
  accessories: Record<string, string>;
}

/** Escena entre tu Pockai y el de un visitante, tal como la resuelve el servidor. */
/** Una opción del menú de visita. El texto lo pone el servidor. */
export interface VisitMenuOption {
  /** greet | pet | treat | play | ask | wait | bye */
  id: string;
  label: string;
  /** En «ofrecer un premio», el alimento de tu inventario que se gastaría. */
  item?: { id: string; name: string };
}

/** Respuesta del Pockai anfitrión a quien le visita (spec 37 §6.2). */
export interface VisitInteraction {
  turn: number;
  line: string;
  behavior: { action: string; animation: string; emote: string | null; clip?: string };
  options: VisitMenuOption[];
  /** Interacciones que quedan en esta visita. */
  remaining: number;
  ended: boolean;
  /** Lo que ese Pockai siente por ti: stranger | acquaintance | friend | best_friend */
  stage: string;
  petName: string;
}

/** Resultado de avisar de que el Pockai usó un mueble. */
export interface FurnitureUseResult {
  applied: boolean;
  /** daily_cap | cooldown | away | asleep | disabled */
  reason?: string;
  interaction: string;
  petId: string;
  vitals: { hunger: number; happiness: number; energy: number; hygiene: number };
  remainingToday?: number;
}

/** La sala del amigo, para quien le visita. Solo aspecto: nada de su estado ni su memoria. */
export interface VisitRoom {
  ownerId: string;
  room: {
    id: string;
    name: string;
    /** Tema de la sala (`HabitatTheme` del escritorio, o `null`). */
    theme: any;
    gridWidth: number;
    gridHeight: number;
    blocked: number[][];
    items: { id: string; furnitureId: string; x: number; y: number; rotation: number }[];
  };
  furniture: { id: string; name: string; footprint: number[]; mount: string; interaction?: string }[];
  host: HabitatVisitor['pet'];
  guest: HabitatVisitor['pet'];
}

export interface HabitatSceneEvent {
  /** `host`: la escena ocurre en tu sala. `guest`: en la del amigo al que visitas (`ownerId`). */
  role?: 'host' | 'guest';
  ownerId?: string;
  visitorId: string;
  slot: number;
  /** greet | explore_together | play_tag | share_food | nap_together | squabble | make_up */
  type: string;
  /** Relación de tu Pockai con el visitante: stranger | acquaintance | friend | best_friend */
  stage: string;
  hostPetId: string;
  guestPetId: string;
  /** Carácter del visitante en palabras, por dimensión (p. ej. `{ temper: 'calm' }`). */
  guestTraits?: Record<string, string>;
}

export interface HabitatVisitor {
  visitorId: string;
  visitorName: string;
  visitorHandle?: string | null;
  pet: PetIdentity;
  /** Mensaje corto que trae el visitante (≤140), si dejó alguno. */
  message?: string | null;
  startedAt: string;
}
