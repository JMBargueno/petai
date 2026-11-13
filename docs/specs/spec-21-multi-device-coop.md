# Spec: Multi-Device Presence y Co-op Pet Care

## ID
21 — Oleada 3 "Comunidad + Ecosistema" (NUEVAS_FUNCIONALIDADES §21)

## Resumen
Capa de presencia multi-device con heartbeat y sincronización instantánea de estado del pet, más sistema de "visitas" entre amigos donde un usuario autorizado puede alimentar/jugar con el pet de otro, generando eventos sociales y badges.

## Contexto
El `RealtimeGateway` actual tiene room `user:{userId}` y emite `pet:update`. No hay presencia entre dispositivos (el usuario no sabe si su pet está activo en otro device) ni hay mecanismo de interacción social entre usuarios. La arquitectura Tauri/Android ya soporta múltiples sesiones simultáneas (hasta 5 sockets/user). Falta: (1) awareness de dispositivos activos, (2) autorización de acceso cruzado, (3) "visitas" al pet de un amigo.

Conecta con: `RealtimeGateway`, `PetsService`, `User`/`DeviceLink` (Prisma), `RedisService`.

## Objetivos
- Presencia en tiempo real: saber qué dispositivos están activos y conectados.
- Sincronización instantánea de estado del pet entre todos los devices del usuario.
- Sistema de "visitas" social: un amigo autorizado puede interactuar con tu pet.
- Badges y recompensas por cuidar el pet de otro.

## User Stories
- Como jugador, quiero ver en qué dispositivos está conectado mi pet, para saber si está "vivo" en otro lado.
- Como jugador, quiero que mi pet reciba la misma actualización de estado en mi PC y mi teléfono simultáneamente.
- Como jugador, quiero visitar el pet de un amigo y alimentarlo, para tener interacción social.
- Como jugador, quiero saber cuando un amigo visita mi pet, para sentir comunidad.
- Como jugador, quiero ganar un badge de "Visitante" por cuidar el pet de otros.

## Criterios de aceptación
- [ ] AC1: Heartbeat cada 30s por dispositivo. UI muestra "Tu pet está en: [Escritorio ✓, Android ✗]".
- [ ] AC2: Estado del pet (hunger, happiness, etc.) se sincroniza en <500ms a todos los devices.
- [ ] AC3: Un amigo con autorización puede "visitar" el pet: alimentar, jugar, limpiar.
- [ ] AC4: El propietario es notificado (WS + push) cuando un amigo visita.
- [ ] AC5: El visitante gana XP y badge "Visitante" (10 visitas = badge dorado).
- [ ] AC6: El pet tiene animación/sound de "alguien me visita" al recibir la interacción.
- [ ] AC7: Autorización: el propietario aprueba/denega lista de visitantes (max 10 amigos).
- [ ] AC8: Rate limit: max 5 visitas/día por visitante a un mismo pet.
- [ ] AC9: Si el propietario no tiene ningún device activo, la visita se procesa y se notifica al reconectar.
- [ ] AC10: Presencia expira tras 90s sin heartbeat → se marca como offline.

## Diseño técnico

### Arquitectura
```
Device A (Tauri)          Device B (Android)
    │  heartbeat 30s         │  heartbeat 30s
    ▼                        ▼
┌─────────────────────────────────────────┐
│  PresenceGateway (WS ns 'presence')     │
│  - Room: user:{userId}                 │
│  - Track: {deviceId, platform, ts}     │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  PresenceService                        │
│  - Redis: petai:presence:{userId}       │
│    → Hash { deviceId: {platform, ts} }  │
│  - TTL: 90s (auto-expire)              │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  CoOpService (nuevo)                    │
│  - Autorización (lista amigos)         │
│  - Visit actions (feed/play/clean)     │
│  - Badges + XP                         │
│  - Rate limiting                       │
└─────────────────────────────────────────┘
```

### Backend
Nuevos módulos en `backend/src/modules/`:

**`presence/`**
- `presence.gateway.ts` — WS namespace `presence`, heartbeat handling
- `presence.service.ts` — track devices, auto-expire, query

**`coop/`**
- `coop.module.ts`, `coop.service.ts`
- `coop.controller.ts` — REST para autorización + visitas
- `coop.dto.ts`

Cambios en `RealtimeGateway`: nuevo método `emitToPet(petId, event, payload)` para notificar visitas al propietario.

Redis keys:
- `petai:presence:{userId}` → Hash `{ deviceId: { platform, lastSeen } }`, auto-expire 90s.
- `petai:coop:visits:{petId}:{date}` → Set de userIds visitantes (rate limit).
- `petai:coop:badges:{userId}` → Hash `{ type: count }`.

### Frontend
**Tauri:** Nuevo `PresencePlugin`: heartbeat loop (30s), UI widget "devices activos", notification listener.
**Android:** `ForegroundService` con heartbeat, UI en "Mis Devices".
**Común:**
- Widget de presencia: iconos por device (desktop, phone, tablet).
- "Visitar" flow: lista amigos → click pet → actions (alimentar, jugar, limpiar).
- Notificación: "¡[Amigo] visitó a [Pet]! 🐾".

### Infraestructura
- Sin CDN nuevo.
- Push notifications: para devices offline (FCM/Apple Push → v2).
## Interfaz de API

**`POST /coop/friends`** (JWT) — autorizar amigo
```json
// Request: { "friendEmail": "friend@example.com" }
// Response: { "id": "uuid", "friendEmail": "...", "status": "pending" }
```

**`GET /coop/friends`** → lista de amigos autorizados.

**`POST /coop/friends/:id/approve`** — aprobar solicitud.

