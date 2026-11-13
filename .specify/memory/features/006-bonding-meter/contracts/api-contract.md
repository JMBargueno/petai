# API Contract: Bonding Meter (006-bonding-meter)

**Version**: 1.0.0 | **Date**: 2026-11-13 | **Plan**: [../plan.md](../plan.md)

Este contrato define los endpoints REST, los eventos WebSocket y los puntos de integración del métrico de vínculo. Se documenta con `@nestjs/swagger` en el backend; se regenera con `pnpm export:openapi` → `shared/openapi/openapi.json`.

> Todas las rutas exigen Bearer JWT (autenticación obligatoria). La identidad (`userId`, `petId`) proviene **siempre** de la sesión (`@CurrentUser`/`@Param` verificado contra el `userId` del token); nunca se acepta `userId` en el body.

---

## REST Endpoints

### GET `/pets/:id` (ampliado)

Devuelve el pet ya con el `applyLazyTick` aplicado (vitales **y** vínculo al día). La respuesta existente ahora incluye los campos de vínculo.

**Auth**: Bearer JWT (obligatorio)

**Path Parameters**: `id` — `string` (uuid del pet del usuario autenticado)

**Responses**:

| Status | Condición | Body |
|--------|-----------|------|
| `200` | Pet encontrado | `PetResponse` (con vínculo) |
| `401` | Token ausente/inválido | `UnauthorizedResponse` |
| `404` | `id` no existe o no pertenece al usuario | `NotFoundResponse` |

**Campos de vínculo añadidos a `PetResponse`**:
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "bonding": 30,
  "bondingTier": "companion",
  "bondingTierName": "Compañero",
  "lastInteractionAt": "2026-11-13T10:00:00.000Z"
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `bonding` | number (0-100, 2 dec.) | Valor del vínculo, acotado a `[0,100]`, tras tick |
| `bondingTier` | string | Id del rango: `acquainted \| companion \| ally \| soulmate \| legend` |
| `bondingTierName` | string | Nombre display del rango (español) |
| `lastInteractionAt` | string (ISO-8601) | Última vez que hubo interacción (base del decaimiento) |

---

### GET `/pets/:id/bonding`

Detalle completo del métrico de vínculo: valor, rango, historial paginado de cambios y estado del decaimiento.

**Auth**: Bearer JWT (obligatorio)

**Path Parameters**: `id` — `string` (uuid del pet del usuario autenticado)

**Query Parameters**:

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `limit` | integer (1-100) | `20` | Nº de `BondingEvent` en `history` |
| `cursor` | string | — | `createdAt` ISO-8601 de la última fila de la página previa (paginación clave) |

**Responses**:

| Status | Condición | Body |
|--------|-----------|------|
| `200` | OK | `BondingDetailResponse` |
| `401` | Token ausente/inválido | `UnauthorizedResponse` |
| `404` | `id` no existe o no es del usuario | `NotFoundResponse` |

