# Spec: Minijuego — Cocina / Menú del día

## ID
15 — Minijuego: Cocina / Menú del día (NUEVAS_FUNCIONALIDADES §15)

## Resumen
Minijuego de cocina (Overcooked simplificado): el pet pide 3–4 ingredientes y el jugador tiene 60 s
para cocinarlos (clic en el ingrediente correcto en orden, evitando la "olla ardiente"). El plato
preparado otorga un **buff de combate** (p. ej. ATK +10 por 1 día). Hay recetas nuevas por nivel y
un **"Menú del día"** (receta especial que cambia cada día) que da un motivo diario para volver.

## Contexto
Hoy existen 3 minijuegos (`balance.json → minigames.games`: catch_food, memory_match, reflex) con
recompensas de coins/XP/felicidad, pero ninguno da **buffs de combate**. La cocina conecta el bucle de
cuidamiento (comida, `foods.json`) con la Arena: "entrenar/comer antes de pelear". Conecta con:
- **Motor de combate** (los buffs se aplican al `Fighter` de la siguiente pelea).
- **Minigames** (nuevo `gameId="cooking"` en el módulo `minigames`).
- **Comida** (`foods.json`, `Pet.favoriteFood`).
- **Retención diaria** ("Menú del día" cambia cada día, seed determinista por fecha).

## Objetivos
- Añadir un minijuego que otorgue buffs de combate temporales (conecta comida → combate).
- Crear un "Menú del día" con receta especial rotativa que motive el login diario.
- Reutilizar la infraestructura existente de minijuegos (sesión, seed, cooldown, límites diarios).
- Mantener el orden de ingredientes y la "olla ardiente" deterministas por `seed` (reproducible).

## User Stories
- Como jugador, quiero cocinar el pedido de mi pet, para ganar un buff de ATK antes de pelear.
- Como jugador, quiero ver qué receta es el "Menú del día", para saber qué cocinar hoy.
- Como jugador, quiero desbloquear recetas nuevas al subir de nivel, para ampliar mi menú.
- Como jugador, quiero tener un minijuego rápido (60 s) que no sea aburrido, para variar entre peleas.
- Como jugador, quiero que el buff se aplique a mis próximas peleas, para que valga la pena.

## Criterios de aceptación
- [ ] AC1: Iniciar "cooking" crea una `MinigameSession` con `gameId="cooking"` y un `seed` (reproducible).
- [ ] AC2: El pet pide 3–4 ingredientes (según dificultad/nivel); el jugador debe clicarlos en el orden
      correcto antes de 60 s, evitando la "olla ardiente" (penaliza tiempo).
- [ ] AC3: La puntuación (ingredientes correctos/tiempo) determina el buff: 100 % = buff completo;
      parcial = buff reducido; error = sin buff.
- [ ] AC4: Al completar, se crea un `CombatBuff` (ATK/DEF/ESP/VEL +N) con `expiresAt = now + 24h`.
- [ ] AC5: El buff se aplica al `Fighter` en los combates siguientes hasta `expiresAt`.
- [ ] AC6: El "Menú del día" es una receta especial determinista por fecha (misma receta para todos el
      mismo día) y otorga un buff extra o mejor.
- [ ] AC7: Las recetas se desbloquean por nivel de pet (`unlockLevel` en `recipes.json`).
- [ ] AC8: Se respetan los límites de `minigames` (energía 10, cooldown 15 s, 20 sesiones recompensadas/día).

## Diseño técnico
### Backend
- Extensión del módulo `backend/src/modules/minigames/`:
  - Nuevo `gameId = "cooking"` en el catálogo `balance.json → minigames.games.cooking`.
  - `minigames.service.ts`: `start` ya existe; añadir la carga de la receta del día según `seed` y
    `recipes.json`. `finish` valida la puntuación y crea el `CombatBuff`.
  - `cooking.ts` (función pura): `buildOrder(recipe, seed)` → orden de ingredientes + posiciones de la
    "olla ardiente" (reproducible con `createRng(seed)`).
