# PetAI — Mejoras de funcionalidad y rendimiento

- **Fecha**: 14 de noviembre de 2026
- **Commit revisado**: `8899ab3` (`main`, al día con `origin/main`)
- **Método**: lectura de `README.md`, `docs/` y del código, contrastando lo que la documentación da por hecho con lo que el código hace. No se ha levantado el servidor ni se han medido tiempos; las cifras de rendimiento que se citan son las de `docs/DEPLOY.md` §7.
- **Datos ejecutados**: `pnpm backend:test` → 48 suites, 592 tests en verde. `tsc --noEmit` → sin errores. `pnpm audit --prod` → limpio.
- Los problemas de seguridad están en [AUDITORIA_SEGURIDAD.md](AUDITORIA_SEGURIDAD.md); aquí solo se citan cuando afectan al funcionamiento.

## 1. Conclusión

El núcleo (fases 1 a 4 y la oleada 1 de la Fase 7) funciona, tiene tests unitarios y e2e, y los clientes lo usan. Las oleadas 2 y 3 (features 010 a 033) están en un estado distinto al que indican el README y el ROADMAP:

- **No tienen migraciones de base de datos.** En producción sus tablas no existen.
- **Muchas de sus rutas quedan en `/v1/v1/...`** por un prefijo duplicado.
- **No tienen ningún test.**
- **Ningún cliente las usa.**
- **Varias son maquetas** que guardan el estado en memoria o devuelven valores fijos.

La recomendación principal no es añadir funcionalidad sino ajustar el estado declarado al real, y después llevar las features a producción una a una, empezando por las que cierran el ciclo de juego.

> **Actualización (rama `fix/migraciones-y-prefijos`)**: F-01 y F-02 están corregidos en esa rama. Se añadió la migración `20261114120000_wave2_wave3` (44 tablas y 10 columnas nuevas, sin sentencias destructivas), los 21 controladores afectados ya no repiten `v1/`, y el job e2e de la CI vuelve a usar `migrate deploy` con una comprobación de que esquema y migraciones coinciden. El texto de F-01 y F-02 describe el estado de `main` en `8899ab3`. Eran 21 controladores y no 20: faltaba `spectator` en la lista.

## 2. Resumen

| ID | Impacto | Asunto |
|---|---|---|
| F-01 | Bloqueante | 44 de 67 modelos no tienen migración; `migrate deploy` no crea sus tablas |
| F-02 | Bloqueante | 20 controladores con prefijo duplicado `/v1/v1/` |
| F-03 | Alto | 23 módulos sin tests; README y ROADMAP dicen lo contrario |
| F-04 | Alto | Features que son maquetas: sync, co-op, spectator, E2E, router de IA |
| F-05 | Alto | Torneo: no usa las estadísticas reales, emparejamiento desalineado, puede no terminar nunca |
| F-06 | Alto | Raid: el jefe puede quedar imposible de rematar |
| F-07 | Alto | El worker del edge rompe SSE, binarios y códigos de estado si se usa como proxy |
| F-08 | Medio | Voz: el límite de cuerpo de 100 KB impide enviar audio |
| F-09 | Medio | `openapi.json` desfasado; los clientes no pueden generar las rutas nuevas |
| F-10 | Medio | Ningún cliente consume las oleadas 2 y 3 |
| F-11 | Medio | Temporadas: configuración estática, sin fin de temporada, compra del pase frágil |
| F-12 | Medio | Regalos caducados que no vuelven al remitente |
| R-01 | Alto | Trabajo lento dentro de la petición HTTP (webhooks, LLM) |
| R-02 | Alto | Estado en memoria que impide escalar a varias réplicas |
| R-03 | Medio | Crons sin bloqueo y consultas periódicas evitables |
| R-04 | Medio | Lecturas calientes sin caché ni paginación |
| R-05 | Medio | Claves de Redis sin caducidad |
| R-06 | Bajo | Imagen Docker pesada y migraciones en el arranque |
| R-07 | Bajo | Métricas del edge sin límite; sin pruebas de carga de escritura |
| C-01 | Medio | Documentación y versiones desalineadas |
| C-02 | Bajo | Ficheros de salida de tests versionados en la raíz |

