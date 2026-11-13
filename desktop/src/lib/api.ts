import createClient from 'openapi-fetch';
import type { paths } from '@shared/openapi/api-types';

export const API_BASE_URL = typeof window !== 'undefined' && window.location.origin.includes('localhost:')
  ? ''
  : 'http://127.0.0.1:3000';

const client = createClient<paths>({ baseUrl: API_BASE_URL });

let currentToken: string | null = localStorage.getItem('petai_access_token');

export function setAccessToken(token: string | null) {
  currentToken = token;
  if (token) {
    localStorage.setItem('petai_access_token', token);
  } else {
    localStorage.removeItem('petai_access_token');
  }
}

export function getAccessToken(): string | null {
  return currentToken;
}

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
      setAccessToken(res.data.accessToken);
    }
    return res.data;
  },

  async login(email: string, password: string) {
    const res = await client.POST('/v1/auth/login', {
      body: { email, password },
    });
    if (res.error) throw new Error((res.error as any)?.message || 'Credenciales inválidas');
    if (res.data?.accessToken) {
      setAccessToken(res.data.accessToken);
    }
    return res.data;
  },

  logout() {
    setAccessToken(null);
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
    handlers: {
      onDelta: (text: string) => void;
      onTool?: (name: string) => void;
      onAction?: (action: { id: string; tool: string; summary: string; expiresAt: string }) => void;
    },
    signal?: AbortSignal,
  ): Promise<{ message: { id: string; content: string }; intelligence: number; tier: string }> {
    const res = await fetch(`${API_BASE_URL}/v1/pets/${petId}/chat`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      },
      body: JSON.stringify({ message }),
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
        else if (event === 'error') throw new Error(data.message);
        else if (event === 'done') return data;
      }
    }
    throw new Error('La respuesta terminó sin completarse');
  },

  async updateMe(data: { displayName?: string; timezone?: string }) {
    return minigameRequest<any>('PATCH', '/v1/me', data);
  },

  async getPendingActions(petId: string) {
    return minigameRequest<{ id: string; tool: string; summary: string; expiresAt: string }[]>(
      'GET',
      `/v1/pets/${petId}/actions`,
    );
  },

  async confirmAction(petId: string, actionId: string) {
    return minigameRequest<{ ok: boolean; tool: string; summary: string; result: any }>(
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
};

async function minigameRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
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
