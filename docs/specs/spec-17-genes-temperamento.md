# Spec: Genes y Temperamento (Rasgos Ocultos)

## ID
17 — Genes y Temperamento (NUEVAS_FUNCIONALIDADES §17)

## Resumen
Cada pet tiene **3 genes ocultos** (15 % de probabilidad de tenerlos al eclosionar): Veloz (+10 % VEL),
Férreo (+10 % DEF), Sagaz (crítico +3 %), Devorador (+15 % comida favorita), Aurora (shiny +1 %),
Crono (−10 % enfriamiento). El **temperamento** (valiente, tímido, arribista, curioso) afecta la IA de
combate y el chat IA. Los genes se revelan con el tiempo o con un "análisis genético" (item de gemas).
Es la profundidad de colección y el puente entre IA y combate.

## Contexto
Hoy el pet tiene stats fijas (base × rareza × nivel) y un `strategy` (agresiva/balanceada/defensiva)
que usa la IA de combate (`engine.ts → STRATEGY`). No hay rasgos únicos por pet ni personalidad en el
chat. Los genes y temperamentos añaden:
- **Variación única** (dos pets de la misma especie/rareza pueden tener stats/genetics distintas).
- **Profundidad de combate** (genes modifican el `Fighter` de forma determinista → reproducibilidad).
- **Personalidad de IA** (el temperamento inyecta en el system prompt del chat IA).
- **Base para breeding (#12)** (herencia de genes/temperamento).

## Objetivos
- Añadir 3 genes ocultos por pet con efectos concretos en combate (deterministas por semilla).
- Añadir un temperamento que modifique la IA de combate y el tono del chat IA.
- Permitir revelar genes con el tiempo o con un "análisis genético" (item de gemas).
- Ser el sistema de genética reutilizable por breeding (#12).

## User Stories
- Como jugador, quiero que mi pet tenga genes únicos, para que sea especial y distinto de otros.
- Como jugador, quiero ver (revelar) los genes de mi pet, para conocer sus ventajas.
- Como jugador, quiero que el temperamento de mi pet afecte cómo pelea, para personalizar la estrategia.
- Como jugador, quiero que mi pet tenga personalidad en el chat según su temperamento, para que sea más
  cercano.
- Como jugador, quiero comprar un "análisis genético" para revelar un gen oculto, para avanzar más rápido.

## Criterios de aceptación
- [ ] AC1: Al eclosionar, el pet tiene 0–3 genes (15 % de probabilidad por gen, máx. 3) y 1 temperamento.
- [ ] AC2: Los genes modifican el `Fighter` deterministamente (misma semilla → mismo combate) según su
      efecto (VEL/DEF/crítico/comida/shiny/enfriamiento).
- [ ] AC3: El temperamento modifica la estrategia base de la IA de combate (`STRATEGY` en `engine.ts`)
      y el tono del chat IA (system prompt).
- [ ] AC4: Los genes están **ocultos** por defecto; se revelan con el tiempo (nivel) o con "análisis
      genético" (item de gemas, 1 por gen).
- [ ] AC5: `GET /pets/:id/genes` devuelve los genes revelados y los ocultos (sin mostrar el efecto hasta
      revelar).
- [ ] AC6: El gen `Aurora` (+1 %) incrementa la probabilidad de shiny del pet (afecta `shinyProbability`).
- [ ] AC7: El gen `Crono` (−10 %) reduce el enfriamiento de las habilidades (cooldowns).
- [ ] AC8: El temperamento se refleja en el `personality` del pet y en el system prompt del chat IA.

## Diseño técnico
### Backend
- Nuevo módulo `backend/src/modules/genes/` con `genes.module.ts`, `genes.controller.ts`,
  `genes.service.ts`, `temperament.ts`, `dto/`.
- `genes.service.ts`:
  - `rollGenes(rng)` → 0–3 genes (15 % por gen), determinista por semilla de eclosión.
  - `rollTemperament(rng)` → 1 de 4 temperamentos.
  - `revealGene(userId, petId, geneIndex)` → revela un gen (por tiempo o item de análisis).
  - `applyGenesToFighter(fighter, genes)` → modifica el `Fighter` (stats, cooldowns, crítico).
- `temperament.ts`: `temperamentToStrategy(temp, baseStrategy)` → mapea temperamento a modificadores
  de `STRATEGY` (valiente → agresiva, etc.); `temperamentToSystemPrompt(temp)` → texto para el chat IA.
- **Integración en eclosión:** el flujo de `hatching` llama a `rollGenes`/`rollTemperament` con la
  semilla del huevo y persiste en `Pet`.
- **Integración en combate:** `battles.service.ts` llama a `applyGenesToFighter` al armar el `Fighter`
  (antes de `runCombat`), preservando la reproducibilidad por semilla.
- **Integración en chat IA:** `ai.service.ts` (módulo `ai`) inyecta `temperamentToSystemPrompt` en el
  system prompt del pet.

### Frontend
- Tarjeta "Genes" del pet: 3 slots (oculto/revelado), con efecto al revelar; CTA "Análisis genético"
  (comprar item de gemas, 1 por gen).
- Indicador de temperamento (icono + nombre) en la ficha del pet.
- Al revelar: animación de "genoma" + reveal del gen.
- El temperamento afecta el avatar del pet (expresión) y el tono del chat IA.

### Datos de juego
- `shared/game-data/genes.json`:
```json
{
  "geneCount": { "probPerGene": 0.15, "max": 3 },
  "genes": {
    "veloz":      { "name": "Veloz",     "effect": { "kind": "vel", "mult": 1.10 } },
    "ferreo":     { "name": "Férreo",    "effect": { "kind": "def", "mult": 1.10 } },
    "sagaz":      { "name": "Sagaz",     "effect": { "kind": "critChance", "add": 0.03 } },
    "devorador":  { "name": "Devorador", "effect": { "kind": "favFoodBonus", "mult": 1.15 } },
    "aurora":     { "name": "Aurora",    "effect": { "kind": "shinyChance", "add": 0.01 } },
    "crono":      { "name": "Crono",     "effect": { "kind": "cooldownReduce", "mult": 0.90 } }
  },
  "reveal": {
    "byLevel": { "thresholds": [10, 25, 50] },
    "analysisItem": { "itemId": "gene_analysis", "priceGems": 3 }
  },
  "temperaments": {
    "valiente":  { "name": "Valiente",  "strategyBias": "aggressive", "moodBias": 0.05 },
    "timido":    { "name": "Tímido",    "strategyBias": "defensive",  "moodBias": -0.05 },
    "arribista": { "name": "Arribista", "strategyBias": "aggressive", "moodBias": 0.10 },
    "curioso":   { "name": "Curioso",   "strategyBias": "balanced",   "moodBias": 0.00 }
  }
}
```
## Interfaz de API
Base: `JwtAuthGuard` + `@CurrentUser()`; rutas bajo `/genes`.

| Método | Ruta | Request | Response | Códigos |
|---|---|---|---|---|
| GET | `/pets/:id/genes` | — | `{ genes: [ { id, revealed, effect? } ], temperament }` | 200, 404 |
| POST | `/pets/:id/genes/reveal` | `{ geneIndex }` | `{ gene: { id, effect } }` | 200, 400 (ya revelado / no tiene gen) |
| POST | `/pets/:id/genes/analysis` | — | compra `gene_analysis` (3 gemas) → revela 1 gen aleatorio | 200, 400 (sin gemas) |
| GET | `/pets/:id/temperament` | — | `{ temperament, strategyBias, moodBias }` | 200, 404 |

## Modelo de datos
Se extiende el modelo `Pet` (no se crea un nuevo modelo, para mantener la relación 1:1 pet→genes):
```prisma
model Pet {
  // ... campos existentes ...
  genes        Json      @default("[]")  // [ { id: "veloz", revealed: false }, ... ]
  temperament  String    @default("curioso")
  // (temperament se añade junto a `personality Json?` existente)
}
```
Alternativa (recomendada para queries/futuro breeding): modelo separado `PetGene`:
```prisma
model PetGene {
  id         String   @id @default(uuid())
  petId      String
  pet        Pet      @relation(fields: [petId], references: [id], onDelete: Cascade)
  geneKey    String   // referencia a genes.json
  revealed   Boolean  @default(false)
  revealedAt DateTime?
  position   Int      // 0,1,2 (orden en el slot)
  @@unique([petId, geneKey])
  @@index([petId])
}
```
Relación agregada en `Pet`: `genes PetGene[]`. El `temperament` se guarda como campo `String` en `Pet`
(valor de `genes.json → temperaments`).

## Lógica de juego
### Asignación al eclosionar (determinista por semilla del huevo)
`rollGenes(rng)`: para cada gen de `genes.json`, con prob. `0.15` se asigna (máx. 3). Si se excede 3,
se eligen los primeros 3. `rollTemperament(rng)`: 1 de 4 (probabilidad uniforme). Ambos usan la
`seed` de la eclosión (reproducible, coherente con el sistema de rareza/pity).

### Efectos de los genes en el `Fighter` (determinista)
`applyGenesToFighter(fighter, genes)` modifica el `Fighter` **antes** de `runCombat` (no cambia la
semilla, solo los stats/params):
- `veloz` → `fighter.stats.vel × 1.10`.
- `ferreo` → `fighter.stats.def × 1.10`.
- `sagaz` → `critChance = base(0.0625) + 0.03 = 0.0925` (se pasa al `CombatConfig` del combate).
- `devorador` → `favFoodBonus × 1.15` (aumenta el efecto de la comida favorita al dar de comer).
- `aurora` → `shinyChance = shinyProbability(0.02) + 0.01 = 0.03` (afecta si el pet es shiny; no
  modifica la rareza).
- `crono` → `cooldowns × 0.90` (redondeo hacia abajo; mínimo 0). Se aplica en `engine.ts` al
  descontar cooldowns.

**Determinismo:** los genes son atributos fijos del pet; no introducen aleatoriedad en el combate.
La misma semilla + mismos genes → mismo resultado. El gen `sagaz`/`crono` modifica parámetros del
motor, no el PRNG.

### Temperamento (IA de combate + chat)
- `temperamentToStrategy(temp, baseStrategy)`: ajusta el `STRATEGY` en `engine.ts` según el
  `strategyBias` (valiente → agresiva, tímido → defensiva, arribista → agresiva + `moodBias 0.10`,
  curioso → balanceada). El `moodBias` suma a `fighter.mood` (coherente con `effStat`).
- `temperamentToSystemPrompt(temp)`: texto descriptivo para el chat IA (p. ej. "Eres valiente,
  enérgico y directo..."). Se inyecta en el system prompt del pet por `ai.service.ts`.
- El temperamento también afecta el `personality Json?` del pet (ya existente) → coherencia visual.

## Eventos y sincronización
- WebSocket (`realtime`): `genes:revealed` → `{ petId, gene }` (al revelar).
- Sin jobs recurrentes; los genes/temperamento son estáticos tras la eclosión.
- **Breeding (#12):** `inheritGene` reutiliza el sistema de `genes.json` y `PetGene`.

## Dependencias
- **Eclosión** (`hatching`, `PityCounter`, `rarity`) para la asignación de genes al nacer.
- **Motor de combate** (`engine.ts`, `STRATEGY`, `CombatConfig`) para aplicar genes/temperamento.
- **Módulo `ai`** (`ai.service.ts`, system prompt) para el temperamento en chat.
- **Economía** (`gene_analysis` item, gemas) para el análisis.
- **Breeding #12** (herencia de genes/temperamento).
## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | `genes.json` + modelo `PetGene`/`temperament` + migración | 2 días |
| 2 | `rollGenes`/`rollTemperament` + integración en `hatching` | 2 días |
| 3 | `applyGenesToFighter` + `temperamentToStrategy` en `engine.ts` | 2 días |
| 4 | `temperamentToSystemPrompt` + integración en `ai.service.ts` | 2 días |
| 5 | Endpoints (reveal, analysis) + item `gene_analysis` + frontend | 3 días |
| 6 | WebSocket + simulación de balance (distribución de genes) | 2 días |

## Balance
- **Frecuencia de genes:** 15 % por gen → distribución: P(0 genes) ≈ 0.74, P(1) ≈ 0.22, P(2) ≈ 0.03,
  P(3) ≈ 0.001. La mayoría de pets tienen 0–1 genes; 2–3 son "especiales" (colección). Esto mantiene
  la rareza como factor dominante.
- **Impacto en combate:** un gen da +10 % a 1 stat o +3 % crítico. Dos genes → +10–20 % a 2 stats.
  Un pet con 3 genes es ≈ +15–20 % superior a otro sin genes (mismo nivel/rareza). Es significativo
  pero menor que la rareza (×1.75) o el elemento (×1.5) → no rompe el balance.
- **Revelación:** por nivel (10/25/50) o análisis (3 gemas/gen). El análisis es un sumidero de gemas
  (6–9 gemas por pet completo) → monetización justa.
- **Determinismo preservado:** los genes no aleatorizan el combate; solo modifican stats/params. La
  reproducibilidad por semilla se mantiene (mismos genes + misma semilla → mismo log).
- **Sin impacto en `rarity`/`pity`:** los genes no modifican la rareza ni el pity; son un atributo
  adicional independiente.

## Tests
- **Unit:** `rollGenes` (distribución 0–3, 15 % por gen); `rollTemperament` (4 valores);
  `applyGenesToFighter` (cada gen modifica la stat/param correcta); `temperamentToStrategy` (4
  temperamentos); determinismo (mismos genes + misma semilla → mismo log).
- **Integración:** eclosión asigna genes/temperamento (persiste en `Pet`); reveal (por nivel/item);
  análisis (descuenta gemas, revela 1 gen); combate con genes (veloz → VEL +10 %; sagaz → crítico 9.25 %).
- **E2E:** eclosionar → ver genes ocultos → revelar (análisis) → pelear con genes activos → ver el
  temperamento en el chat IA.
- **Balance simulation:** simular 10 000 eclosiones → distribución de genes; simular combates con/sin
  genes → win-rate (debe ser ~10–20 % a favor del con genes, no abrumador).
- **Edge:** pet con 3 genes (todos aplican); pet sin genes (sin mods); gen `crono` con cooldown 0
  (no se queda negativo); temperamento `arribista` (mood +10 %); análisis sin gemas (400).

## Riesgos y notas
- **Determinismo del motor:** los genes modifican el `Fighter`/`CombatConfig` **antes** de
  `runCombat`; si se modifican dentro del motor, se rompería la reproducibilidad. Mitigación: aplicar
  genes en el armado del `Fighter` (no en `engine.ts`).
- **Fuga de info:** los genes ocultos no deben exponer el efecto hasta revelar (frontend + backend).
- **Coste de IA:** el temperamento en el chat IA añade tokens al system prompt (pequeño, <50 tokens).
- **Breeding (#12):** el sistema de genética debe ser coherente; si el breeding muta genes, la
  distribución puede cambiar (simular).
- **Consistencia visual:** el temperamento debe reflejarse en el avatar del pet (expresión) →
  coordinación con sprites.

## Preguntas abiertas
- ¿Los genes se revelan automáticamente al llegar a nivel (10/25/50) o solo con análisis?
- ¿El temperamento es fijo al nacer o puede cambiar con el tiempo/entorno?
- ¿Se puede "editar" el temperamento (item) o es permanente?
- ¿Los genes se muestran en el pedigree (breeding) para planificar cruces?
- ¿Existe un "gen de rareza" (afecta la rareza de la cría en breeding) además de los 6 actuales?