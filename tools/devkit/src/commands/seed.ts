import { Command } from 'commander';
import { HttpClient } from '../lib/http-client';
import { buildSeedPlan, parseLevelRange } from '../lib/seed-gen';
import { loadGameData } from '../lib/game-data';

const DEFAULT_API = process.env.PETAI_API_URL ?? 'http://localhost:3000/v1';

export function registerSeedCommand(program: Command) {
  program
    .command('seed')
    .description('Seed rápido de usuarios/mascotas vía POST /dev/seed (o preview local con --dry-run).')
    .requiredOption('--users <n>', 'número de usuarios a crear (>= 0)')
    .requiredOption('--pets <n>', 'número de mascotas a crear (>= 0)')
    .option('--level <range>', 'rango de nivel, p. ej. range(1,100) o 1-100', 'range(1,10)')
    .option('--dry-run', 'no persiste: muestra el plan local (offline)')
    .option('--api <url>', 'base URL del backend', DEFAULT_API)
    .option('--seed <n>', 'semilla para un preview determinista (solo con --dry-run)')
    .action((opts) => {
      const users = Number(opts.users);
      const pets = Number(opts.pets);
      if (!Number.isInteger(users) || users < 0 || !Number.isInteger(pets) || pets < 0) {
        console.error('Error: --users y --pets deben ser enteros >= 0');
        process.exit(1);
      }

      let level: { min: number; max: number };
      try {
        level = parseLevelRange(String(opts.level));
      } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
      }

      if (opts.dryRun) {
        const { species } = loadGameData();
        const plan = buildSeedPlan(
          { users, pets, level, seed: opts.seed !== undefined ? Number(opts.seed) : undefined },
          species,
        );
        console.log(JSON.stringify({ dryRun: true, users, pets, level, distribution: plan.distribution }, null, 2));
        return;
      }

      const client = new HttpClient({ baseUrl: opts.api });
      client
        .post('/dev/seed', { users, pets, level, dryRun: false })
        .then((res) => console.log(JSON.stringify(res, null, 2)))
        .catch((err) => {
          console.error((err as Error).message);
          process.exit(1);
        });
    });
}