## 3. Funcionalidad

### F-01 — Faltan las migraciones de las oleadas 2 y 3 (Bloqueante)

`backend/prisma/schema.prisma` define 67 modelos. Las 10 migraciones de `backend/prisma/migrations/` crean 23 tablas; la última es `20261114000000_add_achievements`. No hay `CREATE TABLE` para `Habitat`, `Season`, `Breeding`, `Raid`, `Tournament`, `CookingSession`, `TrainingSession`, `Adventure`, `Mod`, `Webhook`, `ApiKey`, `AuditLog`, `E2eKeyPair`, `Gift`, `GroupSession` ni para el resto de modelos de las features 010 a 033.

La imagen de producción arranca con `prisma migrate deploy` ([Dockerfile](../../backend/Dockerfile)). Con una base de datos nueva, todas las rutas de esas features fallarán con un 500 por tabla inexistente.

El último commit de `main` (`c165108`, «use prisma db push instead of migrate deploy for e2e tests») cambió la CI para que cree el esquema con `db push`. Eso hace pasar los tests, pero oculta justo este desajuste: la CI ya no comprueba que las migraciones reproduzcan el esquema.

**Qué hacer.**
1. Generar la migración que falta (`prisma migrate dev --name wave2_wave3`) y revisarla.
2. Volver a `migrate deploy` en el job e2e de la CI.
3. Añadir a la CI `prisma migrate diff --from-migrations … --to-schema-datamodel … --exit-code` para que un esquema sin migración rompa el build.

### F-02 — Prefijo `/v1` duplicado (Bloqueante para esas rutas)

`main.ts` aplica `setGlobalPrefix('v1')`. Los controladores del núcleo declaran rutas sin prefijo (`@Controller('pets')`), pero 20 controladores de las oleadas 2 y 3 lo repiten (`@Controller('v1/security')`). El resultado es `/v1/v1/security/...`, no la ruta que documentan sus propios comentarios y las specs.

Afectados: `accessibility`, `adventure`, `ai-router`, `breeding`, `buddies`, `genes`, `gifting`, `habitat`, `modding`, `mood-theater`, `presence`, `reengagement`, `rituals`, `seasons`, `security`, `sync`, `training`, `voice`, `webhooks` y `public-api`.

No afectados (sin prefijo): `raid`, `tournament`, `cooking`, `chests`, `missions`, `achievements`.

Lo he confirmado leyendo el código, no ejecutando el servidor; `openapi.json` no sirve para contrastarlo porque no incluye estas rutas (F-09).

**Qué hacer.** Quitar `v1/` de esos decoradores y añadir un test e2e mínimo por módulo que llame a la ruta documentada.

### F-03 — Sin tests en 23 módulos (Alto)

`README.md` y `docs/ROADMAP.md` dicen que las 33 features están «implementadas y con tests». Recuento de ficheros `*.spec.ts`:

- Con tests: `ai` (10), `environmental` (6), `achievements` (5), `missions` (4), `observability` (3), `pets`, `bonding`, `notifications`, `auth`, `battles`, `chests`, `assets`, `hatching`, `minigames`, `game-data`, `realtime`.
- **Sin ninguno**: `security`, `webhooks`, `modding`, `sync`, `gifting`, `voice`, `presence`, `spectator`, `tournament`, `raid`, `seasons`, `breeding`, `habitat`, `cooking`, `training`, `genes`, `adventure`, `buddies`, `rituals`, `mood-theater`, `accessibility`, `reengagement`, `ai-router`.

Tampoco hay e2e para ellos en `backend/test/`. Los problemas F-01, F-02, F-05 y F-06 habrían salido con un solo test e2e por módulo.

