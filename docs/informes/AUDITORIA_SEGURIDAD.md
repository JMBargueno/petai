# PetAI — Auditoría de seguridad

- **Fecha**: 14 de noviembre de 2026
- **Commit revisado**: `8899ab3` (`main`, al día con `origin/main`)
- **Alcance**: `backend/`, `edge/`, `desktop/`, `mobile/android/`, `docker-compose.prod.yml`, `backend/Dockerfile`, `.github/workflows/ci.yml`, y la documentación (`README.md`, `docs/`).
- **Método**: revisión de código por lectura. No se ha ejecutado ningún ataque ni se ha levantado el servidor. Cada hallazgo cita el fichero y la línea leídos; los que dependen de una condición que no he podido comprobar llevan la marca **(a verificar)**.
- **Datos ejecutados**: `pnpm audit --prod` → sin vulnerabilidades conocidas. `pnpm backend:test` → 48 suites y 592 tests en verde (tras regenerar el cliente de Prisma, que estaba desfasado en local). `tsc --noEmit` → sin errores.

## 1. Conclusión

El núcleo original (auth, pets, tienda, minijuegos, arena, chat IA) está bien protegido y coincide con lo que afirma `docs/DEPLOY.md` §8: Argon2id, refresh rotatorio atómico, SSRF con conexión fijada a la IP validada, keys de IA cifradas con AAD, validación con zod y arranque bloqueado con secretos por defecto.

Las 33 features de la Fase 7 no mantienen ese nivel. Los módulos de las oleadas 2 y 3 no validan la entrada, no tienen ningún test, y varios reimplementan peor algo que el núcleo ya resolvía (SSRF, rotación de tokens, cobro atómico). El resumen de `DEPLOY.md` §8 ya no describe el estado real del código.

Tres cosas hay que resolver antes de cualquier despliegue público:

1. El refresh «fast-path» del edge anula la revocación de sesiones (S-01).
2. El webhook permite SSRF hacia la red interna (S-02).
3. Varias operaciones económicas permiten duplicar objetos o recursos con peticiones simultáneas (S-03, S-04, S-05).

## 2. Resumen de hallazgos

| ID | Severidad | Hallazgo | Dónde |
|---|---|---|---|
| S-01 | Crítica (si se despliega el edge) | El refresh fast-path es un token de 7 días que no se puede revocar | `edge/worker.ts`, `auth.service.ts` |
| S-02 | Alta | SSRF en webhooks: sin resolución DNS, IPv6 sin filtrar, redirecciones seguidas | `webhooks.service.ts` |
| S-03 | Alta | Duplicación de objetos al aceptar o rechazar un regalo en paralelo | `gifting.service.ts` |
| S-04 | Alta | Raid: ataques ilimitados por el coste de uno y sin límite diario propio | `raid.service.ts` |
| S-05 | Alta | Cobros no atómicos: saldo negativo y cobro sin entrega | seasons, habitat, adventure, genes, tournament |
| S-06 | Alta | Voz (STT/TTS) usa la key del servidor sin cuota por usuario | `voice/` |
| S-07 | Alta | Sync offline guarda todo en memoria sin límite y con estado compartido entre usuarios | `delta-sync.service.ts` |
| S-08 | Media | DevKit sin autenticación, activo siempre que `NODE_ENV` no sea `production` | `app.module.ts`, `dev/` |
| S-09 | Media | Escritorio: CSP desactivada, tokens en `localStorage` y permiso HTTP a cualquier host | `tauri.conf.json`, `capabilities/default.json` |
| S-10 | Media | Los módulos nuevos no validan el cuerpo de las peticiones | 23 módulos |
| S-11 | Media | Sandbox de mods por lista negra de regex; URLs de mods sin validar | `sandbox.service.ts`, `modding.service.ts` |
| S-12 | Media | Recompensas afirmadas por el cliente (cocina, reconciliación, group feeding) | cooking, reengagement, gifting |
| S-13 | Media | `SecurityModule`: rotación no atómica, IP de auditoría falsificable, E2E sin efecto real | `security/` |
| S-14 | Media | Pagos de raid y torneo no idempotentes; crons sin bloqueo entre réplicas | raid, tournament |
| S-15 | Media | Presencia de cualquier usuario visible para cualquier otro | `presence.controller.ts` |
| S-16 | Baja | API keys: límite con carrera, claves Redis sin caducidad, se devuelve el hash | `api-key.service.ts` |
| S-17 | Baja | Un solo usuario puede ocultar cualquier mod con tres reportes | `modding.service.ts` |
| S-18 | Baja | API pública expone el nombre del dueño sin opt-in | `public-api.controller.ts` |
| S-19 | Baja | Mensajes de error del proveedor devueltos o registrados tal cual | voice, ai-router |
| S-20 | Baja | Imágenes `:latest` en producción y dependencias de desarrollo en la imagen | `docker-compose.prod.yml`, `Dockerfile` |
| S-21 | Informativa | Documentación de seguridad desfasada respecto al código | `DEPLOY.md`, `spec-26`, README |

