import * as fs from 'fs';
import * as path from 'path';

/** Game-data cargados de `shared/game-data` (los 6 archivos gestionados). */
export interface GameDataFiles {
  balance: any;
  species: any[];
  patterns: any[];
  foods: any[];
  skills: any[];
  missions: any | null;
}

/**
 * Resuelve el directorio `shared/game-data`. Se prueba desde el cwd (repo root / backend) y desde
 * la ubicación del propio archivo, para que funcione sin importar desde dónde se lanza el CLI.
 */
export function resolveGameDataDir(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  const candidates = [
    path.resolve(process.cwd(), 'shared/game-data'),
    path.resolve(process.cwd(), '../shared/game-data'),
    path.resolve(__dirname, '../../../../shared/game-data'),
    path.resolve(__dirname, '../../../shared/game-data'),
    path.resolve(__dirname, '../../../..', 'shared/game-data'),
  ];
  const found = candidates.find((d) => fs.existsSync(d));
  if (!found) throw new Error(`No se encontró shared/game-data (probado: ${candidates.join(', ')})`);
  return found;
}

/** Carga los game-data de disco (sin backend). `missions` es opcional. */
export function loadGameData(dataDir?: string): GameDataFiles {
  const dir = resolveGameDataDir(dataDir);
  const read = (f: string, required: boolean): unknown => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) {
      if (required) throw new Error(`Falta ${f} en ${dir}`);
      return null;
    }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  };
  return {
    balance: read('balance.json', true) as any,
    species: (read('species.json', true) as any[]) ?? [],
    patterns: (read('patterns.json', true) as any[]) ?? [],
    foods: (read('foods.json', true) as any[]) ?? [],
    skills: (read('skills.json', true) as any[]) ?? [],
    missions: (read('missions.json', false) as any) ?? null,
  };
}