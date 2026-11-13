/**
 * Wrapper del balance simulator para el CLI. Importa el motor PURO del backend
 * (`backend/src/modules/battles/combat/battle-sim.ts`) — que a su vez reutiliza `engine.ts` y
 * `rng.ts` — de modo que `simulate` corre 100 % offline y de forma determinista sin backend/DB.
 */
import { simulateBalance, SimReport } from '../../../../backend/src/modules/battles/combat/battle-sim';
import { loadGameData } from './game-data';

export interface SimulateArgs {
  /** Nº de combates (> 0). */
  combats: number;
  /** Semilla del PRNG determinista. */
  seed: number;
  /** Directorio opcional de game-data (por defecto `shared/game-data`). */
  dataDir?: string;
}

/** Ejecuta la simulación offline y devuelve el reporte determinista. */
export function runSimulate(args: SimulateArgs): SimReport {
  const { balance, species, skills } = loadGameData(args.dataDir);
  return simulateBalance({ species, skills, balance, combats: args.combats, seed: args.seed });
}