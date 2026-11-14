# Tasks: Torneo Knockout

**Feature**: 014-torneo

## Phase 1: Setup
- [ ] T-014-01: Add `Tournament`, `TournamentMatch`, `TournamentEntry` to schema.prisma
- [ ] T-014-02: Create `tournament.module.ts`
- [ ] T-014-03: Create `tournament.controller.ts` with 4 endpoints
- [ ] T-014-04: Register in `app.module.ts`

## Phase 2: Bracket Service
- [ ] T-014-05: Implement `BracketService.buildBracket()` — 64-slot seeding
- [ ] T-014-06: Implement `BracketService.resolveMatch()` — best-of-2
- [ ] T-014-07: Implement `BracketService.advanceRound()` — advance winners

## Phase 3: Tournament Service
- [ ] T-014-08: Implement `TournamentService.enter()` — validate ELO, deduct gems
- [ ] T-014-09: Implement `TournamentService.getCurrent()` — status + entries
- [ ] T-014-10: Implement `TournamentService.seed()` — pick top 64 + bots
- [ ] T-014-11: Implement `TournamentService.payOut()` — distribute prizes
- [ ] T-014-12: Cron jobs for auto-seed and auto-resolve

## Phase 4: Testing
- [ ] T-014-13: Unit: buildBracket (64 slots, correct seeding)
- [ ] T-014-14: Unit: resolveMatch best-of-2 (2-0, 2-1, tie-break)
- [ ] T-014-15: Integration: full tournament (enter → seed → resolve → payout)