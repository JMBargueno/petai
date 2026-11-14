import { getSocket } from '../../lib/socket';
import { getAccessToken } from '../../lib/api';

/**
 * Cliente de la API de logros (feature 008) + listener de `achievement:unlocked` vía WebSocket.
 *
 * Usa fetch directo contra la API (base `/v1`) en lugar de openapi-fetch para mantener este módulo
 * autónomo; las formas de los DTOs coinciden con `shared/openapi/openapi.json`.
 */

export type AchievementStatus = 'locked' | 'in_progress' | 'unlocked';

export interface AchievementReward {
  coins: number;
  gems: number;
  xp: number;
  itemId: string | null;
}

export interface Achievement {
  id: string;
  category: string;
  name: string;
  description: string;
  tier: string;
  target: number;
  current: number;
  status: AchievementStatus;
  unlockedAt: string | null;
  claimed: boolean;
  reward: AchievementReward;
}

export interface AchievementListResponse {
  timestamp: string;
  achievementsPublic: boolean;
  categories: Record<string, Achievement[]>;
}

export interface Star {
  id: string;
  x: number;
  y: number;
  status: AchievementStatus;
  name: string;
  tier: string;
}

export interface ConstellationResponse {
  category: string;
  name: string;
  stars: Star[];
  connections: [string, string][];
}

export interface AchievementUnlockedPayload {
  id: string;
  name: string;
  category: string;
  tier: string;
  reward: AchievementReward;
}

/** Token de sesión. En la app de escritorio lo aporta el módulo de autenticación (`$lib/api`). */

async function authHeaders(): Promise<HeadersInit> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const BASE = '/v1';

export async function fetchAchievements(): Promise<AchievementListResponse> {
  const res = await fetch(`${BASE}/achievements`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Error al cargar logros: ${res.status}`);
  return res.json();
}

export async function fetchConstellation(cat: string): Promise<ConstellationResponse> {
  const res = await fetch(`${BASE}/achievements/constellation/${encodeURIComponent(cat)}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Error al cargar la constelación ${cat}: ${res.status}`);
  return res.json();
}

export async function claimAchievement(id: string): Promise<{ achievement: { claimed: boolean }; reward: AchievementReward }> {
  const res = await fetch(`${BASE}/achievements/${encodeURIComponent(id)}/claim`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Error al reclamar ${id}: ${res.status}`);
  return res.json();
}

/** Suscripción a `achievement:unlocked`. Devuelve una función para desuscribirse. */
export function onAchievementUnlocked(cb: (payload: AchievementUnlockedPayload) => void): () => void {
  const socket = getSocket();
  if (!socket) return () => {};
  const handler = (payload: AchievementUnlockedPayload) => cb(payload);
  socket.on('achievement:unlocked', handler);
  return () => {
    socket.off('achievement:unlocked', handler);
  };
}
