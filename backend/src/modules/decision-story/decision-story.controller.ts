import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StoryAnswerDto, storyAnswerSchema, StoryStartDto, storyStartSchema } from './decision-story.schemas';
import { DecisionStoryService } from './decision-story.service';

@ApiTags('Stories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stories')
export class DecisionStoryController {
  constructor(private readonly stories: DecisionStoryService) {}

  @Get('today')
  @ApiOperation({ summary: 'Historias del día (bucket global), cupo del plan y progreso del usuario' })
  today(@CurrentUser() user: any) {
    return this.stories.today(user.id);
  }

  @Get('history')
  @ApiOperation({ summary: 'Historial del usuario: qué contestó en cada historia' })
  history(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.stories.history(user.id, limit ? Number(limit) : 20);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Empezar una historia de hoy (o retomarla). Free 1 al día, Pro 3.' })
  @ApiBody({ schema: { type: 'object', required: ['petId'], properties: { petId: { type: 'string', format: 'uuid' } } } })
  start(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(storyStartSchema)) body: StoryStartDto) {
    return this.stories.start(user.id, id, body.petId);
  }

  @Post(':id/answer')
  @ApiOperation({ summary: 'Responder la escena pendiente; devuelve la consecuencia y la escena siguiente o el resultado' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['sceneIndex', 'optionIndex'],
      properties: { sceneIndex: { type: 'integer' }, optionIndex: { type: 'integer' } },
    },
  })
  answer(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(storyAnswerSchema)) body: StoryAnswerDto) {
    return this.stories.answer(user.id, id, body.sceneIndex, body.optionIndex);
  }
}
