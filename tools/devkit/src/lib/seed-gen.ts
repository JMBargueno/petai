import { randomInt } from 'node:crypto';
import { createRng } from '../../../../backend/src/modules/battles/combat/rng';

export interface SeedPlanArgs {
  users: number;
  pets: number;
  level: { min: number; max: number };
  /** Semilla opcional para que el preview sea determinista (si no, usa `crypto`). */
  seed?: number;
}

export interface SeedPlan {
  users: number;
  pets: number;
  level: { min: number; max: number };
  distribution: { byRarity: Record<string, number>; byLevel: Record<number, number> };
}

/**
 * Genera un plan de seed OFFLINE (sin tocar la DB) y su distribución por rareza/nivel. Se usa en
 * el modo `--dry-run` para previsualizar. La persistencia real la hace el backend en
 * `POST /dev/seed`. Con `seed` fijo el resultado es determinista; sin `seed` usa `crypto` (I).
 */
export function buildSeedPlan(args: SeedPlanArgs, species: any[]): SeedPlan {
  if (species.length === 0) throw new Error('No hay especies para generar el plan de seed');
  const rng = createRng(args.seed ?? randomInt(2 ** 31));
  const byRarity: Record<string, number> = {};
  const byLevel: Record<number, number> = {};

  for (let i = 0; i < args.pets; i++) {
    const sp = species[Math.floor(rng() * species.length)];
    const lvl = args.level.min + Math.floor(rng() * (args.level.max - args.level.min + 1));
    byRarity[sp.rarity] = (byRarity[sp.rarity] ?? 0) + 1;
    byLevel[lvl] = (byLevel[lvl] ?? 0) + 1;
  }

  return { users: args.users, pets: args.pets, level: args.level, distribution: { byRarity, byLevel } };
}

/** Parsea `range(min,max)` (o `min-max`) en `{ min, max }`. */
export function parseLevelRange(raw: string): { min: number; max: number } {
  const m = raw.match(/range\((\d+)\s*,\s*(\d+)\)/i);
  let min: number;
  let max: number;
  if (m) {
    min = Number(m[1]);
    max = Number(m[2]);
  } else {
    const dash = raw.match(/^(\d+)\s*-\s*(\d+)$/);
    if (dash) {
      min = Number(dash[1]);
      max = Number(dash[2]);
    } else {
      const n = Number(raw);
      min = Number.isInteger(n) ? n : 1;
      max = min;
    }
  }
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    throw new Error(`Rango de nivel inválido: ${raw} (usa range(min,max) con min>=1 y max>=min)`);
  }
  return { min, max };
}