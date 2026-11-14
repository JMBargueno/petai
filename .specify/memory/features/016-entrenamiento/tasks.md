# Tasks: Entrenamiento Elemental

## Backend

- [x] T1: Crear `TrainingSession` en Prisma schema
- [x] T2: Crear `training.module.ts` (NestJS module)
- [x] T3: Crear `training.types.ts` (interfaces TypeScript)
- [x] T4: Crear `training.service.ts` con lógica completa:
  - [x] `startTraining(userId, petId)` - validar, generar seed, construir dungeon
  - [x] `submitFloor(userId, petId, element, prediction)` - validar, resolver piso
  - [x] `getActiveBuff(userId, petId)` - consultar buff activo
  - [x] `buildDungeon(seed)` - generar 5 pisos deterministas
  - [x] `resolveFloor(seed, floor, playerElement, enemyElement)` - evaluar afinidad
- [x] T5: Crear `training.controller.ts` con endpoints:
  - [x] POST /v1/training/start
  - [x] POST /v1/training/submit
  - [x] GET /v1/training/active-buff
- [x] T6: Registrar TrainingModule en `app.module.ts`
- [x] T7: Migración Prisma (auto-generada al correr)

## Tests

- [ ] T8: Unit test: buildDungeon con seed fija (5 pisos, elementos reproducibles)
- [ ] T9: Unit test: resolveFloor con cada combinación de afinidad
- [ ] T10: Integration test: start → submit×5 → buff activo
- [ ] T11: Integration test: fallar dungeon (0 hearts → sin buff)
- [ ] T12: Integration test: límites diarios, cooldown

## Dependencias

- Motor de combate (elementMultiplier)
- PetService (validar pet)
- GameDataService (balance.json)
