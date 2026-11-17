import { getSocket } from '../../lib/socket';
import { api } from '../../lib/api';
import type {
  AchievementListResponse,
  AchievementReward,
  ConstellationResponse,
} from '../../lib/api';

/**
 * Cliente de la API de logros + listener de `achievement:unlocked` vía WebSocket.
 *
 * Las peticiones pasan por `$lib/api` (base `API_BASE_URL` y renovación de sesión), así funcionan
 * también fuera del proxy de Vite (app Tauri empaquetada).
 */
export type {
  Achievement,
  AchievementListResponse,
  AchievementReward,
  AchievementStatus,
  ConstellationResponse,
  ConstellationStar as Star,
} from '../../lib/api';

export interface AchievementUnlockedPayload {
  id: string;
  name: string;
  category: string;
  tier: string;
  /** Icono lucide de la insignia. */
  badgeIcon?: string;
  reward: AchievementReward;
}

export function fetchAchievements(): Promise<AchievementListResponse> {
  return api.getAchievements();
}

export function fetchConstellation(cat: string): Promise<ConstellationResponse> {
  return api.getConstellation(cat);
}

export function claimAchievement(id: string) {
  return api.claimAchievement(id);
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