## 3. Hallazgos en detalle

### S-01 — Refresh fast-path no revocable (Crítica si se despliega el edge)

**Qué pasa.** Cada login, registro o refresh devuelve, además del refresh normal, un `refreshFastPath`: un JWT RS256 con 7 días de vida ([auth.service.ts:249-272](../../backend/src/modules/auth/auth.service.ts)). El worker del edge lo verifica solo contra el JWKS y emite un access token sin consultar la base de datos ([worker.ts:94-107](../../edge/worker.ts)). Además devuelve el mismo token, sin rotarlo.

**Consecuencia.** Quien obtenga ese token una vez puede generar access tokens durante 7 días. `logout`, `logout-all`, el cambio de contraseña y la detección de reutilización no le afectan, porque todo eso vive en la tabla `RefreshToken` que el edge no mira. El comentario del código lo reconoce («la revocación dura sigue en origin»), pero en la práctica el origin acepta cualquier access token firmado con `JWT_ACCESS_SECRET`.

**Agravantes.**
- El escritorio guarda este token en `localStorage` ([api.ts:22](../../desktop/src/lib/api.ts)), ver S-09.
- El worker necesita `JWT_ACCESS_SECRET`, así que el secreto que firma todas las sesiones pasa a vivir también en Cloudflare.
- En producción sin `JWT_FASTPATH_*_KEY` se genera un par RSA efímero por proceso ([fast-path-jwt.ts:35](../../backend/src/modules/auth/fast-path-jwt.ts)); `productionProblems()` no lo detecta. Con varias réplicas cada una firma con una clave distinta.

**Arreglo.** Opciones, de más a menos recomendable:
1. Eliminar el fast-path. El refresh ocurre una vez cada 15 minutos por dispositivo; ahorrar una consulta indexada no compensa perder la revocación.
2. Si se mantiene: vida de minutos (no días), `jti` consultado en una lista de revocación en KV/Redis accesible desde el edge, y un `tokenVersion` por usuario que `logout-all` y el cambio de contraseña incrementen.

Mientras tanto, no desplegar `edge/` y dejar de emitir `refreshFastPath`.

### S-02 — SSRF en webhooks (Alta)

`validateUrl` ([webhooks.service.ts:207-240](../../backend/src/modules/webhooks/webhooks.service.ts)) solo mira el texto del host:

- **No resuelve DNS.** Un dominio propio que apunte a `127.0.0.1`, `10.x` o `169.254.169.254` pasa la validación.
- **IPv6 sin filtrar.** `URL.hostname` devuelve las IPv6 entre corchetes (`[::1]`), `isIP('[::1]')` da 0 y la comprobación se salta entera. Aunque no fuera así, solo se cubren `::1` y `fe80`; faltan `fc00::/7`, `::ffff:127.0.0.1`, NAT64 y 6to4.
- **Faltan rangos IPv4**: `0.0.0.0/8`, `100.64.0.0/10`, `198.18.0.0/15`.
- **Sigue redirecciones.** `fetch` usa `redirect: 'follow'` por defecto ([línea 142](../../backend/src/modules/webhooks/webhooks.service.ts)): un host externo válido puede redirigir a una dirección interna.
- **Oráculo.** `POST /webhooks/:id/test` devuelve el `statusCode` obtenido, lo que permite sondear puertos y servicios internos.

