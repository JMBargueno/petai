# Encargo de implementación: mejoras del cerebro del Pockai

Documento autocontenido para quien lo implemente. No hace falta más contexto que este archivo y
el repositorio.

## 1. Qué es esto y qué se pide

Pockai es un juego de mascotas virtuales (monorepo pnpm: `backend` NestJS + Prisma/PostgreSQL,
`desktop`, `web`, `mobile`, `shared`). Cada mascota tiene un «cerebro» descrito en
`docs/specs/spec-36-cerebro-pockai.md` — **léelo entero antes de empezar**: personalidad en 5
dimensiones (0–100), memoria en 3 capas (episódica, semántica, emocional), vida autónoma simulada
sin LLM y un orquestador de chat.

Una revisión de código encontró los problemas de la sección 4. Se pide corregirlos **en tres
lotes independientes, un PR por lote, en orden**. Cada lote debe dejar los tests en verde. No se
ha ejecutado nada durante la revisión: los hallazgos salen de leer el código, así que confirma
cada uno con un test que falle antes de arreglarlo.

## 2. Mapa del código

| Archivo (bajo `backend/src/modules/`) | Papel |
|---|---|
| `ai/chat.service.ts` | Orquestador: `prepare` → `buildContext` → `planTurn` → `run` (stream) → `persistExchange` → `afterTurn`. Modo local: `prepareLocal` / `syncLocal`. |
| `ai/personality.ts` | `buildSystemPrompt`, niveles de inteligencia (`MEMORY_UNLOCK=200`, `AGENT_UNLOCK=500`). |
| `ai/memory.service.ts`, `ai/memory.ts` | Extracción de hechos y resúmenes por LLM (`maybeSummarize`, `store`), hábitos, `search`. |
| `ai/agent-tools.ts`, `ai/agent.service.ts` | Herramientas del nivel agente. |
| `mind/mind.service.ts` | Perfil, `applyExperience`, `patchStored` (escriben el JSON `Pet.personality`). |
| `mind/personality.engine.ts` | Funciones puras: `clampDim`, nacimiento, bloque de prompt. |
| `mind/evolution.engine.ts`, `mind/evolution.listener.ts` | Deriva de personalidad y eventos de dominio que la provocan. |
| `mind/memory.engine.ts`, `mind/mind-memory.service.ts` | Retención, olvido, `selectForPrompt`, `remember`, `feel`, `recallBlock`. |
| `mind/conversation.engine.ts` | `interpretMessage`: intención y sentimiento por regex. |
| `mind/behavior.engine.ts` | `decideBehavior`, `validateBehavior`, `promptHint`, herramienta `express_behavior`. |
| `mind/autonomy.engine.ts`, `mind/autonomy.service.ts` | Vida autónoma (`catchUp`, `socialSweep`). |

Configuración: `shared/game-data/balance.json → personality`. Esquema: `backend/prisma/schema.prisma`
(modelo `PetMemory`). Tests: `mind/mind.engines.spec.ts`, `ai/chat.service.spec.ts`,
`ai/memory.service.spec.ts`, `ai/memory.spec.ts`, e2e en `backend/test/ai.e2e-spec.ts`.

## 3. Reglas que no se pueden romper

- Los `*.engine.ts` son funciones puras: sin BD, sin reloj, sin azar no sembrado.
- La vida autónoma y el combate son deterministas; no añadas llamadas al PRNG en rutas existentes.
- Cero llamadas nuevas al LLM por turno de chat. La extracción en segundo plano sí puede cambiar.
- El texto literal del usuario no se guarda como recuerdo sin pasar por `safeMemoryText`
  (`cleanText` + `isSensitive`). Los recuerdos van al prompt dentro de `<recuerdos>` como datos.
- Los efectos del turno nunca rompen ni retrasan la respuesta del chat (se capturan errores).
- Toda escritura de `Pet.personality` fusiona con lo existente (`genes`, `trait`, `temperament`…).
- Los números de equilibrio viven en `balance.json`, no en el código; si añades claves, actualiza
  `scripts/validate-game-data.js` y ejecuta `pnpm validate:data` desde la raíz.
- Si cambia un contrato HTTP, regenera OpenAPI (`pnpm --filter petai-backend export:openapi`).
- Comentarios, mensajes y nombres de test en español, como el resto del código.

