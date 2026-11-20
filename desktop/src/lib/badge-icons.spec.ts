import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import achievements from '../../../shared/game-data/achievements.json';

// `badge-icons.ts` (en @pockai/ui) importa componentes Svelte (lucide), que el entorno node de Vitest no compila:
// se comprueba el mapa leyendo su código fuente.
const source = readFileSync(path.resolve(__dirname, '../../../shared/ui/src/badge-icons.ts'), 'utf8');

describe('badge-icons', () => {
  it('tiene un icono lucide para cada insignia de achievements.json', () => {
    const missing = (achievements as any).achievements
      .map((a: any) => a.badge?.icon as string)
      .filter((icon: string) => !source.includes(`'${icon}':`));
    expect(missing).toEqual([]);
  });
});
