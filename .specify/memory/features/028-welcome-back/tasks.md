# Tasks: "Welcome Back" — Re-engagement

## Backend

- [x] T1: Extender `Pet` en Prisma (lastLoginAt, absenceDiary, recoveryBuffUntil, welcomeBackTier, lastWelcomeBackAt)
- [x] T2: Crear `reengagement.module.ts`
- [x] T3: Crear `diary.service.ts` (genera 3-5 viñetas por categoría, persiste)
- [x] T4: Crear `reengagement.service.ts`:
  - [x] `computeAbsence(lastLoginAt)` — ms + tramo
  - [x] `status(userId)` — pet activo, tramo, plan, buff
  - [x] `diary(userId)` — generar/persistir diario
  - [x] `forgive(userId, action)` — validar ritual, aplicar buff, regalo
  - [x] `applyRecoveryBuff(petId)` — 24h anti-decaimiento
  - [x] `grantGift(userId)` — item rarity ≥ rare + 200 coins
- [x] T5: Crear `reengagement.controller.ts`:
  - [x] GET /v1/reengagement/status
  - [x] GET /v1/reengagement/diary
  - [x] POST /v1/reengagement/forgive
- [x] T6: Registrar `ReengagementModule` en `app.module.ts`
- [x] T7: Migración Prisma (auto-generada al correr)

## Tests

- [ ] T8: Unit: diary-generator (24h→3, 7d→5, edge 0min)
- [ ] T9: Unit: computeAbsence boundaries (24h, 48h, 7d, 30d)
- [ ] T10: Unit: ritual validation por tramo
- [ ] T11: Integration: full flow 48h (5 clicks → buff), 7d (care), 30d (gift)
- [ ] T12: Integration: anti-spam (no repite en 30min)

## Dependencias

- `AuthModule` (JWT, CurrentUser)
- `PrismaModule`
- `PetsModule` (vitals, pet activo)
- `BondingModule` (incremento natural)
- `InventoryModule` (regalo)
