import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TrainingService } from './training.service';

@ApiTags('Training')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('training')
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  @Post('start')
  @ApiOperation({ summary: 'Iniciar dungeon de entrenamiento elemental (5 pisos)' })
  start(
    @CurrentUser() user: any,
    @Body() body: { petId: string },
  ) {
    return this.training.startTraining(user.id, body.petId);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Enviar elección elemental para el piso actual' })
  submit(
    @CurrentUser() user: any,
    @Body() body: { petId: string; element: string; prediction?: string },
  ) {
    return this.training.submitFloor(user.id, body.petId, body.element, body.prediction);
  }

  @Get('active-buff')
  @ApiOperation({ summary: 'Ver buff de entrenamiento activo del pet' })
  activeBuff(@CurrentUser() user: any, @Param('petId') petId?: string) {
    return this.training.getActiveBuff(user.id, petId);
  }
}