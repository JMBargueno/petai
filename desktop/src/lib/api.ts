import createClient from 'openapi-fetch';
import type { paths } from '@shared/openapi/api-types';

/**
 * URL del backend. En el servidor de desarrollo de Vite se usa el proxy (misma origin); en una
 * compilación de producción sale de VITE_API_URL (p. ej. https://api.petai.example, sin /v1) y, si no
 * se define, apunta a un backend local.
 */
const configuredUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/+$/, '');
export const API_BASE_URL = typeof window !== 'undefined' && window.location.origin.includes('localhost:')
  ? ''
  : configuredUrl || 'http://127.0.0.1:3000';

const ACCESS_KEY = 'petai_access_token';
const REFRESH_KEY = 'petai_refresh_token';

let currentToken: string | null = localStorage.getItem(ACCESS_KEY);
let currentRefreshToken: string | null = localStorage.getItem(REFRESH_KEY);

function store(key: string, value: string | null) {
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
}

export function setAccessToken(token: string | null) {
  currentToken = token;
  store(ACCESS_KEY, token);
}

/** Guarda (o borra, con null) el par de tokens de la sesión. */
function setSession(tokens: { accessToken: string; refreshToken?: string | null } | null) {
  setAccessToken(tokens?.accessToken ?? null);
  currentRefreshToken = tokens?.refreshToken ?? null;
  store(REFRESH_KEY, currentRefreshToken);
}

export function getAccessToken(): string | null {
  return currentToken;
}

const sessionExpiredListeners = new Set<() => void>();
const tokenRenewedListeners = new Set<(token: string) => void>();

/** Avisa cuando la sesión deja de ser válida (refresh rechazado): la app debe volver al login. */
export function onSessionExpired(cb: () => void): () => void {
  sessionExpiredListeners.add(cb);
  return () => sessionExpiredListeners.delete(cb);
}

/** Avisa cada vez que se obtiene un access token nuevo mediante el refresh token. */
export function onTokenRenewed(cb: (token: string) => void): () => void {
  tokenRenewedListeners.add(cb);
  return () => tokenRenewedListeners.delete(cb);
}

function expireSession() {
  const hadSession = currentToken !== null || currentRefreshToken !== null;
  setSession(null);
  if (hadSession) sessionExpiredListeners.forEach((cb) => cb());
}

let refreshing: Promise<string | null> | null = null;

/**
 * Renueva el access token con el refresh token. Solo hay una renovación en curso a la vez: el
 * refresh token rota en cada uso y el backend trata como robo la reutilización de uno ya canjeado.
 *
 * `stale` es el token con el que falló quien llama: si ya hay otro vigente (otra petición renovó
 * mientras tanto) se devuelve ese sin volver a llamar al servidor.
 *
 * Devuelve null si no se pudo renovar. Solo se cierra la sesión cuando el servidor rechaza el
 * refresh token; un fallo de red o un 429/5xx la conserva para reintentar más tarde.
 */
export function renewAccessToken(stale?: string | null): Promise<string | null> {
  if (stale !== undefined && currentToken && currentToken !== stale) return Promise.resolve(currentToken);
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<string | null> {
  const refreshToken = currentRefreshToken;
  if (!refreshToken) {
    expireSession();
    return null;
  }

  // S-01: el fast-path del edge se eliminó; el refresh siempre va al origin autoritativo.
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    return null;
  }
  // Si mientras tanto se cerró la sesión o se inició otra, el resultado ya no aplica
  if (currentRefreshToken !== refreshToken) return null;
  if (res.status === 400 || res.status === 401) {
    expireSession();
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.accessToken || !data?.refreshToken) return null;
  setSession(data);
  tokenRenewedListeners.forEach((cb) => cb(data.accessToken));
  return data.accessToken;
}

/**
 * fetch con renovación de sesión: ante un 401 en una petición autenticada renueva el token y la
 * repite una vez. Las rutas /auth/* (login incorrecto, refresh caducado) no se reintentan.
 */
async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const sent = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? null;
  if (!sent || new URL(req.url).pathname.includes('/auth/')) return fetch(req);
  const retry = req.clone();
  const res = await fetch(req);
  if (res.status !== 401) return res;
  const token = await renewAccessToken(sent);
  if (!token) return res;
  retry.headers.set('Authorization', `Bearer ${token}`);
  return fetch(retry);
}

