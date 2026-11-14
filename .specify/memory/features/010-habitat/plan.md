# Plan: Feature 010 — Hábitat

## Architecture
- New NestJS module at `backend/src/modules/habitat/`
- Prisma models: Habitat, HabitatItem
- Game data: `shared/game-data/habitats.json`
- Endpoints: GET /v1/habitat, POST /v1/habitat/furniture/:id/place, DELETE /v1/habitat/furniture/:id, GET /v1/habitat/buffs

## Data Model
- **Habitat**: petId (unique), habitatSeed, rooms (Json - unlocked room ids)
- **HabitatItem**: id, petId, furnitureId, roomId, x, y, purchasedAt
- **habits.json**: rooms config (id, name, gridW, gridH, unlockStage), furniture catalog (id, name, room, price, currency, buffs)

## Implementation Steps
1. Create Prisma models (Habitat, HabitatItem)
2. Create habitats.json game data
3. Implement HabitatModule + HabitatController + HabitatService
4. Register module in app.module.ts
5. Add endpoints with proper DTOs and guards

## Integration Points
- PetsModule: read Pet.stage for room unlocking
- UsersModule: deduct coins/gems on purchase
- GameDataModule: serve habitats.json
- RealtimeModule: emit habitat:updated events