- `CombatBuff` (nuevo, compartido con Entrenamiento Elemental #16): modelo con efecto y caducidad.
- Integración en combate: `battles.service.ts`, al armar el `Fighter`, suma los `CombatBuff` activos
  del pet a las stats (ver *Lógica de juego*).

### Frontend
- Pantalla de cocina: pedido del pet (lista de ingredientes), temporizador de 60 s, área de "olla" con
  botones de ingredientes + "olla ardiente" animada.
- Feedback inmediato (acierto/error), barra de progreso de ingredientes.
- Pantalla de resultado: plato cocinado, buff obtenido (con duración), CTA "a pelear".
- Panel "Recetas": recetas desbloqueadas/bloqueadas (por nivel) + "Menú del día" destacado.
- Reutiliza el estado y el modal de minijuegos existente (sesión, seed, cooldown).

### Datos de juego
- `shared/game-data/recipes.json`:
```json
{
  "ingredients": ["spicy_berry","sweet_coral","sun_seed","crystal_fruit","moon_dew","ember_leaf"],
  "cooking": { "durationSeconds": 60, "orderLength": { "min": 3, "max": 4 },
    "hotPotChance": 0.25, "hotPenaltySeconds": 6 },
  "recipes": [
    { "id": "ember_roast", "name": "Asado de ascuas", "unlockLevel": 1, "ingredients": ["spicy_berry","ember_leaf"],
      "buff": { "atk": 10 }, "durationHours": 24 },
    { "id": "tidal_soup", "name": "Sopa de marea", "unlockLevel": 15, "ingredients": ["sweet_coral","moon_dew"],
      "buff": { "def": 10 }, "durationHours": 24 },
    { "id": "aurora_dessert", "name": "Postre aurora", "unlockLevel": 30,
      "ingredients": ["crystal_fruit","moon_dew","sun_seed"],
      "buff": { "esp": 8, "vel": 5 }, "durationHours": 24 },
    { "id": "menu_of_day", "name": "Menú del día", "unlockLevel": 1,
      "buff": { "atk": 6, "def": 6, "esp": 6, "vel": 6 }, "durationHours": 24, "special": true }
  ]
}
```
## Interfaz de API
Base: reutiliza `JwtAuthGuard` + `@CurrentUser()` del módulo `minigames`.

| Método | Ruta | Request | Response | Códigos |
|---|---|---|---|---|
| GET | `/minigames/cooking/recipe-of-day` | — | `{ recipeId, name, buff, seed }` (receta del día) | 200 |
| GET | `/minigames/cooking/recipes` | — | recetas desbloqueadas/bloqueadas del pet | 200 |
| POST | `/minigames/cooking/start` | `{ petId, recipeId? }` | `{ sessionId, seed, order[], durationSeconds }` | 200, 400 (nivel/energía/límite) |
| POST | `/minigames/sessions/:id/finish` | `{ score, correctOrder, timeUsed }` | `{ result, buff, coins, xp, happiness }` | 200, 400 (ya finalizada) |
| GET | `/pets/:id/buffs` | — | buffs de combate activos (cocina + entrenamiento) | 200, 404 |

Nota: `start`/`finish` reutilizan el contrato de `MinigameSession` existente; solo se añade `recipeId`
y el cálculo de buff en `finish`.

## Modelo de datos
```prisma
// Compartido con Entrenamiento Elemental #16
model CombatBuff {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  petId     String
  pet       Pet      @relation(fields: [petId], references: [id], onDelete: Cascade)
  source    String   // cooking | elemental_training
  sourceId  String   // sessionId
  kind      String   // atk | def | esp | vel | mood
  value     Int      // p. ej. 10 (puntos) o multiplicador codificado
  expiresAt DateTime
  createdAt DateTime @default(now())
  @@index([userId, expiresAt])
  @@index([petId, expiresAt])
}
```
Agregado a `User`: `combatBuffs CombatBuff[]`. A `Pet`: `combatBuffs CombatBuff[]`.
La receta usada se referencia por `MinigameSession` (campo `gameId="cooking"` + `score`); el `recipeId`
se guarda en el log del minijuego o como extensión del `MinigameSession` (JSON `meta`).
## Lógica de juego
### Generación del minijuego (determinista)
`start` genera `seed = crypto` (aleatorio de sesión, como los minijuegos actuales). `cooking.ts`:
- `buildOrder(recipe, seed)`: con `createRng(seed)` genera el **orden** de 3–4 ingredientes (permutación
  de los ingredientes de la receta) y las posiciones de la "olla ardiente" (`hotPotChance = 0.25` por
  celda). El cliente renderiza el área con esos botones; el jugador debe pulsar los ingredientes en el
  orden mostrado.
- "Menú del día": `seedOfDay = hashSeed("menu:" + YYYYMMDD)` → misma receta/orden para todos el mismo
  día. Receta `menu_of_day` (buff balanceado atk/def/esp/vel +6).

### Puntuación y buff
El cliente envía `{ score, correctOrder, timeUsed }`; el servidor **re-valida** contra el `seed`:
- `correctPct = aciertos / length(order)`; penalización por cada "olla ardiente" tocada
  (`hotPenaltySeconds`).
- `result = correctPct >= 0.99 ? "perfect" : correctPct >= 0.6 ? "good" : correctPct >= 0.3 ? "fail" : "bad"`.
- Buff otorgado: `perfect` → buff completo de la receta; `good` → buff × 0.5 (redondeado); `fail/bad` →
  sin buff (solo coins/XP base reducidos).
- Se crea `CombatBuff` con `expiresAt = now + durationHours`.
- **Recompensas base:** coins/XP por la configuración `balance.json → minigames.games.cooking`
  (p. ej. `coinsPerPoint`, `maxCoins`, `xpPerPoint`), más el buff.

### Aplicación del buff en combate
Al armar el `Fighter` en `battles.service.ts` (y en raid/torneo), se consultan los `CombatBuff`
activos del pet (`expiresAt > now` y mismo `petId`) y se suman a las stats:
`statFinal = statBase + Σ buff.value (por kind)`. Los buffs de cocina son **aditivos** (puntos); el
entrenamiento elemental (#16) usa **multiplicadores** (ver esa spec). Se aplica un **techo**: el total
de buffs aditivos por pet no puede superar el +15 % de la stat base (para no romper el balance de
rareza/elemento). Se reflejan en `GET /pets/:id/buffs` y en `/pets/:id/combat`.

## Eventos y sincronización
- WebSocket (`realtime`): `minigame:finished` → `{ sessionId, result, buff }` (reutiliza el evento de
  minijuegos existente); `buff:applied` → `{ buff }`.
- Sin jobs recurrentes; los buffs caducan por `expiresAt` (se filtran al armar el `Fighter`). Un job
  opcional `buffs.cleanup` elimina `CombatBuff` caducados periódicamente.
- `SeasonsService.awardTickets(userId, "minigame", 1)` si hay temporada (#11).

## Dependencias
- **Módulo `minigames`** (sesión, seed, cooldown, límites diarios, `balance.json → minigames`).
- **`foods.json`** (ingredientes / comida favorita del pet).
- **Motor de combate** (aplicación del buff al `Fighter`).
- **Temporadas #11** (tickets de minijuego).
## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | `recipes.json` + `CombatBuff` (modelo + migración) | 1 día |
| 2 | `cooking.ts` (buildOrder determinista) + `start`/`finish` en minigames | 2 días |
| 3 | Integración del buff en `Fighter` (battles/raid/torneo) + techo | 2 días |
| 4 | Frontend: pantalla cocina, temporizador, "olla ardiente", recetas, menú del día | 3 días |
| 5 | WebSocket + `GET /pets/:id/buffs` + simulación de balance | 1 día |

## Balance
- **Buff cap (+15 %):** un pet no puede superar +15 % de una stat base por buffs aditivos (cocina).
  Un ATK base de 55 con buff perfecto +10 = 65 → +18 %, **se recorta a +15 %** (≈ 63). Esto evita que
  el minijuego iguale la diferencia de rareza (×1.75) o elemento (×1.5).
- **Frecuencia:** 24 h de duración + 20 sesiones/día → el jugador "prepara" su buff diario 1 vez;
  el resto de sesiones dan coins/XP. El Menú del día (buff balanceado) es la recompensa de login.
- **Sin impacto en `rarity`/`pity`:** la cocina no emite pets ni toca el pool de eclosión; solo buffs
  temporales (se disipen a 24 h).
- **Recompensas base:** `cooking` en `balance.json → minigames.games` con `maxCoins ≈ 40`,
  `maxXp ≈ 60`, `happiness 15` (coherente con los otros minijuegos).

## Tests
- **Unit:** `buildOrder` con seed fija (orden + ollas reproducible); "Menú del día" (mismo seed por
  fecha); puntuación (perfect/good/fail/bad); buff × 0.5 en "good"; techo +15 % aplicado.
- **Integración:** start crea sesión; finish valida contra seed (score inflado → recorte); buff creado
  y aplicado al `Fighter`; buff caducado (no se aplica); 20 sesiones/día (límite).
- **E2E:** iniciar cocina → cocinar el pedido → recibir buff → pelear con el buff activo → ver que
  desaparece a 24 h.
- **Balance simulation:** simular 1000 sesiones → distribución de perfect/good/fail; verificar que el
  buff medio no supera +10 % (diseño); comparar win-rate con/sin buff.
- **Edge:** tiempo agotado (0 correctos → "bad"); "olla ardiente" en todas las celdas (imposible,
  límite por `hotPotChance`); buff de 2 recetas (se suman, con techo); pet sin energía (400).

## Riesgos y notas
- **Re-validación del score:** el cliente puede enviar un score falsificado; el servidor **recalcula**
  el resultado con el `seed` (no confía en el score del cliente). Riesgo mitigado.
- **Buff stacking:** sin el techo, 20 sesiones/día → buffs infinitos; mitigado con cap +15 % y
  duración 24 h (el último buff reemplaza/suma con cap).
- **Accesibilidad:** el minijuego de 60 s con "olla ardiente" puede ser exigente en móvil; usar
  botones grandes y feedback táctil claro.
- **Consistencia iOS (#27):** animaciones de cocina vectoriales (Skia-ready).

## Preguntas abiertas
- ¿El buff de cocina es aditivo (puntos) o multiplicador? (proponer aditivo con techo +15 %)
- ¿Se puede "guardar" un buff para usarlo en un momento específico, o se aplica inmediatamente?
- ¿El "Menú del día" otorga además un logro/coleccionable (coordina con #8)?
- ¿Se permite cocinar para un amigo (co-op / "Group Feeding" #29)?