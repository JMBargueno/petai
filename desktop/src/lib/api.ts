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

let currentToken: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem(ACCESS_KEY) : null;
let currentRefreshToken: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null;

function store(key: string, value: string | null) {
  if (typeof localStorage === 'undefined') return;
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

/** Error de la API con el estado HTTP, para distinguir errores de negocio de los terminales. */
export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Construye un ApiError a partir de la respuesta de openapi-fetch. */
function apiError(res: { error?: unknown; response?: Response }, fallback: string): ApiError {
  const message = (res.error as any)?.message;
  return new ApiError(typeof message === 'string' && message ? message : fallback, res.response?.status);
}

/**
 * Error terminal: no es culpa de la acción concreta sino del entorno (sin conexión, servidor caído,
 * sesión inválida). Estos se muestran como aviso en el panel; el resto los dice la mascota.
 */
export function isTerminalError(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status === undefined) return true;
  return err.status >= 500 || err.status === 401;
}

export const api = {
  client,

  async register(email: string, password: string, displayName?: string, inviteCode?: string) {
    const code = inviteCode?.trim();
    const res = await client.POST('/v1/auth/register', {
      body: { email, password, displayName, ...(code ? { inviteCode: code } : {}) },
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Error en registro');
    if (res.data?.accessToken) {
      setSession(res.data);
    }
    return res.data;
  },

  /** ¿El registro exige código de invitación? Ante un fallo de red se asume que no (el servidor decide igualmente). */
  async getRegistrationConfig(): Promise<{ inviteRequired: boolean }> {
    try {
      const res = await client.GET('/v1/auth/registration-config');
      return { inviteRequired: !!res.data?.inviteRequired };
    } catch {
      return { inviteRequired: false };
    }
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
    if (res.error) throw apiError(res, 'Error al comprar huevo');
    return res.data;
  },

  async hatchEgg(eggId: string, nickname?: string) {
    // Nombre opcional: solo se envía si, tras trim, no queda vacío. El backend lo valida (1-16).
    const name = typeof nickname === 'string' ? nickname.trim() : '';
    const res = await client.POST('/v1/eggs/{id}/hatch', {
      params: { path: { id: eggId } },
      ...(name ? { body: { nickname: name.slice(0, 16) } } : {}),
      ...authHeaders(),
    });
    if (res.error) throw apiError(res, 'Error al eclosionar');
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
    if (res.error) throw apiError(res, 'Error al alimentar');
    return res.data;
  },

  async cleanPet(petId: string) {
    const res = await client.POST('/v1/pets/{id}/clean', {
      params: { path: { id: petId } },
      ...authHeaders(),
    });
    if (res.error) throw apiError(res, 'Error al limpiar');
    return res.data;
  },

  async sleepPet(petId: string) {
    const res = await client.POST('/v1/pets/{id}/sleep', {
      params: { path: { id: petId } },
      ...authHeaders(),
    });
    if (res.error) throw apiError(res, 'Error al dormir');
    return res.data;
  },

  async wakePet(petId: string) {
    const res = await client.POST('/v1/pets/{id}/wake', {
      params: { path: { id: petId } },
      ...authHeaders(),
    });
    if (res.error) throw apiError(res, 'Error al despertar');
    return res.data;
  },

  async healPet(petId: string, itemId: string) {
    const res = await client.POST('/v1/pets/{id}/heal', {
      params: { path: { id: petId } },
      body: { itemId },
      ...authHeaders(),
    });
    if (res.error) throw apiError(res, 'Error al curar');
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
    if (res.error) throw apiError(res, 'Error al comprar');
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

  async saveAiConfig(cfg: { mode?: 'byok' | 'managed'; provider?: string; baseUrl?: string; model?: string; apiKey?: string }) {
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

  /**
   * Chat en streaming (SSE). Llama a onDelta con cada fragmento de la respuesta y devuelve el evento
   * final. El razonamiento del modelo nunca llega en los delta: viene aparte en message.thinking.
   */
  async chatStream(
    petId: string,
    message: string,
    clientTools: readonly string[],
    handlers: {
      onDelta: (text: string) => void;
      /** Pensamiento del modelo de razonamiento: se muestra plegado, nunca como respuesta. */
      onReasoning?: (text: string) => void;
      onTool?: (name: string) => void;
      onAction?: (action: { id: string; tool: string; summary: string; expiresAt: string; clientSide?: boolean }) => void;
      onModerated?: (info: { reason: string; message: string; hideUserMessage: boolean }) => void;
    },
    signal?: AbortSignal,
    clientContext?: unknown,
  ): Promise<{ message: { id: string; content: string; thinking?: string }; intelligence: number; tier: string } | { moderated: true }> {
    const res = await authFetch(`${API_BASE_URL}/v1/pets/${petId}/chat`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      },
      body: JSON.stringify({ message, clientTools, clientContext }),
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
        else if (event === 'reasoning') handlers.onReasoning?.(data.text);
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
      mode?: string;
      plan?: 'free' | 'pro';
      daily?: {
        used: number;
        limit: number;
        resetsAt: string;
      };
    }>('GET', '/v1/ai/usage');
  },

  // ---- Facturación y Suscripción Pro (Spec-34) ----
  async getBillingPlans() {
    return minigameRequest<{
      pricing: { monthlyPriceUsd: number; monthlyPriceEur: number; trialDays: number };
      plans: {
        free: { name: string; priceUsd: number; priceEur: number; dailyMessages: number; maxInputChars: number; maxOutputTokens: number; agentTools: boolean };
        pro: { name: string; priceUsd: number; priceEur: number; dailyMessages: number; maxInputChars: number; maxOutputTokens: number; agentTools: boolean };
        byok: { name: string; priceUsd: number; priceEur: number; dailyMessages: null; maxInputChars: number; rateLimitPerMinute: number };
      };
    }>('GET', '/v1/billing/plans');
  },

  async getBillingEntitlement() {
    return minigameRequest<{
      plan: 'free' | 'pro';
      source?: 'stripe' | 'google_play' | null;
      currentPeriodEnd?: string | null;
      cancelAtPeriodEnd?: boolean;
      status?: string | null;
      duplicateSubscriptions?: boolean;
    }>('GET', '/v1/billing/entitlement');
  },

  async createStripeCheckout() {
    return minigameRequest<{ url: string }>('POST', '/v1/billing/stripe/checkout');
  },

  async createStripePortal() {
    return minigameRequest<{ url: string }>('POST', '/v1/billing/stripe/portal');
  },

  /** Modo Hermes local, paso 1: el servidor valida, modera y devuelve los mensajes a enviar al modelo local. */
  async localChatContext(petId: string, message: string, clientContext?: unknown) {
    return minigameRequest<
      | { turnId: string; messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; maxTokens: number }
      | { moderated: { reason: string; message: string; hideUserMessage: boolean } }
    >('POST', `/v1/pets/${petId}/chat/local/context`, { message, clientContext });
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

  async updateDesktopSkills(petId: string, skills: Record<string, boolean>) {
    return minigameRequest<any>('PATCH', `/v1/pets/${petId}/desktop-skills`, { skills });
  },

  async setPetInHabitat(petId: string, inHabitat: boolean) {
    return minigameRequest<any>('PATCH', `/v1/pets/${petId}/in-habitat`, { inHabitat });
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
      memories: { id: string; kind: 'fact' | 'summary' | 'habit'; content: string; createdAt: string }[];
    }>('GET', `/v1/pets/${petId}/memories`);
  },

  async forgetMemory(petId: string, memoryId: string) {
    return minigameRequest<{ deleted: number }>('DELETE', `/v1/pets/${petId}/memories/${memoryId}`);
  },

  async forgetAllMemories(petId: string) {
    return minigameRequest<{ deleted: number }>('DELETE', `/v1/pets/${petId}/memories`);
  },

  /** Resumen diario de hábitos de escritorio (solo categorías y minutos; ver lib/contextDigest.ts). */
  async sendContextDigest(petId: string, body: unknown) {
    return minigameRequest<{ habits: number; stored: boolean }>('POST', `/v1/pets/${petId}/context-digest`, body);
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

  // ── Amistad + Co-op (feature 021) ─────────────────────────────────────────
  async getCoopFriends() {
    return minigameRequest<CoopFriend[]>('GET', '/v1/coop/friends');
  },
  async requestCoopFriend(target: { targetUserId?: string; email?: string }) {
    return minigameRequest<CoopFriend>('POST', '/v1/coop/friends', target);
  },
  async acceptCoopFriend(friendshipId: string) {
    return minigameRequest<CoopFriend>('POST', `/v1/coop/friends/${friendshipId}/accept`);
  },
  async declineCoopFriend(friendshipId: string) {
    return minigameRequest<CoopFriend>('POST', `/v1/coop/friends/${friendshipId}/decline`);
  },
  async coopVisit(body: {
    ownerId: string;
    petId: string;
    action: 'feed' | 'play' | 'clean';
    itemId?: string;
  }) {
    return minigameRequest<CoopVisitResult>('POST', '/v1/coop/visit', body);
  },
  async getCoopHistory() {
    return minigameRequest<{ userId: string; visits: CoopVisitLog[] }>('GET', '/v1/coop/history');
  },

  // ── Presencia (feature 021) ────────────────────────────────────────────────
  /** Dispositivos de un jugador y si tiene alguno activo (punto de presencia). */
  async getPresence(userId: string) {
    return minigameRequest<PresenceInfo>('GET', `/v1/presence/${encodeURIComponent(userId)}`);
  },

  // ── Clanes (feature 021) ──────────────────────────────────────────────────
  async createClan({ name, tag, description }: { name: string; tag: string; description?: string }) {
    return minigameRequest<ClanSummary>('POST', '/v1/clans', { name, tag, description });
  },
  /** El clan del usuario; `null` si aún no está en ningún clan (404 del contrato). */
  async getMyClan(): Promise<ClanSummary | null> {
    try {
      return await minigameRequest<ClanSummary>('GET', '/v1/clans');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  async joinClan(tag: string) {
    return minigameRequest<ClanSummary>('POST', '/v1/clans/join', { tag });
  },
  async leaveClan() {
    return minigameRequest<{ ok: boolean }>('POST', '/v1/clans/leave');
  },
  /** Invita a un jugador (Vigía o superior). Devuelve el resumen actualizado. */
  async inviteToClan(clanId: string, target: { userId?: string; email?: string }) {
    return minigameRequest<ClanSummary>('POST', `/v1/clans/${encodeURIComponent(clanId)}/invite`, target);
  },
  /** Roster vivo del clan (el backend devuelve el resumen completo). */
  async getClanMembers(clanId: string) {
    return minigameRequest<ClanSummary>('GET', `/v1/clans/${encodeURIComponent(clanId)}/members`);
  },

  // ── Gestión del Nexo (rangos de clan) ──────────────────────────────────────
  /** Edita nombre y/o descripción (Guardián o superior). */
  async updateClan(clanId: string, patch: { name?: string; description?: string | null }) {
    return minigameRequest<ClanSummary>('PATCH', `/v1/clans/${encodeURIComponent(clanId)}`, patch);
  },
  /** Disuelve el clan (solo el Forjador). */
  async disbandClan(clanId: string) {
    return minigameRequest<{ success: boolean; message: string }>('DELETE', `/v1/clans/${encodeURIComponent(clanId)}`);
  },
  /** Expulsa a un miembro de rango inferior (Vigía o superior). */
  async kickClanMember(clanId: string, userId: string) {
    return minigameRequest<ClanSummary>('DELETE', `/v1/clans/${encodeURIComponent(clanId)}/members/${encodeURIComponent(userId)}`);
  },
  /** Cambia el rango de un miembro (Guardián o superior; Guardianes solo el Forjador). */
  async setClanMemberRole(clanId: string, userId: string, role: Exclude<ClanRole, 'creator'>) {
    return minigameRequest<ClanSummary>('PATCH', `/v1/clans/${encodeURIComponent(clanId)}/members/${encodeURIComponent(userId)}/role`, { role });
  },
  /** Cede la Forja a otro miembro (solo el Forjador; pasa a Guardián). */
  async transferClanCreator(clanId: string, userId: string) {
    return minigameRequest<ClanSummary>('POST', `/v1/clans/${encodeURIComponent(clanId)}/transfer`, { userId });
  },
  /** Borra un mensaje del chat (el autor o un Vigía o superior). */
  async deleteClanMessage(clanId: string, messageId: string) {
    return minigameRequest<{ success: boolean }>('DELETE', `/v1/clans/${encodeURIComponent(clanId)}/messages/${encodeURIComponent(messageId)}`);
  },

  // ── Chat de clan (feature 021) ─────────────────────────────────────────────
  /** Envía un mensaje al chat del clan. Devuelve el mensaje persistido. */
  async sendClanMessage(clanId: string, body: string) {
    return minigameRequest<ClanMessage>('POST', `/v1/clans/${encodeURIComponent(clanId)}/messages`, { body });
  },
  /** Historial reciente del chat del clan (más nuevos al final). */
  async getClanMessages(clanId: string, { limit, before }: { limit?: number; before?: string } = {}) {
    const params = new URLSearchParams();
    if (limit != null) params.set('limit', String(limit));
    if (before) params.set('before', before);
    const q = params.toString();
    return minigameRequest<ClanMessage[]>('GET', `/v1/clans/${encodeURIComponent(clanId)}/messages${q ? `?${q}` : ''}`);
  },

  // ── Objetivos de clan (feature 021) ────────────────────────────────────────
  /** Crea un objetivo de clan. Devuelve el objetivo persistido. */
  async createClanGoal(clanId: string, goal: { title: string; description?: string; metric: ClanGoalMetric; target: number }) {
    return minigameRequest<ClanGoal>('POST', `/v1/clans/${encodeURIComponent(clanId)}/goals`, goal);
  },
  /** Objetivos del clan (activos y completados). */
  async getClanGoals(clanId: string) {
    return minigameRequest<ClanGoal[]>('GET', `/v1/clans/${encodeURIComponent(clanId)}/goals`);
  },
  /** Añade progreso a un objetivo. Devuelve el objetivo actualizado. */
  async addClanGoalProgress(clanId: string, goalId: string, amount: number) {
    return minigameRequest<ClanGoal>('POST', `/v1/clans/${encodeURIComponent(clanId)}/goals/${encodeURIComponent(goalId)}/progress`, { amount });
  },
  /** Borra un objetivo del clan (solo el líder, según el contrato). */
  async deleteClanGoal(clanId: string, goalId: string) {
    return minigameRequest<{ ok: boolean }>('DELETE', `/v1/clans/${encodeURIComponent(clanId)}/goals/${encodeURIComponent(goalId)}`);
  },

  // ── Visitas en vivo al hábitat (feature 021) ───────────────────────────────
  /** Inicia una visita del jugador a tu hábitat (el backend emite `habitat:visitor_joined`). */
  async startHabitatVisit(ownerId: string) {
    return minigameRequest<{ ok: boolean; startedAt: string }>('POST', '/v1/habitat/visit', { ownerId });
  },
  /** Cierra tu visita en curso (el backend emite `habitat:visitor_left`). */
  async endHabitatVisit() {
    return minigameRequest<{ ok: boolean }>('POST', '/v1/habitat/visit/end');
  },
  /** Amigos que ahora mismo están de visita en tu hábitat. */
  async getHabitatVisitors() {
    return minigameRequest<{ visitors: HabitatVisitor[] }>('GET', '/v1/habitat/visitors');
  },

  // ── Bienvenida (feature 028) ────────────────────────────────────────────────
  /** Estado de la bienvenida. Si hubo ausencia, el backend emite `pet:action welcome_back`. */
  async getReengagementStatus() {
    return minigameRequest<ReengagementStatus>('GET', '/v1/reengagement/status');
  },
  async getReengagementDiary() {
    return minigameRequest<ReengagementDiary>('GET', '/v1/reengagement/diary');
  },

  // ── Entrenamiento elemental ─────────────────────────────────────────────────
  async trainingStart(petId: string) {
    return minigameRequest<TrainingStart>('POST', '/v1/training/start', { petId });
  },
  async trainingSubmit(petId: string, element: TrainingElement, prediction?: TrainingElement) {
    return minigameRequest<TrainingSubmit>('POST', '/v1/training/submit', { petId, element, prediction });
  },
  async trainingActiveBuff(petId?: string) {
    const q = petId ? `?petId=${encodeURIComponent(petId)}` : '';
    return minigameRequest<TrainingBuff>('GET', `/v1/training/active-buff${q}`);
  },

  // ── Cocina ──────────────────────────────────────────────────────────────────
  async cookingDailyMenu() {
    return minigameRequest<CookingDailyMenu>('GET', '/v1/cooking/daily-menu');
  },
  async cookingStart(petId: string) {
    return minigameRequest<CookingStart>('POST', '/v1/cooking/start', { petId });
  },
  async cookingSubmit(sessionId: string, score: number, correctOrder: boolean) {
    return minigameRequest<CookingSubmit>('POST', '/v1/cooking/submit', { sessionId, score, correctOrder });
  },

  // ── Aventura ────────────────────────────────────────────────────────────────
  async adventureStart(petId: string, premium = false) {
    return minigameRequest<AdventureStart>('POST', '/v1/adventure/start', { petId, premium });
  },
  async adventureChoose(adventureId: string, optionIndex: number) {
    return minigameRequest<AdventureChoose>('POST', '/v1/adventure/choose', { adventureId, optionIndex });
  },
  async adventureCurrent() {
    return minigameRequest<AdventureCurrent>('GET', '/v1/adventure/current');
  },
  async adventureHistory(limit = 10) {
    return minigameRequest<AdventureHistoryEntry[]>('GET', `/v1/adventure/history?limit=${limit}`);
  },
};

// ── Bienvenida ────────────────────────────────────────────────────────────────
export interface ReengagementStatus {
  petId: string;
  nickname: string;
  lastLoginAt: string;
  absenceMs: number;
  active: boolean;
  tier: 'happy' | 'offended' | 'sad' | 'emotional' | null;
  plan: { tier: string; message: string; requiredActions: string[]; requiredClicks: number; gift: boolean } | null;
  recoveryBuff: { active: boolean; until: string | null; remainingMs: number };
  alreadyCompleted: boolean;
}

export interface ReengagementDiary {
  petId: string;
  entries: { category: string; text: string; icon: string }[];
  generatedAt: string;
  cached: boolean;
}

// ── Entrenamiento ─────────────────────────────────────────────────────────────
export type TrainingElement = 'fire' | 'water' | 'plant' | 'electric' | 'shadow' | 'light';

export interface TrainingFloor {
  floor: number;
  enemyElement: TrainingElement;
  enemyName: string;
  enemyLevel: number;
}

export interface TrainingStart {
  sessionId: string;
  petId: string;
  seed: number;
  floors: TrainingFloor[];
  hearts: number;
  currentFloor: number;
}

export interface TrainingSubmit {
  floor: number;
  result: 'advanced' | 'failed' | 'completed' | 'failed_dungeon';
  enemyElement: TrainingElement;
  playerElement: TrainingElement;
  multiplier: number;
  hearts: number;
  currentFloor: number;
  status: string;
  buff?: { multiplier: number; expiresAt: string };
  predictionBonus?: boolean;
  xp?: number;
  coins?: number;
}

export interface TrainingBuff {
  active: boolean;
  buff: { petId: string; multiplier: number; stats: string[]; expiresAt: string; remainingMs: number } | null;
}

// ── Cocina ────────────────────────────────────────────────────────────────────
export interface CookingDailyMenu {
  date: string;
  recipeId: string;
  recipeName: string;
  difficulty: number;
  ingredients: string[];
  buff: { stat: string; value: number };
  bonus: string;
}

export interface CookingStart {
  sessionId: string;
  recipeId: string;
  recipeName: string;
  difficulty: number;
  /** Orden correcto de la receta. */
  ingredients: string[];
  /** Los mismos ingredientes barajados: así se muestran al jugador. */
  order: string[];
  hotPotPositions: number[];
  durationSeconds: number;
  seed: number;
  expiresAt: string;
}

export interface CookingSubmit {
  score: number;
  buff: { stat: string; value: number; durationMs: number } | null;
  coins?: number;
  correctPct?: number;
  message?: string;
}

// ── Aventura ──────────────────────────────────────────────────────────────────
export interface AdventureScene {
  order: number;
  text: string;
  choices: { label: string; hint: string }[];
  isFinal?: boolean;
  chosenOption?: number | null;
}

export interface AdventureStart {
  adventureId: string;
  theme: string;
  sceneCount: number;
  currentScene: number;
  scene: AdventureScene;
  isPremium: boolean;
  retriesLeft: number;
}

export type AdventureChoose =
  | { advanced: true; scene: AdventureScene }
  | {
      completed: true;
      outcome: 'win' | 'partial' | 'lose';
      score: number;
      rewards: { xp: number; coins: number };
      memory: string;
    };

export type AdventureCurrent =
  | { active: false }
  | {
      active: true;
      adventureId: string;
      theme: string;
      sceneCount: number;
      currentScene: number;
      scene: AdventureScene | null;
      isPremium: boolean;
      retriesLeft: number;
    };

export interface AdventureHistoryEntry {
  adventureId: string;
  theme: string;
  sceneCount: number;
  outcome: 'win' | 'partial' | 'lose' | null;
  score: number | null;
  xpAwarded: number;
  coinsAwarded: number;
  isPremium: boolean;
  startedAt: string;
  finishedAt: string | null;
}

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
  if (!res.ok) throw new ApiError(data?.message || 'Error en la petición', res.status);
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

// ── Amistad + Co-op ─────────────────────────────────────────────────────────
export interface CoopFriend {
  id: string;
  status: 'pending' | 'accepted' | 'revoked';
  direction: 'incoming' | 'outgoing';
  otherUserId: string;
  otherDisplayName: string;
  otherPet: { petId: string; nickname: string; speciesName: string } | null;
  updatedAt: string;
}

export interface CoopVisitLog {
  visitorId: string;
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
  leader: { userId: string; displayName: string };
  members: ClanMember[];
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
}

export interface HabitatVisitor {
  visitorId: string;
  visitorName: string;
  pet: PetIdentity;
  startedAt: string;
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
  claimed: boolean;
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