En `docker-compose.prod.yml` el backend comparte red con Redis (sin contraseña), Prometheus, Grafana y Alertmanager. La petición es un POST con cuerpo JSON fijo, lo que limita el daño pero no lo elimina.

**Arreglo.** El núcleo ya tiene la solución: reutilizar la validación de URL del proveedor de IA y `pinnedFetch` de [ai/pinned-fetch.ts](../../backend/src/modules/ai/pinned-fetch.ts), que resuelve, filtra rangos (incluidas las IPv4 embebidas en IPv6) y fija la conexión a la IP validada. Añadir `redirect: 'manual'` y no devolver el código de estado en `test`.

Dos problemas operativos en el mismo fichero:
- `deliver` reintenta dentro de la propia petición con esperas de 1 s, 5 s y 30 s. `test` puede tener una conexión HTTP abierta más de 70 s, y `dispatch` bloquea a quien lo llame. Debe ir a una cola.
- El secreto HMAC se guarda en claro. Conviene cifrarlo con `KeyCryptoService`, igual que las keys de IA.

### S-03 — Duplicación de objetos en regalos (Alta)

`accept` y `reject` leen el regalo, comprueban `status === 'pending'` y después, en una transacción aparte, entregan el objeto y marcan el regalo como resuelto ([gifting.service.ts:74-109](../../backend/src/modules/gifting/gifting.service.ts)). La actualización no condiciona por estado.

Con dos peticiones simultáneas ambas ven `pending` y ambas entregan:
- dos `accept` → el receptor recibe el objeto dos veces;
- un `accept` y un `reject` → lo reciben el receptor y el remitente.

Dos cuentas coordinadas pueden multiplicar así cualquier objeto regalable.

**Arreglo.** Dentro de la transacción, reclamar primero con `updateMany({ where: { id, receiverId, status: 'pending' }, data: {...} })` y continuar solo si `count === 1`. Es el patrón que ya usan `chests.service.ts` y `cooking.service.ts`.

Además:
- `qty` no se valida como entero: `"abc"` produce `NaN` y `1.5` un error de Prisma (500).
- Los regalos caducan (`expiresAt`) pero nada devuelve el objeto al remitente ni impide aceptar uno caducado. No hay ningún cron en el módulo.
- Los límites diarios se cuentan fuera de la transacción.

### S-04 — Raid: ataques casi gratuitos y sin límite propio (Alta)

En [raid.service.ts:62-115](../../backend/src/modules/raid/raid.service.ts):

- **Energía no atómica.** Se lee `pet.energy`, se simula el combate y se escribe `energy: Math.max(0, pet.energy - coste)` (línea 88). Veinte peticiones en paralelo leen la misma energía y hacen veinte ataques pagando uno. El mismo patrón está en [cooking.service.ts:57](../../backend/src/modules/cooking/cooking.service.ts).
- **Límite diario equivocado.** Se usa `battlesInLastDay`, que cuenta peleas de la arena (línea 69). Los ataques al raid no crean filas `Battle`, así que no cuentan: el único freno es la energía, que ya hemos visto que se salta.

El reparto es de 5000 gemas proporcional al daño, de modo que esto se convierte directamente en moneda premium.

**Arreglo.** Descontar la energía con `updateMany({ where: { id, energy: { gte: coste } }, data: { energy: { decrement: coste } } })` antes de simular, y contar los ataques del día sobre `RaidParticipant` o una tabla propia.

### S-05 — Cobros no atómicos (Alta)

Cinco puntos comprueban el saldo y luego descuentan sin condición:

| Dónde | Problema añadido |
|---|---|
| [seasons.service.ts:122-134](../../backend/src/modules/seasons/seasons.service.ts) | Sin transacción: si falla la creación del pase, las gemas ya se han descontado. `SeasonPass` tiene clave foránea a `Season` y `ensureSeasonRecord()` no se llama desde ningún sitio, así que la compra puede fallar siempre después de cobrar **(a verificar: salvo que el seed cree la fila)**. |
| [habitat.service.ts:79-92](../../backend/src/modules/habitat/habitat.service.ts) | Cobra antes de comprobar que el hábitat existe y que la casilla está libre. Si esas comprobaciones fallan, el usuario ha pagado y no recibe nada. |
| [adventure.service.ts:39-47](../../backend/src/modules/adventure/adventure.service.ts) | Cobra antes de generar el tema con el LLM; si el proveedor falla no hay reembolso. |
| [genes.service.ts:80-94](../../backend/src/modules/genes/genes.service.ts) | Descuento sin condición dentro de la transacción. |
| [tournament.service.ts:53-58](../../backend/src/modules/tournament/tournament.service.ts) | Descuento sin condición. |

