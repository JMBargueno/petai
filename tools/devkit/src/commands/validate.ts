import { Command } from 'commander';
import {
  GAME_DATA_FILES,
  GameDataFileKey,
  validateFile,
  validateGameData,
} from '../../../../backend/src/modules/game-data/game-data.schemas';
import { loadGameData, resolveGameDataDir } from '../lib/game-data';

/**
 * `petai-devkit validate` — verificación OFFLINE de integridad de los game-data.
 * Reutiliza los schemas zod (`game-data.schemas.ts`) y las reglas de `scripts/validate-game-data.js`
 * (vía `validateGameData`). Exit code 0 si todo es válido, ≠0 si hay errores (lista cada uno).
 */
export function registerValidateCommand(program: Command) {
  program
    .command('validate')
    .description('Valida los game-data offline: schemas zod + referencias cruzadas. Exit 0 si todo válido.')
    .option('--path <dir>', 'directorio de game-data (por defecto shared/game-data)')
    .action((opts) => {
      const errors: string[] = [];
      try {
        const data = loadGameData(opts.path);

        // 1) Validación por archivo (schema zod).
        for (const file of GAME_DATA_FILES) {
          const value = (data as Record<string, unknown>)[file];
          if (file === 'missions' && value == null) continue; // missions es opcional
          const res = validateFile(file as GameDataFileKey, value);
          if (!res.ok) {
            for (const e of res.errors) errors.push(`${file}: ${e.path} → ${e.message}`);
          }
        }

        // 2) Integridad cruzada entre archivos (favoriteFood, rarity, elemento, ligas, skills...).
        const cross = validateGameData({
          balance: data.balance,
          species: data.species,
          patterns: data.patterns,
          foods: data.foods,
          skills: data.skills,
          missions: data.missions,
        });
        for (const c of cross) errors.push(`cross-ref: ${c}`);
      } catch (err) {
        errors.push((err as Error).message);
      }

      if (errors.length > 0) {
        console.error(`✗ ${errors.length} error(es) en los game-data:`);
        for (const e of errors) console.error(`  - ${e}`);
        process.exit(1);
      }

      console.log(`✓ Game-data válidos (${resolveGameDataDir(opts.path)}).`);
    });
}