const client = createClient<paths>({ baseUrl: API_BASE_URL, fetch: authFetch });

function authHeaders() {
  return currentToken
    ? { headers: { Authorization: `Bearer ${currentToken}` } }
    : {};
}

export const api = {
  client,

  async register(email: string, password: string, displayName?: string) {
    const res = await client.POST('/v1/auth/register', {
      body: { email, password, displayName },
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error en registro');
    if (res.data?.accessToken) {
      setSession(res.data);
    }
    return res.data;
  },

  async login(email: string, password: string) {
    const res = await client.POST('/v1/auth/login', {
      body: { email, password },
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Credenciales inválidas');
    if (res.data?.accessToken) {
      setSession(res.data);
    }
    return res.data;
  },

  /** Cierra la sesión en este equipo y revoca su refresh token en el servidor (sin esperar la respuesta). */
  logout() {
    const refreshToken = currentRefreshToken;
    setSession(null);
    if (refreshToken) {
      void fetch(`${API_BASE_URL}/v1/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        keepalive: true,
      }).catch(() => {
        /* sin conexión: el token caducará por sí solo */
      });
    }
  },

  async getMe() {
    const res = await client.GET('/v1/me', {
      ...authHeaders(),
    });
    if (res.error) throw new Error('No autenticado');
    return res.data;
  },

  async getCatalog() {
    const res = await client.GET('/v1/catalog');
    if (res.error) throw new Error('Error al obtener catálogo');
    return res.data;
  },

  async getEggs() {
    const res = await client.GET('/v1/eggs', {
      ...authHeaders(),
    });
    if (res.error) throw new Error('Error al listar huevos');
    return res.data;
  },

  async buyEgg() {
    const res = await client.POST('/v1/eggs/buy', {
      ...authHeaders(),
    });
    if (res.error) throw new Error('Error al comprar huevo');
    return res.data;
  },

  async hatchEgg(eggId: string) {
    const res = await client.POST('/v1/eggs/{id}/hatch', {
      params: { path: { id: eggId } },
      ...authHeaders(),
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error al eclosionar');
    return res.data;
  },

  async getPets() {
    const res = await client.GET('/v1/pets', {
      ...authHeaders(),
    });
    if (res.error) throw new Error('Error al obtener mascotas');
    return res.data;
  },

  async feedPet(petId: string, itemId: string) {
    const res = await client.POST('/v1/pets/{id}/feed', {
      params: { path: { id: petId } },
      body: { itemId },
      ...authHeaders(),
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error al alimentar');
    return res.data;
  },

  async cleanPet(petId: string) {
    const res = await client.POST('/v1/pets/{id}/clean', {
      params: { path: { id: petId } },
      ...authHeaders(),
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error al limpiar');
    return res.data;
  },

  async sleepPet(petId: string) {
    const res = await client.POST('/v1/pets/{id}/sleep', {
      params: { path: { id: petId } },
      ...authHeaders(),
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error al dormir');
    return res.data;
  },

  async wakePet(petId: string) {
    const res = await client.POST('/v1/pets/{id}/wake', {
      params: { path: { id: petId } },
      ...authHeaders(),
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error al despertar');
    return res.data;
  },

  async healPet(petId: string, itemId: string) {
    const res = await client.POST('/v1/pets/{id}/heal', {
      params: { path: { id: petId } },
      body: { itemId },
      ...authHeaders(),
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error al curar');
    return res.data;
  },

  async getInventory() {
    const res = await client.GET('/v1/inventory', {
      ...authHeaders(),
    });
    if (res.error) throw new Error('Error al obtener inventario');
    return res.data;
  },

  async getShop() {
    const res = await client.GET('/v1/shop');
    if (res.error) throw new Error('Error al obtener tienda');
    return res.data;
  },

  async buyShopItem(itemId: string, quantity: number = 1) {
    const res = await client.POST('/v1/shop/buy', {
      body: { itemId, quantity },
      ...authHeaders(),
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error al comprar');
    return res.data;
  },

  // ---- Minijuegos (Fase 2) ----
  async listMinigames() {
    return minigameRequest<any[]>('GET', '/v1/minigames');
  },

  async startMinigame(gameId: string, petId: string) {
    return minigameRequest<{
      sessionId: string;
      gameId: string;
      seed: number;
      durationSeconds: number;
      maxScorePerSecond: number;
      expiresAt: string;
    }>('POST', `/v1/minigames/${gameId}/start`, { petId });
  },

  async finishMinigame(sessionId: string, score: number) {
    return minigameRequest<{ score: number; rewards: any; pet: any }>(
      'POST',
      `/v1/minigames/sessions/${sessionId}/finish`,
      { score },
    );
  },

  // ---- IA (Fase 3) ----
  async getAiConfig() {
    return minigameRequest<any>('GET', '/v1/ai/config');
  },

  async saveAiConfig(cfg: { provider: string; baseUrl?: string; model?: string; apiKey?: string }) {
    return minigameRequest<any>('PUT', '/v1/ai/config', cfg);
  },

  async deleteAiConfig() {
    return minigameRequest<any>('DELETE', '/v1/ai/config');
  },

  async testAiConfig() {
    return minigameRequest<{ ok: boolean; error?: string }>('POST', '/v1/ai/config/test');
  },

  async getChatHistory(petId: string) {
    return minigameRequest<{ id: string; role: 'user' | 'assistant'; content: string }[]>(
      'GET',
      `/v1/pets/${petId}/chat/history`,
    );
  },

  /** Chat en streaming (SSE). Llama a onDelta con cada fragmento y devuelve el evento final. */
  async chatStream(
    petId: string,
    message: string,
    clientTools: readonly string[],
    handlers: {
      onDelta: (text: string) => void;
      onTool?: (name: string) => void;
      onAction?: (action: { id: string; tool: string; summary: string; expiresAt: string; clientSide?: boolean }) => void;
      onModerated?: (info: { reason: string; message: string; hideUserMessage: boolean }) => void;
    },
    signal?: AbortSignal,
  ): Promise<{ message: { id: string; content: string }; intelligence: number; tier: string } | { moderated: true }> {
    const res = await authFetch(`${API_BASE_URL}/v1/pets/${petId}/chat`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      },
      body: JSON.stringify({ message, clientTools }),
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.message || 'Error al enviar el mensaje');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const event = /^event: (.+)$/m.exec(block)?.[1];
        const raw = /^data: (.+)$/m.exec(block)?.[1];
        if (!event || !raw) continue;
        const data = JSON.parse(raw);
        if (event === 'delta') handlers.onDelta(data.text);
        else if (event === 'tool') handlers.onTool?.(data.name);
        else if (event === 'action') handlers.onAction?.(data.action);
        else if (event === 'moderated') {
          handlers.onModerated?.(data);
          return { moderated: true };
        }
        else if (event === 'error') throw new Error(data.message);
        else if (event === 'done') return data;
      }
    }
    throw new Error('La respuesta terminó sin completarse');
  },

  async updateMe(data: {
    displayName?: string;
    timezone?: string;
    notificationPrefs?: {
      vitals_critical?: boolean;
      interaction?: boolean;
      achievement?: boolean;
      arena?: boolean;
      event?: boolean;
      maxPerDay?: number;
    } | null;
  }) {
    return minigameRequest<any>('PATCH', '/v1/me', data);
  },

  async getAiUsage() {
    return minigameRequest<{
      month: string;
      tokens: number;
      requests: number;
      quota: number | null;
      remaining: number | null;
    }>('GET', '/v1/ai/usage');
  },

  /** Modo Hermes local, paso 1: el servidor valida, modera y devuelve los mensajes a enviar al modelo local. */
  async localChatContext(petId: string, message: string) {
    return minigameRequest<
      | { turnId: string; messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; maxTokens: number }
      | { moderated: { reason: string; message: string; hideUserMessage: boolean } }
    >('POST', `/v1/pets/${petId}/chat/local/context`, { message });
  },

  /** Modo Hermes local, paso 2: entrega la respuesta generada para moderarla y guardarla. */
  async localChatSync(petId: string, turnId: string, reply: string) {
    return minigameRequest<
      | { message: { id: string; content: string }; intelligence: number; tier: string }
      | { moderated: { reason: string; message: string; hideUserMessage: boolean } }
    >('POST', `/v1/pets/${petId}/chat/local/sync`, { turnId, reply });
  },

  // ---- Arena (Fase 4) ----
  async getCombatProfile(petId: string) {
    return minigameRequest<CombatProfile>('GET', `/v1/pets/${petId}/combat`);
  },

  async allocateStats(petId: string, points: Record<string, number>) {
    return minigameRequest<CombatProfile>('POST', `/v1/pets/${petId}/combat/stats`, points);
  },

  async equipSkills(petId: string, skills: string[]) {
    return minigameRequest<CombatProfile>('PUT', `/v1/pets/${petId}/combat/skills`, { skills });
  },

  async setStrategy(petId: string, strategy: string) {
    return minigameRequest<any>('PATCH', `/v1/pets/${petId}`, { strategy });
  },

  async matchmake(petId: string) {
    return minigameRequest<BattleResponse>('POST', '/v1/battles/matchmake', { petId });
  },

  async getBattles(limit = 20) {
    return minigameRequest<BattleSummary[]>('GET', `/v1/battles?limit=${limit}`);
  },

  async getBattle(id: string) {
    return minigameRequest<{ id: string; seed: number; createdAt: string; role: string; outcome: string; eloDelta: number; replay: any }>(
      'GET',
      `/v1/battles/${id}`,
    );
  },

  async getLeaderboard(scope: 'global' | 'weekly', petId?: string, limit = 20) {
    return minigameRequest<{
      scope: string;
      entries: LeaderboardEntry[];
      me: { rank: number; score: number } | null;
    }>('GET', `/v1/leaderboard?scope=${scope}&limit=${limit}${petId ? `&petId=${petId}` : ''}`);
  },

  async getArenaRules() {
    return minigameRequest<{ leagues: { id: string; name: string; minElo: number }[]; dailyFreeBattles: number; energyCost: number }>(
      'GET',
      '/v1/arena/leagues',
    );
  },

  async getPendingActions(petId: string) {
    return minigameRequest<{ id: string; tool: string; summary: string; expiresAt: string; clientSide?: boolean }[]>(
      'GET',
      `/v1/pets/${petId}/actions`,
    );
  },

  async confirmAction(petId: string, actionId: string) {
    return minigameRequest<{
      ok: boolean;
      tool: string;
      summary: string;
      result?: any;
      clientSide?: boolean;
      args?: any;
    }>(
      'POST',
      `/v1/pets/${petId}/actions/${actionId}/confirm`,
    );
  },

  async rejectAction(petId: string, actionId: string) {
    return minigameRequest<{ ok: boolean }>('POST', `/v1/pets/${petId}/actions/${actionId}/reject`);
  },

  async listReminders() {
    return minigameRequest<{ id: string; text: string; dueAt: string }[]>('GET', '/v1/reminders');
  },

  async getDueReminders() {
    return minigameRequest<{ id: string; text: string; dueAt: string }[]>('GET', '/v1/reminders/due');
  },

  async markReminderDelivered(id: string) {
    return minigameRequest<{ ok: boolean }>('POST', `/v1/reminders/${id}/delivered`);
  },

  async deleteReminder(id: string) {
    return minigameRequest<{ ok: boolean }>('DELETE', `/v1/reminders/${id}`);
  },

  async getMemories(petId: string) {
    return minigameRequest<{
      unlocked: boolean;
      unlockAt: number;
      intelligence: number;
      memories: { id: string; kind: 'fact' | 'summary'; content: string; createdAt: string }[];
    }>('GET', `/v1/pets/${petId}/memories`);
  },

  async forgetMemory(petId: string, memoryId: string) {
    return minigameRequest<{ deleted: number }>('DELETE', `/v1/pets/${petId}/memories/${memoryId}`);
  },

  async forgetAllMemories(petId: string) {
    return minigameRequest<{ deleted: number }>('DELETE', `/v1/pets/${petId}/memories`);
  },

  async evolvePet(petId: string) {
    return minigameRequest<any>('POST', `/v1/pets/${petId}/evolve`);
  },

  // ── Temporadas (oleada 3, F-10/F-11) ─────────────────────────────────────────
  async getSeasonCurrent() {
    return minigameRequest<SeasonCurrent>('GET', '/v1/seasons/current');
  },
  async getSeasonProgress() {
    return minigameRequest<SeasonProgress>('GET', '/v1/seasons/progress');
  },
  async purchaseSeasonPass() {
    return minigameRequest<{
      message: string;
      pass: { id: string; seasonId: string; price: number; purchasedAt: string };
    }>('POST', '/v1/seasons/pass/purchase');
  },

  // ── Misiones (Paso 3) ─────────────────────────────────────────────────────
  async getMissions() {
    return minigameRequest<MissionList>('GET', '/v1/missions');
  },
  async getMissionsSummary() {
    return minigameRequest<MissionSummary>('GET', '/v1/missions/summary');
  },
  async claimMission(id: string) {
    return minigameRequest<ClaimMissionResponse>('POST', `/v1/missions/${id}/claim`);
  },

  // ── Cofres (Paso 3) ───────────────────────────────────────────────────────
  async getChests() {
    return minigameRequest<ChestList>('GET', '/v1/chests');
  },
  async openChest(chestId: string) {
    return minigameRequest<OpenChestResponse>('POST', '/v1/chests/open', { chestId });
  },
  async purchaseChest(type: 'bronze' | 'silver' | 'gold', paymentMethod: 'coins' | 'gems') {
    return minigameRequest<PurchaseChestResponse>('POST', '/v1/chests/purchase', { type, paymentMethod });
  },
  async getChestHistory(limit = 20, offset = 0) {
    return minigameRequest<ChestHistory>('GET', `/v1/chests/history?limit=${limit}&offset=${offset}`);
  },

  // ── Vínculo (Paso 3, feature 006) ─────────────────────────────────────────
  async getBonding(petId: string) {
    return minigameRequest<BondingDetail>('GET', `/v1/pets/${petId}/bonding?limit=20`);
  },

  // ── Raid Boss (Paso 5, feature 013) ──────────────────────────────────────────
  async getRaidCurrent() {
    return minigameRequest<RaidCurrent>('GET', '/v1/raid/current');
  },
  async raidAttack(petId: string) {
    return minigameRequest<RaidAttackResponse>('POST', '/v1/raid/attack', { petId });
  },
  async getRaidLeaderboard(limit = 100) {
    return minigameRequest<RaidLeaderboard>('GET', `/v1/raid/leaderboard?limit=${limit}`);
  },
  async getRaidHistory(limit = 10) {
    return minigameRequest<RaidHistoryEntry[]>('GET', `/v1/raid/history?limit=${limit}`);
  },

  // ── Torneo Knockout (Paso 5, feature 014) ─────────────────────────────────────
  async getTournamentCurrent() {
    return minigameRequest<TournamentCurrent>('GET', '/v1/tournament/current');
  },
  async tournamentEnter(petId: string) {
    return minigameRequest<TournamentEnterResponse>('POST', '/v1/tournament/enter', { petId });
  },
  async getTournamentBracket() {
    return minigameRequest<TournamentBracket>('GET', '/v1/tournament/bracket');
  },
  async getTournamentStandings(limit = 50) {
    return minigameRequest<TournamentStandings>('GET', `/v1/tournament/standings?limit=${limit}`);
  },

  // Hábitat (feature 019)
  async getHabitat() {
    return minigameRequest<HabitatState>('GET', '/v1/habitat');
  },

  async getHabitatCatalog() {
    return minigameRequest<HabitatCatalog>('GET', '/v1/habitat/catalog');
  },

  async placeHabitatFurniture(furnitureId: string) {
    return minigameRequest<{ message: string; furnitureId: string; room: string }>(
      'POST',
      `/v1/habitat/furniture/${furnitureId}/place`,
    );
  },

  async removeHabitatFurniture(furnitureId: string) {
    return minigameRequest<{ message: string; furnitureId: string }>('DELETE', `/v1/habitat/furniture/${furnitureId}`);
  },

  async getHabitatBuffs() {
    return minigameRequest<HabitatBuffs>('GET', '/v1/habitat/buffs');
  },
};

async function minigameRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await authFetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || 'Error en la petición');
  return data as T;
}

// ── Temporadas (oleada 3) ─────────────────────────────────────────────────────
export interface SeasonCurrent {
  id: string;
  name: string;
  theme: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  timeRemainingMs: number;
  passPrice: number;
  passCurrency: string;
  maxTier: number;
  xpPerTier: number;
  upcoming: { id: string; name: string; theme: string; startTime: string } | null;
}

export interface SeasonTier {
  tier: number;
  freeRewards: { type: string; value: number | string }[];
  premiumRewards?: { type: string; value: number | string }[];
}

export interface SeasonProgress {
  seasonId: string;
  seasonName?: string;
  currentTier: number;
  totalXp: number;
  xpPerTier?: number;
  maxTier: number;
  xpToNextTier?: number;
  hasPass: boolean;
  unlockedTiers: SeasonTier[];
  nextReward: SeasonTier | null;
  seasonExpired?: boolean;
}

export interface CombatProfile {
  petId: string;
  name: string;
  element: string;
  level: number;
  stats: Record<'hp' | 'atk' | 'def' | 'vel' | 'esp', number>;
  allocated: Record<'hp' | 'atk' | 'def' | 'vel' | 'esp', number>;
  statPoints: number;
  mood: number;
  strategy: string;
  elo: number;
  league: { id: string; name: string; minElo: number; next: { id: string; name: string; minElo: number } | null; toNext: number | null };
  unlockedSkills: string[];
  equippedSkills: string[];
  battlesToday: number;
  dailyLimit: number;
  energyCost: number;
  canFight: boolean;
  reason: string | null;
}

export interface BattleResponse {
  battleId: string;
  seed: number;
  result: { outcome: 'win' | 'draw' | 'loss'; winner: 0 | 1 | null; rounds: number };
  opponent: { name: string; speciesId: string; element: string; level: number; isBot: boolean; ownerName: string | null };
  elo: { before: number; after: number; delta: number; league: CombatProfile['league'] };
  rewards: { xp: number; coins: number; happiness: number; energyCost: number };
  replay: any;
  pet: any;
}

export interface BattleSummary {
  id: string;
  createdAt: string;
  role: 'attacker' | 'defender';
  outcome: 'win' | 'draw' | 'loss';
  eloDelta: number;
  rounds: number | null;
  me: { name: string; level: number; element: string };
  opponent: { name: string; level: number; element: string; isBot: boolean };
}

export interface LeaderboardEntry {
  rank: number;
  petId: string;
  name: string;
  owner: string | null;
  speciesId: string;
  level: number;
  elo: number;
  league: string;
  score: number;
  mine: boolean;
}

// ── Misiones (Paso 3) ─────────────────────────────────────────────────────
export interface MissionReward {
  coins: number;
  gems: number;
  xp: number;
}

export interface Mission {
  id: string;
  type: string;
  description: string;
  target: number;
  current: number;
  completed: boolean;
  reward: MissionReward;
  resetsAt: string;
}

export interface MissionList {
  timestamp: string;
  daily: Mission[];
  weekly: Mission[];
  dailyChestUnlocked: boolean;
}

export interface MissionSummary {
  dailyCompleted: number;
  dailyTotal: number;
  weeklyCompleted: number;
  weeklyTotal: number;
  streak: number;
  bestStreak: number;
}

export interface ClaimMissionResponse {
  mission: { id: string; type: string; completed: boolean };
  reward: MissionReward;
  dailyChestUnlocked: boolean;
}

// ── Cofres (Paso 3) ───────────────────────────────────────────────────────
export type ChestType = 'bronze' | 'silver' | 'gold' | 'diamond' | 'mythic';
export type DropTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface Chest {
  id: string;
  type: ChestType;
  source: string;
  createdAt: string;
  openedAt?: string | null;
}

export interface ChestList {
  chests: Chest[];
}

export interface ChestDrop {
  itemId: string;
  name: string;
  qty: number;
  tier: DropTier;
  isNew: boolean;
}

export interface PityProgress {
  count: number;
  threshold: number;
  minTier: string;
}

export interface OpenChestResponse {
  chest: Chest;
  drops: ChestDrop[];
  pityProgress: PityProgress;
}

export interface PurchaseChestResponse {
  chest: Chest;
  coinsRemaining: number;
  gemsRemaining: number;
}

export interface ChestHistory {
  openings: { chestId: string; type: ChestType; drops: ChestDrop[]; openedAt: string }[];
  total: number;
}

// ── Vínculo (Paso 3, feature 006) ─────────────────────────────────────────
export interface BondingEvent {
  id: string;
  delta: number;
  reason: string;
  value: number;
  createdAt: string;
}

export interface BondingHistory {
  items: BondingEvent[];
  nextCursor: string | null;
}

export interface BondingDecayInfo {
  decayRatePerDay: number;
  isDecaying: boolean;
  graceWindowHours: number;
  decayStartHours: number;
  hoursSinceInteraction: number;
  acumulatedDecay: number;
}

export interface BondingUnlocks {
  greeting: boolean;
  memoryRecall: boolean;
  emotionalReactions: boolean;
  patternUnlocked: boolean;
  sleepNearCursor: boolean;
}

export interface BondingDetail {
  value: number;
  tier: string;
  tierName: string;
  lastInteractionAt: string;
  history: BondingHistory;
  decayInfo: BondingDecayInfo;
  unlocks: BondingUnlocks;
}

// ── Hábitat (feature 019) ───────────────────────────────────────────────────
export interface HabitatCatalogRoom {
  id: string;
  name: string;
  gridWidth: number;
  gridHeight: number;
  unlockStage: string;
  description: string;
}

export interface HabitatFurniture {
  id: string;
  name: string;
  room: string;
  price: number;
  currency: 'coins' | 'gems';
  buffs: Record<string, number>;
  description: string;
}

export interface HabitatCatalog {
  rooms: HabitatCatalogRoom[];
  furniture: HabitatFurniture[];
  buffCaps: Record<string, number>;
}

export interface HabitatRoomItem {
  id: string;
  furnitureId: string;
  x: number;
  y: number;
}

export interface HabitatRoom {
  id: string;
  name: string;
  description: string;
  gridWidth: number;
  gridHeight: number;
  unlocked: boolean;
  active: boolean;
  items: HabitatRoomItem[];
}

export interface HabitatState {
  petId: string;
  habitatSeed: number;
  rooms: HabitatRoom[];
}

export interface HabitatBuffs {
  petId: string;
  activeBuffs: Record<string, number>;
  itemCount: number;
}

// ── Raid Boss (Paso 5, feature 013) ──────────────────────────────────────────
export interface RaidContribution {
  damageDealt: number;
  attacks: number;
  percentage: number;
}

export interface RaidCurrent {
  id: string;
  theme: string;
  element: string;
  level: number;
  hpGlobal: number;
  hpRemaining: number;
  hpPercent: number;
  status: string;
  startedAt: string;
  endsAt: string;
  participantCount: number;
  myContribution: RaidContribution | null;
}

export interface RaidAttackResponse {
  damage: number;
  seed: number;
  rounds: number;
  result: 'pet won' | 'boss won' | 'draw';
  hpRemaining: number;
  hpPercent: number;
  settled: boolean;
  replay: unknown;
}

export interface RaidLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  petId: string;
  petName: string;
  petLevel: number;
  petElement: string;
  damageDealt: number;
  percentage: number;
  attacks: number;
  mine: boolean;
}

export interface RaidLeaderboard {
  raidId: string;
  totalDamage: number;
  hpRemaining: number;
  entries: RaidLeaderboardEntry[];
}

export interface RaidHistoryEntry {
  id: string;
  theme: string;
  element: string;
  hpGlobal: number;
  startedAt: string;
  endedAt: string | null;
  status: string;
}

// ── Torneo Knockout (Paso 5, feature 014) ─────────────────────────────────────
export interface TournamentCurrent {
  id: string;
  status: 'entry' | 'bracket' | 'active' | 'finished';
  entryFee: number;
  totalPrizePool: number;
  entryDeadline: string;
  startedAt: string | null;
  endsAt: string;
  entryCount: number;
  bracketSize: number;
  hasEntered: boolean;
  myPlacement: number | null;
}

export interface TournamentEnterResponse {
  tournamentId: string;
  petId: string;
  elo: number;
  feePaid: number;
}

export interface TournamentBracketParticipant {
  name: string;
  elo: number;
  element: string;
}

export interface TournamentBracketMatch {
  id: string;
  slot: number;
  status: string;
  winnerId: string | null;
  petA: TournamentBracketParticipant | null;
  petB: TournamentBracketParticipant | null;
}

export interface TournamentBracket {
  rounds: Record<string, TournamentBracketMatch[]>;
  entries: unknown[];
}

export interface TournamentStandingsEntry {
  rank: number;
  userId: string;
  petId: string;
  petName: string;
  elo: number;
  placement: number | null;
  mine: boolean;
}

export interface TournamentStandings {
  tournamentId: string | null;
  status: string | null;
  total: number;
  limit: number;
  offset: number;
  entries: TournamentStandingsEntry[];
  me: { rank: number; placement: number | null } | null;
}