Con peticiones simultáneas (por ejemplo, comprar un mueble y el pase a la vez) el saldo queda en negativo: el usuario gasta más de lo que tiene.

**Arreglo.** Extraer el patrón de [chests.service.ts:301-313](../../backend/src/modules/chests/chests.service.ts) a un único servicio de monedero (`debit(tx, userId, moneda, importe)` con `updateMany` condicionado) y usarlo en todos los cobros, con la entrega en la misma transacción. Añadir en PostgreSQL `CHECK (coins >= 0 AND gems >= 0)` como red de seguridad.

### S-06 — Voz con la key del servidor y sin cuota (Alta si se configura la key)

`POST /voice/transcribe` y `POST /voice/speak` usan `WHISPER_API_KEY`/`OPENAI_API_KEY` y `ELEVENLABS_API_KEY` del servidor ([stt.service.ts:25-27](../../backend/src/modules/voice/stt.service.ts)). No hay cuota por usuario, ni límite propio, ni moderación del texto. El único freno es el límite global de 300 peticiones por minuto. Cualquier cuenta registrada puede generar un coste considerable en esas APIs.

El chat de texto sí está bien resuelto (BYOK, cuota mensual, 20 mensajes por minuto, moderación); la voz no pasa por nada de eso.

**Arreglo.** Aplicar la misma cuota mensual y el mismo límite por minuto que al chat, moderar el texto de `speak` y limitar la duración del audio. Mejor aún: usar la key del usuario cuando exista.

Nota: estas variables (y `LLM_*`, `ELEVENLABS_*`, `CDN_BASE_URL`, `AI_MAX_*`) no están en `envSchema` ni se revisan en `productionProblems()`.

### S-07 — Sync offline: memoria sin límite y estado compartido (Alta)

[delta-sync.service.ts:33-36](../../backend/src/modules/sync/delta-sync.service.ts) guarda todo en cuatro estructuras globales del proceso, sin caducidad ni tope:

- **Agotamiento de memoria.** Cada acción aceptada guarda sus `args` (contenido libre) para siempre. Con 500 acciones por petición y 300 peticiones por minuto, una sola cuenta puede tumbar el proceso.
- **Interferencia entre usuarios.** `appliedActions` es un único conjunto global de identificadores. Si un usuario envía un `id`, ese `id` queda rechazado en silencio para todos los demás.
- **Sin comprobación de propiedad.** No se verifica que `petId` sea del usuario. Hoy no tiene efecto porque el estado es ficticio (no toca la tabla `Pet`), pero es una trampa para quien conecte esto a datos reales.

Mismo patrón, con menos impacto, en `presence/coop-care.service.ts` y `spectator/spectator.service.ts`.

**Arreglo.** Desactivar el módulo hasta que tenga persistencia real (ver el informe de funcionalidad, F-04). Si se mantiene: clave por usuario, límites de tamaño y caducidad en Redis.

### S-08 — DevKit sin autenticación (Media)

`/dev/hot-reload`, `/dev/seed`, `/dev/action` y `/dev/game-data` no tienen guard ([dev.controller.ts](../../backend/src/modules/dev/dev.controller.ts)). Permiten cambiar el balance del juego en caliente, crear usuarios y actuar sobre la mascota de cualquiera. El módulo se registra siempre que `process.env.NODE_ENV !== 'production'` ([app.module.ts:57](../../backend/src/app.module.ts)).

- `NODE_ENV` vale `development` por defecto. Un entorno de staging o de pruebas accesible desde internet lo expone entero.
- La condición se evalúa al importar el módulo, antes de que `ConfigModule` cargue `.env`. Si alguien define `NODE_ENV=production` solo en el fichero `.env`, el resto de la aplicación puede verse en producción mientras el DevKit sigue activo **(a verificar; con Docker no ocurre porque el Dockerfile y el compose lo fijan como variable real)**.

