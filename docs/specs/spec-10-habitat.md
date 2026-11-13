# Spec: Hábitat / Base Personalizable ("El Territorio")

## ID
10 — Hábitat / Base Personalizable (NUEVAS_FUNCIONALIDADES §10)

## Resumen
Espacio persistente y decorable donde vive la mascota. El jugador coloca muebles que otorgan
**bonificaciones pasivas** a las vitalidades y, opcionalmente, al combate. Las habitaciones se
desbloquean por etapa evolutiva (Sala → Jardín → Santuario → Cita final). Es el bucle emocional
central del "hogar": un objetivo a largo plazo que no depende de ganar peleas.

## Contexto
Hoy el pet vive en una escena 2D estática con 5 vitalidades que decaen por el *lazy tick*
(`GAME_DESIGN §2.2`, `balance.json → vitals.decayPerHour`). No hay un lugar al que "regresar" entre
peleas ni un objetivo de coleccionismo/decro. El Hábitat introduce un bucle diario de "ir a casa,
cuidar, decorar" que refuerza la retención y crea un *sunk-cost* emocional. Conecta con:
- **Vitalidades** (mods al decaimiento y a la recuperación de energía en sueño).
- **Combate** (buffs opcionales por muebles temáticos).
- **Progresión/evolución** (desbloqueo de salas por `Pet.stage`).
- **Economía** (compra de muebles con monedas/gemas, sin tocar el pool de rarezas/pity).
- **Logros/colección** (muebles estéticos como meta de colección).

## Objetivos
- Dar al jugador un espacio persistente, decorable y con identidad ("mi casa").
- Crear bonificaciones pasivas equilibradas que mejoren vitalidades/combate sin romper `balance.json`.
- Generar un objetivo de progreso de coleccionismo desvinculado de la arena.
- Mantener el render determinista en todas las plataformas (grid + seed, coherente con `visualSeed`).

## User Stories
- Como jugador, quiero decorar la habitación de mi pet, para sentir que tiene un hogar con mi estilo.
- Como jugador, quiero que mi fuente de agua reduzca el decaimiento de higiene, para tener que limpiar menos.
- Como jugador, quiero desbloquear el Jardín al evolucionar a Joven, para ver que mi progreso tiene recompensa.
- Como jugador coleccionista, quiero completar el catálogo de muebles, para sentir logro puro sin pelear.
- Como jugador, quiero ver el efecto de cada mueble antes de comprarlo, para tomar decisiones de gasto.

## Criterios de aceptación
- [ ] AC1: El usuario puede ver el estado de su hábitat (salas desbloqueadas, muebles colocados, buffs activos).
- [ ] AC2: Puede comprar un mueble (monedas o gemas) y colocarlo en una celda libre de una sala desbloqueada.
- [ ] AC3: Muebles con buff alteran correctamente el cálculo del lazy tick y/o el `Fighter` de combate.
- [ ] AC4: Solo se colocan muebles en salas cuya etapa evolutiva sea ≤ `Pet.stage` del pet propietario.
- [ ] AC5: Mover/quitar un mueble actualiza los buffs al instante y persiste el layout.
- [ ] AC6: El render de la escena es determinista dado `habitatSeed` + layout.
- [ ] AC7: Un usuario no puede accionar muebles de otro usuario (guarda por `Pet.userId`).
- [ ] AC8: Los buffs pasivos se reflejan en `/pets/:id/vitals` y en el perfil de combate.

## Diseño técnico
### Backend
- Nuevo módulo NestJS `backend/src/modules/habitat/` con `habitat.module.ts`, `habitat.controller.ts`,
  `habitat.service.ts`, `dto/`.
