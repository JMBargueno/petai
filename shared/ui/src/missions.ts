/** Recompensa de una misión en una línea: «50 monedas · 10 XP». */
export function missionRewardLabel(mission: { reward?: { coins?: number; gems?: number; xp?: number } }): string {
  const reward = mission.reward ?? {};
  const parts: string[] = [];
  if (reward.coins) parts.push(`${reward.coins} monedas`);
  if (reward.gems) parts.push(`${reward.gems} gemas`);
  if (reward.xp) parts.push(`${reward.xp} XP`);
  return parts.join(' · ') || '—';
}
