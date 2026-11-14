# Plan: Aventura Narrativa IA

## Arquitectura

```
backend/src/modules/adventure/
├── adventure.module.ts
├── adventure.controller.ts
├── adventure.service.ts              (orquestación principal: start, choose, finish)
├── adventure-orchestrator.service.ts (LLM call, scene generation, validation)
├── adventure-outcome.ts              (fórmula determinista de resultado)
├── adventure-templates.ts            (fallback si LLM falla)
```

## Modelo de Datos (Prisma)

```prisma
model Adventure {
  id           String    @id @default(uuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  petId        String
  pet          Pet       @relation(fields: [petId], references: [id], onDelete: Cascade)
  seed         Int
  theme        String
  sceneCount   Int       @default(4)
  currentScene Int       @default(0)
  isPremium    Boolean   @default(false)
  retriesLeft  Int       @default(0)
  status       String    @default("active") // active | completed | failed | expired
  outcome      String?   // win | partial | lose
  score        Float?
  xpAwarded    Int       @default(0)
  coinsAwarded Int       @default(0)
  startedAt    DateTime  @default(now())
  finishedAt   DateTime?

  scenes       AdventureScene[]

  @@unique([userId, startedAt]) // 1/día
  @@index([userId, status])
}

model AdventureScene {
  id        String   @id @default(uuid())
  adventureId String
  adventure  Adventure @relation(fields: [adventureId], references: [id], onDelete: Cascade)
  order     Int
  text      String
  choices   Json    // [{ label, hint }]
  chosenOption Int? // index del player
  isFinal   Boolean  @default(false)
  createdAt DateTime @default(now())

  @@unique([adventureId, order])
}

model AdventureChoice {
  id        String   @id @default(uuid())
  sceneId   String
  scene     AdventureScene @relation(fields: [sceneId], references: [id], onDelete: Cascade)
  index     Int
  label     String
  wasChosen Boolean  @default(false)
}
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /v1/adventure/start | Iniciar aventura diaria |
| POST | /v1/adventure/choose | Elegir opción y avanzar |
| GET | /v1/adventure/current | Ver aventura en curso |
| GET | /v1/adventure/history | Historial de aventuras |

## Flujo

### Start
1. Validar 1/día (buscar Adventure con startedAt hoy)
2. Validar pet (activo, no dormido)
3. Validar cuota IA (UsageService) o usar fallback
4. Generar seed, tema (por LLM o plantilla)
5. LLM genera escena 1 con choices
6. Crear Adventure + AdventureScene
7. Devolver escena 1

### Choose
1. Validar aventura activa y escena actual
2. Validar option index (0, 1, o 2)
3. Si no es final:
   - LLM genera siguiente escena
   - Guardar AdventureScene
4. Si es final:
   - Calcular outcome determinísticamente (stats + decisions)
   - Aplicar recompensas
   - Crear PetMemory
   - Actualizar status → completed
5. Devolver escena siguiente o resultado

### Outcome Formula
```
statsScore = (petLevel * 0.01 + rarityMult * 0.3 + bonding/100 * 0.3) // 0-1
decisionScore = avg(chosenWasGood) // 0-1 (1=siempre buena elección)
jitter = (seed-derived) * 0.2 - 0.1 // ±10%
totalScore = 0.6 * statsScore + 0.4 * decisionScore + jitter
outcome = totalScore > 0.7 ? "win" : totalScore > 0.4 ? "partial" : "lose"
```

## Decisiones de Diseño

- **JSON estricto**: LLM debe devolver `{ text, choices: [{label, hint}] }` - se valida con JSON.parse.
- **Fallback**: 3 reintentos LLM → plantillas por elemento.
- **Token budget**: 1500 tokens por aventura. Si se excede, detener y dar resultado parcial.
- **Temperamento**: Se inyecta en el system prompt del narrador.
- **PetMemory**: kind="adventure", content="Adventuré {theme} en {fecha}, resultado: {outcome}. {emotional_line}"
