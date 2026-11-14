-- AlterTable: S-05 (SDD §3.3) — Invariant de saldos no negativos.
-- Complementa al débito atómico de C-01 (WalletService) y al guard de estado de S-14: aun cuando
-- una réplica o un bug intentara un decremento incorrecto, la BD rechaza los valores negativos.
ALTER TABLE "User" ADD CONSTRAINT "User_coins_non_negative" CHECK ("coins" >= 0);
ALTER TABLE "User" ADD CONSTRAINT "User_gems_non_negative" CHECK ("gems" >= 0);