**BondingDetailResponse**:
```json
{
  "value": 61.25,
  "tier": "ally",
  "tierName": "Aliado",
  "lastInteractionAt": "2026-11-10T08:00:00.000Z",
  "history": {
    "items": [
      { "id": "e1", "delta": 5, "reason": "evolve", "value": 61.25, "createdAt": "2026-11-13T09:00:00.000Z" },
      { "id": "e2", "delta": -0.75, "reason": "decay", "value": 56.25, "createdAt": "2026-11-13T08:59:59.000Z" },
      { "id": "e3", "delta": 2, "reason": "feed", "value": 57, "createdAt": "2026-11-11T12:00:00.000Z" }
    ],
    "nextCursor": "2026-11-11T12:00:00.000Z"
  },
  "decayInfo": {
    "decayRatePerDay": 0.5,
    "isDecaying": true,
    "graceWindowHours": 24,
    "decayStartHours": 48,
    "hoursSinceInteraction": 72.4,
    "acumulatedDecay": 0.75
  },
  "unlocks": {
    "greeting": true,
    "memoryRecall": true,
    "emotionalReactions": false,
    "patternUnlocked": false,
    "sleepNearCursor": false
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `value` | number (0-100) | Vínculo actual (post tick) |
| `tier` / `tierName` | string | Id y nombre del rango |
| `history.items[]` | array | `BondingEvent` en orden descendente por `createdAt` |
| `history.items[].delta` | number | Signado: `+` incremento, `−` decaimiento |
| `history.items[].reason` | string | `feed \| battle \| minigame \| chat \| clean \| sleep \| evolve \| decay` |
| `history.items[].value` | number | `bonding` resultante después del cambio |
| `history.nextCursor` | string? | `null` si no hay más páginas |
| `decayInfo.acumulatedDecay` | number | Decaimiento total acumulado (para UI "cuánto se enfrió") |
| `unlocks.*` | boolean | Estado de cada desbloqueo por umbral (ver tabla de umbrales) |

**Tabla de umbrales (`unlocks`)**:

| `unlocks.*` | Umbral | Significado |
|-------------|--------|-------------|
| `greeting` | `>= 30` (companion) | El pet saluda al iniciar sesión |
| `memoryRecall` | `>= 60` (ally) **OR** `intelligence >= MEMORY_UNLOCK` | La IA recupera conversaciones previas |
| `emotionalReactions` | `>= 80` (soulmate) | Reacciones emocionales personalizadas |
| `patternUnlocked` | `>= 100` (legend) | Patrón exclusivo desbloqueado |
| `sleepNearCursor` | `>= 100` (legend) | Duerme cerca del cursor (animación escritorio) |

---

## WebSocket Events

Namespace `realtime` (Socket.IO, autenticado con JWT de acceso). Se emiten vía `RealtimeGateway.emitToUser(userId, event, payload)`. El cliente los consume; si no hay conexión, el evento se descarta (el cliente puede reconstruir el estado desde `GET /pets/:id/bonding`).

### `bonding:tier_up`

Se emite cuando una interacción sube el pet de rango (cruce de umbral 30/60/80/100).

**Payload**:
```json
{ "petId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "oldTier": "acquainted", "newTier": "companion", "bonding": 30 }
```

### `bonding:tier_down`

Se emite cuando el decaimiento por abandono baja el pet de rango.

**Payload**:
```json
{ "petId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "oldTier": "ally", "newTier": "companion", "bonding": 59.25 }
```

### `bonding:decay`

Se emite cuando el decaimiento aplicado supera **1 punto** de caída (para que la UI muestre que el vínculo se "enfrió" de forma notable; los decaimientos menores no spamian).

**Payload**:
```json
{ "petId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "bonding": 48.5, "delta": -1.75 }
```

**Regla de emisión**: `tier_up`/`tier_down` se emiten **una sola vez** por cruce (idempotente bajo lectura concurrente). `bonding:decay` se emite solo si `|delta| > 1`. `bonding:tier_down` y `bonding:decay` pueden emitirse en el mismo tick si el decaimiento cruza rango y supera 1 punto.

---

## Integration Points

### Cómo las interacciones incrementan el vínculo

El módulo `bonding` expone un método público `BondingService.recordInteraction(petId, userId, type)` que los servicios de acción invocan **tras** resolver la acción de forma exitosa. `type` ∈ `balance.bonding.interactions` (`feed`, `battle`, `minigame`, `chat`, `clean`, `sleep`, `evolve`); cualquier otro `type` se rechaza (Constitución I).

**Firma**:
```ts
// bonding.service.ts
async recordInteraction(petId: string, userId: string, type: BondingInteractionType): Promise<{ bonding: number; bondingTier: string; tierChanged: 'up' | 'down' | null }>
```

**Flujo**:
1. El servicio de acción (pets/battles/minigames/ai) resuelve la acción y, si es exitosa, llama a `recordInteraction`.
2. `recordInteraction` lee el incremento de `balance.bonding.interactions[type]`, aplica `clamp(bonding + inc, 0, 100)`, recalcula `tier`, fija `lastInteractionAt = now` y crea la `BondingEvent`, en una **transacción** Prisma.
3. Si el tier cambió, emite `bonding:tier_up`.
4. Se refuerza el estado al cliente con `emitPetUpdate` (ya existente) + el push de tier.

**Llamantes y su trigger**:

| Módulo | Trigger | `type` |
|--------|---------|--------|
| `pets.feed` | Alimentación exitosa (no dormido) | `feed` |
| `pets.clean` | Baño exitoso (no dormido) | `clean` |
| `pets.sleep` | Poner a dormir | `sleep` |
| `battles` | Pelea terminada (victoria o derrota cuentan) | `battle` |
| `minigames` | Minijuego terminado con premio | `minigame` |
| `ai.chat` | Turno de chat completado | `chat` |
| `pets` (evolve) | Evolución completada | `evolve` |

**Ejemplo (feed)**:
```ts
// pets.service.ts — feed()
const withXp = await this.addXpInternal(updated, 15);
await this.bonding.recordInteraction(petId, userId, 'feed'); // tras acción exitosa
this.realtimeGateway.emitPetUpdate(userId, withXp);
this.eventEmitter.emit('pet:fed', { userId, petId });
```

### Decaimiento (lazy tick)

No hay endpoint de decaimiento: se resuelve en `pets.service.applyLazyTick` (ya existente), que además del decaimiento de vitales aplica el decaimiento de vínculo si `now − lastInteractionAt > 48h` (y no si `< 24h`). Al aplicar, fija la base de referencia (idempotente). Emite `bonding:tier_down` / `bonding:decay` según corresponda y persiste `BondingEvent` con `reason = "decay"`.

### Integración con la IA (prompt + memoria)

- `buildSystemPrompt` (en `personality.ts`) recibe `bondingTier` y lo añade como contexto al sistema (p. ej. "Vínculo con tu entrenador: Aliado — mostrad afecto y confianza").
- `chat.service.ts`: la inyección de memoria (`memory.recall`) pasa a ser `if (intelligence >= MEMORY_UNLOCK || bondingTier >= 'ally')`. Es idempotente (no duplica el bloque).
- `soulmate` (80+): el prompt añade una directiva de reacciones emocionales personalizadas; el carácter base (rasgo + mood de `personality.ts`) no se altera.
- El `type`/args de herramientas de IA no cambian: `bondingTier` es contexto de solo-lectura, no un argumento manipulable por el modelo (Constitución VIII).

### Desbloqueos visuales (escritorio)

`unlocks.patternUnlocked` / `unlocks.sleepNearCursor` (legend) y `unlocks.greeting` (companion) se consumen por el escritorio vía `openapi.json` (tipos generados) para animar; el backend solo los declara, no anima.

### Dependencias de entrada

| Dependencia | Módulo | Uso |
|-------------|--------|-----|
| `PrismaModule` | `prisma` | `Pet` (bonding/tier/lastInteractionAt) y `BondingEvent`; transacciones |
| `GameDataModule` | `modules/game-data` | `balance.bonding.interactions / decayRatePerDay / tiers[]` |
| `RealtimeModule` | `modules/realtime` | Emitir `bonding:tier_up` / `bonding:tier_down` / `bonding:decay` |
| `@nestjs/jwt` + `passport` | `auth` | Guard `@CurrentUser` (identidad de la sesión) |

### Dependencias de salida (quién consume `bonding`)

| Consumidor | Método / punto |
|------------|----------------|
| `pets.controller.ts` | `GET /pets/:id` (ampliado), `GET /pets/:id/bonding` |
| `pets.service.ts` | `applyLazyTick` (decaimiento), hooks de `feed`/`clean`/`sleep` |
| `battles` / `minigames` / `ai.chat` / evolve | `BondingService.recordInteraction` |
| `ai.personality` / `ai.chat` | `bondingTier` en `systemPrompt` + memoria OR |
| Clientes (Tauri; Android/iOS fases posteriores) | REST + WebSocket vía `openapi.json` |

---

## Error Response Format (convención global)

Todos los errores siguen el formato del `AppExceptionFilter` ya existente:

```json
{ "statusCode": 404, "message": "Mascota no encontrada", "error": "Not Found" }
```

| Code | Error | Mensaje |
|------|-------|---------|
| `401` | Unauthorized | "No autenticado" / "Token inválido" |
| `404` | Not Found | "Mascota no encontrada" |
| `400` | Bad Request | "Tipo de interacción inválido" / "limit fuera de rango" |