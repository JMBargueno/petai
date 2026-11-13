# API Contract: Cofres y Drops (002-cofres-drops)

**Version**: 1.0.0 | **Date**: 2026-11-13 | **Plan**: [../plan.md](../plan.md)

Este contrato define los endpoints REST, eventos WebSocket y puntos de integración del módulo `chests`. Se documenta con `@nestjs/swagger` en el backend; se regenera con `pnpm export:openapi` → `shared/openapi/openapi.json`.

---

## REST Endpoints

### GET `/chests`

Lista los cofres **no abiertos** del usuario autenticado.

**Auth**: Bearer JWT (obligatorio)

**Query Parameters**: Ninguno

**Responses**:

| Status | Body |
|--------|------|
| `200` | `ChestListResponse` |
| `401` | `UnauthorizedResponse` |

**ChestListResponse**:
```json
{
  "chests": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "type": "bronze",
      "source": "daily_mission",
      "createdAt": "2026-11-13T10:00:00.000Z"
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "type": "gold",
      "source": "purchase",
      "createdAt": "2026-11-13T10:05:00.000Z"
    }
  ]
}
```

**Enums**:
- `type`: `"bronze" | "silver" | "gold" | "diamond" | "mythic"`
- `source`: `"daily_mission" | "battle" | "evolution" | "purchase" | "event"`

---

### POST `/chests/open`

Abre un cofre del usuario. Resuelve los drops de forma autoritativa, acredita items al inventario y actualiza el pity. Es **idempotente** (un segundo intento devuelve 409).

**Auth**: Bearer JWT (obligatorio)

