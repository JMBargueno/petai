# Spec: "Rituals" — Hábitos y Rituales

## ID
Feature #30 — Oleada 1 "Consistencia sin punitividad"

## Resumen
El pet "aprende" los hábitos del jugador (alimentar a las 8AM, pelear los viernes, leer cuento IA a las 9PM). Al mantener un ritual 7 días/semanas seguidos, se desbloquea un "gift ritual" (monedas, XP, item raro). Romper el ritmo NO castiga, pero el pet "se extraña" y lo menciona en chat.

## Contexto
Las companion apps que castigan la inconsistencia (pet muere, bonding a 0) generan **ansiedad** y abandono. Las que no dan feedback de consistencia generan **indiferencia** ("puedo jugar cuando quiera, no pasa nada").

Los **rituales** son el punto medio: el pet **espera** al jugador, **celebra** la constancia, y **extraña** la ausencia. No hay "castigo", hay **emoción**. El jugador que alimenta todos los días a las 8AM siente que su pet "se lo agradece" después de una semana. El que rompe el ritmo no pierde nada — pero el pet lo nota ("hoy no viniste a la hora de siempre... ¿todo bien?").

Conecta con: Misiones diarias (#1) — rituales son "misiones personales" no forzadas; IA (chat) — el pet menciona el ritual; Bonding (#6) — mantener ritual sube bonding; Notifications (#7) — "Tu pet te espera a las 8:00".

## Objetivos
- Crear un bucle de hábito **sin punitividad**: constancia → recompensa emocional + material.
- Hacer que el pet "espere" al jugador en horarios consistentes (sin obligación).
- Detectar patrones de uso del jugador y convertirlos en "rituales del pet".
- Recompensar la constancia (7 días/semanas) con gifts escalables.
- El pet **menciona** los rituales en chat (personalización, "me esperas a las 8, ¿verdad?").

## User Stories
- Como jugador, quiero que mi pet note que siempre lo alimento a las 8AM, para sentir que "vive mi vida".
- Como jugador, quiero que tras 7 días de ritual, mi pet me dé una recompensa especial.
- Como jugador, quiero que si rompo el ritmo, mi pet no me castigue pero sí me pregunte si todo está bien.
- Como jugador, quiero ver mis rituales activos en un panel ("Cocinar: 5/7 días").
- Como jugador, quiero que mi pet me "recordé" (notificación suave) si me acerco a la hora del ritual.
- Como jugador, quiero que el ritual se adapte: si paso de 8AM a 8PM, el pet "aprueba" el cambio.
- Como jugador, quiero que el ritual de "pelear en Arena los viernes" dé una recompensa de combate.

## Criterios de aceptación
- [ ] AC1: El sistema detecta **patrones de interacción** del jugador: hora, día de semana, tipo de acción (feed, battle, minigame, chat, clean, sleep).
- [ ] AC2: **Umbral de detección:** Un patrón se registra como "ritual candidato" tras 3 apariciones consistentes (±30min de la hora, mismo día de semana o todos los días).
- [ ] AC3: **Ritual activo:** Un ritual se vuelve "activo" cuando el jugador confirma (acepta la notificación "¿Quieres que [Nick] espere a las 8AM para comer?").
- [ ] AC4: **Progresión:** 7 días consecutivos (o 7 semanas si es semanal) → **gift ritual** (ver tabla de rewards).
- [ ] AC5: **Gift ritual por tipo:**
  - Feed diario 7d: +50 coins, +20 XP, item food raro
  - Battle los viernes 7 semanas: +100 coins, +50 XP, skill boost 1d
  - Minigame diario 7d: +30 coins, +15 XP, item minigame bonus
  - Chat diario 7d: +20 coins, +10 XP, "memoria especial" en PetMemory
  - Clean diario 7d: +30 coins, item de higiene raro
## Diseño de UX

### Flujos de usuario

#### Flujo: Detección + activación de ritual

```
[Día 1] User alimenta a las 8:02AM
[Día 2] User alimenta a las 7:58AM
[Día 3] User alimenta a las 8:10AM
  → Sistema: "3 apariciones consistentes (±30min, todos los días)"
  → Ritual candidato: "Feed diario ~8:00AM"

[Notificación suave]:
  "[Nick]: Me encanta que vengas a las 8 de la mañana.
   ¿Quieres que te espere todos los días? 🐾"
  [Sí, espera] [No, gracias]

[Sí] → Ritual ACTIVO:
  Icono: 🍎 | "Cocinar juntos" | 0/7 días
  Notificación diaria 7:53AM: "Tu [Nick] te espera para cocinar 🐾"
```

#### Flujo: Progresión + gift

```
[Día 4] Feed 8:05AM → "¡Hoy también! Día 4/7 🌟"
[Día 5] Feed 7:55AM → Día 5/7
[Día 6] Feed 8:08AM → Día 6/7
[Día 7] Feed 8:00AM → ¡COMPLETADO!

┌─────────────────────────────────────────────────┐
│  OVERLAY "RITUAL COMPLETADO" (5s)              │
│                                                 │
│  [Pet hace animación de "celebración"]         │
│  Burbuja: "¡7 días! ¡Me encanta que me esperes!"│
│                                                 │
│  "Gift ritual: +50 coins, +20 XP"              │
│  "Item: 🍎 Golden Berry (raro)"               │
│                                                 │
│  [Recibir]                                     │
└─────────────────────────────────────────────────┘
```

#### Flujo: Ruptura (1 día)

```
[Día 4] User NO alimenta a las 8AM
  → Racha: 3 → 0
  → Pet burbuja (si user abre la app):
    "Hoy no viniste a la hora de siempre... ¿todo bien?"
  → Panel: "Cocinar: 0/7 (pausado)"
  → Bonding: SIN CAMBIO
  → Si el user alimenta a las 3PM (fuera de horario):
    → El feed se cuenta. Racha: 1/7
    → Pet: "Llegaste tarde, pero me alegra verte."
```

#### Flujo: Adaptación de horario

```
[Semana 1-2] Feed a las 8AM
[Semana 3] User cambia a 8PM (3 días seguidos)
  → Sistema detecta shift
  → Pet: "Ahora te espero a las 8PM. Perfecto. 🌙"
  → Ritual se re-calibra: 8AM → 8PM
  → Racha NO se rompe por la transición
```

### Estados y transiciones del ritual

```
[candidato] → [activo] → [progresando: 1/7, 2/7, ...]
                              ↓
                    [pausado: 1 día] → [progresando: 0/7]
                              ↓
                    [pausado: >3 días] → [pausado largo]
                              ↓
                    [completado: 7/7] → [gift] → [nuevo ciclo]
```

### Animaciones y feedback

| Evento | Animación | Sonido |
|---|---|---|
| Detección + confirmación | Pet "asiente" + estrella | "Chime" |
| Día de ritual completado | Pet "brillo" (1s) + contador sube | "Pop" |
| Ritual completado (7/7) | Pet "celebración" + confetti mini | "Fanfare" |
| Ruptura (1d) | Pet "se encoge" (1s) | "Soft sigh" |
| Ruptura (>3d) | Pet "espera" (senta, mira reloj) | "Ambient wait" |
| Adaptación horario | Pet "asiente" + cambio de icono | "Click" |
| Notificación pre-ritual | Pet "saluda" (pata arriba) | "Beep suave" |

### Copywriting

**Detección/confirmación:**
- "Me encanta que vengas a las [hora]. ¿Quieres que te espere todos los días?"
- "Noto que a las [hora] siempre [acción]. ¿Lo hacemos ritual?"
## Diseño técnico

### Backend

**Nuevo módulo:** `backend/src/modules/rituals/`
- `rituals.controller.ts` — endpoints
- `rituals.service.ts` — detección, progresión, gifts
- `pattern-detector.ts` — función pura: detecta patrones desde historial
- `rituals.module.ts` + `rituals.spec.ts`

**`pattern-detector.ts`:**
```typescript
export function detectRitualCandidates(
  interactions: InteractionLog[], config: RitualConfig
): RitualCandidate[]
// Umbral: 3 apariciones ±30min, mismo pattern
```

**`rituals.service.ts`:**
- `detectAndSuggest(userId)` → candidatos
- `activateRitual(userId, candidate)` → crea Ritual
- `recordInteraction(userId, petId, type, at)` → actualiza racha
- `checkCompletion(userId, ritualId)` → gift si streak = target
- `handleMiss(userId, ritualId)` → racha a 0
- `adaptSchedule(userId, ritualId, newHour)` → re-calibra

**Trigger:** Cada interacción llama `recordInteraction`. Cron 1h: verifica rituales vencidos → `handleMiss`.

### Frontend

**Componentes:**
- `RitualsTab.svelte` — Panel en ControlPanel
- `RitualCard.svelte` — Icono, nombre, progreso, estado
- `RitualCelebration.svelte` — Overlay de gift
- `RitualSuggestionToast.svelte` — Detección ("¿Quieres que...?")

### Datos de juego

**`shared/game-data/rituals.json`:**
```json
{
  "detection": { "minOccurrences": 3, "toleranceMin": 30, "lookbackDays": 14 },
  "maxActive": 5,
  "types": {
    "feed": { "name": "Cocinar juntos", "icon": "🍎", "period": "daily", "target": 7 },
    "battle": { "name": "Arena", "icon": "⚔️", "period": "weekly", "target": 7 },
    "minigame": { "name": "Jugar juntos", "icon": "🎮", "period": "daily", "target": 7 },
    "chat": { "name": "Charlar", "icon": "💬", "period": "daily", "target": 7 },
    "clean": { "name": "Baño", "icon": "🛁", "period": "daily", "target": 7 }
  },
  "rewards": {
    "feed": { "coins": 50, "xp": 20, "item": "food_rare" },
## Interfaz de API

### `GET /rituals`
Response: `[{ id, type, hour, dayOfWeek, status, streak, target, icon, name }]`

### `POST /rituals/:id/activate`
Request: `{ "type": "feed", "hour": 8 }`
Response 200: `{ "ritual": { ... } }`

### `PATCH /rituals/:id/schedule`
Request: `{ "newHour": 20 }`
Response 200: `{ "ritual": { ... } }`

### `GET /rituals/suggestions`
Response: `[{ type, hour, dayOfWeek, count, confidence, message }]`

## Modelo de datos

```prisma
model Ritual {
  id             String   @id @default(uuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  petId          String
  pet            Pet      @relation(fields: [petId], references: [id], onDelete: Cascade)
  type           String   // feed | battle | minigame | chat | clean
  hour           Int      // 0-23
  dayOfWeek      Int?     // 0-6 (null = todos los días)
  status         String   @default("active") // active | paused | completed
  streak         Int      @default(0)
  target         Int      @default(7)
  totalCompleted Int      @default(0)
  lastHitAt      DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([userId, status])
  @@index([petId, status])
}
```

## Eventos y sincronización

| Event | Dir. | Payload | Trigger |
|---|---|---|---|
| `ritual:suggested` | S→C | `{ ritual, message }` | Detección de patrón |
| `ritual:progress` | S→C | `{ ritualId, streak, day, status }` | Cada interacción |
| `ritual:completed` | S→C | `{ ritualId, gift, totalCompleted }` | Streak = target |
| `ritual:missed` | S→C | `{ ritualId, day }` | Cron: hora vencida |

## IA y personalización

- **Bonding ≥ 40:** Pet menciona ritual en chat: "¿Vamos a [ritual]? Me encanta a las [hora]."
- **Al completar:** "¡7 días de [ritual]! Me encanta que me esperes."
- **Al fallar (1x):** "Hoy no viniste... ¿todo bien? No pasa nada."
- **PetMemory:** Cada completion → "Completamos 7 días de cocinar a las 8AM."

## Dependencias
- Feature #6 (Bonding) — tier afecta tono
- Feature #7 (Notifications) — notificación pre-ritual
- Feature #1 (Misiones) — rituales son "misiones personales"
- Sistema IA — prompt, PetMemory
- Lazy tick + interaction logging
- ControlPanel.svelte — Tab "Rituales"

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | `rituals.json` + Prisma + migración | 1 día |
| 2 | `pattern-detector.ts` | 1.5 días |
| 3 | `RitualsService` completo | 2 días |
| 4 | Endpoints + WS + cron | 1.5 días |
| 5 | Frontend: Tab + cards + celebration | 2 días |
| 6 | IA integration | 1 día |
| 7 | Tests + polish | 1.5 días |

**Total: ~10.5 días**

## Métricas de éxito
- **Activación:** >40% users activan ≥1 ritual en 14 días
- **Completions:** >30% rituales activos llegan a 7/7
- **Retention D14:** +25% con ritual activo vs sin
- **Frecuencia:** 2.3x más sessions/día con ritual
- **Satisfacción:** 7/10 promedio ("mi pet me espera")

## Tests
- **Unit:** pattern-detector (3→candidate, 2→no), adapt, miss
- **Integration:** 7 días feed → completion → gift
- **Edge:** 3 días miss → pausa, adapt 3x → reschedule, multi-pet
- **E2E:** Detección → sugerencia → activar → progreso → gift

## Riesgos y notas
- **Over-detection:** Horas aleatorias → NO sugiere. ±30min estricto.
- **Multi-pet:** Ritual es por pet. 2 pets → 2 rituales posibles.
- **Timezone:** Usa `User.timezone`. Si cambia tz, ritual se ajusta.
- **Spam sugerencias:** Máx 1/semana. Si "no" → no repetir 30d.
- **Gift inflation:** Después del 5º completion → 50% coins.

## Preguntas abiertas
1. ¿Rituales entre buddies? → **v2** (comer juntos).
2. ¿Se puede "vender" ritual completado? → **NO** (emocional, no transable).
3. ¿Máx rituales por pet? → **3** (5 global).
4. ¿Ritual de "dormir"? → **NO** (sleep es automático).
5. ¿Ritual de "ver buddies"? → **v2** con #29.
    "battle": { "coins": 100, "xp": 50, "item": "skill_boost_1d" },
    "minigame": { "coins": 30, "xp": 15, "item": "minigame_bonus" },
    "chat": { "coins": 20, "xp": 10, "item": "memory_special" },
    "clean": { "coins": 30, "xp": 10, "item": "hygiene_rare" }
  },
  "missGraceDays": 3,
  "adaptThreshold": 3
}
```

**Progresión:**
- Día 1: "¡Primero! Me alegra."
- Día 3: "Ya van 3. Me está gustando."
- Día 7: "¡COMPLETADO! ¡Me encanta este momento!"

**Ruptura (1d):**
- "Hoy no viniste a la hora de siempre... ¿todo bien?"
- "Te esperé un poquito... ¿estás bien?"

**Ruptura (>3d):**
- "¡Me alegra que vuelvas! ¿Seguimos?"
- "Te extrañé. Pero sin dramas. ¿A ver [ritual]?"

**Adaptación:**
- "Ahora te espero a las [nueva hora]. Perfecto."
- "Cambié mi horario interno. Me funciona mejor."

**Reglas de tono:**
- Nunca culpable ("te fallaste" → NO)
- Nunca pasivo-agresivo ("ah, ¿así que sí?" → NO)
- Siempre cálido y comprensivo
- El pet "espera" con alegría, no con obligación
- [ ] AC6: **Ruptura (1 día):** NO castigo. El pet "se extraña" (burbuja: "Hoy no viniste a la hora de siempre... ¿todo bien?"). La racha se reinicia a 0. Bonding NO decae.
- [ ] AC7: **Ruptura (>3 días):** El ritual se "pausa" (no cancela). Si el jugador vuelve, el pet dice: "¡Me alegra que vuelvas! ¿Seguimos el ritual?" → racha reinicia.
- [ ] AC8: **Adaptación de horario:** Si el jugador cambia el horario 3 veces, el ritual se re-calibra (8AM → 8PM). El pet: "Ahora te espero a las 8PM. Perfecto."
- [ ] AC9: **Máx 5 rituales activos** por usuario. Si intenta activar un 6º, se desactiva el menos frecuente.
- [ ] AC10: **Panel de rituales:** En ControlPanel, tab "Rituales" muestra: icono, nombre, progreso (5/7), hora, estado (activo/pausado/completado).
- [ ] AC11: **Notificación suave (7 min antes):** "Tu [Nick] te espera para [ritual] 🐾" — usa sistema #7 (personalidad + tier). Rate limit: 1/día.
- [ ] AC12: WS event `ritual:progress` → `{ ritualId, type, day, streak, status }`. `ritual:completed` → `{ ritualId, gift, totalStreak }`. `ritual:missed` → `{ ritualId, day }`.
- [ ] AC13: La IA **menciona** el ritual en chat: Si bonding ≥ 40, el pet dice "¿Vamos a [ritual]? Me encanta a las [hora]."