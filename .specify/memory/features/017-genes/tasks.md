# Tasks: Genes y Temperamento

## Backend

- [x] T1: Crear `shared/game-data/genes.json` (tipos de genes, efectos, probabilidades)
- [x] T2: Crear `genes.module.ts`
- [x] T3: Crear `gene-roll.ts` (rollGenes, rollTemperament - funciones puras)
- [x] T4: Crear `gene-effects.ts` (applyGenesToFighter, temperamentToStrategy, temperamentToSystemPrompt)
- [x] T5: Crear `genes.service.ts`:
  - [x] `getPetGenes(userId, petId)` - devolver genes revelados/ocultos
  - [x] `analyzeGene(userId, petId)` - consumir 3 gemas, revelar 1 gen
  - [x] `getGenesForCombat(petId)` - obtener genes para armar Fighter
- [x] T6: Crear `gene-reveal.service.ts`:
  - [x] `revealByLevel(pet)` - revelar genes al alcanzar nivel
  - [x] `revealByAnalysis(userId, petId)` - revelar usando gemas
- [x] T7: Crear `genes.controller.ts` con endpoints:
  - [x] GET /v1/pets/:id/genes
  - [x] POST /v1/pets/:id/analyze
- [x] T8: Registrar GenesModule en `app.module.ts`
- [x] T9: Exportar `applyGenesToFighter` y `temperamentToStrategy` para uso en battles module

## Integración

- [ ] T10: Modificar `battles.service.ts` para aplicar genes al armar Fighter
- [ ] T11: Modificar `chat.service.ts` para inyectar temperamento en system prompt

## Tests

- [ ] T12: Unit test: rollGenes (distribución, determinismo)
- [ ] T13: Unit test: applyGenesToFighter (cada gen modifica lo correcto)
- [ ] T14: Unit test: temperamentToStrategy (4 mapeos)
- [ ] T15: Integration test: analyzeGene (consume gemas, revela gen)

## Dependencias

- PrismaService
- PetsModule (validar pet)
- InventoryModule (verificar ítems si se usa)
- GameDataService (genes.json)
