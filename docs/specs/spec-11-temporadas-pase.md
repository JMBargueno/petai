# Spec: Temporadas + Pase de Temporada

## ID
11 — Temporadas + Pase de Temporada (NUEVAS_FUNCIONALIDADES §11)

## Resumen
Ciclos de 8–12 semanas con un tema (elemento/evento) que actúan como columna vertebral del
contenido. Cada temporada tiene un **pase gratuito** (recompensas básicas) y un **pase premium**
(compra con gemas o IAP) que otorga skins, huevos temáticos, muebles de temporada y cofres míticos.
Al terminar, se reparten recompensas según liga/clasificación. Es la principal palanca de
monetización y de FOMO estacional.

## Contexto
Hoy el progreso es plano: nivel, ELO/ligas, rarezas/pity. No hay un "meta" de largo plazo ni un
ciclo que regenere contenido y motivación. Las temporadas enmarcan los demás mecanismos (Raid #13
usa el tema, Breeding #12 y Aventura #18 dan tickets, el Pase distribuye el contenido). Conecta con:
- **Arena/ELO** (ligas → recompensa de fin de temporada).
- **Economía** (gemas, pase premium, IAP ~$3–5/mes).
- **Rareza/pity** (huevos temáticos del pase usan el pool existente).
- **Otros mecanismos** ( Raid, Breeding, Aventura, Hábitat como generadores de tickets/XP de temporada).

## Objetivos
- Crear un ciclo estacional (8–12 semanas) que renueve contenido y objetivos sin cambiar el juego base.
- Introducir una moneda de temporada (tickets) ganable por actividades, con tramas de recompensas gratis/premium.
- Monetizar de forma repetible (pase premium + IAP) sin dañar el equilibrio de la arena.
- Dar recompensas de cierre por liga/clasificación (retención de jugadores competitivos).

## User Stories
- Como jugador, quiero ver cuántas semanas faltan para que termine la temporada, para planear mi avance.
- Como jugador, quiero ganar tickets de temporada peleando/cocinando/aventurándome, para subir de nivel en el pase.
- Como jugador que paga, quiero comprar el pase premium, para recibir skins y huevos temáticos exclusivos.
- Como jugador gratuito, quiero seguir recibiendo recompensas de valor, para no sentirme excluido.
- Como jugador competitivo, quiero recibir un premio de fin de temporada según mi liga, para que mi esfuerzo de rank valga.

## Criterios de aceptación
- [ ] AC1: Existe una temporada activa con tema, fechas de inicio/fin y dos tramas (free/premium) visibles.
- [ ] AC2: El usuario gana tickets de temporada por las actividades configuradas (peleas, minijuegos, aventura, raid, breeding).
- [ ] AC3: Al comprar/activar el pase premium, desbloquea la trama premium completa; puede reclamar recompensas de ambos niveles ya alcanzados.
- [ ] AC4: Cada nivel de pase exige un umbral de tickets; al superarlo se notifica y se permite reclamar.
- [ ] AC5: Al finalizar la temporada, se reparten recompensas según liga/clasificación y se cierra la trama.
- [ ] AC6: Los huevos temáticos del pase respetan `rarity`, `pity` y `shinyProbability` de `balance.json`.
- [ ] AC7: Los tickets no caducan dentro de la temporada; al cerrarse, el saldo restante se liquida por su valor.
- [ ] AC8: Un usuario no puede reclamar dos veces la misma recompensa de trama (idempotencia).

## Diseño técnico
### Backend
- Nuevo módulo `backend/src/modules/seasons/` con `seasons.module.ts`, `seasons.controller.ts`,
  `seasons.service.ts`, `pass.service.ts`, `dto/`.
- `SeasonsService`:
  - `activeSeason()` → temporada vigente (o próxima). Idempotente al cambio de fecha.
  - `progress(userId)` → tickets actuales, nivel de trama, recompensas reclamables.
  - `awardTickets(userId, source, amount)` → **punto único** por el que todos los sistemas
    (battles, minigames, raid, breeding, adventure) otorgan tickets; registra `SeasonTicketEarn`.
  - `claimReward(userId, track, level)` → valida nivel alcanzado + no reclamado; entrega el reward.
  - `settleSeason(seasonId)` (job) → liquida recompensas de cierre por liga, cierra tramas.
- `PassService`:
  - `purchasePremium(userId)` → descuenta gemas o crea orden IAP; marca `SeasonPassProgress.premium=true`.
  - `isPremium(userId, seasonId)` → estado de compra.
- **Integración:** `BattlesService`, `MinigamesService` y los nuevos módulos llaman a
  `SeasonsService.awardTickets(...)` tras cada evento elegible (sin duplicar lógica).
- Jobs (BullMQ): `seasons.roll` (crea/activa temporada según calendario), `seasons.settle`
  (reparto final + liquidación), `seasons.dailies` (recompensa diaria de asistencia opcional).

### Frontend
- Pantalla "Temporada": tema, banner, countdown a fin de temporada, tema visual (skins de UI).
- Vista de pase con **dos carriles** (free/premium): nodos por nivel con icono, estado
  (bloqueado/disponible/reclamado). Premium bloqueado muestra CTA de compra.
- Panel "Actividades que otorgan tickets" con progreso diario/semanal.
- Modal de compra premium (gem as / IAP) con resumen de beneficios.
- Push/WebSocket `season:ticket` (actualización de tickets) y `season:completed`.

### Datos de juego
- `shared/game-data/seasons.json` (plantilla; cada temporada instancia un tema):
```json
{
  "durationWeeks": { "min": 8, "max": 12 },
  "ticketEarn": {
    "battle": { "win": 1, "draw": 1, "loss": 0 },
    "minigame_session": 1,
    "adventure_complete": 2,
    "raid_contribution": 1,
    "breeding_complete": 2
  },
  "passLevels": { "free": 50, "premium": 50, "ticketsPerLevel": 40, "dailyBonus": 20 },
  "leagueSettle": [
    { "league": "mythic",   "reward": { "gems": 500, "title": "Leyenda de {tema}", "skin": "tema_mythic" } },
    { "league": "diamond",  "reward": { "gems": 300, "title": "Élite de {tema}" } },
    { "league": "platinum", "reward": { "gems": 150 } },
    { "league": "default",  "reward": { "coins": 500 } }
  ]
}
```
Las recompensas de trama (por nivel) se definen como datos dinámicos en base de datos
(modelo `SeasonReward`), no en `shared`, porque cambian por temporada.
## Interfaz de API
Base: `JwtAuthGuard` + `@CurrentUser()`; rutas bajo `/seasons`.

| Método | Ruta | Request | Response | Códigos |
|---|---|---|---|---|
| GET | `/seasons/active` | — | `{ id, theme, element, startsAt, endsAt, weeksLeft }` | 200 |
| GET | `/seasons/active/pass` | — | `{ tickets, levelFree, levelPremium, premium, claims[], claimable[] }` | 200 |
| GET | `/seasons/active/tracks` | — | definición completa de tramas free/premium | 200 |
| POST | `/seasons/active/pass/premium` | `{ method, productId? }` | `{ premium, transactionId?, remainingGems? }` | 200, 400, 402 |
| POST | `/seasons/active/claim/:track/:level` | — | `{ reward, granted }` | 200, 400 |
| GET | `/seasons/:id/results` | — | resultados de fin de temporada (liga, premios) | 200, 404 |

## Modelo de datos
```prisma
model Season {
  id         String   @id @default(uuid())
  code       String   @unique          // p. ej. "s1_fuego"
  theme      String
  element    String
  premiumGemsPrice Int @default(120)
  premiumIapPrice  Float? @default(3.99)
  startsAt   DateTime
  endsAt     DateTime
  status     String   @default("upcoming") // upcoming | active | ended
  rewards    SeasonReward[]
  passes     SeasonPassProgress[]
}

model SeasonReward {
  id        String  @id @default(uuid())
  seasonId  String
  season    Season  @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  track     String  // free | premium
  level     Int
  kind      String  // coins | gems | item | egg | skin | furniture | title
  payload   Json    // { itemId } | { eggType } | { skinId } | { coins }...
  @@unique([seasonId, track, level])
}

model SeasonPassProgress {
  id             String   @id @default(uuid())
  userId         String
  seasonId       String
  season         Season   @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  tickets        Int      @default(0)
  levelFree      Int      @default(1)
  levelPremium   Int      @default(1)
  premium        Boolean  @default(false)
  claimed        Json     @default("[]")
  settledAt      DateTime?
  @@unique([userId, seasonId])
  @@index([seasonId])
}

model SeasonTicketEarn {
  id        String   @id @default(uuid())
  userId    String
  seasonId  String
  source    String   // battle | minigame | adventure | raid | breeding | daily
  amount    Int
  refId     String?
  createdAt DateTime @default(now())
  @@index([userId, seasonId])
}
```
Agregado a `User`: `seasonPasses SeasonPassProgress[]`.
## Lógica de juego
- **Nivel de trama:** `level = min(maxLevel, floor((tickets) / ticketsPerLevel) + 1)`.
  Con `ticketsPerLevel = 40`: nivel 2 a 40 tickets; nivel 50 a 1960.
- **Reparto de tickets:** cada evento elegible llama a `awardTickets`. `battle` usa el resultado
  (`win/draw/loss` → `seasons.json → ticketEarn.battle`). `dailyBonus` otorga 20 tickets/día activo.
- **Reclamo:** `claimReward` valida `level[track] >= nivel` y que `track:level` no esté en `claimed`;
  aplica el reward (coins/gemas al `User`, `Item` al inventario, `eggType` al flujo de eclosión,
  skin/mueble al hábitat). Idempotente vía `claimed`.
- **Fin de temporada (settle):** job `seasons.settle` en `endsAt`: calcula la liga de cada pet
  (`balance.json → combats.leagues` por `Pet.elo`), entrega `leagueSettle` (título, gemas, skin),
  liquida tickets restantes, marca `status="ended"`, crea la siguiente (tema rotatorio
  fire→water→plant→electric→shadow→light).
- **Huevos temáticos:** un reward `egg` crea un `Egg` con `eggType="tematico"`; la tirada de eclosión
  **reutiliza** `rarity`/`pity`/`shinyProbability` de `balance.json` (solo cambia el pool de especies)
  → conserva el sistema de pity intacto.

## Eventos y sincronización
- WebSocket (`realtime`): `season:ticket` → `{ tickets, levelFree, levelPremium }`; `season:completed`
  → `{ reward }`; `season:settled` → `{ results }`.
- BullMQ: `seasons.roll` (cron semanal), `seasons.settle` (una ejecución a `endsAt`, reintentos +
  idempotencia), `seasons.dailies` (cron diario). Activación/cierre **transaccional** (evita doble settle).

## Dependencias
- **Arena/ELO** (`Pet.elo`, ligas) para el settle.
- **Economía/IAP** (gem as, StoreKit/Play Billing) para el pase premium.
- **Eclosión** (`Egg`, `rarity`, `pity`) para huevos temáticos.
- **Hábitat #10 / Logros #8** (rewards de tipo skin/mueble/título).
- **Otros mecanismos** (battles, minigames, raid, breeding, adventure) como fuentes de tickets.

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Modelos Prisma + migración + `seasons.json` + seed temporada 1 | 2 días |
| 2 | `SeasonsService`/`PassService` (progress, awardTickets, claim, purchase) | 3 días |
| 3 | Integración `awardTickets` en battles/minigames + jobs (roll/settle/dailies) | 3 días |
| 4 | Endpoints + compra premium gemas/IAP | 2 días |
| 5 | Frontend: pantalla temporada, tramas dual, claim, countdown | 4 días |
| 6 | WebSocket + settle final + tests + simulación de economía | 2 días |

## Balance
- **Ticket economy:** ~50–90 tickets/día jugando "normal" → ≈ 1000–1200 tickets/2 semanas → alcanza
  nivel free (~50) a mitad; premium completo (≈1960) requiere ~3–4 semanas dedicadas o compra.
- **Settle por liga:** reparte gemas (500/300/150) sin "pay-to-win" (la liga depende del ELO, no gemas).
  El reward `default` es coins para quien no compite.
- **Huevos temáticos:** no alteran `rarity`/`pity`; solo el pool de especies → no rompe `balance.json`.
- **Inflación:** el pase crea un sumidero de gemas (120) e IAP; se compensa con rewards de gemas en settle.

## Tests
- **Unit:** cálculo de nivel por tickets; reclamo idempotente; liquidación al settle; liga por ELO; rotación.
- **Integración:** tickets desde pelea real; compra premium gemas/IAP (mock billing); settle duplicado
  (solo reparte una vez); huevo temático respeta pity.
- **E2E:** comprar pase → reclamar free+premium → avanzar → fin de temporada → recibir reward de liga.
- **Balance simulation:** simular 12 semanas casual vs. competitivo; verificar que el premium no es
  "obligatorio" para el free-track completo.
- **Edge:** premium+free reclamo; nivel no alcanzado (400); temporada `ended` rechaza claim; 2 dispositivos.

## Riesgos y notas
- **Scoping:** 50×2 tramas + settle es grande; iterar MVP (25 niveles free, settle simple).
- **IAP compliance:** StoreKit/Play Billing requieren validación server-side de receipts (fraude).
- **Coste de contenido:** cada temporada define rewards; plantear un generador de plantilla.
- **FOMO/retención:** mantener ratio ~80/20 de valor en el free para no dañar la percepción.

## Preguntas abiertas
- ¿Se conservan gemas sobrantes de la compra de pase o se liquidan al cierre?
- ¿Existe "pase anual" o solo por temporada?
- ¿Los tickets de temporadas anteriores se conservan o se liquidan siempre al cierre?
- ¿Se permiten "booster" de tickets (compra directa) además del pase premium?
