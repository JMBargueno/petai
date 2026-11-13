# Spec: Minijuego — Entrenamiento Elemental

## ID
16 — Minijuego: Entrenamiento Elemental (NUEVAS_FUNCIONALIDADES §16)

## Resumen
Un "dungeon" de 5 pisos donde cada piso tiene un **enemigo elemental**. El jugador debe elegir la
**habilidad elemental correcta** (p. ej. Fuego contra Planta) usando la tabla de afinidades del motor
de combate. Si acierta, sube de piso; si falla, pierde un "heart". Al completar los 5 pisos, el pet
recibe un buff **multiplicador** (ATK/ESP +5 % por 24 h). Entrenar contra el elemento correcto al
rival siguiente da un bonus extra.

## Contexto
Hoy los minijuegos (`balance.json → minigames.games`) no conectan con el Arena ni usan la tabla de
afinidades elementales. Este minijuego introduce un bucle de "entrenar antes de pelear" que reutiliza
el motor de combate determinista y la tabla de afinidades (`GAME_DESIGN §4.2`, `engine.ts →
elementMultiplier`). Conecta con:
- **Motor de combate** (`elementMultiplier`, `Fighter`, seed determinista).
- **Elementos/afinidades** (`balance.json → combats.elementAdvantage/Disadvantage`).
- **Arena** (el buff da ventaja en la siguiente pelea).
- **`CombatBuff`** (compartido con Cocina #15; aquí tipo multiplicador).

## Objetivos
- Añadir un minijuego que enseñe/refuerce la tabla de afinidades elementales.
- Dar un buff multiplicador (ATK/ESP +5 %) como recompensa, conectando minijuego → Arena.
- Reutilizar el motor de combate (cada piso es un combate determinista contra un enemigo elemental).
- Premiar la estrategia ("entrenar contra el elemento correcto del rival siguiente" da bonus).

## User Stories
- Como jugador, quiero entrenar en un dungeon elemental, para mejorar a mi pet antes de pelear.
- Como jugador, quiero elegir la habilidad elemental correcta, para subir de piso y ganar el buff.
- Como jugador, quiero ver qué elemento tiene el rival, para usar la afinidad y acertar.
- Como jugador, quiero un buff de +5 % ATK/ESP por 24 h, para tener ventaja en el Arena.
- Como jugador, quiero un bonus si adivino el elemento del rival siguiente, para jugar con estrategia.

## Criterios de aceptación
- [ ] AC1: Iniciar "elemental_training" crea una `MinigameSession` con `gameId="elemental_training"`
      y un `seed` (reproducible).
- [ ] AC2: El dungeon tiene 5 pisos; cada piso genera un enemigo elemental determinista (elemento por
      `seed`). El jugador tiene 3 "hearts".
- [ ] AC3: En cada piso, el jugador elige una de sus habilidades elementales; si la afinidad es
      ventajosa contra el elemento del rival (×1.5), sube de piso; si es desventajosa (×0.67) o neutra
      incorrecta, pierde un heart.
- [ ] AC4: Al completar los 5 pisos con ≥1 heart, el pet recibe `CombatBuff` (ATK/ESP +5 %, 24 h).
- [ ] AC5: BONUS: si el jugador adivina correctamente el elemento del rival del piso siguiente
      ("predecir"), gana un +2 % extra al buff.
- [ ] AC6: El resultado de cada piso es un combate determinista (`runCombat`) entre el pet y el
      enemigo elemental del piso (reutiliza el motor).
- [ ] AC7: Si el pet pierde los 3 hearts, el dungeon falla (sin buff, solo XP parcial).
- [ ] AC8: Se respetan los límites de `minigames` (energía 10, cooldown, 20 sesiones/día).

## Diseño técnico
### Backend
- Extensión del módulo `minigames`:
  - Nuevo `gameId = "elemental_training"` en `balance.json → minigames.games`.
  - `elementalTraining.ts` (función pura): `buildDungeon(seed)` → array de 5 pisos, cada uno con
    `enemyElement` (elegido por `createRng(seed)`), `enemyStats` (del elemento, nivel del pet), y las
    habilidades disponibles del pet.
  - `minigames.service.ts`: `start` genera el dungeon (seed); `finish` valida las elecciones del
    jugador piso a piso contra el `seed` y ejecuta el combate determinista de cada piso; calcula el
    buff y el bonus.
- `CombatBuff` (ya definido en #15): aquí `kind = "atk|esp"`, `value` codifica el multiplicador
  (p. ej. 5 = +5 %).

### Frontend
- Pantalla de dungeon: vista vertical de 5 pisos (mapa), "hearts" (3), elemento del rival actual.
- En cada piso: selector de habilidades elementales del pet (solo elementales); el jugador elige 1;
  animación del combate (reutiliza el viewer de `Battle` en mini) y resultado (subir/heart).
- Indicador de "predecir elemento siguiente" (opcional, da +2 %).
- Pantalla de resultado: pisos completados, buff obtenido (+5 % o más), CTA "a pelear".
- Reutiliza el estado de minijuegos (sesión, seed, cooldown).

### Datos de juego
- `shared/game-data/elementalTraining.json`:
```json
{
  "floors": 5,
  "hearts": 3,
  "dungeon": {
    "enemyLevel": "pet_level",
    "enemyStatScale": 0.9,
    "correctAffinityMultiplier": 1.5,
    "wrongAffinityMultiplier": 0.67
  },
  "reward": {
    "buff": { "atkPct": 5, "espPct": 5 },
    "durationHours": 24,
    "predictBonusPct": 2
  },
  "energyCost": 10
}
```
El `elemental_training` se añade a `balance.json → minigames.games` (coins/XP base por piso).
## Interfaz de API
Base: reutiliza `JwtAuthGuard` + `@CurrentUser()` del módulo `minigames`.

| Método | Ruta | Request | Response | Códigos |
|---|---|---|---|---|
| POST | `/minigames/elemental_training/start` | `{ petId }` | `{ sessionId, seed, dungeon: [ { floor, enemyElement, enemyStats, availableSkills } ] }` | 200, 400 (nivel/energía/límite) |
| POST | `/minigames/sessions/:id/finish` | `{ choices: [{ floor, skillId, predictNext }], result }` | `{ floorsCleared, buff, bonus, coins, xp }` | 200, 400 (ya finalizada) |
| GET | `/pets/:id/buffs` | — | buffs activos (cocina + entrenamiento) | 200, 404 |

Nota: `finish` envía las **elecciones** del jugador (skill por piso + predicción); el servidor
**re-valida** cada piso contra el `seed` y ejecuta el combate determinista (no confía en el resultado
que envía el cliente).

## Modelo de datos
- Reutiliza `MinigameSession` (`gameId="elemental_training"`, `seed`, `score`, `meta`).
- Reutiliza `CombatBuff` (definido en #15): `source="elemental_training"`, `kind="atk|esp"`,
  `value=5` (o 7 con bonus), `expiresAt = now + 24h`.
- **No se añade un nuevo modelo Prisma** para este minijuego: el dungeon y las elecciones se guardan
  en `MinigameSession.meta` (JSON: `dungeon`, `choices`, `floorsCleared`). El buff resultante va en
  `CombatBuff`.

## Lógica de juego
### Generación del dungeon (determinista)
`start` genera `seed` (aleatorio de sesión). `elementalTraining.ts`:
- `buildDungeon(seed)`: con `createRng(seed)`, para cada piso `i` (1..5) elige `enemyElement` del pool
  de elementos (fire, water, plant, electric, shadow, light). El enemigo usa stats de ese elemento
  (`species.json` por elemento, `enemyStatScale = 0.9`, nivel del pet).
- `availableSkills`: las habilidades elementales que el pet tiene equipadas (`skills.json`, elementales).
  Si el pet no tiene una elemental ventajosa disponible, el piso es "dificil" (puede fallar).

### Resolución por piso (combate determinista)
Para cada piso, el servidor ejecuta `runCombat(petFighter, enemyFighter, seed + floor)`:
- El **jugador** elige una habilidad elemental (`skillId`); si la afinidad es ventajosa
  (`elementMultiplier(skillElement, enemyElement) = 1.5`), el pet gana el piso (sube).
- Si es desventajosa (0.67) o neutra no-correcta, el pet pierde un heart.
- El resultado real se valida con el combate determinista (el jugador debe elegir la skill ventajosa
  para tener ventaja; el motor aplica la afinidad). El "acertar" = elegir la skill con afinidad 1.5.
- `hearts` inicia en 3; se resta 1 por piso fallado. Si llega a 0, dungeon fallado.

### Bonus de predicción
Si el jugador marca `predictNext: true` y elige correctamente el elemento del piso siguiente
(`enemyElement` del piso `i+1`), gana `predictBonusPct = 2` al buff. (Mecánica opcional de estrategia.)

### Recompensa
- `floorsCleared >= 5` y `hearts >= 1` → `CombatBuff` `atk+esp`, `value = 5` (o 7 con bonus),
  `expiresAt = now + 24h`.
- `floorsCleared < 5` → sin buff; XP/coins parciales por pisos completados
  (`balance.json → minigames.games.elemental_training`).

## Eventos y sincronización
- WebSocket (`realtime`): `minigame:finished` → `{ sessionId, floorsCleared, buff }`; `buff:applied`.
- Sin jobs recurrentes; buffs caducan por `expiresAt` (se filtran al armar el `Fighter`).
- `SeasonsService.awardTickets(userId, "minigame", 1)` si hay temporada (#11).

## Dependencias
- **Módulo `minigames`** (sesión, seed, cooldown, límites diarios).
- **Motor de combate** (`runCombat`, `elementMultiplier`) + **`skills.json`** (habilidades elementales).
- **`species.json`** (enemigos por elemento).
- **`CombatBuff`** (compartido con #15).
- **Temporadas #11** (tickets de minijuego).
## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | `elementalTraining.json` + extensión `balance.json → minigames.games` | 1 día |
| 2 | `elementalTraining.ts` (buildDungeon determinista) + `start`/`finish` | 2 días |
| 3 | Resolución por piso con `runCombat` + bonus de predicción + buff | 2 días |
| 4 | Frontend: dungeon, hearts, selector de skills, animación de combate | 3 días |
| 5 | WebSocket + integración buff (junto con #15) + simulación | 1 día |

## Balance
- **Buff multiplicador (+5 %):** es menor que el buff aditivo de cocina (+15 % cap), pero se apilan
  (cocina aditivo + entrenamiento multiplicador) con un **techo combinado de +20 %** sobre la stat.
  Evita que el minijuego iguale rareza/elemento.
- **Accesibilidad:** un pet con solo 1 elemental equipada puede no tener skill ventajosa para un piso
  → dificultad por diseño (incentiva diversificar skills). El dungeon no es "obligatorio".
- **Frecuencia:** 24 h + 20 sesiones/día; el jugador entrena 1 vez al día para el buff. El bonus de
  predicción (×2) recompensa la estrategia sin ser obligatorio.
- **Sin impacto en `rarity`/`pity`:** no emite pets ni toca el pool de eclosión; solo buffs temporales.
- **Recompensas base:** `elemental_training` en `balance.json → minigames.games` con
  `maxCoins ≈ 36`, `maxXp ≈ 50`, `happiness 12` (coherente con reflex).

## Tests
- **Unit:** `buildDungeon` con seed fija (5 pisos, elementos reproducibles); afinidad ventajosa vs
  desventajosa (usa `elementMultiplier` del motor); bonus de predicción; buff +5 % / +7 %.
- **Integración:** start genera dungeon; finish valida elecciones contra seed (elección inflada →
  recorte); buff creado; dungeon fallado (0 hearts → sin buff); 20 sesiones/día.
- **E2E:** iniciar dungeon → elegir skills → completar 5 pisos → buff activo → pelear con +5 %.
- **Balance simulation:** simular 1000 dungeons → distribución de floorsCleared; verificar que el buff
  medio no supera el diseño (+5 %); comparar win-rate con/sin buff en Arena.
- **Edge:** pet con 1 elemental (piso imposible → heart); predicción correcta/incorrecta;
  2 minijuegos el mismo día (buffs se combinan con techo +20 %); pet sin energía (400).

## Riesgos y notas
- **Re-validación:** el servidor recalcula cada piso con `seed + floor` (no confía en el resultado del
  cliente). Riesgo de fraude mitigado.
- **Dificultad:** si el dungeon es muy fácil (siempre ventajosa), el buff se vuelve trivial; ajustar
  `enemyStatScale` y la cantidad de pisos.
- **Apilamiento de buffs:** cocina (aditivo) + entrenamiento (multiplicador) → aplicar techo combinado
  +20 % en el armado del `Fighter` (compartido con #15).
- **Consistencia iOS (#27):** animaciones del dungeon vectoriales.

## Preguntas abiertas
- ¿El dungeon tiene 5 pisos fijos o escala con el nivel del pet (más pisos a nivel alto)?
- ¿El bonus de predicción es obligatorio a "adivinar" el siguiente o es opcional (marcar)?
- ¿Se permite elegir el elemento del rival (modo "entrenar contra X") o es aleatorio por seed?
- ¿El buff de entrenamiento se apila con el de cocina o los reemplaza (último gana)?