- `HabitatService`:
  - `getHabitat(petId)` → salas, layout, buffs agregados.
  - `buyFurniture(userId, furnitureId)` → valida precio, descuenta `User.coins/gems`, crea `Furniture`.
  - `place(userId, roomId, furnitureId, cell)` → valida sala desbloqueada + celda libre; actualiza `HabitatCell`.
  - `move / remove(userId, cell)` → actualiza layout.
  - `computePassiveBuffs(pet)` → agrega buffs de muebles colocados; **lo consumen** el lazy tick de
    vitalidades y el armado del `Fighter` (ver *Lógica de juego*).
  - `unlockRoom(stage)` → idempotente, crea salas al pasar de etapa (llamado desde el flujo de evolución).
- El decaimiento por hora se calcula hoy en el servicio de vitalidades/pets; aquí se inyectan los
  modificadores vía un `PassiveBuffContext` (se multiplica el `decayPerHour` resultante, no se duplica
  la fórmula del tick).

### Frontend
- Escena 2D por sala: grid lógico (p. ej. 12×8 celdas) renderizado con sprites (`spriteKey`) del mueble.
- Drag-and-drop (o tap-to-select + tap-to-place en móvil) sobre celdas; validación de ocupación en
  cliente con confirmación de servidor.
- Panel de "Muebles" con catálogo (`habitat.json`), precio, tipo de buff y vista previa del efecto.
- Toast de `habitat:updated` (WebSocket) al colocar/mover desde otro dispositivo para re-sincronizar.
- Indicador de sala bloqueada con requisito ("Evoluciona a Adulto para abrir el Santuario").

### Datos de juego
- Nuevo `shared/game-data/habitat.json` (catálogo estático, servido vía módulo `game-data`):
```json
{
  "rooms": [
    { "id": "sala",      "stage": "baby",     "name": "Sala",        "grid": { "w": 12, "h": 8 } },
    { "id": "jardin",    "stage": "juvenile", "name": "Jardín",      "grid": { "w": 12, "h": 8 } },
    { "id": "santuario", "stage": "adult",    "name": "Santuario",   "grid": { "w": 14, "h": 8 } },
    { "id": "citafinal", "stage": "final",    "name": "Cita Final",  "grid": { "w": 14, "h": 10 } }
  ],
  "furniture": [
    { "id": "camita_mullida",   "room": "sala",   "spriteKey": "camita",   "priceCoins": 400, "priceGems": 0,
      "kind": "functional", "buff": { "type": "energySleepRegen", "value": 0.10 } },
    { "id": "fuente_agua",      "room": "jardin", "spriteKey": "fuente",   "priceCoins": 600, "priceGems": 0,
      "kind": "functional", "buff": { "type": "hygieneDecay", "value": 0.80 } },
    { "id": "comedor_tematico", "room": "jardin", "spriteKey": "comedor",  "priceCoins": 900, "priceGems": 1,
      "kind": "functional", "buff": { "type": "happinessDecayAwake", "value": 0.90 } },
    { "id": "poster_01",        "room": "sala",   "spriteKey": "poster_01","priceCoins": 150, "priceGems": 0,
      "kind": "decor", "buff": null }
  ]
}
```
## Interfaz de API
Base: guardado por `JwtAuthGuard` + `@CurrentUser()`; rutas bajo `/habitat`.

| Método | Ruta | Request | Response | Códigos |
|---|---|---|---|---|
| GET | `/habitat/:petId` | — | `{ rooms[], layout[], activeBuffs[], collection }` | 200, 404 |
| GET | `/habitat/catalog` | — | catálogo de `habitat.json` (salas + muebles) | 200 |
| POST | `/habitat/:petId/furniture/buy` | `{ furnitureId }` | `{ furniture, remainingCoins, remainingGems }` | 200, 400 (sin saldo), 404 |
| POST | `/habitat/:petId/furniture/place` | `{ furnitureId, roomId, cell: {x,y} }` | `{ layout, activeBuffs }` | 200, 400 (ocupado/sala bloqueada), 404 |
| POST | `/habitat/:petId/furniture/move` | `{ furnitureId, cell }` | `{ layout, activeBuffs }` | 200, 400, 404 |
| POST | `/habitat/:petId/furniture/remove` | `{ furnitureId, roomId }` | `{ layout, activeBuffs }` | 200, 404 |
| GET | `/habitat/:petId/buffs` | — | buffs pasivos agregados por mueble | 200, 404 |