**Body** (`application/json`):
```json
{
  "chestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Responses**:

| Status | Condición | Body |
|--------|-----------|------|
| `200` | Apertura exitosa | `OpenChestResponse` |
| `401` | Token ausente/inválido | `UnauthorizedResponse` |
| `404` | `chestId` no existe o no pertenece al usuario | `NotFoundResponse` |
| `409` | Cofre ya abierto (`openedAt` no es null) | `ConflictResponse` |

**OpenChestResponse**:
```json
{
  "chest": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "type": "bronze",
    "source": "daily_mission",
    "openedAt": "2026-11-13T10:10:00.000Z"
  },
  "drops": [
    {
      "itemId": "food_apple",
      "name": "Manzana",
      "qty": 3,
      "tier": "common",
      "isNew": true
    },
    {
      "itemId": "med_potion",
      "name": "Poción de salud",
      "qty": 1,
      "tier": "uncommon",
      "isNew": false
    }
  ],
  "pityProgress": {
    "count": 3,
    "threshold": 10,
    "minTier": "rare"
  }
}
```

**DropItem**:
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `itemId` | string | ID del item en el catálogo `Item` |
| `name` | string | Nombre display del item |
| `qty` | integer (1-99) | Cantidad otorgada (capped at 99; excedente → coins) |
| `tier` | string | Tier del drop: `"common" \| "uncommon" \| "rare" \| "epic" \| "legendary"` |
| `isNew` | boolean | `true` si el usuario no tenía ese item antes de la apertura |

**PityProgress**:
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `count` | integer | Aperturas consecutivas sin drop >= minTier |
| `threshold` | integer | Umbral de garantía (de `balance.json → chests.{type}.pity.threshold`) |
| `minTier` | string | Tier mínimo garantizado (de `balance.json → chests.{type}.pity.minTier`) |

---

### POST `/chests/purchase`

Compra un cofre con monedas o gemas. Crea un cofre `source: "purchase"` y descuenta el saldo de forma atómica.

**Auth**: Bearer JWT (obligatorio)

**Body** (`application/json`):
```json
{
  "type": "bronze",
  "paymentMethod": "coins"
}
```

**Validation**:
- `type`: `"bronze" | "silver" | "gold"` — cualquier otro valor (`"diamond"`, `"mythic"`, etc.) → `400`
- `paymentMethod`: `"coins" | "gems"` — cualquier otro → `400`

**Responses**:

| Status | Condición | Body |
|--------|-----------|------|
| `200` | Compra exitosa | `PurchaseChestResponse` |
| `400` | Tipo no comprable / método inválido / saldo insuficiente | `BadRequestResponse` |
| `401` | Token ausente/inválido | `UnauthorizedResponse` |
| `409` | Límite de 5 compras/día alcanzado (por timezone del usuario) | `ConflictResponse` |

**PurchaseChestResponse**:
```json
{
  "chest": {
    "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "type": "bronze",
    "source": "purchase",
    "createdAt": "2026-11-13T10:15:00.000Z"
  },
  "coinsRemaining": 65,
  "gemsRemaining": 5
}
```

---

### GET `/chests/history`

Histórico paginado de aperturas del usuario, ordenado por `openedAt` desc.

**Auth**: Bearer JWT (obligatorio)

**Query Parameters**:

| Param | Tipo | Default | Máx | Descripción |
|-------|------|---------|-----|-------------|
| `limit` | integer | `50` | `100` | Tamaño de página |
| `offset` | integer | `0` | — | Offset para paginación |

**Responses**:

| Status | Body |
|--------|------|
| `200` | `ChestHistoryResponse` |
| `401` | `UnauthorizedResponse` |

**ChestHistoryResponse**:
```json
{
  "openings": [
    {
      "chestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "type": "bronze",
      "drops": [
        {
          "itemId": "food_apple",
          "name": "Manzana",
          "qty": 3,
          "tier": "common",
          "isNew": true
        }
      ],
      "openedAt": "2026-11-13T10:10:00.000Z"
    }
  ],
  "total": 120
}
```

---
## WebSocket Events

Canal: namespace `/realtime` (ya existente, `RealtimeModule`). Autenticación por handshake token Bearer.

### `chest:unlocked`

Emitido al crear un cofre (cualquier fuente: misión, batalla, evolución, compra, evento). Solo se emite si hay una conexión WebSocket activa del usuario.

**Payload**:
```json
{
  "chestId": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "type": "gold",
  "source": "battle"
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `chestId` | string (uuid) | ID del cofre creado |
| `type` | string | Tipo del cofre |
| `source` | string | Origen del cofre |

**Trigger**: Se emite desde `chests.processor.ts` al completar el job `chests:create` y desde `chests.service.ts` en `purchaseChest`.

---

### `chest:opened`

Emitido al abrir un cofre exitosamente. Solo se emite si hay una conexión WebSocket activa del usuario.

**Payload**:
```json
{
  "chestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type": "bronze",
  "drops": [
    { "itemId": "food_apple", "name": "Manzana", "qty": 3, "tier": "common" },
    { "itemId": "med_potion", "name": "Poción de salud", "qty": 1, "tier": "uncommon" }
  ]
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `chestId` | string (uuid) | ID del cofre abierto |
| `type` | string | Tipo del cofre |
| `drops` | array | Lista de drops resueltos (sin `isNew`, que es solo REST) |

**Trigger**: Se emite desde `chests.service.ts` tras la transacción de apertura exitosa. Si no hay conexión, el evento se descarta (no se persiste — el cliente lo puede reconstruir desde `GET /chests/history`).
---

## Integration Points

### Cómo otros módulos otorgan cofres

El módulo `chests` expone un método público `ChestsService.grantChest(userId, type, source)` que otros módulos invocan para otorgar cofres **asincrónamente** sin bloquear la acción que los dispara.

**Firma**:
```ts
// chests.service.ts
async grantChest(userId: string, type: ChestType, source: ChestSource): Promise<void>
```

**Flujo**:
1. El módulo llamante (missions, battles, evolve, events) invoca `grantChest`.
2. `grantChest` enqueue un job BullMQ `chests:create` con payload `{ userId, type, source }`.
3. El job procesa asincrónamente: crea `Chest` en BD + emite WebSocket `chest:unlocked`.
4. El llamante **no espera** el resultado (fire-and-forget con acknowledgment del enqueue).

**Llamantes y sus triggers**:

| Módulo | Trigger | Source | Tipo |
|--------|---------|--------|------|
| `missions` (Feature 001) | Todas las misiones diarias completadas | `"daily_mission"` | Según `balance.json → chests.missionReward` |
| `battles` | Victoria en Arena (10% probabilidad) | `"battle"` | Según `balance.json → chests.battleReward` |
| `pets` (evolve) | Evolución final (stage → final) | `"evolution"` | `"gold"` |
| `events` (futuro) | Evento especial activo | `"event"` | `"mythic"` |
| `chests` (purchase) | Compra directa | `"purchase"` | `"bronze" \| "silver" \| "gold"` |

**Ejemplo de invocación (battles)**:
```ts
// En battles.service.ts tras resolver victoria
if (winnerUserId === attackerUserId && Math.random() < 0.10) {
  // Nota: esta probabilidad decide SI otorgar cofre (no el drop).
  // El drop real se resuelve al abrir, con crypto.randomInt.
  await this.chestsService.grantChest(userId, 'gold', 'battle');
}
```

---

### Dependencias de entrada

| Dependencia | Módulo | Uso |
|-------------|--------|-----|
| `PrismaModule` | `prisma` | Transacciones: `Chest`, `ChestPity`, `InventoryItem`, `User` (saldo) |
| `RedisModule` | `redis` | BullMQ: enqueue + procesamiento de jobs |
| `GameDataModule` | `modules/game-data` | Cargar `balance.json → chests` (tablas de drop, precios) |
| `RealtimeModule` | `modules/realtime` | Emitir WebSocket events (`chest:unlocked`, `chest:opened`) |
| `@nestjs/jwt` + `@nestjs/passport` | `auth` | Guard `JwtAuthGuard` para autenticación Bearer |

### Dependencias de salida (quién consume `chests`)

| Consumidor | Método |
|------------|--------|
| Controlador `chests.controller.ts` | `GET /chests`, `POST /chests/open`, `POST /chests/purchase`, `GET /chests/history` |
| Módulo `missions` | `ChestsService.grantChest` |
| Módulo `battles` | `ChestsService.grantChest` |
| Módulo `pets` (evolve) | `ChestsService.grantChest` |
| Clientes (Tauri, Android, iOS) | REST + WebSocket vía `openapi.json` |

---

## Error Response Format (convención global)

Todos los errores siguen el formato del `AppExceptionFilter` ya existente:

```json
{
  "statusCode": 409,
  "message": "Cofre ya abierto",
  "error": "Conflict"
}
```

| Code | Error | Mensaje |
|------|-------|---------|
| `401` | Unauthorized | "No autenticado" / "Token inválido" |
| `404` | Not Found | "Cofre no encontrado o ya abierto" |
| `409` | Conflict | "Cofre ya abierto" / "Límite de compras diarias alcanzado" |
| `400` | Bad Request | "Saldo insuficiente" / "Tipo de cofre no comprable" / "Método de pago inválido" |

