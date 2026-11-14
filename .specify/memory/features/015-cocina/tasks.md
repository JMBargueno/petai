# Tasks: Minijuego Cocina

**Feature**: 015-cocina

## Phase 1: Setup
- [ ] T-015-01: Add `CookingSession` model to schema.prisma
- [ ] T-015-02: Create `shared/game-data/recipes.json`
- [ ] T-015-03: Create `cooking.module.ts`
- [ ] T-015-04: Create `cooking.controller.ts`
- [ ] T-015-05: Register in `app.module.ts`

## Phase 2: Core Logic
- [ ] T-015-06: Implement `CookingService.start()` — create session with seed
- [ ] T-015-07: Implement `buildOrder(recipe, seed)` — deterministic ingredient order
- [ ] T-015-08: Implement `CookingService.submit()` — validate score, create buff
- [ ] T-015-09: Implement daily menu (deterministic by date)

## Phase 3: Buff System
- [ ] T-015-10: Implement `CombatBuff` model (or use existing)
- [ ] T-015-11: Apply buff to Fighter in combat (integrate with battles)
- [ ] T-015-12: Cap +15% per stat

## Phase 4: Testing
- [ ] T-015-13: Unit: buildOrder determinism
- [ ] T-015-14: Integration: start → submit → buff created
- [ ] T-015-15: Edge: 20 sessions/day, time expired