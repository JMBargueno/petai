import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MissionGenerationService } from './mission-generation.service';

/**
 * Scheduler de misiones: verifica periódicamente qué usuarios necesitan
 * un reset diario o semanal basado en su timezone local.
 *
 * Usa @Cron de @nestjs/schedule: cada 5 minutos se enciende y procesa
 * los usuarios cuya medianoche local (diaria) o lunes 00:00 (semanal) ha llegado.
 *
 * Estrategia: en vez de agendar un job por usuario (miles de jobs),
 * un solo job por lotes detecta a los usuarios cuyo período actual no tiene misiones.
 */
@Injectable()
export class MissionSchedulerService {
  private readonly logger = new Logger(MissionSchedulerService.name);
  /** Tamaño de lote para no saturar la base de datos al recorrer todos los usuarios. */
  private readonly BATCH_SIZE = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly generationService: MissionGenerationService,
  ) {}

  /**
   * Job diario: cada 5 minutos, detecta usuarios que necesitan misiones diarias nuevas.
   * Recorre **todos** los usuarios con al menos un pet de forma paginada (skip/take) para cubrir la
   * base de datos completa, no solo los primeros `BATCH_SIZE` (brecha C3).
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleDailyReset() {
    try {
      const now = new Date();
      let skip = 0;
      let processed = 0;
      // Paginación por lotes: sigue avanzando hasta que un lote devuelva menos de BATCH_SIZE filas.
      for (;;) {
        const users = await this.prisma.user.findMany({
          where: {
            pets: { some: {} }, // Solo usuarios con al menos un pet
          },
          select: { id: true, timezone: true },
          orderBy: { id: 'asc' },
          skip,
          take: this.BATCH_SIZE,
        });
        for (const user of users) {
          await this.ensureDailyMissions(user.id, user.timezone, now);
          processed++;
        }
        if (users.length < this.BATCH_SIZE) break;
        skip += this.BATCH_SIZE;
      }
      if (processed > 0) {
        this.logger.log(`Reset diario de misiones: procesados ${processed} usuarios`);
      }
    } catch (err: any) {
      this.logger.error(`Error en reset diario de misiones: ${err?.message}`);
    }
  }

  /**
   * Job semanal: cada 5 minutos, detecta usuarios que necesitan misiones semanales nuevas.
   * Recorre **todos** los usuarios con al menos un pet de forma paginada (skip/take).
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleWeeklyReset() {
    try {
      const now = new Date();
      let skip = 0;
      let processed = 0;
      for (;;) {
        const users = await this.prisma.user.findMany({
          where: {
            pets: { some: {} },
          },
          select: { id: true, timezone: true },
          orderBy: { id: 'asc' },
          skip,
          take: this.BATCH_SIZE,
        });
        for (const user of users) {
          await this.ensureWeeklyMissions(user.id, user.timezone, now);
          processed++;
        }
        if (users.length < this.BATCH_SIZE) break;
        skip += this.BATCH_SIZE;
      }
      if (processed > 0) {
        this.logger.log(`Reset semanal de misiones: procesados ${processed} usuarios`);
      }
    } catch (err: any) {
      this.logger.error(`Error en reset semanal de misiones: ${err?.message}`);
    }
  }

  /**
   * Verifica si un usuario necesita misiones diarias para el período actual.
   * Si no las tiene, las genera.
   */
  private async ensureDailyMissions(userId: string, timezone: string, now: Date): Promise<void> {
    // El servicio de generación ya verifica si existen misiones para el período actual.
    // Si no hay, las crea. Si sí hay, no hace nada.
    await this.generationService.generateDailyMissions(userId, timezone);
  }

  /**
   * Verifica si un usuario necesita misiones semanales para el período actual.
   */
  private async ensureWeeklyMissions(userId: string, timezone: string, now: Date): Promise<void> {
    await this.generationService.generateWeeklyMissions(userId, timezone);
  }

  /**
   * Limpia misiones caducadas (periodEnd < hace 7 días) para mantener la tabla limpia.
   * Se ejecuta una vez por día a las 03:00 UTC.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredMissions() {
    try {
      const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      const result = await this.prisma.mission.deleteMany({
        where: { periodEnd: { lt: cutoff } },
      });
      if (result.count > 0) {
        this.logger.log(`Limpieza: eliminadas ${result.count} misiones caducadas`);
      }
    } catch (err: any) {
      this.logger.error(`Error en limpieza de misiones: ${err?.message}`);
    }
  }
}