**Qué hacer.** Un e2e de camino feliz por módulo como mínimo de entrada, y corregir el estado en README y ROADMAP hasta que existan.

### F-04 — Features que son maquetas (Alto)

| Feature | Estado real |
|---|---|
| 022 Offline-First CRDT | [delta-sync.service.ts](../../backend/src/modules/sync/delta-sync.service.ts) aplica las acciones a un objeto en memoria con valores iniciales fijos (80 en todo). No lee ni escribe la tabla `Pet`. `CrdtService` está inyectado pero no se llama. `pull` compara una marca de tiempo en milisegundos con un número de versión, así que siempre devuelve todos los deltas. |
| 021 Cuidado cooperativo | [coop-care.service.ts](../../backend/src/modules/presence/coop-care.service.ts): amistades y contadores en memoria. No hay endpoint para crear una amistad, por lo que `POST /coop/visit` responde siempre 403. La visita no modifica a la mascota y `getVisitHistory` devuelve siempre una lista vacía. |
| 023 Spectator | Buffers y suscripciones en memoria; nada los alimenta desde el motor de combate (que además es asíncrono e instantáneo, no hay «directo» que retransmitir). |
| 026 E2E | Solo guarda una clave pública; el chat no la usa. |
| 019 Router de IA | Módulo aparte del chat real (`ai/chat.service.ts`), que sigue usando su propio proveedor. `updateConfig` no persiste. Apunta por defecto a `http://localhost:11434/v1`. |
| 024 Modding | El sprite y el código del minijuego se validan y se descartan; no se guardan. `spriteUrl` queda como `inline://…`, que no resuelve. |
| 027 iOS + Skia | Es un JSON (`shared/assets/animation-specs.json`); `ios/` está vacío. |

**Qué hacer.** Marcar estas features como «prototipo» en README y ROADMAP, y no registrar en `AppModule` los módulos que no hacen nada útil (sync, coop, spectator) hasta que tengan persistencia. Para el modo offline, el diseño realista es una cola de acciones en el cliente que se reproduce contra los endpoints existentes con una clave de idempotencia, no un CRDT.

### F-05 — Torneo (Alto)

En [tournament.service.ts](../../backend/src/modules/tournament/tournament.service.ts):

- **Las mascotas no importan.** `buildFighterFromPet` (líneas 163-173) da a todos los participantes las mismas estadísticas fijas (100/50/40/30/30) y ninguna habilidad. El resultado depende solo del elemento y de la semilla. Debe usar `battlesService.fighterFromPet`, como hace el raid.
- **Emparejamiento desalineado.** El cuadro se construye con las inscripciones ordenadas por ELO (línea 110), pero al resolver se indexa `entries[match.seed1]` sobre una consulta sin `orderBy` ni `take` (líneas 131-137). Los índices no corresponden a las mismas mascotas.
- **Puede no terminar.** El pago busca la final en `round: 6` (línea 148). Con menos de 64 inscritos esa ronda puede no existir **(a verificar en `bracket.service.ts`)**; en ese caso el torneo se queda en estado `bracket` para siempre y `getCurrent` no crea otro.
- **Cuota sin plaza.** Solo entran los 64 de mayor ELO; quien se inscribe de más paga 50 gemas y no juega, sin reembolso.
- **Premio.** `TOTAL_PRIZE` es 3000 pero solo se pagan 1000 al ganador; no hay premios para el resto ni el «item exclusivo» del README.

### F-06 — Raid: jefe imposible de rematar (Alto)

El daño se aplica con `updateMany({ where: { hpRemaining: { gte: damage } } })` ([raid.service.ts:79-87](../../backend/src/modules/raid/raid.service.ts)). Cuando al jefe le queda menos vida que el daño del golpe, la condición no se cumple y el ataque falla con «Error al aplicar daño». Solo un golpe menor o igual que la vida restante puede matarlo, así que el final del raid se bloquea para la mayoría de jugadores.

