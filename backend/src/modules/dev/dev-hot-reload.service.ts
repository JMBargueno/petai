import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { GameDataService, GameDataSnapshot, ReloadResult, isReloadError } from '../game-data/game-data.service';
import { GAME_DATA_FILES, GameDataFileKey } from '../game-data/game-data.schemas';

export interface DevReloadRequest {
  /** Clave del archivo a recargar (balance|species|patterns|foods|skills|missions). */
  file: string;
  /** Origen del contenido: `inline` (usa `content`) o `disk` (lee `shared/game-data/<file>.json`). */
  source: 'inline' | 'disk';
  /** Obligatorio si `source === 'inline'`. JSON como string u objeto. */
  content?: string | unknown;
}

@Injectable()
export class DevHotReloadService {
  constructor(private readonly gameData: GameDataService) {}

  /**
   * Aplica un hot-reload de game data. Devuelve `200 { ok, file, version, changedFields }` o lanza:
   *  - `404` si `file` es desconocido.
   *  - `400` si el JSON está malformado o falla el schema/cross-ref (snapshot anterior conservado).
   */
  async hotReload(req: DevReloadRequest): Promise<{ ok: boolean; file: GameDataFileKey; version?: string; changedFields: string[] }> {
    if (!req || typeof req.file !== 'string' || !GAME_DATA_FILES.includes(req.file as GameDataFileKey)) {
      throw new NotFoundException(`File de game-data desconocido: ${String(req?.file)}`);
    }
    const file = req.file as GameDataFileKey;

    if (req.source === 'inline') {
      if (req.content === undefined || req.content === null) {
        throw new BadRequestException({ ok: false, file, errors: [{ path: 'content', message: 'content es obligatorio con source=inline' }] });
      }
      const data = this.parseInline(req.content, file);
      return this.apply(file, data, 'inline');
    }

    // source === 'disk'
    const data = this.gameData.readFileFromDisk(file);
    if (data === null) throw new NotFoundException(`No existe ${file}.json en disco`);
    return this.apply(file, data, 'disk');
  }

  /**
   * Reload desde disco (lo dispara el watcher). NO lanza: devuelve el resultado de
   * `GameDataService.reload()` para que el llamador lo loguee (ok / errores de validación).
   */
  reloadFromDisk(file: GameDataFileKey): ReloadResult {
    const data = this.gameData.readFileFromDisk(file);
    if (data === null) return { ok: false as const, file, errors: [{ path: '<root>', message: `${file}.json no existe en disco` }] };
    return this.gameData.reload(file, data, 'disk');
  }

  private parseInline(content: string | unknown, file: GameDataFileKey): unknown {
    if (typeof content !== 'string') return content; // ya es un objeto
    try {
      return JSON.parse(content);
    } catch (err) {
      throw new BadRequestException({
        ok: false,
        file,
        errors: [{ path: 'content', message: `JSON malformado: ${(err as Error).message}` }],
      });
    }
  }

  private apply(file: GameDataFileKey, data: unknown, source: GameDataSnapshot['source']) {
    const result = this.gameData.reload(file, data, source);
    if (isReloadError(result)) {
      throw new BadRequestException({ ok: false, file, errors: result.errors });
    }
    return { ok: true, file, version: result.version, changedFields: result.changedFields };
  }
}