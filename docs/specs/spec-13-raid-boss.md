# Spec: Boss de Raid asíncrono

## ID
13 — Boss de Raid asíncrono (NUEVAS_FUNCIONALIDADES §13)

## Resumen
Cada día/semana aparece un **jefe elemental** (stats ×3, 10 M de HP global compartido). Los jugadores
atacan de forma asíncrona; cada ataque es un combate determinista del pet contra una instancia del
boss. El daño de todos suma al HP global; cuando el boss cae, se reparten recompensas **proporcionales
al daño** contribuido. Bucle colectivo diario ("¿cuánto nos falta para matarlo hoy?").

## Contexto
Hoy el combate es 1v1 asíncrono contra bots o jugadores (`battles`). No hay un objetivo **cooperativo**
ni un evento compartido en tiempo. El Raid introduce un bucle social diario que reutiliza el motor de
combate determinista (`runCombat`) y el tema de **Temporadas #11** (cada temporada tiene un boss).
Conecta con:
- **Motor de combate** (`runCombat`, `Fighter`, seed determinista).
- **Temporadas #11** (tema/boss de temporada, rewards, tickets).
- **Arena/ELO** (el daño y la contribución se miden en combate real).
- **Economía** (recompensas proporcionales, energía por ataque).

## Objetivos
- Crear un objetivo colectivo diario/semanal que fomente la comunidad ("ayudemos a matar al boss").
- Reutilizar el combate determinista 1v1 contra un boss con HP gigante (adaptar el motor).
- Repartir recompensas de forma **proporcional y justa** al daño contribuido (sin pay-to-win extremo).
- Mantener la **reproducibilidad por semilla** de cada ataque contra el boss.

## User Stories
- Como jugador, quiero ver el HP global del boss y mi contribución, para saber cuánto falta.
- Como jugador, quiero atacar al boss con mi pet, para sumar daño al equipo.
- Como jugador, quiero ver el ranking de contribución, para motivarme a hacer más daño.
- Como jugador, quiero recibir recompensas proporcionales a mi daño, para que mi esfuerzo valga.
- Como jugador, quiero atacar el boss sin importar la hora, para adaptarlo a mi agenda (asíncrono).

## Criterios de aceptación
- [ ] AC1: Hay un boss activo (por temporada) con HP global, stats ×3 y un tema elemental.
- [ ] AC2: Un ataque consume energía del pet (15, como combate normal) y produce un combate determinista
      de 30 rondas contra el boss (reutiliza `runCombat`).
- [ ] AC3: El daño infligido por el pet en el combate se suma al HP global del boss (transaccional).
- [ ] AC4: Cada ataque genera un `RaidContribution` con `damageDealt` y una `seed` (reproducible).
- [ ] AC5: Al llegar el HP global a 0, el boss "cae" y se reparten recompensas proporcionales al daño
      (payout por contribución).
- [ ] AC6: El ranking de contribución es público (top 100) con `damageDealt` y % del total.
- [ ] AC7: Un usuario no puede hacer "doble ataque" en el mismo combate (cooldown por ataque).
- [ ] AC8: El boss se regenera/rotación (nueva instancia) al caer o al cambio de día/semana.
- [ ] AC9: Cada ataque cuesta 15 de energía y se aplica el límite diario de combates (10 por 24 h).

## Diseño técnico
### Backend
- Nuevo módulo `backend/src/modules/raid/` con `raid.module.ts`, `raid.controller.ts`,
  `raid.service.ts`, `boss.ts` (generación del Fighter del boss), `dto/`.
- `RaidService`:
  - `activeBoss()` → instancia actual (tema, HP global, stats, tiempo).
  - `attack(userId, petId)` → arma `Fighter` del pet, arma `Fighter` del boss (stats ×3), genera
    `seed = hashSeed(raidId + ":" + petId + ":" + Date.now().toString(36))`; ejecuta `runCombat(pet,
    bossFighter, seed)`; extrae `damageDealt = (boss.hpInicialCombate − boss.hpFinal)` **capado** por
    un máximo por ataque (ver Lógica); suma al HP global (transaccional `Prisma`); crea
    `RaidContribution`; descuenta energía y cuenta el combate diario (reutiliza límites de `battles`).
  - `contribution(userId)` → mi daño total, %, ranking personal.
  - `ranking()` → top 100 por `damageDealt` de la instancia activa.
  - `settle(instanceId)` (job) → reparte recompensas proporcionales al daño; marca `fell=true`; crea
    la siguiente instancia.
- `boss.ts`: `buildBossFighter(instance)` → `Fighter` con stats del tema ×3, `strategy="aggressive"`,
  skills elementales del tema, `mood=1` (neutral).

### Frontend
- Pantalla "Raid": boss con HP global (barra), tiempo restante, tema, ranking top 100.
- Botón "Atacar" → dispara combate, muestra repetición del combate (reutiliza el viewer de `Battle`)
  con el daño infligido al boss (destacado), y el avance de la barra global.
