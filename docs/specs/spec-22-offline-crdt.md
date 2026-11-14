# Spec: Offline-First con CRDT Sync

## ID
22 — Oleada 2 "Meta + IA" (NUEVAS_FUNCIONALIDADES §22)

## Resumen
Sistema local-first con storage local (SQLite/Room), registro de acciones offline, y sincronización delta al reconectar. El pet "sigue viviendo" offline (decay, animaciones) y al reconectar se sincroniza el estado con resolución de conflictos por tipo de dato (LWW, merge, deterministic).

## Contexto
Si el usuario pierde conexión (avión, metro, sin WiFi), la app actual no puede hacer nada: no feed, no chat, no updates. El pet se "congela". Offline-first garantiza que la experiencia continúa: el decay sigue, el usuario puede alimentar/jugar, y al reconectar todo se sincroniza sin conflictos perceptibles.

Conecta con: `PetsService`, `InventoryService`, `BattlesModule`, Tauri (plugin-sql), Android (Room), `RealtimeGateway`.

## Objetivos
- La app funciona 100% sin conexión (pet decay, acciones básicas, UI).
- Sincronización al reconectar en <5s con resolución de conflictos automática.
- Delta sync: solo se envían cambios, no estado completo.
- El pet "vive" offline: decay de stats, animaciones de idle, sleeping.

## User Stories
- Como jugador, quiero alimentar a mi pet en el metro sin señal, para no perder el hábito.
- Como jugador, quiero que al volver a tener red mi pet no "resete", para que se sienta vivo.
- Como jugador, quiero ver el pet decay (hunger baja) aunque esté offline, para que no se sienta congelado.
- Como dev, quiero resolver conflictos automáticamente, para no pedir al usuario que resuelva merges.
- Como jugador, quiero que las acciones offline se registren y se sincronicen sin que me dé error.

## Criterios de aceptación
- [ ] AC1: App funciona sin red: pet visible, decay activo, feed/play/clean disponible.
- [ ] AC2: Al reconectar, sync delta completo en <5s (para <100 acciones pendientes).
- [ ] AC3: Conflict resolution: stats → LWW, inventario → merge (unión), combate → deterministic (seed).
- [ ] AC4: Pet decay offline: se calcula localmente (mismo rate que server) y se sincroniza.
- [ ] AC5: Queue de acciones offline: SQLite/Room table con timestamp, status (pending/synced).
- [ ] AC6: Si el server rechaza una acción (p. ej. inventario insuficiente), se notifica al usuario.
- [ ] AC7: Max queue: 500 acciones. Si se excede, se descartan las más antiguas y se avisa.
- [ ] AC8: El pet no puede "morir" offline (health no baja de 10).
- [ ] AC9: Animaciones y AI behavior continúan offline (idle, sleep cycle, mood changes).
- [ ] AC10: Indicador de estado: "Offline — X acciones pendientes" en la UI.

## Diseño técnico

### Arquitectura
```
┌───────────────────────────────────────────────────────────────┐
│                    Client (Tauri / Android)                    │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐   │
│  │  LocalDB     │    │  OfflineQueue│    │  DecayEngine  │   │
│  │  (SQLite/    │◀──▶│  (acciones   │    │  (local,     │   │
│  │   Room)      │    │   pending)   │    │   mismo rate)│   │
│  └──────┬───────┘    └──────┬───────┘    └───────────────┘   │
│         │                   │                                 │
│         └───────────┬───────┘                                 │
│                     ▼                                         │
│         ┌──────────────────────┐                              │
│         │   SyncEngine         │                              │
│         │  - detecta online   │                              │
│         │  - envía deltas     │                              │
│         │  - resuelve conflicts│                             │
│         │  - confirma ACK     │                              │
│         └──────────┬───────────┘                              │
└────────────────────┼──────────────────────────────────────────┘
                     │ HTTPS (batch delta)
                     ▼
┌──────────────────────────────────────────────────────────────┐
│              Backend (NestJS) — SyncModule                    │
│  - POST /sync/push (batch acciones)                          │
│  - POST /sync/pull (delta server → client)                   │
│  - ConflictResolver (LWW, merge, deterministic)              │
│  - Validation (rechaza acciones inválidas)                    │
└──────────────────────────────────────────────────────────────┘
```

### Backend
Nuevo módulo `backend/src/modules/sync/`:
- `sync.module.ts`, `sync.service.ts`
- `sync.controller.ts` — endpoints push/pull
- `conflict-resolver.service.ts` — lógica de resolución
- `sync.dto.ts`

Endpoints:
- `POST /sync/push` — batch de acciones offline (max 100/request)
- `POST /sync/pull` — obtener delta del server (desde lastSyncVersion)
- `GET /sync/version` — última versión global

### Frontend
**Tauri:**
- `tauri-plugin-sql` (SQLite) para local storage.
- `SyncEngine` (Rust): monitoriza red, detecta online, envía deltas.
- `OfflineQueue`: table SQLite `{id, action, args, timestamp, status}`.
- `DecayEngine`: mismo algoritmo que server (intervalo 60s, decay rates de `balance.json`).

**Android:**
- Room (ORM) para local DB.
- `WorkManager` para sync cuando hay red.
- `RoomFlow` para reactivity de queue.

**Común:**
- `SyncState`: `OFFLINE | SYNCING | ONLINE`.
- UI badge: "3 acciones pendientes de sincronizar".
- Conflict toast: "El server no pudo aplicar: [motivo]".
## Interfaz de API