## 4. Lote 1 — correcciones

### 1.1 Escrituras perdidas en `Pet.personality`
**Problema.** `applyExperience` y `patchStored` (`mind/mind.service.ts`) leen el JSON y lo
reescriben dentro de `$transaction` sin bloquear la fila; con el aislamiento por defecto dos
transacciones simultáneas se pisan. Ocurre en cada turno de chat: `persistExchange` emite
`chat:message_sent` (lo atiende `EvolutionListener.onChat` → `applyExperience(['chat'])`) y a la vez
`afterTurn` llama a `applyExperience(events)`. `AutonomyService.catchUp` hace `applyExperience` y
después `patchStored`.
**Cambio.**
- En ambas funciones, bloquear la fila al empezar la transacción (`SELECT … FOR UPDATE` con
  `tx.$queryRaw`; comprueba el nombre real de la tabla en el esquema).
- Evitar la doble escritura del turno: que `afterTurn` incluya `'chat'` en su lista de eventos y
  que `onChat` no se aplique cuando el orquestador ya lo hace (por ejemplo, un indicador en el
  evento). Ojo: `syncLocal` también pasa por `persistExchange` + `afterTurn`, y si `MindService`
  no está inyectado el listener debe seguir funcionando.
- En `catchUp`, aplicar deriva y contadores (`autonomy`, `lastNeglectDay`) en una sola
  transacción: añade a `applyExperience` un parámetro opcional de parche adicional.
**Hecho cuando.** Un test lanza N `applyExperience` concurrentes sobre la misma mascota y la suma
de deriva coincide con aplicarlos en serie (e2e con BD real).

### 1.2 Cuantización de la deriva
**Problema.** `clampDim` (`mind/personality.engine.ts:14`) redondea a 0,1, pero `balance.json`
tiene deltas de 0,05 y la elasticidad los reduce más. Un −0,05 nunca se aplica (`applyDrift`
descarta el cambio si `next === v`), un +0,05 sobre 50 se convierte en +0,1 y en valores extremos
los deltas pequeños se pierden.
**Cambio.** Guardar con 3 decimales; redondear solo al presentar (ya se hace con `Math.round` en
`buildPersonalityBlock`; revisa `describeDims` y `GET /pets/:id/mind`). `rollBirthDims` debe
seguir dando enteros.
**Hecho cuando.** Tests: 20 eventos de −0,05 bajan 1,0; +0,05 y −0,05 son simétricos; el tope
diario y la elasticidad siguen pasando.

### 1.3 Bucle de refuerzo y ruido en el recuerdo
**Problema.** `recallBlock` (`mind/mind-memory.service.ts`) marca `lastRecalledAt` en todo lo que
inyecta, y `retention` (`mind/memory.engine.ts`) usa esa fecha para reiniciar el decaimiento.
Como la puntuación es `coincidencias + retención`, sin coincidencia léxica ganan siempre los
mismos recuerdos y nunca decaen. Además `updateMany` actualiza `updatedAt` (`@updatedAt`), que
también cuenta. No hay puntuación mínima: el marcador «Conversación sin datos relevantes.»
(importancia 0,1, creado en `MemoryService.store`) puede entrar en el prompt.
**Cambio.**
- `selectForPrompt` devuelve también qué recuerdos tuvieron coincidencia con el mensaje;
  `recallBlock` solo refuerza esos.
- `retention` deja de usar `updatedAt` para capas no emocionales (o `recallBlock` deja de tocarlo).
- Diversidad: penalizar en la puntuación lo recordado hace muy poco sin coincidencia
  (p. ej. `lastRecalledAt` de menos de una hora), con el valor en `balance.json`.
- Umbral mínimo de puntuación configurable y exclusión explícita de resúmenes vacíos. El marcador
  debe seguir existiendo: es la marca de «procesado hasta» de `maybeSummarize`.
**Hecho cuando.** Tests puros: un recuerdo sin coincidencia no cambia su retención tras
seleccionarse; el marcador nunca sale en el bloque; con 10 episodios de importancia parecida, dos
selecciones seguidas sin coincidencia no devuelven el mismo conjunto.

