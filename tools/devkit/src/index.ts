import { Command } from 'commander';
import { registerWatchCommand } from './commands/watch';
import { registerSeedCommand } from './commands/seed';
import { registerSimulateCommand } from './commands/simulate';
import { registerActionCommand } from './commands/action';
import { registerValidateCommand } from './commands/validate';

/**
 * Punto de entrada del CLI `petai-devkit` (commander).
 *
 * Subcomandos:
 *   watch     — monitoriza shared/game-data y dispara hot-reload (POST /dev/hot-reload)
 *   simulate  — simula N combates offline con seed fija → reporte JSON determinista
 *   seed      — seed rápido de usuarios/mascotas (POST /dev/seed), con --dry-run local
 *   action    — test harness: feed|battle (POST /dev/action)
 *   validate  — verificación offline de integridad entre los JSON de game data
 */
const program = new Command();
program
  .name('petai-devkit')
  .description('DevKit de PetAI: hot-reload, simulate, seed, action y validate de game data.')
  .version('0.1.0');

registerWatchCommand(program);
registerSeedCommand(program);
registerSimulateCommand(program);
registerActionCommand(program);
registerValidateCommand(program);

program.parseAsync(process.argv).catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});