**`POST /sync/push`** (JWT)
```json
// Request
{
  "petId": "uuid",
  "baseVersion": 42,
  "actions": [
    { "id": "action-uuid", "type": "feed", "args": { "food": "cookie" }, "timestamp": "2026-11-20T10:30:00Z" },
    { "id": "action-uuid2", "type": "clean", "args": {}, "timestamp": "2026-11-20T10:35:00Z" }
  ]
}
// Response 200
{
  "accepted": ["action-uuid", "action-uuid2"],
  "rejected": [{ "id": "action-uuid2", "reason": "hygiene already 100" }],
  "newVersion": 44,
  "state": { "hunger": 72, "happiness": 85, "hygiene": 100, "energy": 90, "health": 95 }
}
```

**`POST /sync/pull`** (JWT)
```json
// Request: { "petId": "uuid", "sinceVersion": 44 }
// Response
{
  "version": 52,
  "state": { "hunger": 65, "happiness": 80, "energy": 85, "health": 95 },
  "changes": [
    { "type": "state_update", "timestamp": "...", "data": { "hunger": 65 } },
    { "type": "item_gained", "timestamp": "...", "data": { "itemId": "toy_ball" } }
  ]
}
```

## Modelo de datos

**`SyncVersion`** (nuevo — tracking de versiones por pet):
```prisma
model SyncVersion {
  petId     String   @id
  version   Int      @default(0)
  state     Json     // snapshot: {hunger, happiness, energy, hygiene, health}
  updatedAt DateTime @updatedAt
}
```

**`SyncAction`** (nuevo — log de acciones para audit/replay):
```prisma
model SyncAction {
  id        String   @id @default(uuid())
  petId     String
  userId    String
  type      String   // feed | play | clean | battle | chat...
  args      Json
  clientTs  DateTime
  serverTs  DateTime @default(now())
  status    String   @default("applied") // applied | rejected
  rejectReason String?
  version   Int
  @@index([petId, version])
  @@index([userId, status])
}
```

## Protocolos y comunicación
- **Delta sync:** Client envía `actions[]` + `baseVersion`. Server aplica en orden, valida, y devuelve `newVersion` + `state`.
- **Conflict resolution:**
  - Stats (hunger, etc.): LWW por timestamp (server tiene última palabra para decay, client para user actions).
  - Inventario: Merge (unión de items). Si hay dup, gana el count mayor.
  - Combate: Deterministic por seed (el log del combate es inmutable).
- **Sync cadence:** Al reconectar, 1 push + 1 pull. Si hay >100 acciones, batch en chunks de 50.
- **ACK:** Cada acción tiene `id` único. Server confirma por id.
- **Timeout:** Si el push no responde en 10s, el client reintenta (idempotente por action.id).

## Security
- JWT en todos los endpoints sync.
- `action.id` es idempotente: reenviar la misma acción no duplica.
- Rate limit: 50 actions/min durante sync (no aplica offline).
- Validación server-side: el server RECHAZA acciones inválidas (no tiene ese item, pet dormido, etc.).
- No se envían API keys ni tokens en los actions args (solo referencias).

## Dependencias
- `PetsService` (apply actions), `InventoryService` (items).
- `BattlesModule` (deterministic combate).
- `RealtimeGateway` (notificar sync completo a otros devices).
- `tauri-plugin-sql` (Tauri), Room (Android).
- `RedisService` (rate limit sync).

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | SyncModule (push/pull endpoints) + SyncVersion | 2 días |
| 2 | ConflictResolver (LWW, merge, deterministic) | 2 días |
| 3 | Validation layer (rechazar acciones inválidas) | 1.5 días |
| 4 | Tauri: SQLite + OfflineQueue + DecayEngine | 3 días |
| 5 | Tauri: SyncEngine (network detect + batch) | 2 días |
| 6 | Android: Room + WorkManager + SyncEngine | 3 días |
| 7 | UI: SyncState indicator, conflict toasts | 1.5 días |
| 8 | Tests (unit + integration + offline simulation) | 2.5 días |

**Total: ~17.5 días (~3-4 semanas)**

## Performance y escalabilidad
- Sync < 5s para <100 acciones (batch push + pull).
- Local decay: O(1) por tick (60s). Sin red, sin overhead.
- SQLite/Room: <5MB para 500 acciones.
- Server push: batch de 50-100 actions → 1 DB transaction → <200ms.
- Memory: SyncQueue in-memory <1MB (500 actions × 200 bytes).

## Tests
- Unit: ConflictResolver (LWW, merge, deterministic), DecayEngine (mismo rate que server).
- Integration: Push 100 actions → apply → verify state. Offline → reconnect → sync.
- E2E: Kill network → feed pet → restore network → verify sync.
- Offline sim: 30min offline → 50 actions → sync → verify consistency.
- Edge: 500 actions (max queue), conflict (2 devices offline simultaneously), server rejects.

## Riesgos y notas
- Decay divergence: Si el client y server calculan decay con timestamps ligeramente distintos, puede haber ±5% drift. Mitigar: server tiene última palabra para decay.
- Battery (Android): WorkManager sync puede consumir batería. Limitar a 1 sync/hour si screen off.
- SQLite locking (Tauri): Multiple reads/writes concurrentes → usar WAL mode.
- Data loss: Si el client se borra (app reinstall), se pierde la queue. Mitigar: "last synced state" en server es la fuente de verdad.
- CRDT vs Operational Transform: v1 usa OT simplificado (LWW + merge). v2 podría migrar a Yjs/Automerge si se necesita collaborative editing real.

## Preguntas abiertas
1. ¿CRDT full (Yjs/Automerge) o OT simplificado (LWW+merge)? → OT v1 (más simple, suficiente para stats).
2. ¿Sync cada N acciones o cada X min? → Al reconectar (event-driven, no timer).
3. ¿El chat IA funciona offline? → No (requiere LLM). Solo acciones básicas.
4. ¿Max offline duration? → Ilimitado, pero decay se capte (pet no muere, health min 10).