### 1.4 Hora local para el agente
**Problema.** `buildSystemPrompt` (`ai/personality.ts`, rama `agent`) da `now.toISOString()` (UTC)
más el nombre de la zona; el modelo debe convertir para calcular `due_at` de `create_reminder`.
**Cambio.** Dar la hora local con desfase y día de la semana (p. ej. `2026-11-18T11:00+01:00,
miércoles`), con `Intl.DateTimeFormat` y la zona ya validada (`safeTimeZone`). Sin segundos.
**Hecho cuando.** Test en `ai/personality.spec.ts` con una zona no UTC.

### 1.5 Felicidad con valor obsoleto
**Problema.** `afterTurn` (`ai/chat.service.ts`) escribe `pet.happiness + n` usando la mascota
leída antes del stream.
**Cambio.** Actualización atómica acotada a 100 (incremento condicionado o SQL con `LEAST`).
**Hecho cuando.** El test existente de `afterTurn` sigue pasando y uno nuevo cubre el tope en 100.

### 1.6 Reacción repetida en turnos neutros
**Problema.** `decideBehavior` es determinista y su pista (`promptHint`) va siempre al prompt. En
mensajes normales (`chat`, `question`) la misma mascota recibe la misma instrucción todos los
turnos: «devuelve una pregunta curiosa» o «responde con pocas palabras».
**Cambio.** En `buildContext`, no enviar `behaviorHint` cuando la intención es `chat` o
`question`; la reacción (animación y emote del evento `done`) se mantiene. `promptHint` y
`decideBehavior` no cambian de firma.
**Hecho cuando.** Test en `chat.service.spec.ts`: mensaje neutro → el prompt de sistema no
contiene «Reacción decidida»; «he tenido un día malo» → sí la contiene.

## 5. Lote 2 — memoria v2

### 2.1 Una sola política de olvido
**Problema.** `MemoryService.store` crea hechos y resúmenes directamente con topes FIFO propios
(`MAX_FACTS=50`, `MAX_SUMMARIES=20`) y no llama a `enforceCapacity`; `MindMemoryService` olvida
por retención con otras capacidades. `ingestDigest` escribe hábitos sin importancia explícita.
**Cambio.** Que `store` e `ingestDigest` escriban a través de `MindMemoryService` (o que llamen a
`enforceCapacity` al terminar) y retirar los topes FIFO, conservando el resumen más reciente
(ya protegido en `pickEvictions`). `AiModule` ya importa `MindModule`; evita ciclos.

### 2.2 Extracción con operaciones y episodios
**Problema.** (a) Los hechos solo se deduplican por texto normalizado idéntico: «vive en Madrid» y
«se mudó a Barcelona» conviven. (b) Los episodios emocionales salen de plantillas fijas
(`EPISODES` en `mind/conversation.engine.ts`), sin detalle. (c) Todos los hechos entran con
importancia 0,6.
**Cambio.** Ampliar `EXTRACTION_SYSTEM_PROMPT` y `parseExtraction` (`ai/memory.ts`):
- Entrada: la transcripción más los hechos actuales numerados (como datos, no instrucciones).
- Salida JSON: `summary`, `facts: [{ op: "add" | "update" | "delete", index?, text?, importance }]`
  y `episodes: [{ text, importance, valence }]` (máx. 2, en primera persona de la mascota, sin
  citas literales).
- Validación estricta en servidor: índices dentro de rango, textos por `safeMemoryText`,
  importancia y valencia acotadas, máximos por extracción. Salida inválida → se ignora como hoy.
- Subir `maxTokens` lo justo y actualizar la estimación de coste.
Las plantillas de `EPISODES` se quedan como respaldo para cuando no hay extracción.

### 2.3 Episodios de plantilla repetidos
**Problema.** «Mi entrenador me dijo que me quiere.» solo se deduplica dentro del mismo día; en
una semana ocupa 7 de los 15 huecos episódicos del nivel charla.
**Cambio.** Guardar los episodios de plantilla con clave estable por intención (`ep:affection`…),
de modo que se actualicen en vez de acumularse, refrescando fecha e importancia (con tope).

