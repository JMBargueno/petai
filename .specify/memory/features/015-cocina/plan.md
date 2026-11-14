# Implementation Plan: Minijuego Cocina

**Feature**: 015-cocina

## Architecture

Nuevo módulo `backend/src/modules/cooking/` que se registra en AppModule.
- `cooking.module.ts` — NestJS module
- `cooking.controller.ts` — REST endpoints
- `cooking.service.ts` — Lógica de sesión, score, buff

Game data: `shared/game-data/recipes.json` (ingredientes, pasos, buffs)

## Data Model (Prisma)
- `CookingSession`: id, userId, petId, recipeId, seed, ingredients Json, hotPotPositions Json, startedAt, finishedAt, score, buffApplied, createdAt
- `Recipe` (if not in JSON): id, name, ingredients Json, difficulty, unlockLevel, buff Json

## Key Decisions
1. **Session**: 60s timer, 3-4 ingredients to click in order
2. **Hot pot**: Random positions (seed) where clicking loses time
3. **Score**: Based on correct ingredients + time bonus
4. **Buff**: +5 to +10 ATK/DEF/ESP/VEL for 24h, capped at +15%
5. **Daily menu**: Deterministic by date seed → same recipe for all

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/cooking/start` | Start cooking session |
| POST | `/v1/cooking/submit` | Submit result |
| GET | `/v1/cooking/daily-menu` | Today's special recipe |

## Risks
- Score manipulation: Server recalculates with seed
- Buff stacking: Cap +15% per stat