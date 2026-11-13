# Spec: Cruzamiento (Breeding)

## ID
12 — Cruzamiento / Breeding (NUEVAS_FUNCIONALIDADES §12)

## Resumen
Dos mascotas del **mismo elemento** se cruzan con un ticket de crianza y 2 h de incubación. La
descendencia hereda genes parentales (elemento, patrón, temperamento, genes ocultos) con mutaciones
aleatorias, y tiene un **10 % de chance de rareza superior** si ambos padres son Raro o superior. Es
la meta a muy largo plazo ("conseguir el pet perfecto") y el motor de colección a profundidad.

## Contexto
Hoy la obtención de pets es por eclosión de huevo (pool de rareza + pity, `balance.json → rarity`).
No hay forma de "mejorar" un pet genéticamente ni de construir una línea. El breeding introduce un
bucle de optimización de largo plazo que reutiliza el sistema de genética de **Genes y Temperamento
(#17)** y el sistema de rareza/pity existente. Conecta con:
- **Eclosión/rareza/pity** (la rareza de la cría usa tablas propias + interacción con pity).
- **Genes/Temperamento #17** (herencia de genes ocultos y temperamento).
- **Patrones/paleta/`visualSeed`** (herencia visual determinista).
- **Economía** (ticket de crianza, incubación con timer).
- **Temporadas #11** (huevos/cruces temáticos; fuente de tickets).

## Objetivos
- Permitir combinar dos pets para producir un hijo con stats/genética potencialmente superior.
- Introducir incertidumbre de resultado (mutación, rareza, genes) que genere engagement.
- Integrar el sistema de genética (#17) como sistema reutilizable (herencia 50 % / mutación 10 %).
- Mantener la **reproducibilidad por semilla** (la cría se define por una semilla guardada, coherente
  con el motor de combate determinista).

## User Stories
- Como jugador, quiero cruzar dos pets del mismo elemento, para intentar conseguir uno mejor.
- Como jugador, quiero ver el árbol de parentezco (pedigree) de mi pet, para conocer su linaje.
- Como jugador, quiero saber las probabilidades de rareza y de genes antes de cruzar, para decidir.
- Como jugador, quiero que mi cría herede (o muten) los genes de mis mejores pets, para optimizar.
- Como jugador, quiero esperar 2 h para la cría, para que sea una meta espaciada, no spam.

## Criterios de aceptación
- [ ] AC1: Solo se aceptan dos pets del **mismo elemento**, del mismo usuario, con nivel ≥ 25 (adulto).
- [ ] AC2: Cruzar consume 1 `breeding_ticket` y crea una incubación de 2 h (timer).
- [ ] AC3: Al incubar, la cría hereda elemento, patrón y temperamento con reglas definidas (ver Lógica).
- [ ] AC4: La rareza de la cría sigue la tabla de upgrade (10 % superior si ambos padres Raro+); no puede
      bajar de la rareza mínima de los padres salvo mutación regresiva controlada.
- [ ] AC5: La cría recibe una `visualSeed` y paleta derivados de los padres (render determinista).
- [ ] AC6: Genes ocultos: cada gen parental se hereda con 50 %, y existe 10 % de mutar a un gen nuevo.
- [ ] AC7: La semilla de la cría se guarda; reproducir el cálculo con la misma semilla da la misma cría.
- [ ] AC8: La cría aparece en el inventario del usuario con stats basales según su rareza (× multiplicador).
- [ ] AC9: Un ticket no se puede usar dos veces; la incubación es cancelable (devuelve ticket antes del 100 %).

## Diseño técnico
### Backend
- Nuevo módulo `backend/src/modules/breeding/` con `breeding.module.ts`, `breeding.controller.ts`,
  `breeding.service.ts`, `genetics.ts` (lógica pura de herencia), `dto/`.
- `genetics.ts` (funciones puras, 100 % deterministas vía `createRng(seed)`, `rng.ts`):
  - `rollRarity(raridadA, raridadB, rng)` → tabla de upgrade.
  - `inheritGene(geneA, geneB, rng)` → 50 % hereda, 10 % muta.
  - `inheritTemperament(tA, tB, rng)` → 60 % hereda de uno, 40 % mezcla.
  - `deriveVisualSeed(seedA, seedB, rng)` → nueva `visualSeed` + paleta.
  - `blendStats(statsA, statsB, rarityMult, rng)` → stats base de la cría.
- `BreedingService`:
  - `start(userId, petAId, petBId)` → valida requisitos + consumo de ticket; crea `Breeding` (seed,
    `incubatesAt = now + 2h`); guarda instantánea de los padres (snapshot inmutable en `Breeding.parents`).
  - `complete(breedingId)` (job) → resuelve la cría con `genetics.ts` usando la seed guardada; crea un
    nuevo `Pet`; emite `breeding:complete`.
  - `cancel(breedingId)` → solo antes del 100 %; devuelve el ticket.
- La semilla de la cría: `seed = hashSeed(breedingId + ":" + petAId + ":" + petBId)` (reproducible,
  no depende del reloj), coherente con el enfoque del motor de combate.

### Frontend
- Pantalla "Criar": selector de 2 pets (mismo elemento), vista de requisitos, probabilidades
  estimadas (rango de rareza, genes posibles) y CTA de cruzar (muestra ticket disponible).
- Timer de incubación con countdown; opción de cancelar.
- Tarjeta de "Pedigree": árbol de padres → crías (recursivo), con rareza/genes/temperamento.
- Pantalla de resultado al completar: animación de eclosión, reveal de rareza/genes (los genes ocultos
  pueden no revelarse aún → ver #17).
- Push/WebSocket `breeding:complete` al terminar la incubación.

### Datos de juego
- `shared/game-data/breeding.json`:
```json
{
  "minLevel": 25,
  "incubationHours": 2,
  "requiresSameElement": true,
  "rarityUpgrade": {
    "bothAtLeastRareChance": 0.10,
    "maxStepUp": 1,
    "downgradeChance": 0.10,
    "order": ["normal","rare","super_rare","legendary","mythic"]
  },
  "genes": { "inheritChance": 0.50, "mutateChance": 0.10, "maxGenes": 3 },
  "temperament": { "inheritChance": 0.60 },
  "statBlend": { "minParents": 0.6, "maxParents": 0.9, "spread": 0.10 },
  "cost": { "item": "breeding_ticket" }
}
```
El item `breeding_ticket` se añade al catálogo de `Item` (`kind="consumable"`).
## Interfaz de API
Base: `JwtAuthGuard` + `@CurrentUser()`; rutas bajo `/breeding`.

| Método | Ruta | Request | Response | Códigos |
|---|---|---|---|---|
| GET | `/breeding/eligibility` | — | lista de pets adultos y tickets disponibles | 200 |
| POST | `/breeding/start` | `{ petAId, petBId }` | `{ breedingId, incubatesAt, seed, preview }` | 200, 400 (no mismo elemento / nivel / sin ticket) |
| GET | `/breeding/active` | — | `{ breedingId, progressPct, incubatesAt }` | 200, 404 |
| POST | `/breeding/:id/cancel` | — | `{ refunded: true }` | 200, 400 (ya completa) |
| GET | `/breeding/:id/pedigree` | — | árbol de linaje | 200, 404 |
| GET | `/pets/:id/pedigree` | — | linaje del pet (padres, abuelos) | 200, 404 |

## Modelo de datos
```prisma
model Breeding {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  petAId       String
  petBId       String
  petA         Pet      @relation("BreedingA", fields: [petAId], references: [id])
  petB         Pet      @relation("BreedingB", fields: [petBId], references: [id])
  seed         Int
  parents      Json     // snapshot inmutable de stats/rareza/pattern/genes de ambos
  incubatesAt  DateTime
  completedAt  DateTime?
  childPetId   String?
  child        Pet?     @relation(fields: [childPetId], references: [id])
  canceled     Boolean  @default(false)
  createdAt    DateTime @default(now())
  @@index([userId, completedAt])
}
```
Agregado a `Pet`: `breedingAsA Breeding[] @relation("BreedingA")`, `breedingAsB Breeding[]
@relation("BreedingB")`, `bredFrom Breeding[]` (linaje, para pedigree), `breedingsAsChild Breeding[]`.
## Lógica de juego
Todas las tiradas usan `createRng(breeding.seed)` en **orden fijo** (rareza → patrón → temperamento
→ genes → visualSeed → stats), de modo que la cría es 100 % reproducible.

### Rareza de la cría
`order = [normal, rare, super_rare, legendary, mythic]`. Sea `M = max(raridadA, raridadB)`:
- `0.10` (si `M ≥ rare`) → **asciende 1 escalón** (`M+1`, techo `mythic`).
- `0.10` → **regresa 1 escalón** (`M−1`, suelo `normal`).
- `0.80` → **iguala `M`** (no baja salvo el 10 % de regresión controlada).
- Si `M = normal` → siempre `normal`.
- La rareza de la cría **no toca el pity global** (`PityCounter`) (ver Balance).

| Ambos padres | Prob. ascender | Prob. igual | Prob. bajar |
|---|---|---|---|
| normal / normal | 0 % | 100 % | 0 % |
| rare / rare | 10 % | 80 % | 10 % |
| super_rare / super_rare | 10 % | 80 % | 10 % |
| legendary / legendary | 10 % | 80 % | 10 % |
| mythic / anything | 0 % | 100 % | 0 % |

### Genes ocultos (integra #17)
Cada uno de los hasta 3 genes parentales (`maxGenes = 3`): `0.50` hereda (de A o B por `rng`), `0.10`
**muta** a un gen nuevo, `0.40` se pierde. La cría conserva ≤ 3 genes; si ambos comparten un gen, su
probabilidad sube a ≈ 0.75.

### Temperamento
`0.60` hereda el de uno de los padres (por `rng`); `0.40` aleatorio entre los 4
(`valiente`, `tímido`, `arribista`, `curioso`).

### Stats y visual
- `speciesId`: de las especies del elemento compartido (`species.json` por elemento), ponderado por
  rareza resultante.
- Stats base: `blend = min(A,B)*0.6 + max(A,B)*0.9 + noise(rng)*spread`, luego `× rarityMultiplier`.
  Inicia nivel 1 (baby); no hereda nivel/habilidades aprendidas, solo potencial genético.
- `visualSeed = rng() >>> 0`; paleta: 60 % hereda de un padre, 40 % mezcla (interpolar por `rng`).
- Shiny: `shinyProbability` (2 %) base; gen `Aurora` (+1 %) suma si está presente.

## Eventos y sincronización
- Job BullMQ `breeding.complete` (agendado en `incubatesAt`, reintentos + idempotencia por
  `Breeding.completedAt`). Resuelve la cría y crea el `Pet`.
- WebSocket (`realtime`): `breeding:complete` → `{ breedingId, child: {petId, rarity, preview} }`.
- `SeasonsService.awardTickets(userId, "breeding", 2)` al completar (si hay temporada activa, #11).

## Dependencias
- **Genes y Temperamento #17** (sistema de genética reutilizable).
- **Eclosión/rareza/pity** (`balance.json → rarity`) para multiplicadores y pool de especies.
- **Species/patterns** (`species.json`, `patterns.json`).
- **Economía** (`breeding_ticket`, `User`).
- **Temporadas #11** (tickets de temporada por cría).
## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Modelos Prisma + migración + `breeding.json` + item `breeding_ticket` | 2 días |
| 2 | `genetics.ts` puro (rarity/genes/temperament/visual/stats) + tests unit | 3 días |
| 3 | `BreedingService` (start/complete/cancel/pedigree) + endpoints + job | 3 días |
| 4 | Frontend: selector, timer, pedigree, reveal | 3 días |
| 5 | WebSocket + integración seasons + simulación de genética | 2 días |
| 6 | QA de balance (distribución de rareza/genes por generación) | 2 días |

## Balance
- **Distribución de rareza:** cruzar dos Legendary ≈ 10 % Mythic. El pool se desplaza hacia arriba de
  forma controlada (10 % ascenso/cría) con 10 % de regresión que evita la purga de rarezas bajas.
  Simular 5 generaciones para verificar que la tasa de Mythic no supere ~20 %.
- **Sin impacto en pity:** independiente de `PityCounter`; no reinicia `sinceSuperRare`/`sinceLegendary`.
- **Economía del ticket:** se obtiene por logros, pase de temporada y (opcional) compra (5 gemas).
  Consumir 2 pets adultos en 1 cría → sumidero de pets de alta rareza, compensa la emisión de nuevos.
- **Stats:** `blend` con `noise ± 0.10` → crías dentro de ±10 % del rango padres×rareza; evita clones.

## Tests
- **Unit:** `rollRarity` (todas las combinaciones), `inheritGene` (50/10/40), `inheritTemperament`,
  `blendStats` con semilla fija, `deriveVisualSeed` reproducible.
- **Determinismo:** misma `Breeding.seed` + mismos padres → `Pet` idéntico (byte a byte).
- **Integración:** start descuenta ticket + crea timer; complete (job) crea `Pet`; cancel devuelve
  ticket; dos crías simultáneas independientes.
- **E2E:** cruzar → esperar (acelerado) → `breeding:complete` → pet en inventario con pedigree correcto.
- **Balance simulation:** 10 000 crías → distribución de rareza/genes/temperamento; verificar que el
  promedio no crece descontrolado a lo largo de 5 generaciones.
- **Edge:** distintos elementos (400); mismo pet dos veces (400); sin ticket (400); cría Mythic (techo);
  gen compartido por ambos padres (prob. > 0.5).

## Riesgos y notas
- **Explosión de rareza:** el ascenso compuesto puede saturar de Mythic; mitigar con 10 % de regresión
  y "tope de generaciones" opcional.
- **Snapshots inmutables:** `Breeding.parents` guarda stats; la cría usa el snapshot aunque el usuario
  luego modifique a los padres.
- **Pedigree profundo:** limitar a 3 generaciones en UI.
- **Fraude:** el ticket es `Item` consumible con `@@unique([userId,itemId])`; consumo transaccional
  para evitar doble gasto.

## Preguntas abiertas
- ¿El pet padre se "gasta" en la cría o queda libre para otra cría (reutilizable)?
- ¿Existe límite de consanguinidad que penalice stats al cruzar parientes cercanos?
- ¿Se introduce "marcar criador principal" para bonos de pedigrí?
- ¿La cría hereda habilidades aprendidas o solo el pool de especie (rediseño de skills)?
