# Plan: Feature 012 — Breeding

## Architecture
- New NestJS module at `backend/src/modules/breeding/`
- Prisma models: Breeding, BreedingResult
- Services: BreedingService (lifecycle), GeneticsEngineService (gene calculation)
- Endpoints: POST /v1/breeding/start, GET /v1/breeding/:id, GET /v1/breeding/history

## Data Model
- **Breeding**: id, userId, parent1Id, parent2Id, status, startedAt, completesAt, seed
- **BreedingResult**: id, breedingId, offspringId, inheritedGenes (Json), mutations (Json)
- Genes: element, rarity, pattern, palette, statModifiers

## Genetics Engine
- 50% of genes from parent1, 50% from parent2 (random per gene)
- 10% mutation chance per gene (crypto.randomInt(0, 100) < 10)
- Mutation: random value within valid range for the gene
- Resulting pet gets visualSeed from crypto.randomInt

## Implementation Steps
1. Create Prisma models (Breeding, BreedingResult)
2. Implement GeneticsEngineService with pure functions
3. Implement BreedingService (start, get, history, complete)
4. Implement BreedingController with endpoints
5. Register in app.module.ts
6. Add a scheduled job or lazy check for completion