**Arreglo.** Activación explícita (`DEVKIT_ENABLED=true`, rechazada en producción por `productionProblems`) y, además, un guard que exija origen local o un token.

### S-09 — Escritorio: CSP desactivada y tokens al alcance del webview (Media)

- `"csp": null` en [tauri.conf.json](../../desktop/src-tauri/tauri.conf.json). La spec 26 da por hecho que la CSP está activa.
- Access token, refresh token y fast-path en `localStorage` ([api.ts:19-22](../../desktop/src/lib/api.ts)). `docs/PROYECTO.md` §8 dice que van al llavero del sistema.
- La capability permite `http:default` hacia `https://*/**` y `shell:allow-open` ([capabilities/default.json](../../desktop/src-tauri/capabilities/default.json)).
- Cinco usos de `{@html}` con SVG (`PetView.svelte`, `ControlPanel.svelte`, `ReplayViewer.svelte`). Hoy son recursos locales, pero el módulo de mods prevé sprites SVG subidos por usuarios.

Cualquier inyección de HTML en el webview se convierte en robo de sesión y en peticiones a cualquier host sin CORS. No he encontrado una inyección explotable hoy; es falta de defensa en profundidad, y pasa a ser grave en cuanto se rendericen sprites de mods.

**Arreglo.** CSP estricta (`default-src 'self'`; `connect-src` limitado a la API y a loopback), tokens en el llavero del sistema, y `http` limitado al host de la API y a `127.0.0.1` para Hermes.

### S-10 — Los módulos nuevos no validan la entrada (Media)

No hay `ValidationPipe` global. El núcleo valida con zod en cada servicio, pero de los 23 módulos de las oleadas 2 y 3 solo `adventure` y `voice` usan zod. El resto recibe `@Body()` tipado con interfaces de TypeScript, que no existen en ejecución. Ejemplos:

- [security.controller.ts:60](../../backend/src/modules/security/security.controller.ts): `FingerprintFeatures` sin validar.
- [modding.controller.ts:29](../../backend/src/modules/modding/modding.controller.ts): `name`, `description` y `data` sin límite de tamaño ni de tipo; `data` se guarda tal cual.
- [sync.controller.ts:39](../../backend/src/modules/sync/sync.controller.ts) y [spectator.controller.ts:37](../../backend/src/modules/spectator/spectator.controller.ts): `throw new Error(...)` ante entrada inválida, que el cliente recibe como 500.

**Arreglo.** Un pipe de zod reutilizable y un esquema por endpoint. Es el cambio con mejor relación entre esfuerzo y riesgo eliminado.

### S-11 — Sandbox de mods (Media)

[sandbox.service.ts](../../backend/src/modules/modding/sandbox.service.ts) filtra con listas negras de expresiones regulares:

- **SVG.** Se evita con entidades (`java&#115;cript:`), `href` sin comillas, `<style>` con `@import` o `url(...)`, `<use>` o `<image>` con `data:image/svg+xml`. Hace falta un saneador con lista blanca (DOMPurify con perfil SVG o equivalente).
- **JS.** Se evita con `Function('...')()` sin `new`, `(0,eval)(...)`, `self['fe'+'tch']`, `importScripts`, `WebSocket` o `globalThis`. Un filtro de texto no puede aislar código; el aislamiento real tiene que estar en el cliente (iframe con `sandbox` y CSP, o Worker sin acceso a red).
- **URLs.** `spriteUrl` y `minigameUrl` se aceptan sin validar esquema ni host ([modding.service.ts:86-87](../../backend/src/modules/modding/modding.service.ts)), y `update` permite cambiarlas después.

Además, el sprite y el código se validan pero no se guardan: `spriteUrl` queda como `inline://usuario/nombre`, que no resuelve a nada. El riesgo es latente porque ningún cliente carga mods todavía.

### S-12 — Recompensas afirmadas por el cliente (Media)

