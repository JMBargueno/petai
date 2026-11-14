import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { runSimulate } from '../lib/battle-sim';

export function registerSimulateCommand(program: Command) {
  program
    .command('simulate')
    .description('Simula N combates in-memory con seed fija y emite un reporte JSON determinista (offline).')
    .requiredOption('--combats <n>', 'número de combates (entero > 0)')
    .option('--seed <n>', 'semilla del PRNG determinista', '42')
    .option('--out <file>', 'escribe el reporte JSON a un archivo')
    .option('--path <dir>', 'directorio de game-data (por defecto shared/game-data)')
    .action((opts) => {
      const combats = Number(opts.combats);
      if (!Number.isInteger(combats) || combats <= 0) {
        console.error('Error: --combats debe ser un entero > 0');
        process.exit(1);
      }
      const seed = Number(opts.seed);
      if (Number.isNaN(seed)) {
        console.error('Error: --seed debe ser un número');
        process.exit(1);
      }

      const started = Date.now();
      const report = runSimulate({ combats, seed, dataDir: opts.path });
      const out = JSON.stringify(report, null, 2);
      if (opts.out) {
        const p = path.resolve(opts.out);
        fs.writeFileSync(p, out + '\n', 'utf8');
        console.log(`Reporte escrito en ${p} (${combats} combates en ${Date.now() - started} ms)`);
      } else {
        console.log(out);
      }
    });
}