import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GameDataService } from './game-data.service';

@ApiTags('Catalog')
@Controller('catalog')
export class GameDataController {
  constructor(private readonly gameDataService: GameDataService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener catálogo general de juego (especies, balance, patrones y alimentos)' })
  getCatalog() {
    return this.gameDataService.getCatalog();
  }
}
