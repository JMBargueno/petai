import { Command } from 'commander';
import { HttpClient } from '../lib/http-client';

const DEFAULT_API = process.env.PETAI_API_URL ?? 'http://localhost:3000/v1';

/** `petai-devkit action <feed|battle> --petId=xxx` — test harness vía POST /dev/action. */
export function registerActionCommand(program: Command) {
  program
    .command('action <type>')
    .description('Test harness: invoca una acción del juego (feed|battle) sin UI vía POST /dev/action.')
    .argument('<type>', 'acción a ejecutar: feed | battle')
    .requiredOption('--petId <uuid>', 'id de la mascota (validado en el servidor)')
    .option('--foodId <id>', 'comida para feed (default apple)', 'apple')
    .option('--seed <n>', 'semilla para battle (determinista)')
    .option('--api <url>', 'base URL del backend', DEFAULT_API)
    .action((type, opts) => {
      if (!['feed', 'battle'].includes(type)) {
        console.error(`Error: acción no soportada: ${type} (usa feed o battle)`);
        process.exit(1);
      }

      const args: Record<string, unknown> = {};
      if (type === 'feed' && opts.foodId) args.foodId = opts.foodId;
      if (type === 'battle' && opts.seed !== undefined) args.seed = Number(opts.seed);

      const client = new HttpClient({ baseUrl: opts.api });
      client
        .post('/dev/action', { action: type, petId: opts.petId, args })
        .then((res) => console.log(JSON.stringify(res, null, 2)))
        .catch((err) => {
          console.error((err as Error).message);
          process.exit(1);
        });
    });
}