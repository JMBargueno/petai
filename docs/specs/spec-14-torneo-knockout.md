# Spec: Torneo Knockout semanal

## ID
14 — Torneo Knockout semanal (NUEVAS_FUNCIONALIDADES §14)

## Resumen
Pico competitivo **semanal**: los 64 mejores de la liga Diamond+ entran a un bracket de eliminación
directa. Cada duelo es un **best-of-2** (2 combates deterministas). Cuota de entrada: **50 gemas**.
Premios: campeón (item exclusivo + título + 1000 gemas), finalistas (500), semifinas (250). Genera FOMO
de "entrar al torneo" y un bracket compartible.

## Contexto
Hoy hay Arena (ELO/ligas) y clasificación, pero no un evento **competitivo puntual** con premios. El
torneo añade un pico semanal de tensión que reutiliza el motor de combate determinista y el ranking
ELO. Conecta con:
- **Arena/ELO** (`Pet.elo`, `balance.json → combats.leagues`) para el seeding (top 64 Diamond+).
- **Motor de combate** (`runCombat`, 2 seeds → best-of-2).
- **Economía** (cuota 50 gemas, premios).
- **Temporadas #11** (torneo como evento de temporada, tickets).

## Objetivos
- Crear un evento competitivo semanal con premio y prestigio (campeón, título).
- Seeding justo por ELO (top 64 Diamond+) con bracket de eliminación directa.
- Duelo best-of-2 determinista (2 seeds) → reproducible y verificable.
- Monetizar (cuota) y generar FOMO (ventana de inscripción + bracket compartible).

## User Stories
- Como jugador Diamond+, quiero entrar al torneo pagando 50 gemas, para competir por el título.
- Como jugador, quiero ver el bracket y mi posición, para saber a quién enfrentaré.
- Como jugador, quiero saber cuándo juega cada duelo, para estar disponible a ver/resultar.
- Como espectador, quiero ver el bracket actualizado y compartirlo, para seguir el torneo.
- Como campeón, quiero recibir el item exclusivo + título + gemas, para que el esfuerzo valga.

## Criterios de aceptación
- [ ] AC1: Seleccionan automáticamente los 64 pets de ELO más alto de la liga Diamond+ (≥1700) a cierre
      de la ventana de inscripción.
- [ ] AC2: La inscripción cuesta 50 gemas y crea un `TournamentSlot` (una entrada por usuario, 1 pet).
- [ ] AC3: El bracket se arma con seeding por ELO (1 vs 64, 2 vs 63, ...) y es determinista.
- [ ] AC4: Cada duelo es best-of-2: 2 combates deterministas con 2 seeds; gana quien gane 2.
- [ ] AC5: Los duelos se resuelven a horas programadas (o por los participantes con confirmación).
- [ ] AC6: Al finalizar, se reparten premios: campeón 1000 gemas + item + título; finalistas 500; semis 250.
- [ ] AC7: El bracket es público y actualizable en tiempo real.
- [ ] AC8: Un pet descalificado (abandono/tiempo agotado) pierde el duelo; la cuota no se devuelve.
- [ ] AC9: Se emite `tournament:match` (resultado de duelo) y `tournament:finished` (campeón).

## Diseño técnico
### Backend
- Nuevo módulo `backend/src/modules/tournament/` con `tournament.module.ts`, `tournament.controller.ts`,
  `tournament.service.ts`, `bracket.ts` (generación/seeding), `dto/`.
- `TournamentService`:
  - `register(userId, petId)` → valida liga Diamond+ + saldo (50 gemas); crea `TournamentSlot`.
  - `seed()` (job) → al cierre de inscripción: toma top 64 por `Pet.elo`, arma `TournamentMatch`
    (rondas 1→6) con seeding determinista.
  - `resolveMatch(matchId)` (job a la hora programada, o por confirmación de ambos) → ejecuta 2
    combates (`runCombat` con `seed1`, `seed2`); determina el ganador del best-of-2; actualiza el
    bracket (avanza); si es la final, reparte premios.
  - `payOut(tournamentId)` → reparte premios (campeón/finalistas/semis); entrega item/título/gemas.
- `bracket.ts`: `buildBracket(pets64)` → array de `TournamentMatch` con `round` (1..6), `slot`,
  `bestOf=2`, `seed1`, `seed2`.

### Frontend
- Pantalla "Torneo": estado (inscripción abierta / en curso / finalizado), countdown, cuota, premio.
- Vista de bracket: 6 columnas (R1→Final), duelos con pet/nombre/ELO; en vivo muestra resultado.
- CTA "Inscribir pet" (elige pet Diamond+) → confirma pago de 50 gemas.
- Vista de mis duelos + aviso de "a juego".
- Compartir bracket (imagen/JSON) → `tournament.share` (Web Share API).
- Push/WebSocket `tournament:match`, `tournament:finished`, `tournament:registered`.

