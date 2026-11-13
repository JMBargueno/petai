# Spec: Aventura Narrativa IA

## ID
18 — Aventura Narrativa IA (NUEVAS_FUNCIONALIDADES §18)

## Resumen
La IA del pet genera un **cuento/aventura diaria personalizada** de 3–5 escenas. El jugador toma
decisiones (interactive fiction): el LLM genera una escena + 2–3 opciones, el jugador elige, y así
hasta el final. El resultado (victoria/derrota/parcial) se **valida determinísticamente** según las
stats del pet. Otorga XP y monedas, y la mascota **recuerda** la aventura (la menciona en conversaciones
futuras). Es el diferenciador IA: contenido diario infinito y personal que une el tamagotchi y la IA.

## Contexto
Hoy el pet "vive" (vitalidades, combate, chat) pero no tiene **contenido narrativo diario**. La
aventura convierte el LLM en generador de contenido fresco e infinito, personalizado por el pet
(especie, elemento, temperamento #17, bonding, historial). Conecta con:
- **Módulo `ai`** (`AiConfig`, `AiUsage`, cuotas de tokens, `ai.service.ts`).
- **`PetMemory`** (la mascota recuerda la aventura → menciones futuras).
- **Progresión** (XP/monedas por completar).
- **Genes/Temperamento #17** (personalidad del narrador y del protagonista).
- **Economía** (aventura premium por gemas; justifica el modo suscripción IA).

## Objetivos
- Generar una aventura diaria personalizada (3–5 escenas, choices) con el LLM del pet.
- Validar el **resultado final determinísticamente** (según stats), no dejarlo al LLM.
- Persistir la aventura y hacer que el pet la recuerde (menciones en el chat).
- Controlar el coste de tokens (cuotas, `AiUsage`) y ofrecer un modo premium.

## User Stories
- Como jugador, quiero que mi pet me cuente una aventura cada día, para tener contenido fresco.
- Como jugador, quiero decidir las opciones de la historia, para sentir que la vivo con mi pet.
- Como jugador, quiero que el resultado dependa de mis stats, para que sea justo (no aleatorio puro).
- Como jugador, quiero que mi pet recuerde la aventura y lo mencione en el chat, para que sea memorable.
- Como jugador que paga, quiero una "aventura premium" (más larga, reintentar decisiones), para más
  contenido.

## Criterios de aceptación
- [ ] AC1: El usuario puede iniciar una aventura diaria (1 gratis/día) con su pet activo.
- [ ] AC2: La IA genera 3–5 escenas; cada escena tiene texto + 2–3 opciones; el jugador elige.
- [ ] AC3: Al finalizar, el **resultado** (win/lose/partial) se calcula determinísticamente por una
      fórmula con las stats del pet (no se toma del LLM).
- [ ] AC4: Las recompensas (XP/monedas) se aplican según el resultado y se guardan.
- [ ] AC5: La aventura se persiste (escenas, choices, resultado) y se crea un `PetMemory` (resumen)
      para que el pet la mencione en el chat IA.
- [ ] AC6: Se consume tokens de `AiUsage` y se respetan las cuotas del modo `byok`/`managed`
      (`AiConfig`); si no hay saldo, se ofrece la versión premium (gemas).
- [ ] AC7: La aventura premium (gemas) permite más escenas y reintentar 1 decisión.
- [ ] AC8: El narrador usa el temperamento/personalidad del pet (coherencia con #17).

## Diseño técnico
### Backend
- Nuevo módulo `backend/src/modules/adventure/` con `adventure.module.ts`, `adventure.controller.ts`,
  `adventure.service.ts`, `narrator.ts` (orquestación LLM), `outcome.ts` (validación determinista),
  `dto/`.
- `adventure.service.ts`:
  - `startDaily(userId, petId)` → valida 1/día, construye el **briefing** (especie, elemento,
    temperamento, bonding, último `PetMemory`) y llama a `narrator.generateScene(briefing, seed)`.
  - `choose(userId, sessionId, optionIndex)` → valida opción, llama al LLM para la siguiente escena;
    guarda la decisión.
  - `finish(sessionId)` → calcula el **resultado determinista** (`outcome.ts`), aplica XP/monedas,
    crea `PetMemory` (resumen), cierra la sesión.
- `narrator.ts`: orquesta el LLM (vía `ai.service.ts`) con un **system prompt** de narrador +
  el briefing del pet; exige respuesta **estructurada** (JSON: `{ text, options: [{ label, nextId }],
  isEnd })`). Valida la estructura y re-intenta si el LLM devuelve mal formato (fallback a plantilla).
- `outcome.ts`: `resolveOutcome(pet, decisions, seed)` → fórmula determinista (ver *Lógica de juego*);
  no depende del LLM (solo de stats + decisiones + seed).
- **Coste:** cada llamada al LLM suma tokens a `AiUsage` (`ai.service.ts` ya lo hace). Si el modo
  `byok`/`managed` no tiene cuota, se rechaza o se ofrece premium.

### Frontend
- Pantalla "Aventura": narrador (burbuja), texto de la escena, botones de opciones (2–3), indicador
  de escena (1/5), barra de progreso.
- Al elegir: transición a la siguiente escena (streaming del texto si el LLM soporta).
- Pantalla de resultado: win/lose/partial + recompensas (XP/monedas) + "mi pet lo recordará".
- CTA "Aventura premium" (gem as) si se agotó la diaria.
- El pet menciona la aventura en el chat IA posterior (integración con `ChatMessage`).

### Datos de juego
- `shared/game-data/adventure.json`:
```json
{
  "sceneCount": { "free": 3, "premium": 5 },
  "optionsPerScene": { "min": 2, "max": 3 },
  "rewards": {
    "win":  { "xp": 30, "coins": 20 },
    "partial": { "xp": 15, "coins": 10 },
    "lose": { "xp": 5, "coins": 3 }
  },
  "premium": { "priceGems": 5, "retryDecisions": 1 },
  "dailyFree": 1,
  "tokenBudgetPerAdventure": 1500
}
```
## Interfaz de API
Base: `JwtAuthGuard` + `@CurrentUser()`; rutas bajo `/adventure`.

| Método | Ruta | Request | Response | Códigos |
|---|---|---|---|---|
| GET | `/adventure/daily` | — | estado de la aventura diaria (disponible/activa) | 200 |
| POST | `/adventure/start` | `{ petId, premium? }` | `{ sessionId, scene: { text, options[], sceneIndex } }` | 200, 400 (ya usada hoy / sin cuota IA) |
| POST | `/adventure/:sessionId/choose` | `{ optionIndex }` | `{ scene: { text, options[], sceneIndex } }` | 200, 400 (opción inválida / terminada) |
| POST | `/adventure/:sessionId/retry` | — | reintento de 1 decisión (solo premium) | 200, 403 (no premium) |
| POST | `/adventure/:sessionId/finish` | — | `{ outcome, rewards: { xp, coins }, memoryId }` | 200, 400 |

## Modelo de datos
```prisma
model AdventureSession {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  petId       String
  pet         Pet      @relation(fields: [petId], references: [id], onDelete: Cascade)
  seed        Int
  premium     Boolean  @default(false)
  scenes      Json     // [ { text, options[], choice, sceneIndex } ] (persiste la historia)
  decisions   Json     // [ { sceneIndex, optionIndex } ]
  outcome     String?  // win | partial | lose
  rewardsXp   Int      @default(0)
  rewardsCoins Int     @default(0)
  retries     Int      @default(0)
  startedAt   DateTime @default(now())
  finishedAt  DateTime?
  createdAt   DateTime @default(now())
  @@index([userId, createdAt])
  @@index([petId])
}
```
- El **resumen** de la aventura se persiste en `PetMemory` (modelo existente, `kind="summary"` o
  nuevo `kind="adventure"`): `content = "Hoy [pet] [resumen de la aventura]..."`. Es lo que el chat IA
  recupera para mencionar la aventura en conversaciones futuras.
- Agregado a `User`: `adventures AdventureSession[]`. A `Pet`: `adventures AdventureSession[]`.

## Lógica de juego
### Orquestación del LLM (narrador)
1. `start`: se construye el **briefing** = `{ especie, elemento, rareza, temperamento, bonding,
   resumen de último PetMemory }` + el system prompt de narrador (personalidad del pet, tono, longitud).
   `seed = hashSeed(adventureId + ":" + petId + ":" + dateKey)` (reproducible por día para el fallback).
2. El LLM devuelve **JSON estricto** `{ text, options: [{ label, id }], isEnd }`. Se valida con un
   schema; si falla (mal formato, >token), se reintenta 1 vez; si sigue fallando, se usa una
   **plantilla de fallback** (escena genérica del elemento) para no romper la experiencia.
3. `choose`: se envía la historia hasta ahora + la elección; el LLM genera la siguiente escena. Se
   guarda en `scenes`. Si `isEnd=true`, se procede a `finish`.
4. **Toque de tokens:** cada escena consume ~300 tokens; 5 escenas ≈ 1500 (`tokenBudgetPerAdventure`).
   Se suma a `AiUsage` (ya hecho por `ai.service.ts`). Si supera la cuota del modo, se detiene y se
   ofrece premium.

### Resultado determinista (outcome.ts) — NO lo decide el LLM
`resolveOutcome(pet, decisions, seed)`:
- `combatScore` = función de stats relevantes según el tema de la aventura:
  `score = round( (hp+atk+def+vel+esp)/5 × mood × (1 + 0.05·nivel) )`.
- `choiceQuality` = calidad de las decisiones del jugador (cada opción tiene un peso oculto
  `0..1` definido por el narrador; se guarda en `options[].weight` **en el log**, no visible al cliente).
- `seedJitter = (rng() - 0.5) × 0.2` (±10 %).
- `finalScore = (score × 0.6) + (avgChoiceQuality × 100 × 0.4) + seedJitter × 100`.
- `outcome = finalScore >= 60 ? "win" : finalScore >= 30 ? "partial" : "lose"`.

**Determinismo:** dado el pet (stats), las decisiones y la `seed`, el resultado es reproducible. El
LLM no controla el resultado; solo narra. Esto evita que un "pet mal narrado" pierda por culpa del
LLM.

### Recompensas y memoria
- `rewards[outcome]` (`adventure.json`): win → 30 XP + 20 coins; partial → 15/10; lose → 5/3.
  Se aplican al `Pet` (XP/monedas del pet o del usuario según diseño).
- `PetMemory`: `content = resumen` generado por el LLM al `finish` (1 frase). El chat IA lo recupera
  (contexto) y lo menciona ("¿Recuerdas aquella vez que...?").
- `SeasonsService.awardTickets(userId, "adventure", 2)` si hay temporada (#11).

## Eventos y sincronización
- WebSocket (`realtime`): `adventure:scene` → `{ scene }` (streaming por escena, opcional);
  `adventure:finished` → `{ outcome, rewards, memoryId }`.
- Sin jobs recurrentes; la aventura es síncrona por elección (el usuario la avanza). Un job opcional
  `adventure.cleanup` cierra sesiones abandonadas >24 h (sin recompensa).
- **Streaming:** el LLM puede emitir tokens en streaming vía el canal IA existente; el frontend
  renderiza el texto de la escena progresivamente.

## Dependencias
- **Módulo `ai`** (`AiConfig`, `AiUsage`, `ai.service.ts`, cuotas, streaming) — dependencia crítica.
- **`PetMemory`** (resumen para que el pet recuerde).
- **Progresión** (XP/monedas del pet).
- **Genes/Temperamento #17** (personalidad del narrador y del protagonista).
- **Temporadas #11** (tickets de aventura, tema).
- **Economía** (gem as para aventura premium).
## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | `adventure.json` + modelo `AdventureSession` + migración | 1 día |
| 2 | `narrator.ts` (orquestación LLM, JSON estricto, fallback) + tests con mock LLM | 3 días |
| 3 | `outcome.ts` (validación determinista) + `start`/`choose`/`finish` | 2 días |
| 4 | Integración con `AiUsage`/cuotas + `PetMemory` (resumen) + premium | 2 días |
| 5 | Frontend: pantalla aventura, streaming, choices, resultado | 3 días |
| 6 | WebSocket + QA de calidad narrativa + simulación de balance/coste | 2 días |

## Balance
- **Coste IA (crítico):** ~1500 tokens/aventura. Con 1000 DAU y 1 aventura/día → ~1.5 M tokens/día.
  Es la funcionalidad de mayor coste; debe ir de la mano del modo suscripción IA (#19 multi-model
  router). El `tokenBudgetPerAdventure` (1500) y el fallback (plantilla sin LLM) limitan el gasto.
- **Recompensas:** win 30 XP + 20 coins; partial 15/10; lose 5/3. Es menor que una victoria de combate
  (40 XP/25 coins) → la aventura es "contenido", no el principal fuente de progreso.
- **Determinismo del resultado:** el outcome depende de stats (60 %) + decisiones (40 %) + jitter
  (±10 %). Un pet fuerte con buenas decisiones gana; un pet débil con malas decisiones pierde. No es
  "pay-to-win" (no depende de gemas, sino de stats + juego).
- **Sin impacto en `rarity`/`pity`:** la aventura no emite pets ni toca el pool de eclosión; solo
  XP/monedas. No interfiere con el sistema de rareza.
- **Personalización:** el briefing (especie, elemento, temperamento, bonding) hace que cada aventura
  sea única → retención. El `PetMemory` crea continuidad entre días (el pet "recuerda").

## Tests
- **Unit (con mock LLM):** `narrator.generateScene` (JSON válido, reintentos, fallback a plantilla);
  `resolveOutcome` (win/partial/lose con stats/decisiones/seed fijas); **determinismo** (mismo
  pet + decisiones + seed → mismo outcome); token budget (excede → premium/fallback).
- **Integración:** start (1/día, valida cuota IA); choose (avanza escena); finish (aplica recompensas,
  crea `PetMemory`); premium (retry 1 decisión); sin cuota IA → rechaza u ofrece premium.
- **E2E:** iniciar aventura → elegir opciones (5 escenas) → resultado según stats → XP/monedas →
  `PetMemory` → ver que el chat IA lo menciona después.
- **Balance simulation:** simular 1000 aventuras → distribución de win/partial/lose (debe ser ~40/40/
  20 para un pet medio); verificar que un pet Mítico gana más que un Normal; medir tokens reales
  vs. budget.
- **Edge:** LLM devuelve mal formato (fallback); LLM se pasa de tokens (detiene + premium); aventura
  abandonada 24 h (cleanup, sin recompensa); 2 aventuras el mismo día (400 la 2ª); pet sin IA configurada
  (usar modo managed/fallback).

## Riesgos y notas
- **Calidad del LLM:** el contenido puede ser inconsistente o de baja calidad; mitigar con:
  - JSON estricto + validación (evita "prosa" no estructurada).
  - Fallback a plantillas por elemento (garantiza experiencia mínima).
  - System prompt de narrador con la personalidad del pet (#17) para coherencia.
- **Coste de tokens:** es el mayor riesgo económico; mitigar con budget, fallback, y el modo
  suscripción IA (#19). Considerar cachear aventuras por (especie, elemento, temperamento, seed).
- **Determinismo vs. creatividad:** el resultado es determinista, pero la **narración** es creativa
  (LLM). Esto es intencional: la historia varía, pero el resultado es justo.
- **Retención por dependencia del LLM:** si el LLM falla, la experiencia se degrada; el fallback
  (plantillas) es crítico para no romper la aventura diaria.
- **Streaming:** el LLM emite tokens en streaming; el frontend debe manejar el estado intermedio
  (escena en curso) y la re-conexión (re-sincronizar `scenes` del `AdventureSession`).
- **Moderación:** el LLM puede generar contenido inapropiado; añadir un filtro de seguridad (no
  almacenar texto no moderado) y un "modo seguro" por defecto.

## Preguntas abiertas
- ¿La aventura es estrictamente 1/día o se pueden "comprar" más con gemas (además de la premium)?
- ¿El resultado de la aventura afecta algo permanente (logro, coleccionable) o solo XP/monedas?
- ¿Se permite "compartir" la aventura con amigos (UGC de historias)?
- ¿El LLM elige el "tema" de la aventura (aventura de combate, misterio, exploración) o es fijo?
- ¿Se integra con el Combat Spectator (#23) para "ver" la batalla de la aventura?
- ¿Existe un "final secreto" (condición especial) que otorgue un reward extra (FOMO)?