Ejemplo `GET /habitat/:petId`:
```json
{ "rooms": ["sala","jardin"], "lockedRooms": ["santuario","citafinal"],
  "layout": [ { "furnitureId": "fuente_agua", "roomId": "jardin", "cell": { "x": 3, "y": 2 } } ],
  "activeBuffs": [ { "type": "hygieneDecay", "value": 0.80, "source": "fuente_agua" } ] }
```

## Modelo de datos
Nuevos modelos Prisma (añadidos a `backend/prisma/schema.prisma`):

```prisma
model Furniture {
  id            String   @id @default(uuid())
  petId         String
  pet           Pet      @relation(fields: [petId], references: [id], onDelete: Cascade)
  furnitureKey  String   // referencia a habitat.json (id del catálogo)
  acquiredAt    DateTime @default(now())
  // una pet puede tener varios ejemplares del mismo mueble (colección)
  @@index([petId])
}

model HabitatCell {
  id           String   @id @default(uuid())
  petId        String
  pet          Pet      @relation(fields: [petId], references: [id], onDelete: Cascade)
  roomId       String
  x            Int
  y            Int
  furnitureId  String?  // null si la celda está libre
  furniture    Furniture? @relation(fields: [furnitureId], references: [id])
  updatedAt    DateTime @updatedAt
  @@unique([petId, roomId, x, y])
  @@index([petId])
}

model HabitatRoom {
  id         String   @id @default(uuid())
  petId      String
  pet        Pet      @relation(fields: [petId], references: [id], onDelete: Cascade)
  roomId     String
  unlockedAt DateTime
  habitatSeed Int      @default(1)
  @@unique([petId, roomId])
}
```
Relación agregada en `Pet`: `furniture Furniture[]`, `habitatCells HabitatCell[]`, `habitatRooms HabitatRoom[]`.
## Lógica de juego
### Buffs pasivos (aplicados al lazy tick)
El lazy tick actual (`GAME_DESIGN §2.2`) calcula el decaimiento con `vitals.decayPerHour`. El hábitat
aplica un multiplicador por celda ocupada (agregado, no reemplaza):
- `hygieneDecay` (Fuente): `hygieneDecay_eff = 2.5 × value` → 2.5 × 0.80 = **2.0/h**.
- `happinessDecayAwake` (Comedor): `happinessDecay_eff = 4 × value` → 4 × 0.90 = **3.6/h** (solo vigilia).
- `energySleepRegen` (Camita): `energyRegen_eff = 20 × (1 + value)` → 20 × 1.10 = **22/h** en sueño.

Reglas de agregación: los buffs del mismo tipo **se multiplican de forma compuesta con un techo**,
p. ej. higiene = `2.5 × Π(value_i)` con piso `≥ 1.0/h` (no puede dejar de decaer). Se aplica solo a la
sala "activa" del pet (la escena actual), no a todas.

### Buffs de combate (opcionales, por muebles temáticos)
Algunos muebles de sala de combate otorgan un modificador al `Fighter` (multiplicador sobre `mood`,
coherente con `engine.ts → effStat`): p. ej. `Estatua del Guerrero` → `mood ×1.03` (+3% ATK/DEF/ESP/VEL).
Límite: máx. 2 muebles de combate por pet, techo combinado `mood ≤ 1.10`. Se refleja en
`/pets/:id/combat` y se pasa al `runCombat` vía el campo `Fighter.mood`.

### Desbloqueo de salas
Mapa etapa→sala: `baby→sala`, `juvenile→jardin`, `adult→santuario`, `final→citafinal`. Al cambiar
`Pet.stage` (flujo de evolución `balance.json → evolution`), `HabitatService.unlockRoom` crea la sala
idempotente y emite `habitat:roomUnlocked`.

