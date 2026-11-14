# Tasks: Boss de Raid asíncrono

**Feature**: 013-raid-boss

## Phase 1: Data Model & Module Setup

- [ ] T-013-01: Agregar modelos `Raid`, `RaidBoss`, `RaidParticipant` a `schema.prisma`
- [ ] T-013-02: Crear `raid.module.ts` con imports de `PetsModule`, `GameDataModule`
- [ ] T-013-03: Crear `raid.controller.ts` con los 4 endpoints
- [ ] T-013-04: Registrar `RaidModule` en `app.module.ts`

## Phase 2: Core Service Logic

- [ ] T-013-05: Implementar `RaidService.getCurrent()` — buscar raid activo o rotar
- [ ] T-013-06: Implementar `RaidService.buildBossFighter()` — Fighter con stats ×3
- [ ] T-013-07: Implementar `RaidService.attack()` — combate determinista + daño
- [ ] T-013-08: Implementar daño transaccional (WHERE hpRemaining >= damage)
- [ ] T-013-09: Validar energía (15) y límite diario (10 combates/24h)

## Phase 3: Ranking & Payout

- [ ] T-013-10: Implementar `RaidService.leaderboard()` — top 100 por damageDealt
- [ ] T-013-11: Implementar `RaidService.settle()` — repartir gemas proporcionales
- [ ] T-013-12: Implementar `RaidService.rotate()` — crear nueva instancia al expirar

## Phase 4: Testing & Polish

- [ ] T-013-13: Unit tests: buildBossFighter, damage cap, determinism
- [ ] T-013-14: Integration test: concurrent attacks (no damage loss)
- [ ] T-013-15: E2E: full raid cycle (3 users → boss dies → payouts)