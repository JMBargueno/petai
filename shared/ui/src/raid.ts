/** Textos de la raid que repiten los contenedores de cada app. */
export function raidHitText(res: { damage: number; rounds: number }): string {
  return `Infligiste ${res.damage.toLocaleString()} de daño (${res.rounds} asaltos).`;
}

export const RAID_SETTLED = '¡Jefe derrotado! El premio se ha repartido entre quienes participaron.';
