# Spec: Misiones y desafíos diarios/semanales

## ID
Feature #1 de la lista de 33 funcionalidades — Oleada 1 "Hábito y bucle diario"

## Resumen
Sistema de misiones diarias (3-5) y semanales (5-7) que ancla el login diario, conecta todos los sistemas del juego (cuidado, minijuegos, Arena, IA) en un bucle cohesivo y desbloquea un cofre diario al completar todas las misiones del día. Las misiones se generan dinámicamente para evitar repetición consecutiva.

## Contexto
PetAI es un tamagotchi con IA que tiene múltiples sistemas independientes (alimentar, pelear, minijuegos, chat IA, recordatorios) pero carece de un objetivo diario claro que guíe al jugador a través de todos ellos. Esta feature actúa como "columna vertebral de retención" que une cada mecánica en un bucle motivacional: abrir la app → ver misiones → completar 2-3 min de acciones → obtener recompensa → desbloquear cofre.

Conecta con: sistema de cuidado (feed, clean, sleep), Arena (`/battles`), minijuegos (`/minigames`), chat IA (`/pets/:id/chat`), y los cofres (Feature #2).

## Objetivos
- Crear un hábito diario de 2-3 minutos al abrir la app.
- Conectar todos los sistemas de juego en un bucle cohesivo.
- Motivar la variedad de interacciones (no solo pelear, también cuidar, chatear, jugar minijuegos).
- Generar un reward loop: completar misiones → cofre diario → drops → motivación.

## User Stories
- Como jugador, quiero ver un panel de misiones al abrir la app para saber qué hacer hoy.
- Como jugador, quiero que mi progreso en cada misión se actualice en tiempo real mientras realizo acciones.
- Como jugador, quiero recibir una notificación de "¡Misión completada!" con la recompensa ganada.
- Como jugador, quiero que al completar todas las misiones diarias se desbloquee un cofre diario.
- Como jugador, quiero ver misiones semanales con progreso a lo largo de 7 días.
- Como jugador, quiero que las misiones cambien cada día para no aburrirme.

## Criterios de aceptación
- [ ] AC1: Al iniciar la app, el endpoint `GET /missions` devuelve entre 3 y 5 misiones diarias activas y entre 5 y 7 semanales activas del usuario.
- [ ] AC2: Cada misión tiene un tipo, un objetivo numérico, y una recompensa (monedas, gemas, XP).
- [ ] AC3: El progreso de cada misión se incrementa automáticamente cuando el usuario realiza la acción correspondiente.
- [ ] AC4: Al completar el objetivo, se notifica vía WebSocket (`mission:completed`) y se acredita la recompensa de forma atómica.
- [ ] AC5: Al completar todas las diarias, se desbloquea un `Chest` de tipo `daily`.
- [ ] AC6: Las misiones se generan al medianoche local del usuario con anti-repetición (no las mismas 3 días seguidos).
- [ ] AC7: Las misiones semanales se resetean el lunes 00:00 del timezone del usuario.
## Diseño técnico
### Backend
- **Módulo NestJS:** `src/missions/`
  - `missions.module.ts`, `missions.controller.ts`, `missions.service.ts`
  - `mission-generation.service.ts` — lógica de generación y anti-repetición
  - `mission-tracking.service.ts` — escucha eventos del dominio y actualiza progreso
  - `dto/mission.dto.ts`, `dto/mission-progress.dto.ts`

- **Eventos de dominio (EventEmitter2):**
  - `pet:fed` → incrementa misión de tipo `feed`
  - `battle:finished` → incrementa misión de tipo `battle`
  - `minigame:finished` → incrementa misión de tipo `minigame`
  - `chat:message_sent` → incrementa misión de tipo `chat`
  - `pet:cleaned` → incrementa misión de tipo `clean`
  - `pet:slept` → incrementa misión de tipo `sleep`
  - `pet:evolved` → incrementa misión de tipo `evolve`
  - `egg:hatched` → incrementa misión de tipo `hatch`

- **Scheduler:** BullMQ job `missions:daily-reset` (00:00 por timezone) y `missions:weekly-reset` (lunes 00:00). Usa el timezone del `User` para calcular la medianoche local.

- **Anti-repetición:** Se mantiene un historial en Redis (`SET missions:history:{userId}`) con los últimos 3 días de misiones diarias. El algoritmo excluye combinaciones que aparezcan 3+ veces en el historial.

### Frontend
- **Componente `MissionPanel` (Svelte):** Lista de misiones diarias con barra de progreso, sección semanal colapsable, badge "¡Todas completadas!", botón de cofre diario, animación de confetti al completar.
- **Estado global:** `missions.svelte.ts` — store con misiones, progreso y cooldown del cofre.
- **Escucha WebSocket:** `mission:completed`, `mission:daily_complete` (desbloquea cofre).

### Datos de juego
- **Nuevo archivo `shared/game-data/missions.json`:**
```json
{
  "version": "1.0.0",
  "daily": {
    "minCount": 3, "maxCount": 5,
    "types": [
      { "type": "feed", "target": 2, "weight": 3, "reward": { "coins": 15, "xp": 10 } },
      { "type": "battle", "target": 1, "weight": 2, "reward": { "coins": 25, "xp": 20 } },
      { "type": "minigame", "target": 1, "weight": 3, "reward": { "coins": 20, "xp": 15 } },
      { "type": "chat", "target": 5, "weight": 2, "reward": { "coins": 10, "xp": 10, "gems": 1 } },
      { "type": "clean", "target": 1, "weight": 3, "reward": { "coins": 10, "xp": 5 } },
      { "type": "sleep", "target": 1, "weight": 2, "reward": { "coins": 5, "xp": 5 } }
    ]
  },
  "weekly": {
    "minCount": 5, "maxCount": 7,
    "types": [
      { "type": "level_up", "target": 1, "weight": 2, "reward": { "coins": 100, "gems": 5, "xp": 100 } },
      { "type": "battle_win", "target": 3, "weight": 3, "reward": { "coins": 150, "gems": 3, "xp": 80 } },
      { "type": "hatch_rare", "target": 1, "weight": 1, "reward": { "coins": 200, "gems": 10 } },
      { "type": "minigame", "target": 5, "weight": 3, "reward": { "coins": 120, "gems": 5 } },
      { "type": "chat", "target": 30, "weight": 2, "reward": { "coins": 80, "xp": 60 } }
    ]
  },
## Interfaz de API
### GET /missions
- **Auth:** Bearer token
- **Response 200:**
```json
{
  "timestamp": "2026-12-01T10:00:00Z",
  "daily": [
    { "id": "uuid", "type": "feed", "description": "Alimenta a tu pet 2 veces", "target": 2, "current": 1, "completed": false, "reward": { "coins": 15, "xp": 10 }, "resetsAt": "2026-12-02T00:00:00-05:00" }
  ],
  "weekly": [
    { "id": "uuid", "type": "battle_win", "description": "Gana 3 peleas", "target": 3, "current": 1, "completed": false, "reward": { "coins": 150, "gems": 3 }, "resetsAt": "2026-12-08T00:00:00-05:00" }
  ],
  "dailyChestUnlocked": false
}
```
- **Status codes:** 200, 401

### POST /missions/:id/claim
- **Auth:** Bearer token
- **Description:** Canjear recompensa de misión completada (una sola vez).
- **Response 200:** `{ "mission": { "id", "type", "completed" }, "reward": { "coins", "xp" }, "dailyChestUnlocked": false }`
- **Status codes:** 200, 404, 409 (ya canjeada), 400 (no completada)

### GET /missions/summary
- **Auth:** Bearer token
- **Response 200:** `{ "dailyCompleted": 2, "dailyTotal": 4, "weeklyCompleted": 1, "weeklyTotal": 6, "streak": 3, "bestStreak": 12 }`

## Modelo de datos
### Nuevo modelo `Mission` (Prisma)
```prisma
model Mission {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  period      String   // "daily" | "weekly"
  type        String
  target      Int
  current     Int      @default(0)
  completed   Boolean  @default(false)
  claimed     Boolean  @default(false)
  rewardCoins Int      @default(0)
  rewardGems  Int      @default(0)
  rewardXp    Int      @default(0)
  periodStart DateTime
  periodEnd   DateTime
  createdAt   DateTime @default(now())
  @@index([userId, period, periodEnd])
  @@index([userId, completed])
}
```

### Modificación en `User`
```prisma
model User {
  // ... campos existentes
  missions Mission[]
}
```

### Redis keys
- `missions:progress:{userId}:{missionId}` → entero (contador en caliente)
- `missions:history:{userId}` → JSON array de últimos 3 días de tipos

## Eventos y sincronización
### WebSocket events
- `mission:completed` → `{ missionId, type, reward, dailyCompleted, dailyTotal }`
- `mission:daily_complete` → `{ chestUnlocked: true, chestId }`
- `mission:progress` → `{ missionId, current, target }` (throttled 1/2s)

### BullMQ jobs
- `missions:daily-reset` — medianoche local por usuario
- `missions:weekly-reset` — lunes 00:00 local
- `missions:claim` — transacción PG + Redis para claim

### Sincronización
- Progreso en Redis (INCR) → flush a PG cada 30s o al completar
- Lazy reconciliation al hacer `GET /missions` si hay delta

## Dependencias
- **Feature #2 (Cofres):** El cofre diario usa el sistema de cofres. Stubear con reward fijo si #2 no está listo.
- **Sistema de cuidado:** Endpoints deben emitir eventos de dominio.
- **Arena:** `POST /battles/matchmake` → evento `battle:finished`
- **Minijuegos:** `POST /minigames/sessions/:id/finish` → evento `minigame:finished`
- **Chat IA:** `POST /pets/:id/chat` → evento `chat:message_sent`
- **Redis (ioredis):** Ya en stack
- **BullMQ:** Necesario añadir (no está en package.json actualmente)

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Modelos Prisma (`Mission`), migración, `missions.json` | 1 día |
| 2 | Módulo `missions` + generación con anti-repetición | 2 días |
| 3 | Eventos de dominio (listener EventEmitter2) | 1.5 días |
| 4 | Redis progress + flush PG + `GET /missions` | 1 día |
| 5 | `POST /missions/:id/claim` + cofre diario | 1 día |
| 6 | BullMQ jobs reset por timezone | 1 día |
| 7 | WebSocket events | 0.5 día |
| 8 | Frontend: MissionPanel + store + animaciones | 2 días |
| 9 | Tests + docs | 1 día |

**Total: ~11 días**

## Tests
- **Unit:** generación (3-5 diarias, no repetición), tracking (increment, cap, completed), claim (una sola vez, 409/400)
- **Integration:** GET /missions retorna activos, feed → progreso, claim → reward, reset diario
- **E2E:** flujo completo abrir app → completar 3 misiones → claim → cofre
- **Edge:** 2 pets (misión por usuario), DST, offline + volver, race condition en claim

## Riesgos y notas
- **Balance:** Recompensas misiones ≈ 50-70% del valor de la acción directa.
- **Performance:** Listener no bloquea (setImmediate).
- **Streak:** Perdonar 1 día/semana (grace period).
- **Anti-cheat:** Progreso validado en servidor, no por input del cliente.

## Preguntas abiertas
1. ¿Catch-up de misiones de ayer? (Propuesta: NO, se descartan.)
2. ¿Logros (#8) interactúan? (Propuesta: "30 días consecutivos" depende del streak.)
3. ¿Preview de misiones del próximo día? (Propuesta: NO, mantener sorpresa.)
4. ¿Cofre diario escala con streak? (Propuesta: SÍ, sube de tier cada 7 días.)