- Mi contribución: daño total, %, posición en ranking.
- Al caer el boss: pantalla de celebración + repartición de recompensas del usuario.
- Push/WebSocket `raid:progress` (barra global), `raid:fell` (boss caído), `raid:reward` (repartición).

### Datos de juego
- `shared/game-data/raid.json`:
```json
{
  "boss": {
    "statMultiplier": 3,
    "hpGlobal": 10000000,
    "maxDamagePerAttack": 5000,
    "roundsPerAttack": 30,
    "energyCost": 15,
    "maxAttacksPer24h": 10,
    "cooldownSeconds": 30
  },
  "payout": {
    "model": "proportional",
    "totalGems": 2000,
    "totalCoins": 500000,
    "minParticipationPct": 0.001,
    "topBonus": { "1": 1.25, "2": 1.15, "3": 1.10 }
  },
  "rotation": { "type": "weekly", "elementCycle": ["fire","water","plant","electric","shadow","light"] }
}
```

## Interfaz de API
Base: `JwtAuthGuard` + `@CurrentUser()`; rutas bajo `/raid`.

| Método | Ruta | Request | Response | Códigos |
|---|---|---|---|---|
| GET | `/raid/active` | — | `{ instanceId, element, name, hpGlobal, hpRemaining, endsAt, myContribution }` | 200, 404 (sin raid) |
| POST | `/raid/active/attack` | `{ petId }` | `{ contributionId, seed, damageDealt, log, hpRemaining, energyLeft }` | 200, 400 (energía/límite/cooldown) |
| GET | `/raid/active/contribution` | — | `{ damageDealt, pct, rank, attackCount }` | 200, 404 |
| GET | `/raid/active/ranking` | `?limit=100` | `[{ userId, petId, damageDealt, pct }]` | 200, 404 |
| GET | `/raid/:instanceId/result` | — | repartición final (si cayó) | 200, 404 |

