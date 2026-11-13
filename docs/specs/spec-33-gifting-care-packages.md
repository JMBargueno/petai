# Spec: "Gifting & Care Packages" — Regalos entre Jugadores

## ID
Feature #33 — Oleada 3 "Economía social colaborativa"

## Resumen
Sistema de regalos entre jugadores: enviar items del inventario al pet de un amigo (máx 3/día), "Care Packages" para pets enfermos ausentes (bundle de comida+medicina+toy+coins con nota), y "Group Feeding" donde 3-5 jugadores cocinan juntos un item raro en una room de 10 minutos. Crea economía social colaborativa y un "magneto de retorno" cuando un amigo te envía un Care Package.

## Contexto
Las companion apps son **solitarias** por defecto. Un pet no tiene "amigos" ni "comunidad". Al permitir que el pet **reciba cosas de otros players**, se crea:
1. **Conexión social:** "Mi amigo pensó en mí y le envió comida a mi pet."
2. **Magneto de retorno:** "Mi pet está enfermo y mi amigo me envió un Care Package" → el jugador vuelve a la app porque **alguien** le envió algo.
3. **Sessions sociales:** "Group Feeding" → 3 amigos cocinan juntos en una room. Es un "hangout" de 10 min.
4. **Economía social:** Items se transfieren entre players (no se "pagan" con dinero real).

