import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { GenesService } from './genes.service';

@ApiTags('Genes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/pets')
export class GenesController {
  constructor(private readonly genes: GenesService) {}

  @Get(':id/genes')
  @ApiOperation({ summary: 'Ver genes y temperamento del pet (revelados y ocultos)' })
  getGenes(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.genes.getPetGenes(user.id, petId);
  }

  @Post(':id/analyze')
  @ApiOperation({ summary: 'Realizar análisis genético (consume 3 gemas, revela 1 gen)' })
  analyze(@CurrentUser() user: any, @Param('id') petId: string) {
    return this.genes.analyzeGene(user.id, petId);
  }
}