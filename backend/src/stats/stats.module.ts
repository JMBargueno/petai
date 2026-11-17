import { Global, Module } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsListener } from './stats.listener';

/**
 * Estadísticas de usuario (`UserStat`). Global para que cualquier módulo pueda registrar estadísticas
 * dentro de sus transacciones (p. ej. el gasto de monedas en `WalletService`) sin crear ciclos.
 */
@Global()
@Module({
  providers: [StatsService, StatsListener],
  exports: [StatsService],
})
export class StatsModule {}