## Modelo de datos
```prisma
model RaidInstance {
  id             String   @id @default(uuid())
  seasonId       String?  // vinculado a temporada #11
  element        String
  name           String
  hpGlobal       Int      @default(10000000)
  hpRemaining    Int      @default(10000000)
  fell           Boolean  @default(false)
  fellAt         DateTime?
  startsAt       DateTime
  endsAt         DateTime
  contributions  RaidContribution[]
  createdAt      DateTime @default(now())
  @@index([endsAt, fell])
}

model RaidContribution {
  id            String   @id @default(uuid())
  instanceId    String
  instance      RaidInstance @relation(fields: [instanceId], references: [id], onDelete: Cascade)
  userId        String
  petId         String
  seed          Int
  damageDealt   Int
  log           Json     // log del combate determinista
  rewardGems    Int      @default(0)
  rewardCoins   Int      @default(0)
  rewarded      Boolean  @default(false)
  createdAt     DateTime @default(now())
  @@index([instanceId, damageDealt])
  @@index([instanceId, userId])
}
```
Agregado a `Pet`: `raidContributions RaidContribution[]`.
## Lógica de juego
### Combate contra el boss (adaptación del motor)
El motor `runCombat` espera dos `Fighter`s. Para el raid:
1. `petFighter` = Fighter normal del pet (mood, genes #17, buffs de hábitat #10).
2. `bossFighter` = Fighter del boss: stats del tema ×3 (`statMultiplier`), `strategy="aggressive"`,
   skills elementales del tema (`skills.json`), `mood=1`.
3. `seed = hashSeed(raidId + ":" + petId + ":" + nonce)` → reproducible.
4. Se ejecutan `roundsPerAttack = 30` rondas. El boss no muere en una sola pelea; al terminar,
   `damageDealt = maxHpBoss − boss.hp`, **capado** por `maxDamagePerAttack` (5000).
5. `damageDealt` se suma a `hpRemaining` (transaccional). El log se guarda en `RaidContribution.log`.

**Determinismo:** `damageDealt` es 100 % reproducible con su `seed`; el boss del combate arranca
siempre con `hpGlobal` completo, de modo que el resultado no depende del orden de los ataques.

### Reparto proporcional (payout)
Al caer el boss (`hpRemaining <= 0`), `settle` reparte `totalGems` (2000) y `totalCoins` (500000):
- `share = damageDealt / totalDamage`.
- `rewardGems = round(totalGems * share)`; `rewardCoins = round(totalCoins * share)`.
- **Top bonus:** posición 1 ×1.25, 2 ×1.15, 3 ×1.10 (reajuste sobre top 3, redistribución del resto).
- `minParticipationPct = 0.001`: contribuciones < 0.1 % reciben el piso (recompensa mínima).
- `SeasonsService.awardTickets(userId, "raid", 1)` por ataque (si hay temporada, #11).

### Rotación
`rotation.type = "weekly"`: cada 7 días (o al caer) se crea una nueva `RaidInstance` con el siguiente
elemento del ciclo y el tema de temporada (#11). `endsAt = startsAt + 7d`.

## Eventos y sincronización
- WebSocket (`realtime`): `raid:progress` → `{ hpRemaining, myContribution }` (tras cada ataque, a
  todos los conectados); `raid:fell` → `{ instanceId }`; `raid:reward` → `{ gems, coins }`;
  `raid:rotated` → `{ instanceId, element }`.
- BullMQ: `raid.settle` (evento cuando `hpRemaining <= 0`, reintentos + idempotencia por
  `RaidInstance.fell`), `raid.rotate` (cron semanal).
- **Transaccionalidad:** cada `attack` hace `hpRemaining -= damageDealt` + crea `RaidContribution` en
  la misma transacción `Prisma` (evita pérdida de daño por concurrencia).

## Dependencias
- **Motor de combate** (`runCombat`, `Fighter`, `rng.ts`).
- **Skills** (`skills.json`) para el Fighter del boss.
- **Temporadas #11** (tema/boss, rewards, tickets).
- **Arena/ELO** (límites de combate diario, energía).
- **Genes #17 / Hábitat #10** (mods al petFighter).
## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Modelos Prisma + migración + `raid.json` + `boss.ts` (Fighter del boss) | 2 días |
| 2 | `RaidService.attack` (combate determinista + suma daño transaccional) | 3 días |
| 3 | Ranking, contribution, endpoints | 2 días |
| 4 | `settle` + `rotate` (jobs) + repartición proporcional | 2 días |
| 5 | Frontend: pantalla raid, barra global, ranking, viewer de daño | 3 días |
| 6 | WebSocket + simulación de balance (curva de HP, payout) | 2 días |

## Balance
- **Curva de HP:** 10 M de HP con ~1000 jugadores activos y ~3 ataques/día de ~5000 daño →
  ~15 M de daño/día → el boss cae en ≈ 1 día. Ajustar `hpGlobal`/`maxDamagePerAttack` según DAU real
  (objetivo: cae en 24–48 h). Simular con perfiles de DAU (100 / 1000 / 10000).
- **Payout justo:** el reparto proporcional recompensa el daño real; el top bonus (×1.25) no crea
  "pay-to-win" porque depende del daño en combate (skill + rareza + element), no de gemas. Un pet
  Mítico con el elemento fuerte inflige ≈ 3× más daño que un Normal.
- **Sin impacto en `rarity`/`pity`:** el raid no emite pets ni toca el pool de eclosión; solo reparte
  gemas/coins (sumidero de recompensas, emite gemas controlado por `totalGems`).
- **Energía:** reutiliza el coste de combate (15) y el límite de 10 combates/24 h → no introduce un
  segundo coste de energía.

## Tests
- **Unit:** `buildBossFighter` (stats ×3, skills del tema); cap de `maxDamagePerAttack`; payout
  proporcional (sumas = total, top bonus, minParticipation); determinismo del ataque con seed fija.
- **Integración:** `attack` suma daño transaccional (2 ataques concurrentes no pierden daño); settle
  reparte una sola vez (idempotencia); rotate crea nueva instancia.
- **E2E:** 3 usuarios atacan → barra global avanza → boss cae → todos reciben `raid:reward`
  proporcionales → ranking correcto.
- **Balance simulation:** simular curvas de HP con DAU variable; verificar tiempo hasta caída y
  distribución de payout (Gini) razonable.
- **Edge:** DAU=1 (un solo jugador mata al boss → recibe 100 %); ataque con energía insuficiente (400);
  dos ataques en cooldown (400); contribución < 0.1 % (recibe piso); boss caído (rechaza ataques).

## Riesgos y notas
- **Desequilibrio:** si pocos jugadores dominan (pocos Mythic), el payout se concentra → usar
  `minParticipationPct` y "rebalanceo de payout" opcional (top no puede superar X %).
- **Latencia:** cada ataque ejecuta 30 rondas de combate (CPU). Con picos de DAU, el raid puede ser
  costoso; cachear el `bossFighter` y precomputar la IA del boss por ronda.
- **Fraude/abuso:** un usuario con muchos pets podría "flood" el raid; limitar por `maxAttacksPer24h`
  y por energía (ya cubierto).
- **Consistencia de HP global:** usar `Prisma` transacción + lock para evitar races en `hpRemaining`.

## Preguntas abiertas
- ¿El raid es diario (24 h) o semanal (7 días)? El doc menciona "cada semana"; proponer semanal con
  rotación elemental.
- ¿Se permite "espectar" el combate de otros (reutilizar el Combat Spectator #23)?
- ¿Hay "bosses sorpresa" (eventos especiales) además del boss de temporada?
- ¿El daño de un ataque se "congela" en el momento o se recalcula si el pet sube de nivel?
