import { ApiProperty } from '@nestjs/swagger';

export class UpdateDesktopSkillsDto {
  @ApiProperty({
    description: 'Diccionario de autorizaciones de habilidades de escritorio (ej: { drag_throw: true, pomodoro_companion: true })',
    example: {
      drag_throw: true,
      climb_walls: true,
      window_perching: false,
      quick_summon: true,
      pomodoro_companion: true,
      context_awareness: false,
      file_analyzer: false,
    },
  })
  skills!: Record<string, boolean>;
}