**Qué hacer.** Aplicar `LEAST(hpRemaining, damage)`: descontar con `GREATEST(hp - daño, 0)` en una sentencia SQL, o reintentar con el daño recortado a la vida restante.

Además, `raid.endsAt` caducado se gestiona en dos sitios (petición y cron) y `rotate()` puede crear dos raids activos a la vez.

### F-07 — El worker del edge no sirve como proxy general (Alto si se enruta todo por él)

`fallbackOrigin` ([worker.ts:118-146](../../edge/worker.ts)) reenvía cualquier ruta que no sea el refresh, pero:

- lee la respuesta entera con `res.text()`: el chat por SSE deja de ser streaming y los binarios (`/assets/*`) se corrompen;
- devuelve siempre `200` y `Content-Type: application/json` en éxito (se pierden los 201 y 204), y sustituye el cuerpo de los errores por un mensaje genérico (se pierden los mensajes de validación, `retryAfterSeconds` y la cabecera `Retry-After`);
- solo reenvía `Content-Type` y `Authorization`.

Si el worker se limita a la ruta `/v1/auth/refresh` no ocurre nada de esto, pero el código y su comentario («passthrough») invitan a ponerlo delante de todo. Hay que devolver `fetch(request)` sin tocar para lo que no sea refresh, o fijar la ruta en `wrangler.toml`. Sobre el propio fast-path, ver S-01 en el informe de seguridad.

### F-08 — Voz: no cabe el audio (Medio)

`POST /voice/transcribe` recibe el audio en base64 dentro de JSON y comprueba un máximo de 10 MB ([voice.controller.ts:50](../../backend/src/modules/voice/voice.controller.ts)). No se ha configurado el límite del body parser, que por defecto es 100 KB: cualquier audio de más de unos 75 KB (dos o tres segundos) recibe un 413 antes de llegar al controlador.

**Qué hacer.** Subida `multipart/form-data` con límite propio en esa ruta (mejor que base64, que infla un 33 %), y respuesta de TTS como binario en streaming en vez de base64 en JSON.

### F-09 — Contrato OpenAPI desfasado (Medio)

`shared/openapi/openapi.json` tiene 71 rutas y ninguna de `security`, `modding` ni del resto de módulos nuevos. Es «el contrato único» del que se generan los clientes (`docs/PROYECTO.md` §3). Además, los controladores nuevos tipan `@Body()` con interfaces, que Swagger no puede describir.

**Qué hacer.** Regenerarlo tras corregir F-02, usar DTOs o esquemas zod con `@nestjs/swagger`, y comprobar en la CI que el fichero versionado coincide con el generado.

### F-10 — Los clientes no usan las oleadas 2 y 3 (Medio)

Buscando las rutas en `desktop/src` y `mobile/android/app/src/main`: el escritorio solo consume `achievements` de la Fase 7 y Android solo menciona `missions`. Ninguna feature de la 010 a la 033 tiene interfaz. El README las presenta junto al resto sin distinguir.

**Qué hacer.** Priorizar por valor para el jugador y coste de interfaz. Propuesta de orden:

1. Misiones, cofres, logros y vínculo (oleada 1, backend sólido): llevarlos a escritorio y Android.
2. Recompensas de fin de temporada de la arena, pendiente desde la Fase 4.
3. Temporadas con pase y hábitat, una vez resueltos F-01, F-11 y los cobros atómicos.
4. Raid y torneo, tras F-05 y F-06.
5. El resto, según datos de uso.

### F-11 — Temporadas (Medio)

- La temporada actual sale de `shared/game-data/seasons.json` y se carga con `require` en el constructor ([seasons.service.ts:44](../../backend/src/modules/seasons/seasons.service.ts)): no pasa por `GameDataService`, no admite recarga en caliente y cambiar de temporada exige desplegar.
- No hay transición: cuando pasa `endTime` todo responde «expirada» y no existe proceso que cierre la temporada, reparta premios o active `upcomingSeason`.
- `ensureSeasonRecord()` no se llama desde ningún sitio y `SeasonPass` referencia a `Season`. Si la fila no existe, comprar el pase falla después de cobrar **(a verificar: salvo que el seed la cree)**.
- `addXp` calcula el nivel y concede premios en pasos separados; dos llamadas simultáneas pueden conceder el mismo nivel dos veces.