## Eventos y sincronización
- WebSocket (namespace `realtime`, vía `RealtimeGateway.emitToUser`):
  - `habitat:updated` → `{ petId, layout, activeBuffs }` (tras place/move/remove/buy).
  - `habitat:roomUnlocked` → `{ petId, roomId }` (al evolucionar).
- No hay jobs recurrentes: el buff se recalcula bajo demanda (lazy), sin colas.
- Multi-dispositivo: cualquier cambio emite `habitat:updated` para re-sincronizar la escena.

## Dependencias
- **Módulo de vitalidades/pets** (inyección de `PassiveBuffContext` al lazy tick).
- **Motor de combate** (`Fighter.mood`, `runCombat`).
- **Flujo de evolución** (desbloqueo de salas).
- **Módulo `game-data`** (servir `habitat.json`).
- **Economía** (`User.coins/gems`).

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Modelos Prisma + migración + seed de `habitat.json` | 2 días |
| 2 | `HabitatService` (get/buy/place/move/remove/buffs) + endpoints | 3 días |
| 3 | Integración de buffs en lazy tick y `Fighter` | 2 días |
| 4 | Frontend: escena, grid, drag-and-drop, panel catálogo | 4 días |
| 5 | WebSocket `habitat:*` + re-sincronización multi-dispositivo | 1 día |
| 6 | Tests + simulación de balance | 2 días |

## Balance
- **Inflación económica:** los muebles drenan monedas/gemas (sumidero), mitigando la acumulación de
  `coins` por peleas/minijuegos. Precios: funcional 400–900 monedas, decor 100–250; 1 gemas para los
  premium de temporada. Sin impacto en `rarity`/`pity`/`shinyProbability`.
- **Buff caps:** higiene mínimo 1.0/h, felicidad mínimo 2.0/h, mood de combate ≤1.10 → un pet con
  todos los muebles gana ≈ +5–8% de vitalidades y +3% de combate; se considera "conveniente", no
  decisivo, frente a la ventaja de elemento (×1.5) o rareza (×1.75).
- **Parche de balance:** agregar `"habitat"` a `balance.json` con los caps y multiplicadores para que
  `petai-devkit simulate` los incluya.

## Tests
- **Unit:** agregación de buffs (multiplicación compuesta + caps); desbloqueo de sala por etapa;
  validación de celda ocupada/sala bloqueada; precio negativo o sin saldo.
- **Integración:** flujo buy→place→buffs activo en `vitals` y `combat`; multi-dispositivo (2 sockets
  reciben `habitat:updated`).
- **E2E:** decorar una sala, evolucionar a Joven, confirmar Jardín desbloqueado y render correcto.
- **Balance simulation:** comparar decaimiento con/sin muebles a 24/48/72 h; confirmar que no acelera
  la salud por debajo de `sicknessHealthThreshold` de forma abusiva.
- **Edge:** 2 muebles del mismo tipo (cap aplicado); quitar último mueble (buff vuelve a base);
  pet de otro usuario intenta accionar (403/404).

## Riesgos y notas
- **Gasto vs. progresión:** si los muebles son demasiado baratos, se vuelven irrelevantes; si caros,
  frustrantes. Ajustar por `habitat` en `balance.json` tras simulación.
- **Render en móvil:** el grid de 14×10 puede ser denso; usar zoom/scroll y celdas de 48dp.
- **Persistencia:** muchas celdas por pet (≈100) → índice `[petId, roomId, x, y]` cubre consultas.
- **Consistencia con iOS (#27):** el render debe ser vectorial (SVG/Skia-ready) y guiado por `habitatSeed`.

## Preguntas abiertas
- ¿Se permite vender muebles (reventa a monedas) para dar salida al inventario, o son permanentes?
- ¿Los muebles de combate otorgan buff a **todo** el combate o solo en el hábitat (modo "entrenado")?
- ¿Limite máximo de muebles por sala (tope de celdas ocupadas) para evitar "pantalla llena"?
- ¿Existe un "valor estético" del hábitat que otorgue logros/certificados visuales (coordinado con Logros/Constelación #8)?

