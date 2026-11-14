import { Global, Module } from '@nestjs/common';
import { WalletService } from './wallet.service';

/**
 * C-01 / SDD §3.3 — Primitiva económica compartida. `@Global()` para no tener que importarla en los
 * 8+ módulos que hacen cobros/abonos (S-03, S-04, S-05, S-12, S-14).
 */
@Global()
@Module({ providers: [WalletService], exports: [WalletService] })
export class WalletModule {}