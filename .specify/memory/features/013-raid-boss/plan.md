# Implementation Plan: Boss de Raid asíncrono

**Feature**: 013-raid-boss
**Branch**: `013-raid-boss`

## Architecture Overview

Nuevo módulo `backend/src/modules/raid/` que se registra en `AppModule`. Reutiliza:
- `PrismaService` (transacciones para HP global)
- `PetsService` (validar pet, energía, getPetById)
- `BattlesService.fighterFromPet()` (armar Fighter del pet)
- `simulateBattle()` del motor de combate
- `createRng()` / `hashSeed()` para seeds deterministas

## Module Structure

```
backend/src/modules/raid/
├── raid.module.ts          # NestJS module (imports: PetsModule, GameDataModule)
├── raid.controller.ts      # Endpoints REST
├── raid.service.ts         # Lógica de negocio
└── dto/
    ├── attack.dto.ts       # Body de POST /attack
    └── raid-response.dto.ts # Respuestas
```

## Data Model (Prisma)

- `Raid` — instanciación semanal: id, element, theme, hpGlobal, hpRemaining, status, startedAt, endsAt, settledAt
- `RaidBoss` — stats del boss (element, level, stats Json, skills Json) — se crea al instanciar
- `RaidParticipant` — contribución: userId, raidId, petId, damageDealt, seed, totalAttacks, lastAttackAt

## Key Decisions

1. **Determinism**: Cada ataque genera seed = `hashSeed(raidId + ":" + petId + ":" + Date.now().toString(36))`
2. **Damage cap**: `maxDamagePerAttack` desde balance.json → raids
3. **Concurrency**: Prisma transaction with `FOR UPDATE` equivalent via updateMany guard
4. **Settle**: When hpRemaining <= 0, distribute gems proportionally in one transaction
5. **Rotation**: Cron job checks if raid expired or settled, creates next raid

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/raid/current` | Boss activo con HP, tema, contribuciones |
| POST | `/v1/raid/attack` | Atacar con un pet |
| GET | `/v1/raid/leaderboard` | Top 100 contribuciones |
| GET | `/v1/raid/history` | Historial de raids pasadas |

## Dependencies

- `@nestjs/schedule` (cron para rotación)
- `PrismaService` (global)
- `PetsModule` (pet validation, energy)
- `GameDataModule` (balance config)

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Race condition en HP global | Prisma transaction + WHERE hpRemaining >= damage |
| CPU spike con muchas simulaciones | Limitar a 10 ataques/24h por usuario |
| Payout desbalanceado | Cap máximo por contributor (minParticipationPct) |