### F-12 — Regalos caducados (Medio)

Enviar un regalo descuenta el objeto del inventario del remitente y fija `expiresAt` a 24 horas. Nada procesa los caducados: el objeto no vuelve al remitente y el regalo se puede seguir aceptando pasado el plazo ([gifting.service.ts](../../backend/src/modules/gifting/gifting.service.ts)). Hace falta un cron de devolución o resolverlo de forma perezosa al listar.

### Otros pendientes ya declarados en la documentación

Siguen abiertos y conviene tenerlos en la misma lista: modo suscripción de IA con key del servidor, moderación de contenido con modelo, Play Billing y verificación de compras, FCM, iOS, verificación de correo y recuperación de contraseña, actualización automática y firma del escritorio. De todos ellos, la recuperación de contraseña es el que más afecta a un lanzamiento: hoy una contraseña olvidada supone perder la cuenta.

## 4. Rendimiento y escalabilidad

### R-01 — Trabajo lento dentro de la petición (Alto)

- **Webhooks.** `deliver` reintenta con esperas de 1 s, 5 s y 30 s dentro de la llamada, con 10 s de timeout por intento ([webhooks.service.ts:138-167](../../backend/src/modules/webhooks/webhooks.service.ts)). Un destino caído retiene la petición más de 70 s. `dispatch` espera a todos los webhooks del usuario antes de volver.
- **Aventura.** `start` espera la generación del tema por el LLM antes de responder.
- **Notificaciones con IA.** Mismo patrón **(a verificar el detalle)**.

`docs/PROYECTO.md` prevé BullMQ desde el principio y hay un dashboard `bullmq.json` en Grafana, pero no hay ninguna cola en el código.

**Qué hacer.** Introducir BullMQ sobre el Redis existente para webhooks, notificaciones, extracción de memoria y liquidaciones de raid y torneo. Resuelve a la vez reintentos, reparto entre réplicas y la ejecución única de los crons (R-03).

### R-02 — Estado en memoria (Alto para escalar)

`DEPLOY.md` §4 lista tres elementos en memoria. Hay bastantes más:

| Dónde | Qué guarda |
|---|---|
| `sync/delta-sync.service.ts` | Versiones, estado, deltas y acciones aplicadas, sin límite |
| `presence/presence.service.ts`, `coop-care.service.ts` | Presencia, amistades, contadores de visitas |
| `spectator/spectator.service.ts` | Buffers de combate y suscripciones |
| `ai-router/fallback.service.ts` | Estado del circuit breaker |
| `ai/chat.service.ts` | Turnos de Hermes local, respuesta en curso, respaldo del límite |
| `ai/memory.service.ts` | Extracciones en curso |
| `battles/battles.service.ts` | Pelea en curso por usuario |
| `environmental/environmental.service.ts` | Último estado ambiental por usuario, sin limpieza |
| `missions/mission-tracking.service.ts` | Último aviso de progreso por usuario (este sí se vacía) |

El mapa de `environmental` crece con el número de usuarios y no se limpia nunca; junto con los de `sync`, es una fuga lenta de memoria con una sola réplica. Con varias, además, «una pelea a la vez» y «una respuesta en curso» dejan de cumplirse.

**Qué hacer.** Pasar a Redis con caducidad lo que deba compartirse (bloqueos con `SET NX PX`), acotar el resto con una caché LRU, y añadir el adaptador de Redis de Socket.IO antes de la segunda réplica.

### R-03 — Crons (Medio)

- `raid` consulta la base de datos cada minuto y `tournament` cada cinco, haya o no raid o torneo activo.
- `missions` tiene dos crons cada cinco minutos y uno diario; `chests` uno diario.
- Ninguno tiene bloqueo distribuido: con N réplicas se ejecutan N veces.

