import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import { GAME_DATA_FILES, GameDataFileKey } from '../game-data/game-data.schemas';
import { GameDataService, isReloadError } from '../game-data/game-data.service';
import { DevHotReloadService } from './dev-hot-reload.service';

type Watcher = {
  on: (event: string, cb: (event: string, path: string) => void) => Watcher;
  close: () => Promise<void> | void;
};

/**
 * Watcher de `shared/game-data/*.json` (solo los 6 archivos gestionados) vía `chokidar`. Ante
 * `change`/`add` hace un debounce breve y dispara un hot-reload ATÓMICO (swap directo en memoria,
 * mismo proceso). Si la validación falla, se loguea el error y el snapshot anterior se conserva.
 *
 * Solo se registra en `NODE_ENV !== 'production'` (DevModule condicional), así que este servicio
 * nunca existe en producción.
 */
@Injectable()
export class GameDataWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameDataWatcherService.name);
  private watcher: Watcher | null = null;
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly gameData: GameDataService,
    private readonly hotReload: DevHotReloadService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') {
      this.logger.warn(`GameDataWatcher: desactivado en ${process.env.NODE_ENV}`);
      return;
    }

    // require perezoso: `chokidar` (devDependency) solo se carga cuando el watcher arranca (dev).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const chokidar = require('chokidar') as { watch: (pattern: string, opts?: unknown) => Watcher };
    const dataDir = this.gameData.getDataDir();
    this.watcher = chokidar.watch(path.join(dataDir, '*.json'), { ignoreInitial: true });

    const handler = (event: string, filePath: string) => this.scheduleReload(filePath, event);
    this.watcher.on('add', handler);
    this.watcher.on('change', handler);

    this.logger.log(`Watcher de game-data activo sobre ${dataDir} (${GAME_DATA_FILES.length} archivos)`);
  }

  private scheduleReload(filePath: string, event: string) {
    const base = path.basename(filePath);
    const file = base.replace(/\.json$/i, '') as GameDataFileKey;
    if (!GAME_DATA_FILES.includes(file)) {
      this.logger.debug(`Watcher: ignorando ${event} de ${base} (archivo no gestionado)`);
      return;
    }

    // Debounce por archivo para absorber escrituras parciales y eventos duplicados.
    const prev = this.timers.get(file);
    if (prev) clearTimeout(prev);
    this.timers.set(
      file,
      setTimeout(() => {
        this.timers.delete(file);
        const result = this.hotReload.reloadFromDisk(file);
        if (isReloadError(result)) {
          const msg = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
          this.logger.error(`Hot-reload RECHAZADO para ${file}: ${msg}. Snapshot anterior conservado.`);
        } else {
          this.logger.log(`Hot-reload OK: ${file} (cambios: ${result.changedFields.join(', ') || 'n/d'})`);
        }
      }, 120),
    );
  }

  async onModuleDestroy() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    if (this.watcher) await this.watcher.close();
  }
}