Conecta con: Inventory (items), Multi-Device/Co-op (#21), Pet Buddies (#29), Notificaciones (#7), IA (chat: "¡Me llegó un regalo!"), Bonding (#6).

## Objetivos
- Crear **conexión social** entre jugadores vía sus pets.
- Hacer que un "Care Package" sea un **magneto de retorno** (vuelves porque alguien te envió algo).
- Generar **sessions sociales** (Group Feeding, 10 min, 3-5 players).
- Economía social: items se transfieren, no se venden. Sin FOMO monetaria.
- El pet **reacciona** emocionalmente al recibir un regalo (animación + IA).

## User Stories
- Como jugador, quiero enviar un item de mi inventario al pet de mi amigo, para que "le caiga bien" a su pet.
- Como jugador, quiero que mi pet "reciba" el regalo con animación de sobre y diga "¡Me llegó un regalo!".
- Como jugador, quiero poder escribir una "thank you note" (1 línea) al recibir un regalo.
- Como jugador, quiero que si mi pet está enfermo y yo no estoy, un amigo pueda enviar un Care Package.
- Como jugador, quiero ver al volver: "Mientras no estabas, [X] te envió un Care Package."
- Como jugador, quiero cocinar con 3-5 amigos un item raro (Group Feeding, 10 min).
- Como jugador, quiero que las recompensas del Group Feeding se repartan proporcionalmente.
- Como jugador, quiero poder **rechazar** un regalo si no quiero (el item vuelve al sender).

## Criterios de aceptación
- [ ] AC1: **Gifting básico:** `POST /gifts/send` → enviar 1 item del inventario al pet de un amigo. Máx **3/día enviados**, **5/día recibidos**.
- [ ] AC2: **Animación de recepción:** El pet receptor hace animación "recibir sobre" (3s): sobre aparece → pet abre → contenido brilla → pet "sonríe". Burbuja: "¡Me llegó un regalo de [sender]! 🎁"
- [ ] AC3: **Thank you note:** El receptor puede escribir 1 línea (máx 100 chars) que el sender ve en su "gift history".
- [ ] AC4: **Care Package:** Si el pet del receptor tiene `sick=true` (status público opt-in), otros jugadores pueden enviar un bundle: `[food + medicine + toy + 50 coins]` + nota. Máx 1 care package/día por receptor.
- [ ] AC5: **Care Package al volver:** Si el receptor estuvo ausente >2h y recibió un Care Package, al volver ve: "Mientras no estabas, [X] te envió un Care Package 💊. [Nick] está mejor."
- [ ] AC6: **Group Feeding:** 3-5 jugadores entran a una "cocina virtual" (room, 10 min). Cada jugador completa 1 minijuego (diferente). Al completar todos, se genera un item raro que se **reparte proporcionalmente** (30% al host, 23.3% al resto).
## Diseño de UX

### Flujos de usuario

#### Flujo: Enviar gift

```
[Panel → "Gifts" tab → "Enviar"]
  1. Seleccionar amigo (lista de "buddies" / amigos con pet activo)
  2. Ver pet del amigo (species, nombre, estado)
  3. Seleccionar item de mi inventario (solo food, toys, medicine)
  4. Escribir nota (opcional, máx 100 chars)
     "¡Feliz cumple! 🎂"
  5. [Enviar] → animación de "sobre saliendo" (1s)
  6. Confirmación: "¡Enviado! [Nick] de [Friend] lo recibirá."

[Receiver side]:
  → WS: gift:received
  → Pet hace animación "recibir sobre" (3s)
  → Burbuja: "¡Me llegó un regalo de [Sender]! 🎁"
  → Panel: "Gifts recibidos: [item] de [Sender]. Nota: '¡Feliz cumple!'"
  → [Responder nota] [Rechazar (24h)]
```

#### Flujo: Care Package

```
[Usuario ve que pet de amigo está "sick" (status público)]
  → Opción: "Enviar Care Package 💊"
  → Bundle automático: [1 food + 1 medicine + 1 toy + 50 coins]
  → Nota: "¡Ánimes, [PetName]! Pronto estarás bien. — [MyName]"
  → [Enviar Care Package]

[Receiver al volver]:
  → "Mientras no estabas, [X] te envió un Care Package 💊"
  → "Le aplicamos medicina + comida. [Nick] está mejor!"
  → Stats: health +20, hunger +15 (auto-aplicado)
```

#### Flujo: Group Feeding (3-5 players, 10 min)

```
[Player A crea "Cocina"]
  → Room WS: "cooking:{roomId}"
  → UI: "Mesa de cocina" con 4 platos vacíos
  → "Invita a 3-4 amigos" → links de invitación

[Players B, C, D entran]
  → Cada uno tiene 1 "plato"
  → "Completa tu minijuego para cocinar tu ingrediente:"
  → Player A: catch_food (45s)
  → Player B: memory_match (90s)
  → Player C: reflex (30s)
  → Player D: catch_food (45s)

[Progress bar por plato: 0% → 100%]
  → Al completar todos (máx 10min):
  → "🎉 ¡Cocina completa!"
  → Item raro generado: "Royal Feast" (rarity: super_rare)
  → Se reparte: 30% al host (A), 23.3% al resto
  → Cada player recibe: 1 item + 20 coins
  → "¡Buen provecho! 🍽️"
```

### Estados y transiciones

| Estado | Descripción |
|---|---|
| `gift_pending` | Gift enviado, esperando aceptación (24h) |
| `gift_accepted` | Recibido, item aplicado |
| `gift_rejected` | Rechazado, item vuelve al sender |
| `gift_expired` | 24h sin acción, se auto-acepta |
| `care_active` | Care Package aplicado, stats subiendo |
| `group_feeding_active` | Room activo, minijuegos en curso |
| `group_feeding_complete` | Item generado, reparto hecho |

### Animaciones y feedback

| Evento | Animación | Sonido |
|---|---|---|
| Gift enviado | Sobre "sale" con whoosh (1s) | "Send whoosh" |
| Gift recibido | Sobre aparece → abre → brilla → sonríe (3s) | "Gift pop" + "happy" |
| Care Package | Medicina "cae" → pet "se siente mejor" (2s) | "Heal chime" |
| Group feeding join | Pet "se sienta" en mesa (1s) | "Sit" |
| Group feeding complete | Confetti + item "aparece" en mesa (2s) | "Fanfare" |
| Thank you note | Burbuja con texto (3s) | "Typing" |

### Copywriting

**Gift recibido:**
- "¡Me llegó un regalo de [Sender]! 🎁"
- "¡[Sender] me mandó [item]! Qué genial 😄"
- "Awww, [Sender] pensó en mí 🥰"

**Care Package:**
- "¡[Sender] me mandó medicina! Me siento mejor 💊"
- "Gracias [Sender], no estás solo 🐾"

**Group feeding:**
- "¡Vamos a cocinar! ¿Qué ponemos?"
- "¡Mi ingrediente está listo! 🍳"
- "¡Cocina completa! ¿A comer? 🍽️"

**Thank you note:**
- "¡Gracias [Receiver]! Me encantó 🎉"
- "Se lo agradezco a [Receiver] de parte de [Nick] 🐾"

## Diseño técnico

### Backend

**Nuevo módulo:** `backend/src/modules/gifting/`
- `gifting.controller.ts` — endpoints
- `gifting.service.ts` — send, receive, reject, care package
- `group-feeding.service.ts` — room management, progress, reward
- `group-feeding.gateway.ts` — WebSocket room
- `gifting.module.ts` + `gifting.spec.ts`

**`gifting.service.ts`:**
```typescript
@Injectable()
export class GiftingService {
  async sendGift(senderId, receiverPetId, itemId, note): Promise<Gift>
  async receiveGift(receiverId, giftId): Promise<Gift>
  async rejectGift(receiverId, giftId): Promise<Gift>
  async sendCarePackage(senderId, receiverPetId, note): Promise<CarePackage>
  async getHistory(userId, direction, limit): Promise<Gift[]>
  async checkDailyLimit(userId, type): Promise<{ remaining: number }>
}
```
### Datos de juego

**`shared/game-data/gifting.json`:**
```json
{
  "dailyLimits": { "send": 3, "receive": 5, "carePackage": 1, "groupFeeding": 1 },
  "giftTTLHours": 24,
  "carePackage": {
    "bundle": ["food_basic", "medicine", "toy", "coins_50"],
    "healthRestore": 20, "hungerRestore": 15
  },
  "groupFeeding": {
    "minPlayers": 3, "maxPlayers": 5, "roomTTLMinutes": 10,
    "hostRewardPct": 0.30, "rewardCoins": 20,
    "rewardRarity": ["rare", "super_rare"]
  }
}
```

## Interfaz de API

### `POST /gifts/send`
Request: `{ "receiverPetId": "uuid", "itemId": "food_berry", "note": "¡Feliz cumple!" }`
Response 201: `{ "giftId": "uuid", "status": "pending" }`
Response 403: `{ "error": "Límite diario alcanzado" }`

### `POST /gifts/:id/accept`
Response 200: `{ "gift": {...}, "itemApplied": true }`

### `POST /gifts/:id/reject`
Response 200: `{ "gift": {...}, "itemReturned": true }`

### `POST /gifts/care-package`
Request: `{ "receiverPetId": "uuid", "note": "¡Ánimes!" }`
Response 201: `{ "careId": "uuid", "bundle": ["food","medicine","toy","coins_50"] }`

### `GET /gifts/history?direction=received&limit=50`
Response: `[{ id, from, to, itemName, note, status, createdAt }]`

### `POST /group-feeding/rooms`
## Modelo de datos

```prisma
model Gift {
  id            String   @id @default(uuid())
  senderId      String
  receiverId    String
  receiverPetId String
  itemId        String
  item          Item     @relation(fields: [itemId], references: [id])
  note          String?
  status        String   @default("pending") // pending | accepted | rejected | expired
  thankYouNote  String?
  createdAt     DateTime @default(now())
  resolvedAt    DateTime?
  @@index([receiverId, status])
  @@index([senderId, createdAt])
}

model CarePackage {
  id            String   @id @default(uuid())
  senderId      String
  receiverId    String
  receiverPetId String
  note          String?
  bundle        Json
  applied       Boolean  @default(false)
  healthRestore Float    @default(20)
  hungerRestore Float    @default(15)
  createdAt     DateTime @default(now())
  @@index([receiverId, createdAt])
}

model GroupFeedingRoom {
  id          String    @id @default(uuid())
  code        String    @unique
  hostId      String
  players     Json
  status      String    @default("active")
  rewardId    String?
  createdAt   DateTime  @default(now())
  expiresAt   DateTime
  completedAt DateTime?
  @@index([hostId, createdAt])
}
```

## Eventos y sincronización

| Event | Dir. | Payload | Trigger |
|---|---|---|---|
| `gift:received` | S→C | `{ giftId, senderName, itemName, note }` | Gift enviado |
| `gift:sent` | S→C | `{ giftId, receiverName, itemName }` | Al sender |
| `gift:rejected` | S→C | `{ giftId, receiverName }` | Rechazo |
| `care:package-received` | S→C | `{ careId, senderName, note, petName }` | Care enviado |
| `group:feeding-join` | S→C | `{ roomId, playerId, position }` | Join |
| `group:feeding-progress` | S→C | `{ roomId, progress, playerCount }` | Minigame done |
| `group:feeding-complete` | S→C | `{ roomId, reward, distribution }` | Todos completos |

## IA y personalización

- **Al recibir gift (bonding ≥ 40):** "¡[Sender] me mandó [item]! ¿Le dices que lo quiero? 😄"
- **Care package:** "¡[Sender] me mandó medicina! Me siento mejor 💊 Gracias."
- **Group feeding:** "¡Vamos a cocinar juntos! ¿Qué ponemos?"
- **Thank you note:** "¡Me encantó! [Sender] es el mejor."

## Dependencias
- Feature #6 (Bonding) — tier afecta tono
- Feature #7 (Notifications) — notificación de gift
- Feature #21 (Multi-Device/Co-op) — base rooms
- Feature #29 (Pet Buddies) — relationship para gifts
- Inventory system — transferencia de items
- Realtime gateway + new gateway — WS rooms
- IA chat — reacción al recibir

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Prisma + migración | 1.5 días |
| 2 | `GiftingService` (send, receive, reject, care) | 2.5 días |
| 3 | Endpoints + WS + Redis rate limits | 1.5 días |
| 4 | Frontend: GiftsTab + animations | 2.5 días |
| 5 | `GroupFeedingService` + Gateway | 3 días |
| 6 | Frontend: Room + plates + progress | 3 días |
| 7 | Care Package + "al volver" | 1.5 días |
| 8 | IA + tests + polish | 2 días |

**Total: ~17.5 días**

## Métricas de éxito
- **Gifts/día:** 1-2 por user activo
- **Care Packages:** >5% sick pets reciben ≥1
- **Group Feeding:** >10% weekly
- **Retention con gift:** +30% D7 (magneto de retorno)
- **Social graph:** >50% con ≥1 buddy con gifts
- **Thank you rate:** >70%

## Tests
- **Unit:** Rate limits, care bundle, group distribution
- **Integration:** Send → WS → accept → item in inventory
- **Integration:** Care → sick pet → health +20
- **Group feeding:** 3 players → complete → reward
- **Edge:** 24h expiry, reject, multi-device
- **E2E:** Full flow send → receive → animation → thank you

## Riesgos y notas
- **Spam:** Rate limits estrictos. No "floodear".
- **Item duplication:** Gift = transferencia. NO duplicar.
- **Group abandonment:** Room expira 10min. 50% reward si incomplete.
- **Care abuse:** Máx 1/día por receptor.
- **Privacy:** Status público opt-in. Solo "sick/sano".
- **Economy:** No monetizado. Solo inventory.
- **Multi-device:** WS broadcast al room.

## Preguntas abiertas
1. ¿Regalar gems? → **NO** (solo inventory).
2. ¿Group feeding especies diferentes? → **SÍ**.
3. ¿Re-gift item recibido? → **SÍ** (va a inventory).
4. ¿Care si pet NO sick? → **NO**.
5. ¿Group feeding da bonding? → **SÍ** (+3 a todos).
6. ¿Gift anónimo? → **NO** (conexión social es el punto).
Request: `{ "maxPlayers": 4 }`
Response 201: `{ "roomId": "uuid", "code": "ABC123", "expiresAt": "..." }`

### `POST /group-feeding/rooms/:id/join`
Request: `{ "code": "ABC123" }`
Response 200: `{ "roomId": "uuid", "position": 2, "assignedGame": "memory_match" }`

### `POST /group-feeding/rooms/:id/complete`
Request: `{ "gameType": "memory_match", "score": 45 }`
Response 200: `{ "progress": 0.5, "complete": false }`

**`group-feeding.service.ts`:**
```typescript
@Injectable()
export class GroupFeedingService {
  async createRoom(hostId, maxPlayers): Promise<Room>
  async joinRoom(roomId, playerId): Promise<Room>
  async completeMinigame(roomId, playerId, gameType, score): Promise<Room>
  async finalizeRoom(roomId): Promise<Reward>
}
```

**Rate limits (Redis):**
- `gift:send:{userId}:{date}` → máx 3
- `gift:receive:{userId}:{date}` → máx 5
- `care:send:{userId}:{date}` → máx 1
- `group:feeding:{userId}:{date}` → máx 1

### Frontend

**Componentes:**
- `GiftsTab.svelte` — Panel con "Enviar" / "Recibidos" / "Enviados"
- `SendGift.svelte` — Form: amigo, item, nota
- `GiftCard.svelte` — Individual gift (item, nota, estado)
- `GiftAnimation.svelte` — Overlay de animación (sobre, brillos)
- `CarePackageModal.svelte` — Bundle + nota
- `GroupFeedingRoom.svelte` — Mesa de cocina, platos, progress
- `FeedingPlate.svelte` — Individual plato (minigame, progress)
- [ ] AC7: **Room Group Feeding:** WebSocket room temporal (TTL 10min). UI: "mesa de cocina" con 3-5 "platos" (uno por jugador). Cada plato se "llena" cuando el jugador completa su minigame.
- [ ] AC8: **Status público (opt-in):** `PATCH /me` → `{ "publicPetStatus": true }`. Si activo, otros jugadores pueden ver si tu pet está `sick` (para Care Packages). NO se ven stats exactas, solo "enfermo/sano".
- [ ] AC9: **Rechazo:** El receptor puede rechazar un gift en 24h. El item vuelve al inventario del sender. El pet no hace animación de "recepción".
- [ ] AC10: **Gift history:** `GET /gifts/history?direction=received|sent` → últimos 50 gifts con: sender/receiver, item, nota, fecha, estado (accepted/rejected/expired).
- [ ] AC11: **WS events:** `gift:received`, `gift:sent`, `care:package-received`, `group:feeding-join`, `group:feeding-complete`.
- [ ] AC12: **IA reacción:** Al recibir un gift, el pet menciona al sender en chat: "¡[Sender] me mandó [item]! ¿Le dices que lo quiero? 😄" (si bonding ≥ 40).
- [ ] AC13: **Rate limits:** 3 gifts/día enviados, 5 recibidos, 1 care package/día, 1 group feeding/día. Reset a medianoche (timezone del user).