**Qué hacer.** Trabajos repetibles de BullMQ o un bloqueo en Redis por ejecución. El raid no necesita cron para liquidar: basta hacerlo en el ataque que deja la vida a cero, con el cron como red de seguridad cada pocos minutos.

### R-04 — Lecturas calientes sin caché ni paginación (Medio)

- `GET /public/leaderboard` ordena `Pet` por ELO con dos `include` en cada llamada ([public-api.controller.ts:28-33](../../backend/src/modules/webhooks/public-api.controller.ts)). El núcleo ya mantiene la clasificación en un ZSET de Redis (`leaderboard.service.ts`): reutilizarlo. Además incluye mascotas que nunca han peleado y bots, a diferencia de la clasificación del juego.
- `GET /public/events` hace `raid.findMany` sin límite ni filtro de estado, de modo que devuelve todos los raids históricos.
- `tournament.standings` carga todas las inscripciones con su mascota sin paginar.
- `modding.workshop` busca con `contains` insensible a mayúsculas, que no usa índice. Con volumen hará falta un índice trigram (`pg_trgm`). Usa paginación por `skip`, que se degrada en páginas altas.
- `raid.getCurrent`, `tournament.getCurrent` y `seasons.getProgress` hacen de dos a cuatro consultas por llamada para datos que cambian poco: caché de 5 a 30 segundos en Redis.
- `device-fingerprint.verify` sin Redis carga todas las filas de `AuditLog` de una huella para contarlas en memoria; debe ser un `count` con `distinct`.

El esquema tiene índices para las consultas principales que he revisado (`Pet.elo`, `Gift` por remitente y receptor, `Battle` por mascota y fecha, `AuditLog` por usuario). No he encontrado índices ausentes evidentes más allá de la búsqueda de mods.

### R-05 — Claves de Redis sin caducidad (Medio)

Crecen indefinidamente: `apikey:rl:{id}:{minuto}` y `apikey:lastused:{id}:{minuto}` (una por key y minuto), `modding:publish:{usuario}:{día}` y `fp:{huella}`. Con `appendonly yes` además engordan el fichero AOF. Todas necesitan `EXPIRE`; para los límites, usar `AuthThrottleService.hitFixed`, que ya lo hace bien.

### R-06 — Imagen y arranque (Bajo)

- La imagen copia el workspace completo con dependencias de desarrollo. Una etapa final con `pnpm deploy --prod` y solo el CLI de Prisma reduciría tamaño y superficie.
- `migrate deploy` se ejecuta en cada arranque del contenedor. `DEPLOY.md` ya avisa de moverlo a un job con varias réplicas; conviene hacerlo antes de necesitarlo.
- El seed en producción usa `ts-node`; compilarlo junto al resto evita llevar el compilador a la imagen.
- El Dockerfile usa `node:22-slim` y la documentación indica Node 24 LTS.

### R-07 — Observabilidad y medición (Bajo)

- El worker del edge acumula cada observación en un array global sin límite ([worker.ts:28](../../edge/worker.ts)); debe agregar en buckets al registrar.
- Las pruebas de carga de `DEPLOY.md` §7 solo cubren lecturas. Faltan las rutas que más pesan: `matchmake` (simulación más varias escrituras), apertura de cofres, `feed` y chat por SSE con muchas conexiones abiertas.
- Con `OTEL_TRACES_SAMPLER_ARG=0.15` y spans de base de datos y Redis en cada petición, conviene medir el coste de la instrumentación con y sin OTLP antes de fijar el muestreo.

## 5. Calidad y mantenimiento

### C-01 — Documentación y versiones desalineadas (Medio)

