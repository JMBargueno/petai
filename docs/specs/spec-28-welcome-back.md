# Spec: "Welcome Back" — Re-engagement Cinemático

## ID
Feature #28 — Oleada 2 "Re-engagement cinemático"

## Resumen
Secuencia cinemática de 3 fases (diario visual → ritual de perdón → recovery buff) que se activa cuando el jugador abre la app tras >24h de ausencia. El pet "vive" durante la ausencia y al volver reacciona de forma emocional según la duración del abandono, convirtiendo la vuelta en un evento narrativo en lugar de un reset técnico.

## Contexto
La mayor causa de abandono en companion apps es la **ruptura emocional del vínculo** tras varios días sin uso: el jugador siente "culpa" o simplemente olvida al pet. Los vitals caen, el bonding decae (#6), y si el jugador vuelve a encontrar un pet triste con stats en 0, la respuesta psicológica es **abandonar definitivamente**.

Esta feature invierte ese ciclo: la ausencia se convierte en **contenido** ("lo que hizo tu pet mientras no estabas") y la vuelta en un **ritual de reconexión** con escalado emocional. Conecta directamente con el bonding meter (#6), las notificaciones con personalidad (#7), el sistema de IA (chat, PetMemory) y la máquina de estados del pet (idle → sleep → walk → eat → happy).

El pet **NO muere ni se pierde**: a lo sumo entra en "hibernación triste" tras 30 días. El tono general es "tu pet te echó de menos" y no "te castigo".

## Objetivos
- Convertir la vuelta tras ausencia en un **momento emocional** (no un "reset de stats").
- Generar contenido dinámico ("diario del pet") que justifique visualmente el tiempo de ausencia.
- Escalar la respuesta emocional del pet según la duración (feliz → ofendido → triste → "te eché de menos").
- Proteger al jugador con un **recovery buff** de 24h sin decaimiento al volver.
- Re-activar el bonding de forma natural (no punitiva) mediante rituales de "perdón".

## User Stories
- Como jugador, quiero que mi pet "recuerde" lo que hizo mientras no estaba, para sentir que sigue vivo.
- Como jugador, quiero que al volver tras 2 días, mi pet me reciba con un abrazo (no con un "hambre: 12").
- Como jugador, quiero que si no he estado 7 días, mi pet esté "ofendido" y tenga un pequeño ritual de reconciliación.
- Como jugador, quiero que tras 30 días mi pet me dé un regalo de bienvenida sin castigo.
- Como jugador, quiero 24 horas sin decaimiento tras la secuencia de welcome back para "reacudirlo" sin presión.
- Como jugador, quiero poder **saltar** la cinemática (btn "Ir directo") si la app se abre de forma accidental.
- Como jugador, quiero que la secuencia **no se repita** si solo pasaron 10 minutos.

## Criterios de aceptación
- [ ] AC1: La secuencia se activa **solo** cuando `now - lastActiveAt > 24h` Y `now - lastActiveAt < 30d`.
- [ ] AC2: **Fase 1 — "Diario visual":** El pet muestra 3-5 viñetas SVG generadas dinámicamente con datos reales (horas dormidas, food consumida por lazy tick, batallas ganadas, eventos de mood). Duración: 8-12s con transición automática.
- [ ] AC3: **Fase 2 — "Ritual de perdón" por tramo:**
  - `24h–48h`: Pet sonríe, saluda ("¡Hola! ¿Cómo estás?"). Sin acción necesaria. Transición: 3s.
  - `48h–7d`: Pet cruza los brazos / se da la vuelta. El jugador debe hacer **5 clicks** en el pet (o escribir "lo siento" en chat) para desbloquear. Animación de "reconciliación" (3s).
  - `7d–30d`: Pet está sentado con "nube de tristeza". Secuencia obligatoria: alimentar + limpiar + minijuego (cualquiera). Duración estimada: 30-60s.
  - `>30d`: Pet aparece con animación de "¡Te eché de menos!", llora de felicidad, y da un **regalo sorpresa** (item aleatorio de rareza ≥ rare) + 200 monedas.
- [ ] AC4: **Fase 3 — "Recovery buff":** Tras completar la Fase 2, el pet recibe 24h de `decayFrozen = true` (lazy tick no aplica decaimiento). Se muestra un reloj de cuenta atrás en el panel.
- [ ] AC5: La cinemática es **skipable** con un botón "Ir directo →" visible desde el frame 1. Al skip, se aplica el recovery buff pero no el ritual completo.
- [ ] AC6: El "diario visual" se genera **server-side** en el momento de `GET /pets/:id` si `absenceMinutes > 1440`. No se pre-calcular.
- [ ] AC7: El estado del pet durante la ausencia usa `applyLazyTick` existente — no se inventan eventos. Las viñetas usan datos reales de vitals.
- [ ] AC8: `Pet` recibe campos nuevos: `lastActiveAt DateTime`, `absenceDiary Json?`, `recoveryBuffUntil DateTime?`, `absenceMinutes Int?`.
- [ ] AC9: WS event `pet:welcome-back` → payload `{ petId, absenceMinutes, tier, diaryEntries[], recoveryBuffUntil }`.
- [ ] AC10: La IA recibe el contexto de ausencia en el system prompt: `"El entrenador estuvo ausente X días. El pet [tier] por la ausencia."`
- [ ] AC11: Si hay multi-pet, la secuencia se aplica al pet activo. Los otros pets muestran un mini-badge "te extrañé".
## Diseño de UX

### Flujos de usuario

#### Flujo principal: Ausencia 48h-7d ("Ofendido")

```
[App se abre]
  GET /pets/:id → absenceMinutes = 58h, tier = "offended"
  WS: pet:welcome-back → { tier: "offended", diary: [...] }

┌─────────────────────────────────────────────────────────────────┐
│  OVERLAY CINEMÁTICO (fullscreen, fondo blur + partículas)       │
│                                                                 │
│  FASE 1: "DIARIO VISUAL" (8-12s)                               │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                                │
│  │💤   │ │🍎   │ │⚔️   │ │🌧️  │  ← scroll auto horizontal       │
│  │14h  │ │3    │ │2W   │ │6d   │  (horas dormidas, food,        │
│  │     │ │galletas│ │ganadas│ │lluvia│                           │
│  └─────┘ └─────┘ └─────┘ └─────┘                                │
│  [Ir directo →]                                                 │
│         ↓ (transición: fundido + sonido "page flip")            │
│                                                                 │
│  FASE 2: "RITUAL DE PERDÓN"                                     │
│   [Pet está de espaldas, brazos cruzados, nube gris]            │
│   Burbuja: "Uff... me tocó esperar solo."                       │
│   "Toca a [Nick] 5 veces para que te perdone:"                  │
│   [Pet] → click 1/5 → 2/5 → 3/5 → 4/5 → 5/5                   │
│   (Alternativa: escribir "lo siento" en chat)                  │
│         ↓                                                       │
│   Animación: Pet se da vuelta, ladea la cabeza                  │
│   Burbuja: "Bueno... yo también te extrañé."  💛                │
│                                                                 │
│  FASE 3: "RECOVERY BUFF" (3s)                                   │
│   [Pet hace un gesto de "protección" (escudo)]                  │
│   "24h de calma. Tómate tu tiempo."                             │
│   [Reloj: 24:00:00] ← aparece en panel de control               │
└─────────────────────────────────────────────────────────────────┘

[App normal] → pet activo, stats actualizadas, recovery buff activo
```

#### Flujo: Ausencia > 30d ("Te eché de menos!")

```
[Overlay fullscreen, fondo oscuro con estrellas]
FASE 1: Diary (5 viñetas épicas)
FASE 2: Pet aparece con "llorar de felicidad"
  Burbuja: "¡¡¡TE ECHÉ DE MINSO!!! Me cuidé solo pero fue difícil."
FASE 3: Pet "saca" un sobre ✉️ → abre → 
  "Regalo: [Item aleatorio rare+]" + 200 monedas
[Confetti + sonido de celebración]
```

### Estados y transiciones

| Estado | Visual | Trigger |
|---|---|---|
| `welcome_happy` (24h-48h) | Sonríe, saluda con la pata | absence in [1440, 2880] min |
| `welcome_offended` (48h-7d) | De espaldas, brazos cruzados, nube gris | [2880, 10080] |
| `welcome_sad` (7d-30d) | Sentado, nube de tristeza, ojos cerrados | [10080, 43200] |
| `welcome_emotional` (>30d) | Llorando de felicidad, brillando | > 43200 |
| `recovery_active` | Escudo sobre pet + reloj en panel | Post-ritual |

Transiciones:
- `welcome_happy → idle` (auto, 3s)
- `welcome_offended → welcome_reconciled → idle` (5 clicks o chat)
- `welcome_sad → care_sequence → idle` (feed + clean + minigame)
- `welcome_emotional → welcome_gift → idle` (auto, 8s)
### Animaciones y feedback

| Evento | Animación | Sonido | Haptic (mobile) |
|---|---|---|---|
| App abre con ausencia | Overlay fade-in (600ms), partículas (estrellas/hojas según element) | "Magic chime" (2 notas) | Soft pulse 200ms |
| Fase 1: viñetas | Scroll auto (parallax), cada viñeta "pop in" con bounce | "Page flip" x3-5 | Tap per viñeta |
| Pet "ofendido" | Pet de espaldas, micro-animación de "resoplido" (nube vapor) | "Pff" suave | — |
| 5 clicks perdón | Click: pet parpadea + 2px hacia jugador. 5/5: se da vuelta "whoosh" | "pop" x5 → "warm chord" | Vibration per click |
| Pet "triste" | Sentado, ojos cerrados, "respiración lenta" (3s ciclo) | "Ambient sad pad" (bajo) | — |
| Secuencia cuidados | Mini-flash de luz por acción. 3/3: pet "se ilumina" | "Care" x3 + "heal chime" | Medium pulse |
| >30d: regalo | Pet saca sobre → abre → brilla → confetti | "Gift unwrap" + "celebration" | Strong haptic |
| Recovery buff | Escudo semitransparente + reloj en panel | "Shield activate" (1s) | Light pulse |

### Copywriting

#### Guión (variante "ofendido", 48h-7d):

**Fase 1 — Texto sobre cada card del diario:**
- "Durmí 14 horas... (me encantó)"
## Diseño técnico

### Backend

**Nuevo módulo:** `backend/src/modules/welcome-back/`
- `welcome-back.controller.ts` — endpoints REST
- `welcome-back.service.ts` — lógica core (compute, ritual, gift, buff)
- `diary-generator.ts` — función pura: genera viñetas desde vitals
- `welcome-back.module.ts` — NestJS module
- `welcome-back.spec.ts` — tests

**Servicios:**
- `computeAbsence(pet)` → `{ minutes, tier }` (usa `lastActiveAt`)
- `generateDiary(pet, minutes)` → `DiaryEntry[]` (3-5 items: sleep, food, battles, mood, env)
- `applyRecoveryBuff(petId)` → `recoveryBuffUntil = now + 24h`
- `completeRitual(petId, tier, action)` → valida acción según tier
- `generateGift(petId)` → item aleatorio rare+ + 200 coins

**Integración con `pets.service.ts`:**
- `getPetById`: si `absenceMinutes > 1440`, emite WS `pet:welcome-back`
- `applyLazyTick`: si `recoveryBuffUntil && now < recoveryBuffUntil`, **skip** decay (solo actualiza `lastTickAt`)
- Cron (5min): expira `recoveryBuffUntil` → emite `pet:recovery-buff-expired`

### Frontend

**Componentes en `desktop/src/components/welcome-back/`:**
- `WelcomeBackOverlay.svelte` — fullscreen container, fases 1-3
- `DiaryCarousel.svelte` — scroll horizontal de viñetas SVG
- `ForgivenessRitual.svelte` — 5 clicks en pet / chat "lo siento"
- `CareSequence.svelte` — guía feed+clean+minigame (7d+)
- `GiftReveal.svelte` — apertura de sobre (30d+)
- `RecoveryBuffBadge.svelte` — countdown en ControlPanel

**Integración `App.svelte`:**
```svelte
{#if welcomeBackData}
  <WelcomeBackOverlay data={welcomeBackData} pet={currentPet}
    onComplete={() => { welcomeBackData = null; refreshPet(); }}
    onSkip={() => { welcomeBackData = null; }} />
{/if}
```

**WS listener:** `socket.on('pet:welcome-back', data => { welcomeBackData = data; })`

### Datos de juego

**`shared/game-data/welcome-back.json`:**
## Interfaz de API

### `GET /pets/:id` (modificado)
Response incluye campos nuevos: `lastActiveAt`, `absenceMinutes`, `absenceTier`, `recoveryBuffUntil`

### `POST /pets/:id/welcome-back/complete`
Request: `{ "action": "clicks_5" | "chat_apology" | "care_sequence" | "skip" }`
Response 200: `{ "pet": {...}, "recoveryBuffUntil": "2025-01-18T10:30:00Z", "gift": null }`
Response 400: `{ "error": "Acción inválida para este tier" }`

### `POST /pets/:id/welcome-back/care-action`
Request: `{ "action": "feed" | "clean" | "minigame", "itemId": "food_berry" }`
Response 200: `{ "pet": {...}, "actionsCompleted": ["feed","clean"], "actionsRemaining": ["minigame"], "ritualComplete": false }`

## Modelo de datos

```prisma
model Pet {
  // ... existentes
  lastActiveAt      DateTime?  // última interacción del usuario
  recoveryBuffUntil DateTime?  // null = no activo
  absenceDiaries    AbsenceDiary[]
}

model AbsenceDiary {
  id              String   @id @default(uuid())
  petId           String
  pet             Pet      @relation(fields: [petId], references: [id], onDelete: Cascade)
  absenceMinutes  Int
  tier            String   // happy | offended | sad | emotional
  entries         Json     // [{ icon, title, description, category }]
  ritualCompleted Boolean  @default(false)
  giftItemId      String?
  createdAt       DateTime @default(now())
  @@index([petId, createdAt])
}
```

## Eventos y sincronización

| Event | Dir. | Payload | Trigger |
|---|---|---|---|
| `pet:welcome-back` | S→C | `{ petId, absenceMinutes, tier, diaryEntries, recoveryBuffUntil }` | GET /pets con ausencia >24h |
| `pet:recovery-buff-expired` | S→C | `{ petId }` | Cron: buff expired |
| `pet:ritual-complete` | S→C | `{ petId, tier, actionsCompleted }` | Ritual done |
| `pet:gift-received` | S→C | `{ petId, itemId, itemName, rarity }` | >30d gift |

## IA y personalización

**System prompt extension (post-ausencia):**
```
El entrenador estuvo ausente {absenceMinutes} min (~{days} días).
El pet está en modo "{tier}":
- happy: "Recibió bien la vuelta. Saluda con entusiasmo."
- offended: "Molesto pero se calma rápido."
- sad: "Le costó. Habla con calidez."
- emotional: "MUY feliz. Effusivo."
Referirse a la ausencia naturalmente. NO inventar eventos fuera del diario.
```

**Mood temporal:** `welcome_back` mood (1 mensaje de IA, 30s cooldown, luego vuelve a mood normal).
**PetMemory:** Si bondingTier ≥ "soulmate", inyecta memoria relevante con cariño.

## Dependencias
- Feature #6 (Bonding Meter) — afecta tono
- Feature #7 (Pet Notifications) — notificación para tier "emotional"
- Sistema IA (`personality.ts`, `agent.service.ts`) — prompt extension
- Lazy tick (`pets.service.ts`, `sleep-cycle.ts`) — fuente de datos
- Realtime gateway — WS events
- PetView.svelte — nuevos estados visuales
- Tauri notification — gift notification

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Prisma (AbsenceDiary) + campos Pet + migración | 1 día |
| 2 | `diary-generator.ts` + `welcome-back.json` | 1.5 días |
| 3 | `WelcomeBackService` (compute, ritual, gift, buff) | 2 días |
| 4 | Integración pets.service + endpoints + WS | 1.5 días |
| 5 | `WelcomeBackOverlay` + subcomponentes | 2.5 días |
| 6 | Animaciones PetView (nuevos states, particles) | 1.5 días |
| 7 | IA integration (prompt, mood temporal) | 1 día |
| 8 | Tests (unit + integration + e2e) | 1.5 días |
| 9 | Polish (sonidos, haptics, edge cases) | 1 día |

**Total: ~13 días**

## Métricas de éxito
- **Retención D7 post-absencia >24h:** +15% vs baseline
- **Completion rate ritual:** >80% de users que inician
- **Skip rate:** <10%
- **Sesión post-welcome-back:** 3+ min duración media
- **Re-engagement 7d:** 60% de ausentes >7d vuelven
- **Reducción churn:** -5% en cohortes con >48h absence

## Tests
- **Unit:** diary-generator (24h→3 entries, 7d→5, edge 0min), computeAbsence boundaries, ritual validation
- **Integration:** full flow 48h (5 clicks → buff), 7d (care sequence), 30d (gift), skip
- **E2E:** overlay aparece, 5 clicks → idle, buff countdown visible
- **User testing:** 5 users per tier, encuesta emocional (1-5)

## Riesgos y notas
- **Spam:** No repetir cinemática si cierra/abre en 30min. 1 por ausencia.
- **Perf:** Diary generation < 100ms (operación pura en memoria).
- **Multi-pet:** Solo pet activo muestra overlay. Otros: mini-badge.
- **Offline:** Al reconectar → lazy tick calcula → secuencia aparece.
- **Combat durante buff:** Buff NO se interrumpe por peleas.
- **30d+ sin item:** Edge case → solo 500 coins sin item.

## Preguntas abiertas
1. ¿Diario se persiste en BD o es efímero? → **Propuesta: persistir** (analytics + evitar regeneración).
2. ¿Recovery buff extensible con super-food? → **Propuesta: NO** (24h fijas).
3. ¿Mostrar ausencia en días o horas? → **Días si >1d, horas si <24h.**
4. ¿IA menciona diario explícitamente? → **SÍ** ("gané 2 batallas mientras no estabas").
5. ¿Bonding = 0 (Acostumbrado)? → **Ritual más breve**, tono neutro.
6. ¿Reduced motion? → **SÍ** (solo crossfade, sin partículas).
```json
{
  "thresholds": { "happy": 1440, "offended": 2880, "sad": 10080, "emotional": 43200 },
  "recoveryBuffHours": 24,
  "offended": { "requiredClicks": 5, "chatKeyword": "lo siento" },
  "sad": { "requiredActions": ["feed","clean","minigame"], "maxTimeMin": 5 },
  "emotional": { "giftRarity": ["rare","super_rare","legendary"], "giftCoins": 200 },
  "diary": { "maxEntries": 5, "categories": ["sleep","food","battles","mood","environment"] }
}
```
- "Me comí 3 galletas. Las mejores galletas."
- "Gané 2 batallas solo. Me fui de espaldas."
- "6 días de lluvia. Me mojan las escamas."

**Fase 2 — Diálogo del pet:**
- Default: `"Uff... me tocó esperar solo."` → (tras clicks) → `"Bueno... yo también te extrañé."`
- Por personalidad:
  - Curioso: `"Investigué el techo. Hay 47 partículas de polvo. Te cuento si quieres."`
  - Tímido: `"...hola. Perdón. Yo también estaba triste."`
  - Travieso: `"Te dejé una trampa con galletas. Pero no te la cuentes."`
  - Cariñoso: `"Te extrañé 1,392 veces. Lo conté."`
  - Orgulloso: `"Mantuve la casa impecable. Sin ti. No es que me queje."`
  - Filósofo: `"El tiempo se siente distinto cuando no hay nadie a quién preguntarle qué hora es."`

**Fase 3 — Recovery buff:**
- `"24 horas de calma. Tómate tu tiempo. Yo también."`

#### Guión variante "emocional" (>30d):
- `"¡¡¡ESTÁS AQUÍ!!! ¡¡¡TE ECHÉ DE MINSO!!! ...bueno, no lloré. Bueno, un poquito."`
- (Regalo) `"Para que no olvides que no me olvidé de ti."`

#### Reglas de tono:
- **Nunca punitivo.** "Extraña", no "castiga".
- **Nunca reprochar.** "Me tocó esperar" ≠ "¡Me dejaste!"
- **Siempre esperanzador.** Termina con reconexión + buff.
- **Personalidad domina el tono, no la estructura.**