### Datos de juego
- `shared/game-data/tournament.json`:
```json
{
  "size": 64,
  "minLeague": "diamond",
  "bestOf": 2,
  "entryFeeGems": 50,
  "prizes": {
    "champion": { "gems": 1000, "item": "champion_trophy_t1", "title": "Campeón de {tema}" },
    "finalist":   { "gems": 500 },
    "semifinalist": { "gems": 250 }
  },
  "schedule": { "registrationDays": 2, "matchIntervalHours": 12, "matchWindowMinutes": 20 },
  "byes": { "fillWithBots": true }
}
```
## Interfaz de API
Base: `JwtAuthGuard` + `@CurrentUser()`; rutas bajo `/tournament`.

| Método | Ruta | Request | Response | Códigos |
|---|---|---|---|---|
| GET | `/tournament/active` | — | `{ state, registrationClosesAt, mySlot, bracketStatus }` | 200, 404 |
| POST | `/tournament/active/register` | `{ petId }` | `{ slotId, bracketPreview? }` | 200, 400 (no Diamond+/sin gemas/ya inscrito) |
| GET | `/tournament/active/bracket` | — | bracket completo (duelos, ganadores, en vivo) | 200, 404 |
| GET | `/tournament/active/matches` | — | mis duelos (ronda, rival, hora, resultado) | 200, 404 |
| GET | `/tournament/:id/result` | — | resultados finales + premios | 200, 404 |

## Modelo de datos
```prisma
model Tournament {
  id            String   @id @default(uuid())
  seasonId      String?
  theme         String
  element       String
  size          Int      @default(64)
  state         String   @default("registration") // registration | seeded | running | finished
  regOpensAt    DateTime
  regClosesAt   DateTime
  startsAt      DateTime
  finishedAt    DateTime?
  championPetId String?
  slots         TournamentSlot[]
  matches       TournamentMatch[]
}

model TournamentSlot {
  id            String  @id @default(uuid())
  tournamentId  String
  tournament    Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  userId        String
  petId         String
  pet           Pet     @relation(fields: [petId], references: [id])
  seed          Int     // posición en el bracket
  placed        Int?    // posición final (1=campeón...)
  feePaid       Boolean @default(true)
  @@unique([tournamentId, userId])
  @@unique([tournamentId, petId])
}

model TournamentMatch {
  id            String   @id @default(uuid())
  tournamentId  String
  tournament    Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  round         Int      // 1..6 (R1=octavos ... 6=final para size 64)
  slot          Int
  bestOf        Int      @default(2)
  slotAId       String?  // TournamentSlot
  slotBId       String?
  winnerSlotId  String?
  seed1         Int?
  seed2         Int?
  log1          Json?    // log del combate 1
  log2          Json?    // log del combate 2
  scheduledAt   DateTime?
  resolvedAt    DateTime?
  status        String   @default("pending") // pending | live | done
}
```
Agregado a `Pet`: `tournamentSlots TournamentSlot[]`.
## Lógica de juego
### Seeding (determinista)
A `regClosesAt`, el job `tournament.seed`:
1. Consulta los 64 pets con mayor `Pet.elo` dentro de liga `diamond` (`minElo ≥ 1700`). Si hay < 64,
   se rellena con bots deterministas (`byes.fillWithBots`, `combat/bots.ts`) para completar el bracket.
2. Asigna `seed` por ELO: seed 1 = más alto, seed 64 = más bajo.
3. Genera los duelos de R1: `1 vs 64, 2 vs 63, ...` (estándar de single elimination). Cada duelo de la
   ronda `r` tiene 2^((roundsTotal − r)) duelos; winners avanzan a la siguiente (roundsTotal = 6 para 64).
4. `seed1 = hashSeed(tournamentId + ":" + matchId + ":c1")`, `seed2 = hashSeed(... + ":c2")` →
   2 combates deterministas.

### Resolución best-of-2
`resolveMatch(matchId)`:
- Ejecuta `runCombat(petA, petB, seed1)` → resultado 1; `runCombat(petA, petB, seed2)` → resultado 2.
- Gana el duelo quien gane **2 combates**. Si queda 1–1, **se resuelve a un tercer combate** con
  `seed3 = hashSeed(... + ":c3")` (tie-break) → total best-of-3 si hay empate en el best-of-2.
  *(Alternativa configurable: `tieBreak = "third" | "elo"` — si `elo`, gana el de mayor ELO.)*
- `winnerSlotId` se fija; el slot avanza al duelo de la siguiente ronda (se actualiza `TournamentMatch`
  de la ronda siguiente con el winner como participante).
- Si es la **final**: se reparten premios (`payOut`).

### Horario y resolución
- Cada `TournamentMatch` tiene `scheduledAt` (intervalo `matchIntervalHours`). A la hora, el job
  `tournament.resolve` lo resuelve **asíncrono** (no requiere presencia de los jugadores): usa las
  stats actuales del pet al momento de la resolución. Si el pet está "enfermo/bajón", sigue jugando
  (el mood ya aplica) → incentivo a cuidar antes del torneo.
- `matchWindowMinutes = 20`: opción de "resolución manual" si se desea (ambos confirman); de lo
  contrario, resolución automática por el job.

