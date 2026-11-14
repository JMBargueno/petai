import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AccessibilityService } from './accessibility.service';

@ApiTags('Accessibility')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/accessibility')
export class AccessibilityController {
  constructor(private readonly accessibility: AccessibilityService) {}

  @Get('prefs')
  @ApiOperation({ summary: 'Obtener las prefs de accesibilidad del usuario' })
  @ApiResponse({ status: 200, description: 'Prefs actuales' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  getPrefs(@CurrentUser() user: { id: string }) {
    return this.accessibility.getPrefs(user.id);
  }

  @Put('prefs')
  @ApiOperation({ summary: 'Actualizar prefs de accesibilidad (parcial)' })
  @ApiResponse({ status: 200, description: 'Prefs actualizadas' })
  @ApiResponse({ status: 400, description: 'Valor inválido' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  updatePrefs(@CurrentUser() user: { id: string }, @Body() body: Record<string, unknown>) {
    return this.accessibility.updatePrefs(user.id, body ?? {});
  }

  @Get('minigames/accessible')
  @ApiOperation({ summary: 'Variantes accesibles de minijuegos' })
  @ApiResponse({ status: 200, description: 'Listado de variantes accesibles' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  accessibleMinigames() {
    return this.accessibility.accessibleMinigames();
  }

  @Get('config')
  @ApiOperation({ summary: 'Config centralizada de accesibilidad (tokens/parámetros)' })
  @ApiResponse({ status: 200, description: 'Config de accesibilidad' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  config() {
    return this.accessibility.config();
  }
}
