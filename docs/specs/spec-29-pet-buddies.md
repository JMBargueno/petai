# Spec: "Pet Buddies" — Interacción entre Pets

## ID
Feature #29 — Oleada 3 "Vida social del pet"

## Resumen
Sistema de interacciones entre 2+ mascotas del mismo usuario (o un buddy invitado de un amigo) que pueden perseguirse, dormir juntos, pelear juguetonamente y comer juntas. Las interacciones otorgan XP de bonding a ambas partes y crean la sensación de que el pet tiene "vida social" propia más allá del jugador.

## Contexto
Un solo pet en pantalla puede sentirse "aislado". En un Tamagotchi, la mascota siempre está sola. Aquí, al permitir que el pet interactúe con **otro pet** (del mismo jugador o de un amigo), se crea un micro-mundo vivo que el jugador puede "dejar correr" mientras trabaja.

Es el equivalente digital a "dejar a tus mascotas juntas en el jardín": ver a dos criaturas interactuar es **10x más orgánico** que ver una sola. Refuerza la percepción de "están vivas, no son sprites".

Conecta con: Bonding Meter (#6) — interacciones dan bonding; Multi-Device/Co-op (#21) — base para buddies de amigos; Gifting (#33) — buddy relationship habilita "visitar al pet del amigo".

## Objetivos
- Dar al pet "compañía": 2+ pets interactúan espontáneamente en la pantalla.
- Crear micro-rituales sociales (dormir juntos, jugar) que el jugador puede observar.
- Otorgar recompensas (bonding, happiness, XP) por interacciones sociales.
- Habilitar (v2) buddies de amigos para crear conexiones sociales entre jugadores.
- Aumentar el tiempo de "observación pasiva" (ver a dos pets jugar > ver 1 solo).

## User Stories
- Como jugador, quiero ver a mis 2 pets perseguirse por la pantalla, para sentir que tienen vida propia.
- Como jugador, quiero que si mis dos pets duermen juntos, recuperen energía más rápido.
- Como jugador, quiero que mis pets "peleen" (jugueteo) y ambas suban de felicidad.
- Como jugador, quiero que al alimentar a un pet, el otro "roba" un bocado (animación).
- Como jugador, quiero que mi pet "visite" al pet de un amigo y vuelva con una historia.
- Como jugador, quiero que las interacciones denny bonding, no solo happiness.
- Como jugador, quiero poder **separar** mis pets (no quiero que interactúen ahora).

## Criterios de aceptación
- [ ] AC1: Con 2+ pets activos del mismo usuario, se activa el sistema de **Pet Buddies** automáticamente.
- [ ] AC2: **Interacciones espontáneas** (trigger cada 15-45s aleatorio, máx 1 cada 10s):
  - `chase` (12%): Un pet persigue al otro por la pantalla (3-5s). Ambos +2 happiness.
  - `sleep_together` (8%): Si ambos tienen energy < 40, se acuestan juntos. +5% recuperación energía/durante.
  - `play_fight` (10%): "Mini-riña" de 5s (un empujón, el otro cae, ambos ríen). +5 happiness a ambos.
  - `eat_together` (10%): Si el jugador da comida a 1, el otro "roba" un bocado. +2% happiness extra al roba-comes.
  - `idle_chat` (15%): Ambos hacen animación de "hablar" (burbujas pequeñas con "..." ). +1 bonding cada.
  - `watch_together` (10%): Si hay evento de ambiental (#5), ambos miran en la misma dirección.
## Diseño de UX

### Flujos de usuario

#### Flujo: 2 pets, interacción espontánea (play_fight)

```
[App normal, 2 pets en pantalla]
  Pet A (Ignisaurio) → pos (200, 300), anim: idle
  Pet B (Axolunar) → pos (500, 400), anim: walk

[Timer 15-45s: roll = "play_fight"]
  1. Pet B mira a Pet A (0.5s) → Burbuja: "..."
  2. Pet B camina rápido hacia Pet A (1s)
  3. Animación "embrujo" (2s): Pet A empuja, Pet B cae, ambos ríen
  4. Vuelven a posición normal (1s)
     → Burbuja A: "¡Hehe!" / Burbuja B: "¡Jajá!"
  5. Stats: +5 happiness ambos, +1 bonding ambos
[WS: buddy:interaction → { type: "play_fight", ... }]
```

#### Flujo: Dormir juntos
- Noche 22-07, ambos energy < 40 → se acuestan JUNTOS
- +5% recuperación energía vs solo
- Burbuja si user abre: "Zzz... nos dormimos juntos 🌙"

#### Flujo: "Comer juntos"
- User da comida a Pet A → Pet A anima "eat"
- 50% chance: Pet B corre → "roba bocado" → "¡Mía también!"
- Pet A: "Ugh... 😤" | +2% happiness extra a Pet B

### Estados y transiciones

| Estado | Duration |
|---|---|
| `buddy_idle` | — |
| `buddy_chase` | 3-5s |
| `buddy_play_fight` | 5s |
| `buddy_sleep_together` | hasta despertar |
| `buddy_eat_together` | 3s |
| `buddy_idle_chat` | 4s |

Transiciones: `buddy_idle → [interaction] → buddy_idle` (auto). Si user arrastra pet, se cancela.

### Animaciones y feedback

| Interacción | Animación | Sonido | Haptic |
|---|---|---|---|
| chase | Persecución (acel + frenado) | "Boing" x2 | Soft tap |
| play_fight | Empujón → caída → risa | "Pop" + "hehe" | Medium pulse |
| sleep_together | Zzz, posición adyacente, respiración sync | "Night ambient" | — |
| eat_together | Corre → "muerde" → Pet A "Ugh" | "Nom" + "Ugh" | Light tap |
| idle_chat | Burbujas "..." alternando | "Tik tik" | — |

## Diseño técnico

### Backend

**Nuevo módulo:** `backend/src/modules/buddies/`
- `buddies.controller.ts` — endpoints (toggle, invitar buddy)
- `buddies.service.ts` — interacciones, caps, cooldowns
- `buddies.module.ts`
- `buddies.spec.ts`

**`buddies.service.ts`:**
```typescript
@Injectable()
export class BuddiesService {
  async rollInteraction(userId: string): Promise<BuddyInteraction | null>
  async applyInteractionEffects(interaction: BuddyInteraction): Promise<void>
  async setSeparated(userId: string, separated: boolean): Promise<void>
  async checkDailyCap(petId: string): Promise<boolean>
  // v2: Invitar buddy de amigo
  async inviteFriendBuddy(userId, friendUserId, friendPetId): Promise<BuddyInvitation>
}
```

**Trigger:** Roll se calcula en lazy tick (al consultar pets) o cron 30s → WS al client. El client anima localmente.

**WS events:**
- `buddy:interaction` → `{ type, petAId, petBId, duration, effects }`
- `buddy:separated` → `{ userId, separated }`
- `buddy:friend-invite` → `{ fromPetId, toPetId, expiresAt }` (v2)
- `buddy:friend-active` → `{ friendPetId, species, expiresAt }` (v2)

### Frontend

**Componentes:**
- `BuddyScene.svelte` — Canvas 2+ pets, coordina posiciones
- `BuddyInteraction.svelte` — Animación específica (chase, fight, etc.)
- `BuddyBadge.svelte` — Indicator "juntos" / "separados"

**`PetView.svelte` props nuevos:**
- `buddyPet: Pet | null`
- `buddyState: 'idle' | 'chase' | 'play_fight' | 'sleep_together' | ...`

### Datos de juego

**`shared/game-data/buddies.json`:**
```json
{
  "interactionInterval": { "min": 15, "max": 45 },
  "cooldownSec": 10,
  "maxPer5Min": 3,
  "dailyCap": 5,
  "types": {
    "chase": { "chance": 0.12, "duration": 4, "happiness": 2 },
    "sleep_together": { "chance": 0.08, "energyBonus": 0.05 },
    "play_fight": { "chance": 0.10, "duration": 5, "happiness": 5 },
    "eat_together": { "chance": 0.10, "happinessBonus": 2 },
    "idle_chat": { "chance": 0.15, "duration": 4, "bonding": 1 },
    "watch_together": { "chance": 0.10, "duration": 3 }
  },
  "bondingPerInteraction": 1
}
```
## Modelo de datos

```prisma
model BuddyInteraction {
  id        String   @id @default(uuid())
  petAId    String
  petBId    String
  type      String   // chase | play_fight | sleep_together | eat_together | idle_chat | watch_together
  duration  Int      @default(0)
  happinessA Float   @default(0)
  happinessB Float   @default(0)
  bondingA  Float    @default(0)
  bondingB  Float    @default(0)
  createdAt DateTime @default(now())
  @@index([petAId, createdAt])
  @@index([petBId, createdAt])
}

model BuddyInvitation {
  id          String    @id @default(uuid())
  fromUserId  String
  fromPetId   String
  toUserId    String
  toPetId     String
  status      String    @default("pending") // pending | accepted | expired
  expiresAt   DateTime
  createdAt   DateTime  @default(now())
  @@index([toUserId, status])
}
```

## Eventos y sincronización

| Event | Dir. | Payload | Trigger |
|---|---|---|---|
| `buddy:interaction` | S→C | `{ type, petAId, petBId, duration, effects }` | Roll en lazy tick / cron |
| `buddy:separated` | S→C | `{ userId, separated }` | Toggle PATCH |
| `buddy:friend-invite` | S→C | `{ fromPetId, toPetId, expiresAt }` | Invitación (v2) |
| `buddy:friend-active` | S→C | `{ friendPetId, species, expiresAt }` | Aceptación (v2) |
| `buddy:friend-expired` | S→C | `{ friendPetId }` | 30min expirados (v2) |

## IA y personalización

- Los pets NO usan IA para las interacciones buddy (son animaciones pre-programadas).
- **Burbujas** son de `buddies.json` por (personalidad × tipo de interacción).
- **Si bondingTier ≥ "companion" (#6):** Las burbujas son más effusivas ("¡Me encanta que estés aquí!").
- **Si bondingTier < "companion":** Burbujas más cortas/neutras ("..." / "hola").
- **IA en chat:** Si el user pregunta "¿Cómo está [otro pet]?", el IA puede decir: "Ahora mismo [buddy] está durmiendo junto a mí. Es muy cómodo."

## Dependencias
- **Feature #6 (Bonding):** Interacciones dan bonding. Tier afecta tono de burbujas.
- **Feature #5 (Environmental Awareness):** `watch_together` usa eventos de weather.
- **Feature #21 (Multi-Device/Co-op):** Base para buddies de amigos (v2).
- **Feature #33 (Gifting):** Buddy relationship habilita "enviar gift al buddy".
- **Lazy tick:** Trigger de interacciones.
- **PetView.svelte:** Nuevos estados visuales + posicionamiento relativo.
- **Realtime gateway:** WS events.

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | `buddies.json` + modelo Prisma + migración | 1 día |
| 2 | `BuddiesService` (roll, effects, caps, cooldown) | 2 días |
| 3 | WS events + integración lazy tick | 1.5 días |
| 4 | `BuddyScene` + `PetView` modifications (2 pets) | 3 días |
| 5 | Animaciones (chase, fight, sleep, eat, chat) | 2.5 días |
| 6 | Toggle "separados" + UI badge | 1 día |
| 7 | v2: Buddy de amigo (invite, accept, expire) | 3 días |
| 8 | Tests + polish | 1.5 días |

**Total: ~15.5 días (v1: 11 días, v2: +4.5 días)**

## Métricas de éxito
- **Tiempo de sesión:** +40% si hay 2+ pets (vs 1 pet solo)
- **Observación pasiva:** 30% de sesiones con >5min de "ver a pets" sin interactuar
- **Buddy interactions/día:** 3-8 por usuario (máx cap = 5×2 pets)
- **Retention multi-pet:** +20% D30 para users con 2+ pets vs 1
- **Buddy de amigo (v2):** >30% de users con 2+ pets invitan a un amigo

## Tests
- **Unit:** rollInteraction (distribución correcta), applyEffects (stats correctos), daily cap, cooldown
- **Integration:** 2 pets → lazy tick → WS event → stats updated
- **E2E:** Ver 2 pets → esperar → interacción aparece → animación correcta
- **Edge:** 3+ pets (solo 2 interactúan), user arrastra pet durante interacción, toggle separados

## Riesgos y notas
- **Perf:** 2+ sprites en canvas → asegurar 60fps. Si hay 3+ pets, solo 2 visible por "room".
- **Posicionamiento:** Pets pueden solaparse. Solución: "zona de exclusión" (mín 80px entre centers).
- **Multi-device:** Si 2 devices activos → ambos ven la misma interacción (WS broadcast al room).
- **Buddy de amigo:** El pet visitante NO consume food del anfitrión. Es "puramente social".
- **Sleeping:** Si un pet está `sleeping=true` y el otro no → NO interactúan (el dormido no "despierta").
- **Sick:** Pet enfermo NO interacciona (está demasiado débil). Burbuja: "No me siento bien... pero gracias."

## Preguntas abiertas
1. ¿Buddies de amigos son permanentes o temporales? → **Propuesta: 30min por visita, máx 3/día.**
2. ¿Se puede "forzar" una interacción (click en ambos)? → **Propuesta: NO** (espontáneo = más orgánico).
3. ¿Los buddies comparten food? → **Propuesta: NO** (cada pet tiene su food).
4. ¿Máximo de pets en pantalla? → **Propuesta: 3** (más = confusión visual).
5. ¿Buddy de amigo ve mis pets? → **Propuesta: SÍ** (semi-transparente, sin stats).

## Interfaz de API

### `PATCH /me/buddies`
Request: `{ "separated": true }`
Response 200: `{ "ok": true }`

### `POST /buddies/invite` (v2)
Request: `{ "friendUserId": "uuid", "friendPetId": "uuid" }`
Response 200: `{ "invId": "uuid", "expiresAt": "..." }`
Response 403: `{ "error": "El amigo no tiene buddies activos" }`

### `GET /pets/:id` (modificado)
Response incluye: `buddyActive: boolean`, `buddyPetId: string | null`, `todayBuddyInteractions: number`
### Copywriting

- Chase: "¡Espera!" / "¡Nop!"
- Play_fight: "¡Hehe!" / "¡Jajá!" / "¡A ver otra!"
- Sleep: "Zzz... juntos..." / "🌙"
- Eat_together: "¡Mía también!" / "Ugh... 😤"
- Idle_chat: "..." / "¿Viste [algo]?" / "Sí 😄"
- Watch: "¡Mira!" / "No sé, pero es bonito"

**Variación por personalidad:**
- Curioso: "¡Mira eso! ¡Mira eso!"
- Tímido: "...¿puedo jugar contigo?"
- Travieso: "Te lo merecías"
- Cariñoso: "Me encanta estar contigo"
- [ ] AC3: Cada interacción otorga **+1 bonding** a ambos pets (máx 5/día por interacción buddy, para no inflar).
- [ ] AC4: **Cooldown:** Máx 3 interacciones buddy en 5 minutos. Después, se resetea al ciclo normal (idle/walk).
- [ ] AC5: El jugador puede **pausar** buddies con un toggle "Modo separados" en el panel (persiste por sesión).
- [ ] AC6: **Buddy de amigo (v2):** Un jugador puede invitar a un amigo a "co-ubicar" su pet. El pet del amigo aparece como semi-transparente "visitante" (máx 1 a la vez, durabilidad 30min). Interacciones reducidas (solo `idle_chat` y `chase`).
- [ ] AC7: WS event `buddy:interaction` → `{ type, petAId, petBId, duration, effects }`. El frontend anima ambos pets.
- [ ] AC8: Las interacciones se registran en BD (`BuddyInteraction`) para analytics y daily cap.
- [ ] AC9: Si hay 3+ pets, se seleccionan 2 al azar para cada interacción (no todos interactúan a la vez).
- [ ] AC10: **Animación:** Los sprites SVG necesitan variantes de "encuentro" (2 sprites en canvas: chase, play_fight, sleep_together). Si no hay sprite, se usa fallback de "posición relativa" (2 sprites lado a lado con animación CSS).