### Premios
`payOut`: campeón → `championPetId`, `TournamentSlot.placed=1`, entrega `champion_trophy_t1`
(`InventoryItem`), título (campo en perfil) y 1000 gemas; finalistas (placed=2,3) → 500 gemas;
semis (placed=4..7) → 250 gemas. `SeasonsService.awardTickets(...)` opcional por participación.

## Eventos y sincronización
- WebSocket (`realtime`): `tournament:registered` → `{ slotId }`; `tournament:match` → `{ matchId,
  winnerSlotId, round }` (a todos los conectados al torneo); `tournament:finished` → `{ championPetId,
  prizes }`.
- BullMQ: `tournament.seed` (a `regClosesAt`), `tournament.resolve` (por duelo, agendado a
  `scheduledAt`, reintentos + idempotencia por `TournamentMatch.resolvedAt`), `tournament.payout`
  (tras la final).

## Dependencias
- **Arena/ELO** (`Pet.elo`, ligas) para el seeding.
- **Motor de combate** (`runCombat`, 2–3 seeds) + **bots** (`combat/bots.ts`) para relleno.
- **Economía** (cuota 50 gemas, premios, `Item`/`InventoryItem`).
- **Temporadas #11** (tema, tickets).
- **Perfil/logros** (título de campeón, item exclusivo #8).
## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Modelos Prisma + migración + `tournament.json` + `bracket.ts` (seeding) | 2 días |
| 2 | `TournamentService.register` + `seed` (job) | 3 días |
| 3 | `resolveMatch` (best-of-2 + tie-break) + `payout` + jobs | 3 días |
| 4 | Endpoints + cuota (pago de gemas) | 2 días |
| 5 | Frontend: pantalla torneo, bracket en vivo, inscripción, share | 4 días |
| 6 | WebSocket + simulación (64 duelos) + QA balance | 2 días |

## Balance
- **Monetización justa:** cuota 50 gemas; premios totales = 1000+2×500+4×250 = 3000 gemas + item. El
  "pool" de gemas entra (64×50 = 3200) y sale (3000) → neto ≈ 200 de ganancia de la casa, razonable.
- **Accesibilidad:** solo Diamond+ entra (≥1700 ELO); no es "pay-to-win" porque el acceso depende del
  ELO (progreso real), no de gemas. El relleno con bots garantiza un bracket completo.
- **Tie-break:** el best-of-3 (3er combate) mantiene la determinismo; la alternativa `tieBreak=elo`
  evita combates extra pero favorece al de mayor ELO. Proponer `third` por defecto.
- **Resolución asíncrona:** el pet juega con sus stats actuales → incentivo a cuidar antes; no requiere
  presencia simultánea (redundante con el modelo asíncrono del Arena).

## Tests
- **Unit:** `buildBracket` (seeding 64, paridades correctas); `resolveMatch` best-of-2 (2–0, 2–1, 1–1→
  tie-break); `payOut` (sumas de premios, placed correcto); determinismo (mismo seed → mismo log).
- **Integración:** registro (descuenta 50 gemas, 1 slot por usuario); seed (top 64 + bots); resolve
  (job) avanza bracket; payout (una sola vez); doble registro (400).
- **E2E:** inscribir → seed → resolver R1→Final → campeón recibe item+título+gemas; bracket público
  actualizado; 2 dispositivos reciben `tournament:match`.
- **Balance simulation:** simular 100 torneos → distribución de ELO de ganadores (debe correlacionar
  con el seeding); verificar que el campeón suele ser top-seed (>70 %).
- **Edge:** < 64 Diamond+ (relleno con bots); empate 1–1 (tie-break); pet enfermo al resolver (mood
  aplicado); pet sin energía (sigue jugando, resolución asíncrona); cuota pagada dos veces (idempotente).

## Riesgos y notas
- **Accesibilidad del horario:** la resolución asíncrona elimina el requisito de presencia, pero puede
  generar sensación de "no controlo el juego" → ofrecer resolución manual opcional.
- **Fraude de cuota:** el pago de gemas debe ser transaccional (evitar doble descuento); el ticket de
  inscripción (`TournamentSlot`) es único por `@@unique([tournamentId,userId])`.
- **Latencia del seed:** 64 duelos × 2 combates = 128 combates en el seed (solo para previsualización
  opcional); la resolución real se hace por duelo (no todo a la vez).
- **Bots:** el relleno con bots debe ser transparente (marcar "BOT" en el bracket) para no confundir.
- **FOMO:** si la ventana de inscripción es muy corta, se pierde engagement; proponer 2 días.

## Preguntas abiertas
- ¿Tie-break por 3er combate o por ELO? (proponer 3er combate por consistencia determinista)
- ¿Se permite "retar" a un jugador dentro del bracket (custom) o es estrictamente por seeding?
- ¿El bracket se comparte como imagen estática o como URL en vivo?
- ¿Hay "torneo premium" (más grande, mayor premio) además del semanal estándar?
- ¿Los bots de relleno compiten por premios o solo completan el bracket (sin recibir rewards)?