# Plan: Feature 011 — Temporadas + Pase

## Architecture
- New NestJS module at `backend/src/modules/seasons/`
- Prisma models: Season, SeasonPass, SeasonProgress, SeasonReward
- Game data: `shared/game-data/seasons.json`
- Services: SeasonsService (core logic), SeasonRewardsService (reward distribution)

## Data Model
- **Season**: id, name, theme, startTime, endTime, isActive
- **SeasonPass**: id, userId, seasonId, purchasedAt, price
- **SeasonProgress**: userId, seasonId, currentTier, tempXp, totalXp
- **SeasonReward**: id, seasonId, tier, rewardType, rewardValue, isPremium, claimedBy (Json)
- **seasons.json**: season configs with tiers and rewards

## Endpoints
- GET /v1/seasons/current → active season with tiers, rewards
- GET /v1/seasons/:id → specific season details
- POST /v1/seasons/pass/purchase → buy season pass (gems)
- GET /v1/seasons/progress → user progress in current season

## Implementation Steps
1. Create Prisma models
2. Create seasons.json game data
3. Implement SeasonsModule + SeasonsController + SeasonsService + SeasonRewardsService
4. Register in app.module.ts