- **Cocina.** `submit` acepta `correctOrder: true` del cliente y concede el buff de combate completo y 40 monedas, sin duración mínima ni comprobación contra la semilla ([cooking.service.ts:69-97](../../backend/src/modules/cooking/cooking.service.ts)). Los minijuegos del núcleo sí validan duración y puntuación máxima plausible.
- **Reconciliación.** `clicks`, `chat` y `actions` los declara el cliente y dan 500 monedas ([reengagement.service.ts:208-236](../../backend/src/modules/reengagement/reengagement.service.ts)).
- **Group feeding.** `completeMinigame` no valida ningún juego. Actualiza el JSON de participantes leyendo y reescribiendo (se pierden actualizaciones simultáneas) y `finalizeRoom` comprueba `rewardsDistributed` fuera de la transacción, así que dos finalizaciones a la vez reparten dos veces ([group-feeding.service.ts:96-160](../../backend/src/modules/gifting/group-feeding.service.ts)).
- **Care package.** Crea 50 monedas para el receptor; el límite diario se cuenta fuera de la transacción.

### S-13 — `SecurityModule` (Media)

- **Rotación duplicada y no atómica.** [token-rotation.service.ts:29-73](../../backend/src/modules/security/token-rotation.service.ts) reimplementa la rotación que `auth.service` ya hace bien. Lee, comprueba y revoca en pasos separados: dos peticiones simultáneas obtienen dos tokens válidos. Emite tokens con otro formato (`petai_refresh_…`) que `/auth/refresh` no acepta, y no devuelve access token. Sobra: debería eliminarse.
- **IP falsificable.** `clientIp` toma `X-Forwarded-For` directamente ([security.controller.ts:94-98](../../backend/src/modules/security/security.controller.ts)) en vez de `req.ip`, que ya respeta `TRUST_PROXY`. El registro de auditoría se puede falsear con una cabecera.
- **Fingerprint.** Lo calcula el servidor a partir de datos que envía el cliente, así que un bot manda valores distintos por cuenta. El conjunto `fp:*` en Redis no caduca, y sin Redis el respaldo carga todas las filas de `AuditLog` con esa huella.
- **E2E.** Solo se guarda una clave pública tras una validación de formato que acepta cualquier cadena en base64. `ChatService` no la usa. La respuesta devuelve `e2eEnabled: true`, lo cual es falso: el chat sigue pasando en claro por el servidor.
- **Sin implementar** respecto a la spec 26: `DELETE /account` (borrado RGPD), límite por dispositivo, y auditoría de login y refresh en el flujo real de `auth`.

### S-14 — Pagos no idempotentes y crons sin bloqueo (Media)

- `settle` del raid reparte gemas y después marca el raid como liquidado, sin transacción común ni reclamación previa ([raid.service.ts:182-195](../../backend/src/modules/raid/raid.service.ts)). Lo invocan el ataque que mata al jefe y un cron cada minuto: pueden coincidir.
- `payOut` del torneo comprueba el estado y actualiza en pasos separados ([tournament.service.ts:145-160](../../backend/src/modules/tournament/tournament.service.ts)).
- `getActiveRaid` y `getCurrent` crean el raid o el torneo si no existe: dos peticiones simultáneas crean dos.
- Ningún `@Cron` usa bloqueo distribuido. Con dos réplicas todos se ejecutan dos veces.

**Arreglo.** Reclamar el cambio de estado con `updateMany` condicionado y pagar solo si `count === 1`, todo en una transacción. Bloqueo en Redis (`SET NX PX`) para los crons.

### S-15 — Presencia visible para cualquiera (Media)

`GET /presence/:userId` devuelve los dispositivos activos y su plataforma de cualquier usuario a cualquier cuenta autenticada ([presence.controller.ts:38-46](../../backend/src/modules/presence/presence.controller.ts)). Debe limitarse al propio usuario o a amistades aceptadas.

### S-16 a S-20 — Severidad baja