**`DELETE /coop/friends/:id`** — revocar acceso.

**`POST /coop/visit`** — visitar pet de un amigo
```json
// Request: { "petId": "uuid", "action": "feed" | "play" | "clean" }
// Response: { "success": true, "xpGained": 10, "badgeProgress": 3 }
// 429: { "error": "Limite de visitas alcanzado", "retryAfter": 3600 }
```

**`GET /coop/visit-log?petId={id}`** — historial de visitas al pet.

**WS `presence` namespace:**
- C→S: `presence:heartbeat { deviceId, platform }` (cada 30s)
- S→C: `presence:update { devices: [{id, platform, active}] }`
- S→C: `coop:visit-notification { visitorName, action, petId }`
- S→C: `coop:badge-earned { type, name }`

## Modelo de datos

**`DevicePresence`** (nuevo — tracking, no persistencia larga):
```prisma
model DevicePresence {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  deviceId  String   @unique
  platform  String   // desktop | android | ios
  appName   String?
  lastSeen  DateTime @default(now())
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  @@index([userId, active])
}
```

**`CoopFriendship`** (nuevo):
```prisma
model CoopFriendship {
  id          String   @id @default(uuid())
  userId      String   // propietario
  friendId    String   // visitante autorizado
  status      String   @default("pending") // pending | accepted | revoked
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([userId, friendId])
}
```

**`CoopVisit`** (nuevo):
```prisma
model CoopVisit {
  id          String   @id @default(uuid())
  visitorId   String
  petId       String
  action      String   // feed | play | clean
  xpGained    Int      @default(10)
  visitCount  Int      // n-ésima visita de este visitor a este pet
  createdAt   DateTime @default(now())
  @@index([visitorId, petId, createdAt])
  @@index([petId, createdAt])
}
```

**`CoopBadge`** (nuevo):
```prisma
model CoopBadge {
  id        String   @id @default(uuid())
  userId    String
  type      String   // visitor_1 | visitor_10 | visitor_50 | caregiver
  earnedAt  DateTime @default(now())
  @@unique([userId, type])
}
```

## Protocolos y comunicación
- Heartbeat: WS `presence` namespace, cada 30s. Si 90s sin heartbeat → offline.
- Pet state sync: se reutiliza `pet:update` del `RealtimeGateway` (ya emite a `user:{userId}`).
- Visit events: `RealtimeGateway.emitToUser(ownerId, 'coop:visit', payload)`.
- Si propietario no tiene devices activos: se guarda `CoopVisit` en DB, se notifica al reconectar.
- Rate limit: Redis `petai:coop:visits:{petId}:{date}` → max 5/día por visitor.

## Security
- Autorización explícita: solo amigos en `CoopFriendship.status = 'accepted'`.
- Rate limiting: 5 visitas/día/pet/visitor.
- JWT en todos los endpoints + WS handshake.
- El visitor NO ve stats completos del pet (solo suficiente para la interacción).
- `DevicePresence` se purga a las 24h (BullMQ job).

## Dependencias
- `RealtimeGateway` (existing), `PetsService` (feed/play/clean actions).
- `RedisService`, `PrismaService`.
- `UsersModule` (para lookup por email en friendships).
- OpenTelemetry (#3) — spans para visit flow.

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | PresenceGateway + PresenceService + Redis | 2 días |
| 2 | DevicePresence model + migration + auto-expire | 1.5 días |
| 3 | CoopService: friendships + authorization | 2 días |
| 4 | Visit actions (feed/play/clean) + rate limit | 2 días |
| 5 | Badges + XP + notifications | 1.5 días |
| 6 | WS events: presence:update, coop:visit-notification | 1.5 días |
| 7 | Frontend: presence widget + visit UI (Tauri) | 2 días |
| 8 | Frontend: Android presence + visit | 1.5 días |
| 9 | Tests + docs | 2 días |

**Total: ~16 días (~3-4 semanas)**

## Performance y escalabilidad
- Presencia: Redis hash per user, O(1) read. 1M users × 2 devices = 2M keys ≈ 200MB RAM.
- Heartbeat: 30s → 1M users = ~33k heartbeats/sec. Redis handles easily.
- Visit actions: reutilizan `PetsService` existing logic. Sin overhead extra.
- Auto-expire: BullMQ job cada 5min purga `lastSeen < now-24h`.

## Tests
- Unit: PresenceService (heartbeat, expire), CoopService (auth, rate limit, badges).
- Integration: 2 devices + visit, offline owner + visit → notification on reconnect.
- E2E: Full flow: friend request → accept → visit → badge → notification.
- Load: 10k heartbeats/sec, verify Redis memory < 500MB.
- Edge: Revoked friendship mid-visit, 5th visit limit, simultaneous visits.

## Riesgos y notas
- Push notifications para offline devices: FCM/APNs es v2 (v1 solo WS).
- "Visita" a un pet con stats muy bajas: el visitante puede accidentalmente "matar" al pet (over-feed). Mitigar: acciones de visita no alteran stats >10%.
- Privacy: El visitor no ve el chat history del pet. Solo interactúa.
- Social graph: `CoopFriendship` es unidireccional (A autoriza a B). B no tiene acceso a A salvo que A acepte.

## Preguntas abiertas
1. ¿Visitas solo entre amigos o cualquier usuario con pet público? → Amigos (privacidad).
2. ¿El visitante puede hablar con el pet (chat IA)? → No v1, solo acciones físicas.
3. ¿Push notifications en v1? → No, solo WS. FCM/APNs en v2.
4. ¿Max devices por user? → 5 (coincide con MAX_SOCKETS_PER_USER actual).