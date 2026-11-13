import { Command } from 'commander';
import { GAME_DATA_FILES, GameDataFileKey } from '../../../../backend/src/modules/game-data/game-data.schemas';
import { HttpClient } from '../lib/http-client';
import { resolveGameDataDir } from '../lib/game-data';

const DEFAULT_API = process.env.PETAI_API_URL ?? 'http://localhost:3000/v1';

/**
 * `petai-devkit watch` — chokidar sobre `shared/game-data/*.json` (solo los 6 gestionados). Ante
 * change/add hace un debounce breve y POSTea a `POST /dev/hot-reload` (variante entre procesos),
 * logueando el resultado (ok / errores de validación). Ignora el resto de archivos con log.
 */
export function registerWatchCommand(program: Command) {
  program
    .command('watch')
    .description('Monitoriza shared/game-data/*.json y dispara hot-reload (POST /dev/hot-reload).')
    .option('--path <dir>', 'directorio de game-data (por defecto shared/game-data)')
    .option('--api <url>', 'base URL del backend', DEFAULT_API)
    .action((opts) => {
      // require perezoso: `chokidar` solo se carga cuando este comando se ejecuta.
      const chokidar = require('chokidar');
      const dir = resolveGameDataDir(opts.path);
      const client = new HttpClient({ baseUrl: opts.api });

      console.log(`[watch] observando ${dir} (archivos: ${GAME_DATA_FILES.join(', ')})`);
      console.log(`[watch] backend: ${opts.api ?? DEFAULT_API}`);
      console.log('[watch] listo (Ctrl+C para salir)');

      const timers = new Map<string, NodeJS.Timeout>();
      const watcher = chokidar.watch(`${dir}/*.json`, { ignoreInitial: true });

      const onEvent = (event: string, filePath: string) => {
        const base = filePath.split(/[\\/]/).pop() ?? '';
        const file = base.replace(/\.json$/i, '');
        if (!GAME_DATA_FILES.includes(file as GameDataFileKey)) {
          console.log(`[watch] ignorando ${event} de ${base} (no gestionado)`);
          return;
        }
        const prev = timers.get(file);
        if (prev) clearTimeout(prev);
        timers.set(
          file,
          setTimeout(async () => {
            timers.delete(file);
            try {
              const res = await client.post(`/dev/hot-reload`, { file, source: 'disk' });
              console.log(`[watch] OK ${file}: ${JSON.stringify(res)}`);
            } catch (err) {
              console.error(`[watch] ERROR ${file}: ${(err as Error).message}`);
            }
          }, 150),
        );
      };

      watcher.on('add', onEvent);
      watcher.on('change', onEvent);
    });
}