import { ApiProperty } from '@nestjs/swagger';

/** Modelo de clima para el contrato OpenAPI (espejo de `WeatherInfo`). */
export class WeatherInfoModel {
  @ApiProperty({
    enum: ['clear', 'cloud', 'rain', 'snow', 'hot', 'cold', 'unknown'],
    example: 'hot',
    description: 'Condición mapeada (WMO + temperatura).',
  })
  condition!: string;

  @ApiProperty({ nullable: true, example: 32, description: 'Temperatura actual (°C)' })
  temperature!: number | null;

  @ApiProperty({ nullable: true, example: 0, description: 'Código WMO de Open-Meteo' })
  weatherCode!: number | null;

  @ApiProperty({ description: 'Sirvió desde la cache de Redis' })
  cached!: boolean;

  @ApiProperty({ nullable: true, description: 'ISO 8601 del último (re)obtenimiento' })
  fetchedAt!: string | null;
}

/** Modelo de actividad para el contrato OpenAPI (espejo de `ActivityInfo`). */
export class ActivityInfoModel {
  @ApiProperty({ description: '¿Hay un heartbeat reciente?' })
  active!: boolean;

  @ApiProperty({ enum: ['active', 'solo'], example: 'active' })
  mode!: string;

  @ApiProperty({ nullable: true, description: 'ISO 8601 del último heartbeat' })
  lastActiveAt!: string | null;
}

/** Modelo de festividad para el contrato OpenAPI (espejo de `FestivalInfo`). */
export class FestivalInfoModel {
  @ApiProperty({ example: 'navidad' })
  id!: string;

  @ApiProperty({ example: 'Navidad' })
  name!: string;

  @ApiProperty({ description: 'Clave de accesorio/overlay', example: 'sombrerito' })
  accessory!: string;

  @ApiProperty({ description: 'Frase de micro-momento', example: '¡Feliz Navidad! 🎄' })
  message!: string;
}

/** Respuesta de `GET /environmental/festivals/upcoming` (espejo de `UpcomingFestival`). */
export class UpcomingFestivalModel {
  @ApiProperty({ example: 'navidad' })
  id!: string;

  @ApiProperty({ example: 'Navidad' })
  name!: string;

  @ApiProperty({ description: 'Fecha ISO del próximo comienzo', example: '2026-12-25' })
  date!: string;

  @ApiProperty({ description: 'Días restantes (0 si es hoy)', example: 42 })
  daysRemaining!: number;
}

/** Respuesta de `GET /environmental/status` (espejo de `EnvironmentalStatus`). */
export class EnvironmentalStatusModel {
  @ApiProperty({ enum: ['late_night', 'morning', 'afternoon', 'evening', 'night'], example: 'afternoon' })
  timeOfDay!: string;

  @ApiProperty({ type: WeatherInfoModel })
  weather!: WeatherInfoModel;

  @ApiProperty({ type: ActivityInfoModel })
  activity!: ActivityInfoModel;

  @ApiProperty({ type: FestivalInfoModel, nullable: true, description: 'Festividad activa o null' })
  festival!: FestivalInfoModel | null;
}
