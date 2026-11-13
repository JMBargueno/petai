import { ApiProperty } from '@nestjs/swagger';

/**
 * Campos de vínculo añadidos a la respuesta de `GET /pets/:id` (feature 006,
 * `contracts/api-contract.md`). `GET /pets/:id` ya devuelve el pet con el lazy tick aplicado,
 * de modo que `bonding` y `lastInteractionAt` son el estado al día (sin decaimiento pendiente).
 */
export class BondingFieldsDto {
  @ApiProperty({ description: 'Valor del vínculo, acotado a [0,100], 2 decimales', example: 30, minimum: 0, maximum: 100 })
  bonding: number;

  @ApiProperty({
    description: 'Id del rango: acquainted | companion | ally | soulmate | legend',
    example: 'companion',
  })
  bondingTier: string;

  @ApiProperty({ description: 'Nombre display del rango (español)', example: 'Compañero' })
  bondingTierName: string;

  @ApiProperty({ description: 'Última vez que hubo interacción (base del decaimiento), ISO-8601', example: '2026-11-13T10:00:00.000Z' })
  lastInteractionAt: string;
}

/** Una fila del historial de cambios (`BondingEvent`), en orden descendente por `createdAt`. */
export class BondingEventDto {
  @ApiProperty({ description: 'Id del evento', example: 'e1' })
  id: string;

  @ApiProperty({ description: 'Variación signada: + incremento, − decaimiento', example: 2 })
  delta: number;

  @ApiProperty({
    description: 'Motivo: feed | battle | minigame | chat | clean | sleep | evolve | decay',
    example: 'feed',
  })
  reason: string;

  @ApiProperty({ description: 'bonding resultante después del cambio', example: 57 })
  value: number;

  @ApiProperty({ description: 'Momento del cambio, ISO-8601', example: '2026-11-11T12:00:00.000Z' })
  createdAt: string;
}

/** Página del historial de `BondingEvent` (paginación por cursor `createdAt` ascendente-invertido). */
export class HistoryPageDto {
  @ApiProperty({ type: [BondingEventDto] })
  items: BondingEventDto[];

  @ApiProperty({
    description: 'createdAt ISO-8601 de la última fila (para la siguiente página); null si no hay más',
    nullable: true,
  })
  nextCursor: string | null;
}

/** Estado del decaimiento (feature 006): cuánto se ha "enfriado" el vínculo por abandono. */
export class DecayInfoDto {
  @ApiProperty({ description: 'Puntos de decaimiento por día (balance)', example: 0.5 })
  decayRatePerDay: number;

  @ApiProperty({ description: 'Si ahora mismo el abandono está produciendo decaimiento', example: true })
  isDecaying: boolean;

  @ApiProperty({ description: 'Ventana de gracia en horas (sin decaimiento)', example: 24 })
  graceWindowHours: number;

  @ApiProperty({ description: 'Horas de abandono a partir de las que decae', example: 48 })
  decayStartHours: number;

  @ApiProperty({ description: 'Horas transcurridas desde la última interacción (2 dec.)', example: 72.4 })
  hoursSinceInteraction: number;

  @ApiProperty({ description: 'Decaimiento total acumulado (para UI "cuánto se enfrió")', example: 0.75 })
  acumulatedDecay: number;
}

/** Desbloqueos por umbral de vínculo (los consume el escritorio para animar; el backend solo declara). */
export class UnlocksDto {
  @ApiProperty({ description: 'El pet saluda al iniciar sesión (>= 30, companion)', example: true })
  greeting: boolean;

  @ApiProperty({
    description: 'La IA recupera conversaciones previas (>= 60, ally — o intelligence >= MEMORY_UNLOCK)',
    example: true,
  })
  memoryRecall: boolean;

  @ApiProperty({ description: 'Reacciones emocionales personalizadas (>= 80, soulmate)', example: false })
  emotionalReactions: boolean;

  @ApiProperty({ description: 'Patrón exclusivo desbloqueado (>= 100, legend)', example: false })
  patternUnlocked: boolean;

  @ApiProperty({ description: 'Duerme cerca del cursor, animación de escritorio (>= 100, legend)', example: false })
  sleepNearCursor: boolean;
}

/** Respuesta de `GET /pets/:id/bonding` (feature 006, `contracts/api-contract.md`). */
export class BondingDetailResponseDto {
  @ApiProperty({ description: 'Vínculo actual (post tick)', example: 61.25, minimum: 0, maximum: 100 })
  value: number;

  @ApiProperty({ description: 'Id del rango', example: 'ally' })
  tier: string;

  @ApiProperty({ description: 'Nombre del rango', example: 'Aliado' })
  tierName: string;

  @ApiProperty({ description: 'Última interacción, ISO-8601', example: '2026-11-10T08:00:00.000Z' })
  lastInteractionAt: string;

  @ApiProperty({ type: HistoryPageDto })
  history: HistoryPageDto;

  @ApiProperty({ type: DecayInfoDto })
  decayInfo: DecayInfoDto;

  @ApiProperty({ type: UnlocksDto })
  unlocks: UnlocksDto;
}
