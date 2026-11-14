import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GameDataService } from '../game-data/game-data.service';
import { DevHotReloadService, DevReloadRequest } from './dev-hot-reload.service';
import { DevSeedService, DevSeedRequest } from './dev-seed.service';
import { DevActionService, DevActionRequest } from './dev-action.service';

/**
 * Endpoints de desarrollo (solo `NODE_ENV !== 'production'`; DevModule condicional ⇒ 404 en prod).
 * Son herramientas internas, no parte del contrato público de juego.
 */
@ApiTags('Dev')
@Controller('dev')
export class DevController {
  constructor(
    private readonly gameData: GameDataService,
    private readonly hotReloadService: DevHotReloadService,
    private readonly seedService: DevSeedService,
    private readonly actionService: DevActionService,
  ) {}

  @Post('hot-reload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aplica un hot-reload atómico de game data (200 ok / 400 inválido / 404 desconocido)' })
  hotReload(@Body() body: DevReloadRequest) {
    return this.hotReloadService.hotReload(body);
  }

  @Get('game-data')
  @ApiOperation({ summary: 'Devuelve el snapshot de game-data vigente en memoria' })
  getGameData() {
    return this.gameData.getSnapshot();
  }

  @Post('seed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Seed programático de usuarios y mascotas (crypto, con dryRun)' })
  seed(@Body() body: DevSeedRequest) {
    return this.seedService.seed(body);
  }

  @Post('action')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test harness: invoca una acción del juego (feed/battle) sin UI' })
  action(@Body() body: DevActionRequest) {
    return this.actionService.action(body);
  }
}