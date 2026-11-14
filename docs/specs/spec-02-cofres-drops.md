# Spec: Cofres y drops aleatorios

## ID
Feature #2 de la lista de 33 funcionalidades — Oleada 1 "Micro-recompensa + FOMO"

## Resumen
Sistema de cofres (Bronce, Plata, Oro, Diamante, Mítico) que contienen items aleatorios con tablas de drops definidas en `balance.json`. Se consiguen con misiones, victorias, evoluciones o compra directa. Incluyen un sistema de pity por tipo de cofre que garantiza rareza mínima tras N aperturas.

## Contexto
Los cofres añaden un bucle de micro-recompensa constante que complementa el sistema de misiones (Feature #1): al completar todas las diarias se desbloquea un cofre, y el "¿qué caerá?" genera FOMO y dopamina. También conecta con la economía del juego (monedas/gemas para comprar cofres) y el catálogo de items (comida, medicina, huevos, skins).

Conecta con: `missions` (cofre diario), `battles` (recompensa por victoria), `evolve` (cofre por evolución), `shop` (compra directa), `inventory` (items obtenidos), y `balance.json` (tablas de drops).

## Objetivos
- Proporcionar micro-recompensas frecuentes que mantengan el engagement entre sesiones largas.
- Crear un FOMO de "¿qué caerá?" con rarezas visibles (color del cofre).
- Mantener un balance económico: los items de cofres no devalúen los drops directos del juego.
- Implementar un sistema de pity por tipo de cofre para proteger contra mala suerte.

## User Stories
- Como jugador, quiero abrir un cofre y ver una animación de revelación para sentir la emoción del drop.
- Como jugador, quiero ver qué rareza mínima puedo obtener antes de comprar un cofre.
- Como jugador, quiero que tras 10 cofres de bronce sin item raro, el siguiente me garantice al menos un raro.
- Como jugador, quiero ver el historial de mis aperturas de cofres.
- Como jugador, quiero comprar cofres con monedas o gemas desde la tienda.
- Como jugador, quiero que los cofres míticos solo estén disponibles en eventos especiales.

## Criterios de aceptación
- [ ] AC1: El endpoint `POST /chests/open` acepta un `chestId` y devuelve la lista de items obtenidos según la tabla de drops del tipo de cofre.
- [ ] AC2: Cada tipo de cofre (bronze, silver, gold, diamond, mythic) tiene una tabla de drops independiente en `balance.json → chests` con probabilidades por tier (common, uncommon, rare, epic, legendary).
- [ ] AC3: El sistema de pity se trackea por usuario y tipo de cofre: tras `pityThreshold` aperturas sin drop de tier >= `pityMinTier`, la siguiente apertura garantiza al menos ese tier.
- [ ] AC4: Los drops se resuelven en el servidor de forma autoritativa usando `crypto.randomInt` (mismo patrón que la eclosión).
- [ ] AC5: Los items obtenidos se añaden al `InventoryItem` del usuario de forma atómica.
- [ ] AC6: `POST /chests/purchase` crea un cofre inactivo en el inventario (no se abre hasta que el usuario lo abre).
- [ ] AC7: El endpoint `GET /chests/history?limit=` devuelve las últimas 100 aperturas con fecha, tipo de cofre e items obtenidos.
## Diseño técnico
### Backend
- **Módulo NestJS:** `src/chests/`
  - `chests.module.ts`, `chests.controller.ts`, `chests.service.ts`
  - `drop-table.service.ts` — carga y evalúa tablas de drops desde `balance.json`
  - `pity.service.ts` — trackea pity por usuario y tipo de cofre
  - `dto/chest-purchase.dto.ts`, `dto/chest-open.dto.ts`

- **Resolución de drops (servidor autoritativo):**
  1. Determinar tier del cofre. Cargar tabla `balance.json → chests.{tier}`.
  2. Resolver pity: si `count >= threshold`, forzar tier mínimo.
  3. Tirada ponderada con `crypto.randomInt` sobre peso total.
  4. Si drop >= pity minTier → reset pity. Si no → increment.
  5. Upsert en `InventoryItem`. Crear `ChestOpening`.

- **Fuentes de cofres:** misiones diarias, victoria en Arena (10%), evolución, compra directa, eventos.

### Frontend
- **`ChestGrid`:** Grid de cofres no abiertos con brillo por tier.
- **`ChestOpening`:** Animación spin → reveal + partículas.
- **`ChestHistory`:** Lista paginada de aperturas.

### Datos de juego
- **`balance.json → chests`:** Sección nueva con tablas por tier (items, weights, qty ranges, pity threshold y minTier).

## Interfaz de API
### GET /chests
- **Auth:** Bearer → `200`: `{ chests: [{ id, type, source, createdAt }] }`

### POST /chests/open
- **Body:** `{ "chestId": "uuid" }`
- **200:** `{ chest, drops: [{ itemId, name, qty, tier, isNew }], pityProgress }`
- **Status:** 200, 404, 409

### POST /chests/purchase
- **Body:** `{ "type": "bronze|silver|gold", "paymentMethod": "coins"|"gems" }`
- **200:** `{ chest, coinsRemaining, gemsRemaining }`
- **Status:** 200, 400 (insuficiente), 409 (máx 5/día)

### GET /chests/history
- **Query:** `?limit=50&offset=0`
- **200:** `{ openings: [{ chestId, type, drops, openedAt }], total }`

## Modelo de datos
```prisma
model Chest {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String   // bronze | silver | gold | diamond | mythic
  source    String   // daily_mission | battle | evolution | purchase | event
  openedAt  DateTime?
  drops     Json?
  createdAt DateTime @default(now())
  @@index([userId, openedAt])
}

model ChestPity {
  id      String @id @default(uuid())
  userId  String
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tier    String
  count   Int    @default(0)
  @@unique([userId, tier])
}
```
- Modificación `User`: añadir `chests Chest[]` y `chestPity ChestPity[]`.

## Eventos y sincronización
### WebSocket events
- `chest:unlocked` → `{ chestId, type, source }` — al crear un cofre
- `chest:opened` → `{ chestId, type, drops }` — al abrir (si hay conexión)

### BullMQ jobs
- `chests:create` — crear cofres asíncrono (no bloquear la acción trigger)
- `chests:cleanup` — diario: borrar cofres > 30 días sin abrir → convertir a monedas

### Sincronización
- Transacción: drops en `InventoryItem` + `Chest.openedAt` + `ChestPity.count`

## Dependencias
- **Feature #1 (Misiones):** Cofre diario
- **Sistema de items (existente):** `Item`, `InventoryItem`, `/inventory`
- **Arena (existente):** Victoria → 10% cofre
- **Evolución (existente):** `POST /pets/:id/evolve` → cofre gold
- **Tienda (existente):** `POST /shop/buy` extendido
- **balance.json:** Sección `chests` nueva

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Modelos Prisma + migración + balance.json section | 1 día |
| 2 | `drop-table.service` + `pity.service` | 1.5 días |
| 3 | Módulo `chests` (endpoints) | 1.5 días |
| 4 | Triggers (misiones, battles, evolve, tienda) | 1 día |
| 5 | WebSocket + frontend animaciones | 1.5 días |
| 6 | Tests + docs | 1 día |

**Total: ~7.5 días**

## Tests
- **Unit:** drop-table (weighted random, pity trigger/reset), pity service
- **Integration:** open → inventory, pity increment, 409 ya abierto
- **E2E:** comprar → abrir → verificar inventory
- **Edge:** pity exacto (N-1 vs N), race condition, balance insuficiente, tier mítico

## Riesgos y notas
- **Balance:** Drops ≈ 60% valor compra directa. Simular 100k aperturas con DevKit.
- **Anti-cheat:** Resolución exclusivamente servidor.
- **Spam:** qty > 99 → convertir a monedas.
- **Monetización:** Límite 5 compras/día.

## Preguntas abiertas
1. ¿Cofres caducan? (Propuesta: SÍ, 30 días → monedas.)
2. ¿Deshacer drop? (Propuesta: NO, irreversible.)
3. ¿Cofres compartibles? (Propuesta: NO en v1.)
4. ¿Diamante como tier? (Propuesta: Sí, por temporada/raid.)