- **S-16 · API keys** ([api-key.service.ts](../../backend/src/modules/webhooks/api-key.service.ts)). El límite hace `GET` y luego `INCR` (carrera) y nunca pone caducidad: se crea una clave Redis por key y minuto para siempre. Lo mismo ocurre con `apikey:lastused:*` y `modding:publish:*`. Usar `INCR` + `EXPIRE` atómico, o `AuthThrottleService.hitFixed`, que ya existe. Sin Redis no hay límite. `list` devuelve `keyHash` sin necesidad. Las keys no caducan.
- **S-17 · Reportes de mods.** `ModReport` no tiene unicidad por usuario: una cuenta que reporte tres veces oculta cualquier mod ([modding.service.ts:168-189](../../backend/src/modules/modding/modding.service.ts)).
- **S-18 · API pública.** `/public/leaderboard` devuelve `displayName` del dueño de cada mascota sin opt-in, mientras que `/public/pets/:id` sí lo exige. La preferencia se guarda dentro de `notificationPrefs`, que no es su sitio.
- **S-19 · Errores del proveedor.** STT, TTS y ai-router registran o propagan el cuerpo de error del proveedor ([stt.service.ts:59-61](../../backend/src/modules/voice/stt.service.ts), [generic.provider.ts:60](../../backend/src/modules/ai-router/providers/generic.provider.ts)). El núcleo evita esto a propósito.
- **S-20 · Infraestructura.** Prometheus, Grafana y Alertmanager con etiqueta `:latest`. La imagen de producción incluye dependencias de desarrollo (riesgo ya aceptado en `DEPLOY.md`). Redis sin contraseña, aceptable mientras siga solo en la red interna, pero agrava S-02. El worker del edge expone `/__metrics` sin autenticación.

### S-21 — Documentación desfasada (Informativa)

| Documento | Dice | Código |
|---|---|---|
| `DEPLOY.md` §8 | El escritorio no usa el refresh token | Lo usa ([api.ts:89-140](../../desktop/src/lib/api.ts)) |
| `PROYECTO.md` §8 | Token en el llavero del sistema | `localStorage` |
| `spec-26` | CSP de Tauri activa por defecto | `csp: null` |
| README (026) | «E2E encryption en chat» | Solo se guarda una clave pública |
| README | Las 33 features «implementadas y con tests» | 23 módulos sin ningún test |
| `DEPLOY.md` §8 | Resumen de auditoría | No cubre la Fase 7 ni el edge |

## 4. Lo que está bien

Para que el informe no dé una imagen distorsionada, esto se ha revisado y es correcto:

- `RateLimitGuard` global que verifica la firma del JWT antes de contar por usuario.
- Validación de entorno con arranque bloqueado en producción.
- CORS por lista de orígenes, también en Socket.IO; `helmet`; Swagger desactivado en producción.
- Gateway de tiempo real: usuario tomado del JWT, tope de cinco conexiones y corte al caducar el token.
- `assets`: sirve solo claves de un índice precalculado, sin acceso a rutas arbitrarias.
- `chests`: cobro atómico con test de carrera (`chests-race.e2e-spec.ts`).
- Android: `allowBackup="false"`, sin tráfico en claro en release y minificado activo. (El cifrado de tokens con Keystore que indica el ROADMAP no se ha comprobado en el código.)
- CI: permisos de solo lectura, acciones de terceros fijadas por SHA, `pnpm audit` en cada cambio.
- Todas las consultas pasan por Prisma; no hay SQL en crudo ni ejecución de código dinámico en el servidor.

## 5. Orden de actuación recomendado

1. **Antes de cualquier despliegue**: S-01 (no desplegar el edge o quitar el fast-path), S-02, S-08.
2. **Antes de abrir registro público**: S-03, S-04, S-05, S-06, S-07, S-14.
3. **Siguiente iteración**: S-10 (zod en todos los módulos), S-09, S-12, S-13, S-15.
4. **Cuando se active el modding**: S-11 y S-17 son requisito previo.
5. **Mantenimiento**: S-16, S-18, S-19, S-20, S-21.

Añadir un test de carrera por cada operación económica, siguiendo el de cofres, y actualizar `DEPLOY.md` §8 cuando se cierren los puntos.

## 6. Fuera de alcance

- Pruebas dinámicas (pentest, fuzzing, carga).
- Compilación y análisis del binario de escritorio y del APK.
- Revisión línea a línea de `breeding`, `buddies`, `rituals`, `mood-theater`, `accessibility`, `training` y `habitat`: se han revisado sus puntos de cobro y recompensa, no el resto.
- iOS (no hay código).