| Documento | Dice | Realidad |
|---|---|---|
| README, ROADMAP | 33 features implementadas y con tests | Ver F-01 a F-04 |
| README | Android en `mobile/android/` | Existen también `android/` e `ios/` vacíos en la raíz |
| PROYECTO §2 | PostgreSQL 18, Redis 8, Node 24, Prisma 8 o 7 | Compose: PostgreSQL 17 y Redis 7. Dockerfile: Node 22. Prisma 6.19 |
| PROYECTO §5.1 | Módulos `subscriptions`, `leveling`, `raids`, `tournaments` | No existen los dos primeros; los otros se llaman `raid` y `tournament` |
| PROYECTO §3, §5.1 | BullMQ para notificaciones | No hay colas |
| ROADMAP Fase 5 | Ruta `C:	` (con un tabulador) | Errata: era `C:\t` |
| API.md | Solo documenta el núcleo y `environmental` | Faltan todas las rutas de la Fase 7 |
| PROYECTO §9 | Casillas de las fases 0 a 6 sin marcar | ROADMAP las da por completadas |

Dos estilos de módulo conviven: `src/missions` y `src/achievements` en la raíz, el resto en `src/modules`. Los controladores nuevos mezclan mensajes de error en inglés y en español.

### C-02 — Ficheros sobrantes en el repositorio (Bajo)

Están versionados en la raíz: `export-err.txt`, `jest-ascii.txt`, `jest-assets.txt`, `jest-out.txt`, `jest-sim-a.json`, `jest-sim-b.json`, `jest2.txt` a `jest6.txt` y `missions-test-out.txt`. Son salidas de ejecuciones de tests. Hay que borrarlos y añadir el patrón a `.gitignore`. También hay un `.env` en la raíz (ignorado por git, correcto) junto a la instrucción del README de copiarlo a `backend/.env`.

### C-03 — Patrones a consolidar (Bajo)

El código nuevo reimplementa cosas que el núcleo ya tiene resueltas. Unificarlas reduce errores y código:

| Necesidad | Implementación a reutilizar | Duplicados a eliminar |
|---|---|---|
| Cobro atómico | `chests.service.ts` (extraer a un servicio de monedero) | seasons, habitat, adventure, genes, tournament |
| Límite de frecuencia | `AuthThrottleService.hitFixed` | api-key, modding |
| Petición saliente segura | `ai/pinned-fetch.ts` | webhooks |
| Rotación de refresh | `auth.service.ts` | `security/token-rotation.service.ts` |
| Reclamar una sesión una sola vez | `updateMany` condicionado de `cooking.submit` | gifting, group-feeding, raid, tournament |
| Luchador a partir de mascota | `battlesService.fighterFromPet` | tournament |
| Validación de entrada | zod, como en `auth/dto` | 21 módulos sin validar |
| Datos de juego | `GameDataService` | `require` directo en seasons y habitat |

## 6. Plan propuesto

**Paso 1 — Que lo declarado sea cierto (pocos días).**
F-01 (migración y comprobación en CI), F-02 (prefijos), C-02 (limpieza), regenerar OpenAPI (F-09) y corregir README y ROADMAP con el estado real de cada feature (F-03, F-04, C-01).

**Paso 2 — Red de seguridad.**
Un e2e de camino feliz por módulo. Servicio de monedero y validación zod compartidos (C-03). Con esto se cierran también los hallazgos S-03, S-05 y S-10 del informe de seguridad.

**Paso 3 — Cerrar el ciclo de juego con lo que ya es sólido.**
Interfaz en escritorio y Android para misiones, cofres, logros y vínculo. Recompensas de fin de temporada. Recuperación de contraseña.

**Paso 4 — Infraestructura para crecer.**
BullMQ (R-01, R-03), estado compartido en Redis y adaptador de Socket.IO (R-02), cachés de lectura (R-04), pruebas de carga de escritura (R-07).

**Paso 5 — Features de las oleadas 2 y 3, de una en una.**
Cada una con migración, tests, interfaz y revisión de seguridad antes de marcarla como completada. Orden sugerido: temporadas y hábitat, raid, torneo, regalos; después el resto según datos de uso. Sync offline, spectator, E2E y modding necesitan rediseño antes de retomarse.
