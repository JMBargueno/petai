import { writable } from 'svelte/store';
import type { RewardReceived } from './api';

/**
 * Recompensas recibidas (canje de voucher o regalo del equipo) pendientes de celebrar. La misma
 * entrega puede llegar dos veces —respuesta del canje y evento `reward:received`—: se celebra una
 * sola vez por `redemptionId`.
 */
export const rewardToCelebrate = writable<RewardReceived | null>(null);

const seen = new Set<string>();
const MAX_SEEN = 200;

/** Encola la celebración si es nueva. Devuelve true si se va a celebrar. */
export function celebrateReward(reward: RewardReceived | null | undefined): boolean {
  if (!reward?.redemptionId || seen.has(reward.redemptionId)) return false;
  if (seen.size >= MAX_SEEN) seen.clear();
  seen.add(reward.redemptionId);
  rewardToCelebrate.set(reward);
  return true;
}

/** Solo tests. */
export function resetRewardsForTest() {
  seen.clear();
  rewardToCelebrate.set(null);
}

export const CHEST_LABELS: Record<string, string> = {
  bronze: 'Bronce',
  silver: 'Plata',
  gold: 'Oro',
  diamond: 'Diamante',
  mythic: 'Mítico',
};

export type RewardLineKind = 'coins' | 'gems' | 'pro' | 'chest' | 'accessory';

/** Desglose legible de lo recibido, en el orden en que se enseña. */
export function rewardLines(g: RewardReceived['granted']): { kind: RewardLineKind; text: string }[] {
  const out: { kind: RewardLineKind; text: string }[] = [];
  if (g.coins) out.push({ kind: 'coins', text: `+${g.coins.toLocaleString('es')} monedas` });
  if (g.gems) out.push({ kind: 'gems', text: `+${g.gems.toLocaleString('es')} gemas` });
  if (g.proDays) {
    const until = g.proUntil ? ` (hasta el ${new Date(g.proUntil).toLocaleDateString('es', { day: 'numeric', month: 'short' })})` : '';
    out.push({ kind: 'pro', text: `+${g.proDays} ${g.proDays === 1 ? 'día' : 'días'} de Pro${until}` });
  }
  for (const c of g.chests) out.push({ kind: 'chest', text: `${c.qty} × cofre de ${CHEST_LABELS[c.type] ?? c.type}` });
  for (const a of g.accessories) out.push({ kind: 'accessory', text: a.alreadyOwned ? `${a.name} (ya la tenías)` : `Prenda: ${a.name}` });
  return out;
}
