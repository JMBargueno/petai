# Tasks: Aventura Narrativa IA

## Backend

- [x] T1: Crear modelos Prisma: Adventure, AdventureScene, AdventureChoice
- [x] T2: Crear `adventure.module.ts`
- [x] T3: Crear `adventure-outcome.ts` (fórmula determinista)
- [x] T4: Crear `adventure-templates.ts` (fallback por elemento)
- [x] T5: Crear `adventure-orchestrator.service.ts`:
  - [x] `generateScene(briefing, seed, sceneNum)` - LLM call con validación
  - [x] `resolveOutcome(pet, decisions, seed)` - cálculo determinista
  - [x] `buildBriefing(pet, memories)` - briefing para LLM
- [x] T6: Crear `adventure.service.ts`:
  - [x] `startDaily(userId, petId, premium?)` - iniciar aventura
  - [x] `choose(userId, adventureId, optionIndex)` - avanzar escena
  - [x] `getCurrent(userId)` - ver aventura activa
  - [x] `getHistory(userId, limit?)` - historial
  - [x] `applyRewards(adventure, outcome)` - XP/coins
  - [x] `createPetMemory(pet, adventure)` - recordar
- [x] T7: Crear `adventure.controller.ts`:
  - [x] POST /v1/adventure/start
  - [x] POST /v1/adventure/choose
  - [x] GET /v1/adventure/current
  - [x] GET /v1/adventure/history
- [x] T8: Registrar AdventureModule en `app.module.ts`

## Integración

- [ ] T9: Conectar con UsageService para token tracking
- [ ] T10: Conectar con MemoryService para crear/recall PetMemory
- [ ] T11: Conectar con temperamento (genes module) para narrador

## Tests

- [ ] T12: Unit test: resolveOutcome (determinismo, distribution)
- [ ] T13: Unit test: generateScene (mock LLM, validation, fallback)
- [ ] T14: Integration test: start → choose × 4 → rewards
- [ ] T15: Integration test: límite diario, token budget
- [ ] T16: Integration test: fallback cuando LLM no disponible

## Dependencias

- AiModule (AiConfigService, UsageService, MemoryService)
- PetsModule (validar pet)
- PrismaService
- GameDataService (balance)