### 2.4 Aprender del entrenador desde el principio
**Problema.** La capa semántica solo la llena la extracción, bloqueada hasta inteligencia 200
(`maybeSummarize`). Los primeros 200 mensajes no dejan ningún dato concreto del entrenador.
**Cambio.** Permitir la extracción por debajo de 200 con cadencia propia, más espaciada, en
`balance.json` o en los límites del plan (`memoryExtractEvery` ya existe en `PlanLimits`; 0 la
desactiva y debe seguir haciéndolo). La capacidad del nivel charla (10 semánticos) ya acota el
almacenamiento. Revisa `MemoryService.list`, que devuelve `unlocked: intelligence >= 200`, y los
clientes que lo muestran.
**Decisión de producto que debe confirmar el propietario antes de implementar:** la cadencia en
el plan gratuito, porque gasta presupuesto de IA gestionada.

**Hecho cuando (lote 2).** Tests: una extracción con `update` sustituye el hecho antiguo; un
`delete` con índice fuera de rango se ignora; episodios extraídos pasan el filtro de sensibles;
tras `store` ninguna capa supera su capacidad; tres «te quiero» en días distintos dejan un solo
episodio; una mascota con inteligencia 50 recibe hechos cuando la cadencia lo permite.

## 6. Lote 3 — medición y mejoras dependientes

Hacer primero 3.1 y 3.2; el resto solo si los datos lo justifican.

- **3.1 Métricas.** Con `backend/src/observability/metrics.service.ts`: recuerdos inyectados por
  capa y cuántos con coincidencia, reacciones propuestas y rechazadas por `validateBehavior`,
  extracciones correctas/sin formato, distribución de intenciones. Aviso al arrancar si
  `MindService` o `MindMemoryService` no están inyectados (hoy son `@Optional()` y fallan en silencio).
- **3.2 Casos de evaluación.** Tabla de frases → intención esperada para `interpretMessage`,
  incluyendo negaciones («no estoy triste»), falsos positivos de `explor` («explorador de
  archivos») y frases en inglés; corrige las reglas hasta que pasen. Tabla equivalente para
  `selectForPrompt`.
- **3.3 Recuperación.** Lematización ligera en `tokens` («jugar»/«jugamos») y extra de puntuación
  cuando el mensaje nombra al sujeto de un recuerdo (el comentario de `selectForPrompt` lo promete
  y solo existe para el entrenador). `MemoryService.search` debería usar la misma puntuación.
  Embeddings solo si 3.2 demuestra que lo léxico no basta.
- **3.4 Progresión de inteligencia.** Hoy es +1 fijo por intercambio (`persistExchange`), también
  en modo local, donde la respuesta la afirma el cliente: a 20 mensajes por minuto se alcanza el
  nivel agente en 25 minutos. Añadir tope diario en `balance.json`. **Requiere decisión de producto.**
- **3.5 «Desde la última vez».** En el primer mensaje tras una ausencia, garantizar 1–2 episodios
  autónomos aún no contados en el bloque de recuerdos. Comprueba antes si `reengagement` o el
  diario de ausencia ya lo cubren.
- **3.6 Prompt.** Mover lo estable (identidad, reglas, herramientas) al principio y lo volátil
  (estadísticas, hora, recuerdos) al final para aprovechar la caché de prompt.

## 7. Verificación

Desde la raíz del repositorio:

- `pnpm --filter petai-backend test` — unitarios (Jest). Para acotar: añade `-- mind` o `-- ai`.
- `pnpm --filter petai-backend test:e2e` — necesita PostgreSQL y Redis (`docker-compose.yml`).
- `pnpm validate:data` — si tocas `balance.json`.
- `pnpm --filter petai-backend build` — compila sin errores de tipos.

Prueba manual por lote, con el backend levantado: `GET /pets/:id/mind`, enviar varios mensajes de
chat (uno neutro, uno «he tenido un día malo», uno «te quiero») y comprobar el evento `done`
(`behavior`), los recuerdos en `GET /pets/:id/memories` y que las dimensiones se mueven.

La spec 36 advierte de que la migración `20261118000000_pockai_mind` y el flujo completo nunca se
probaron contra una BD real. Hazlo antes de dar por bueno el lote 1 y di en el PR qué quedó sin
verificar.

## 8. Qué entregar

Por lote: un PR con los cambios, los tests nuevos, la sección correspondiente de
`docs/specs/spec-36-cerebro-pockai.md` actualizada y, en la descripción, qué se verificó y qué no.
Si un hallazgo resulta no ser cierto al escribir su test, no lo «arregles»: dilo en el PR.
