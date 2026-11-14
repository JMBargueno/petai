# Implementation Plan: Torneo Knockout

**Feature**: 014-torneo

## Architecture

Nuevo módulo `backend/src/modules/tournament/`:
- `tournament.module.ts` — NestJS module
- `tournament.controller.ts` — REST endpoints
- `tournament.service.ts` — Lógica de inscripción, seed, payout
- `bracket.service.ts` — Generación y resolución del bracket

## Module Structure
```
backend/src/modules/tournament/
├── tournament.module.ts
├── tournament.controller.ts
├── tournament.service.ts
└── bracket.service.ts
```

## Data Model (Prisma)
- `Tournament`: id, status, entryFee, totalPrizePool, entryDeadline, startedAt, endedAt, createdAt
- `TournamentMatch`: id, tournamentId, round, slot, bestOf, seed1, seed2, winnerId, status
- `TournamentEntry`: id, tournamentId, userId, petId, elo, placement, registeredAt

## Key Decisions
1. **Seeding**: Top 64 by ELO; bracket pairs (1v64, 2v63, ...)
2. **Bot fill**: If <64, fill with generated bots (transparent in UI)
3. **Best-of-2**: 2 seeds → 2 combat simulations → winner takes slot
4. **Payout**: Champion 1000, Finalists 2×500, Semis 4×250 = 3000 total
5. **Entry**: 50 gems, one per user, validated in transaction

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/tournament/current` | Current tournament status |
| POST | `/v1/tournament/enter` | Register (50 gems) |
| GET | `/v1/tournament/bracket` | Full bracket |
| GET | `/v1/tournament/standings` | Standings for user |

## Risks
- Entry race: Use `@@unique([tournamentId, userId])` + transaction
- Bracket resolution: Sequential per round (cron-driven)