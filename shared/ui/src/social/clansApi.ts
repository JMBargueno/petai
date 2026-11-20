/**
 * Puerto de la pantalla de Clanes: las operaciones que necesita, sin saber cómo llegan al servidor.
 * El escritorio las implementa con su `api`; Android, con `query` y `perform` del núcleo.
 *
 * Clanes es la pantalla con más lógica entre llamadas (confirmaciones, rangos, chat y objetivos),
 * así que en vez de repartirla entre una vista y dos contenedores iguales, la vista entera vive en
 * la biblioteca y recibe este puerto.
 */
import type { ClanGoal, ClanGoalMetric, ClanMessage, ClanRole, ClanSummary } from './types';

export interface ClansApi {
  /** Tu clan, o `null` si aún no tienes. */
  getMyClan(): Promise<ClanSummary | null>;
  /** El clan con su roster al día. */
  getClanMembers(clanId: string): Promise<ClanSummary>;
  /** Tú (para saber tu rango). */
  getMe(): Promise<{ id?: string } | null>;
  getClanGoals(clanId: string): Promise<ClanGoal[]>;
  getClanMessages(clanId: string, opts?: { limit?: number }): Promise<ClanMessage[]>;
  createClan(clan: { name: string; tag: string; description?: string }): Promise<unknown>;
  joinClan(tag: string): Promise<unknown>;
  inviteToClan(clanId: string, target: { handle: string }): Promise<unknown>;
  leaveClan(): Promise<unknown>;
  kickClanMember(clanId: string, userId: string): Promise<unknown>;
  setClanMemberRole(clanId: string, userId: string, role: Exclude<ClanRole, 'creator'>): Promise<unknown>;
  transferClanCreator(clanId: string, userId: string): Promise<unknown>;
  updateClan(clanId: string, patch: { name?: string; description?: string | null }): Promise<unknown>;
  disbandClan(clanId: string): Promise<unknown>;
  deleteClanMessage(clanId: string, messageId: string): Promise<unknown>;
  createClanGoal(clanId: string, goal: { title: string; metric: ClanGoalMetric; target: number }): Promise<ClanGoal>;
  addClanGoalProgress(clanId: string, goalId: string, amount: number): Promise<ClanGoal>;
  deleteClanGoal(clanId: string, goalId: string): Promise<unknown>;
  sendClanMessage(clanId: string, body: string): Promise<ClanMessage | null>;
  /** Un error, en una frase para el jugador. */
  errorText(e: unknown, fallback?: string): string;
}
