# PetAI — SDD de solución de hallazgos de la auditoría de seguridad

- **Documento**: Software Design Document (SDD) — diseño de las soluciones para los hallazgos del informe de auditoría.
- **Entrada**: [`docs/informes/AUDITORIA_SEGURIDAD.md`](AUDITORIA_SEGURIDAD.md) (21 hallazgos, S-01 a S-21).
- **Código de referencia**: `main` en commit `3eeec6a`. La auditoría se hizo sobre `8899ab3`; las líneas citadas en este SDD se han re-verificado contra `3eeec6a`.
- **Fecha**: 14 de noviembre de 2026.
- **Alcance**: `backend/`, `edge/`, `desktop/`, infraestructura (`docker-compose.prod.yml`, `backend/Dockerfile`) y documentación. iOS no tiene código y queda fuera.
- **Naturaleza**: documento de **diseño** (qué y cómo, listo para implementar), no la implementación. Cada hallazgo cita archivos reales y el patrón de referencia que hay que reutilizar.

## 1. Resumen y principio rector

El informe concluye que el núcleo (auth, pets, tienda, minijuegos, arena, chat IA) mantiene el estándar de seguridad (Argon2id, refresh rotatorio atómico, SSRF con conexión fijada a la IP validada, keys de IA cifradas con AAD, validación con zod y arranque bloqueado con secretos por defecto). Las 33 features de la Fase 7 (oleadas 2 y 3) no lo mantienen: no validan la entrada, no tienen tests, y varios reimplementan peor algo que el núcleo ya resolvía (SSRF, rotación de tokens, cobro atómico).

**Principio rector de este SDD:** no inventar soluciones nuevas; **reutilizar el patrón que el núcleo ya demuestra en producción** y, cuando un patrón se usa en varios sitios, **extraerlo a un componente compartido** y aplicarlo en todos. Componentes transversales y su patrón de referencia (verificado en `3eeec6a`):

| Componente transversal (nuevo) | Patrón de referencia (ya en el código) | Hallazgos que resuelve |
|---|---|---|
| `WalletService.debit/credit` (débito/abono atómico) | `chests.service.ts:301-323` (`updateMany` condicional + `count`) | S-03, S-04, S-05, S-12, S-14 |
| Bloqueo distribuido de crons (Redis `SET NX PX`) | `RedisService` (ya global en `AppModule`) | S-14 |
| `ZodValidationPipe` + un esquema por endpoint | zod ya usado en `auth`, `adventure`, `voice` | S-10 (refuerza S-11) |
| Fetch SSRF-safe (`resolveSafeBaseUrl` + `pinnedFetch`) | `ai/ssrf.ts` + `ai/pinned-fetch.ts` | S-02 |
| Cuota + rate-limit + moderación de IA | `ai/usage.service.ts`, `chat.service.ts`, `ai/moderation.ts` | S-06 |
| Test de concurrencia por operación económica | `backend/test/chests-race.e2e-spec.ts` | todas las operaciones económicas (S-03..S-05, S-12, S-14) |

Además, como red de seguridad, `CHECK (coins >= 0 AND gems >= 0)` en `User` y `CHECK (energy >= 0)` en `Pet` (ver §3.3).

## 2. Mapa de severidad y oleada de despliegue

Se alinea con el §5 del informe («orden de actuación recomendado»). Cada hallazgo indica en su sección la oleada a la que pertenece.

| Oleada | Cuándo | Severidad | Hallazgos | Componentes clave |
|---|---|---|---|---|
| **1 — Antes de cualquier despliegue** | inmediato | Crítica/Alta | S-01, S-02, S-08 | fetch SSRF-safe, `DevGuard`, gating del edge |
| **2 — Antes de abrir registro público** | alto | Alta | S-03, S-04, S-05, S-06, S-07, S-14 | `WalletService`, cron lock, cuota de voz, Redis por usuario |
| **3 — Siguiente iteración** | medio | Media | S-09, S-10, S-12, S-13, S-15 | `ZodValidationPipe`, keychain/CSP, ownership de presencia |
| **4 — Cuando se active el modding** | pre-requisito | Media | S-11, S-17 | sanitizer SVG, aislamiento JS, `@@unique(ModReport)` |
| **5 — Mantenimiento** | bajo | Baja/Info | S-16, S-18, S-19, S-20, S-21 | imágenes fijadas, sanitizado de errores, docs |

> S-11 y S-17 quedan diseñados en §3.5 pero solo se activan (oleada 4) cuando se despliegue el modding.

## 3. Soluciones por hallazgo

Cada hallazgo sigue la misma estructura: **Causa raíz** (líneas verificadas en `3eeec6a`) → **Diseño propuesto** (implementable, con métodos y llamadas a Prisma) → **Archivos afectados** → **Amenazas y casos límite** → **Tests** → **Rollout / migración**.


### 3.1 SesiÃ³n, tokens y edge (S-01, S-13, S-09)
#### S-01 — Refresh «fast-path» no revocable (Crítica si se despliega el edge)

**Causa raíz.**
- `AuthService.generateTokens` devuelve, además del refresh normal, `refreshFastPath` (`backend/src/modules/auth/auth.service.ts:249`).
- `issueFastPathRefreshToken` firma un JWT RS256 cuya vida es `JWT_REFRESH_EXPIRES_IN` (7 días por defecto) y no guarda nada en la tabla `RefreshToken` (`auth.service.ts:258-271`; `expiresIn` en línea 269). No hay `jti` consultable ni versión de token.
- El edge lo verifica stateless contra el JWKS y emite un access HS256 sin tocar la BD (`edge/worker.ts:74` detecta el path; `signAccessToken` en `worker.ts:54-63`), y devuelve el mismo fast-path sin rotarlo (`worker.ts:106-107`).
- El worker necesita `JWT_ACCESS_SECRET` en el entorno de Cloudflare (`worker.ts:22`): el secreto que firma todas las sesiones vive fuera del origin.
- En producción, sin `JWT_FASTPATH_PRIVATE_KEY`/`PUBLIC_KEY`, se genera un par RSA efímero por proceso (`backend/src/modules/auth/fast-path-jwt.ts:35`); `productionProblems()` (`backend/src/config/env.config.ts:81-110`) no lo detecta, así que con varias réplicas cada una firma con una clave distinta.
- El escritorio guarda este token en `localStorage` (`desktop/src/lib/api.ts:22`) y lo intenta primero en el refresh (`api.ts:99`), lo que amplifica S-09.

**Diseño propuesto.**
Decisión: mantener el fast-path del edge (conserva la meta de latencia p95 < 50 ms) pero hacerlo **acotado en tiempo y revocable**, y **bloquear el arranque en producción** si la clave del fast-path no está definida. Se reutiliza la rotación atómica ya correcta de `AuthService.refresh` (`auth.service.ts:138-141`) como fuente de verdad; el fast-path deja de ser una vía de sesión.

1. Vida corta e independiente. Nueva variable `JWT_FASTPATH_TTL` (string, p. ej. `10m`) en `env.config.ts`. En `issueFastPathRefreshToken`, sustituir `expiresIn: JWT_REFRESH_EXPIRES_IN` por `expiresIn: JWT_FASTPATH_TTL`. Aísla la vida del fast-path del refresh de base (7 días) y acota la ventana de daño a minutos, no a días.
2. Versión de token por usuario. Añadir al modelo `User` el campo `tokenVersion Int @default(0) @map("token_version")`. Incluir `tokenVersion` en los claims del fast-path (`issueFastPathRefreshToken` lee `user.tokenVersion`).
3. Revocación que llega al edge. Al revocar sesiones —`revokeAllSessions` (usada por `logoutAll`, `auth.service.ts:176-180`), `changePassword` (`auth.service.ts:209`) y la detección de reutilización en `refresh` (`auth.service.ts:150`)— hacer `user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } })` y publicar una marca de revocación en un store accesible desde el edge: Cloudflare KV namespace `FASTPATH_REVOCATION`, key `rev:<userId>`, valor = nueva `tokenVersion`, TTL = `JWT_FASTPATH_TTL` (basta con cubrir la vida máxima del fast-path). El edge, tras validar RS256+JWKS, hace un solo `KV.get('rev:' + sub)`; si existe y su valor es mayor que el `tokenVersion` del claim, rechaza y cae al fallback al origin (`worker.ts:118`). Es una única lectura KV (≈ 0 ms, sin BD), por lo que se conserva el objetivo de latencia. Si el KV falla, el path ya cae al origin (fallback transparente existente).
   - Para mantener la coherencia origen↔KV sin acoplar a una única réplica, la publicación a KV ocurre en el mismo método que incrementa `tokenVersion` (un único `publishRevocation(userId, version)` del nuevo `FastPathRevocationService`), idempotente.

4. Validación de arranque en producción. En `productionProblems()` añadir: si faltan `JWT_FASTPATH_PRIVATE_KEY` o `JWT_FASTPATH_PUBLIC_KEY` → problema ("el fast-path no puede arrancar en producción sin un par RSA persistente; evita pares efímeros por réplica que se divergen"). Reutiliza el patrón de acumulación de `problems` de `env.config.ts:81-110`.
5. Reducir el alcance de `JWT_ACCESS_SECRET` en el edge. El edge sigue firmando el access HS256 (necesario para el fast-path), pero el valor que vive en Cloudflare debe rotarse de forma independiente y no reutilizarse como secreto de nada más; documentarlo en `DEPLOY.md` §8. (Alternativa más fuerte: el edge solo verifica y devuelve un «ticket» que el origin canjea, sacrificando latencia; no recomendado.)
6. `edge/worker.ts`: en el path fast-path, no devolver el fast-path sin rotar de forma que se entienda como «refresco duradero»: la rotación de base la hace origin; el fast-path es de un solo uso por TTL. Añadir comentario explícito.
7. El endpoint `GET /v1/auth/jwks` (`backend/src/modules/auth/auth.controller.ts:23-30`) permanece y solo expone la clave pública (correcto).

Variables/config nuevas: `JWT_FASTPATH_TTL`; `JWT_FASTPATH_PRIVATE_KEY`, `JWT_FASTPATH_PUBLIC_KEY`, `JWT_FASTPATH_KID` (ya existen); más el KV namespace `FASTPATH_REVOCATION` por lado de Cloudflare.

**Archivos afectados.**
- `backend/src/modules/auth/auth.service.ts`
- `backend/src/modules/auth/fast-path-jwt.ts`
- `backend/src/modules/auth/fast-path-revocation.service.ts` (nuevo)
- `backend/src/modules/auth/auth.module.ts`
- `backend/src/modules/auth/auth.controller.ts`
- `backend/src/config/env.config.ts`
- `backend/prisma/schema.prisma` (campo `tokenVersion` en `User`)
- `edge/worker.ts`
- `edge/wrangler.toml` (o `wrangler.jsonc`): bind del KV `FASTPATH_REVOCATION`
- `desktop/src/lib/api.ts` (deja de depender del fast-path como «refresco»; ver S-09)

**Amenazas y casos límite.**
- Robo del fast-path: antes daba access tokens durante 7 días; ahora la ventana es `JWT_FASTPATH_TTL` y `logoutAll`/cambio de contraseña lo invalidan al instante vía KV.
- Réplicas divergentes: si varias réplicas firmaran con claves distintas (efímero) el edge rechazaría tokens de algunas; se elimina al exigir par persistente por env (bloqueo de arranque).
- KV no disponible o con lag: el fast-path cae al origin autoritativo (fallback), que aplica la revocación de base de datos. Peor caso = latencia, no pérdida de revocación.
- Reutilización del refresh de base: no cambia (ya es atómico); el fast-path no entra en la tabla `RefreshToken`.
- Retrocompatibilidad: los fast-path emitidos antes siguen válidos hasta su TTL; al renovarse, reciben la nueva `tokenVersion`.

**Tests.**
- Unit: `issueFastPathRefreshToken` firma con `expiresIn = JWT_FASTPATH_TTL` y claim `tokenVersion`; `FastPathRevocationService.publishRevocation` escribe `rev:<userId>` con el TTL correcto; `logoutAll`/`changePassword` incrementan `tokenVersion` (Prisma mock).
- Unit: `productionProblems()` falla en producción sin `JWT_FASTPATH_*_KEY`.
- E2e (edge): worker con KV sembrado — fast-path con `tokenVersion` desactualizado + marca de revocación presente → rechazo/fallback al origin; sin marca → 200 con access HS256 válido, verificable por `JwtAuthGuard` del origin.
- E2e: `POST /v1/auth/refresh` de base sigue rotando atómicamente (reutilización de un token ya canjeado → revocación total), de forma independiente al fast-path.

**Rollout / migración.**
- Migración de Prisma (no destructiva): `User.tokenVersion Int @default(0)` → `prisma migrate dev --name add_user_token_version` y `migrate deploy` en producción.
- Config: definir `JWT_FASTPATH_TTL` y un par `JWT_FASTPATH_*_KEY` persistente en los secretos del origen; crear el KV `FASTPATH_REVOCATION` en Cloudflare y añadir el bind en `wrangler`.
- Orden: desplegar origen (migración + env) → publicar el edge con KV → migrar el escritorio (S-09). Mientras el edge siga sin KV, mantenerlo fuera de producción (orden §5.1 de la auditoría).

#### S-13 — `SecurityModule` (Media)

**Causa raíz.**
- Rotación duplicada y no atómica: `TokenRotationService.rotateToken` hace `findUnique` → `update` → `create` en pasos separados (`backend/src/modules/security/token-rotation.service.ts:29-73`; `findUnique` línea 31, `update` línea 52, `create` línea 58). Dos peticiones simultáneas obtienen dos tokens. El token nuevo usa formato `petai_refresh_…` (línea 57) que `AuthService.refresh` (HS256 + tabla `RefreshToken`) no acepta, y no devuelve access token. Es redundante con la rotación atómica correcta de `AuthService.refresh` (`auth.service.ts:138-141`).
- IP falsificable: `SecurityController.clientIp` lee `X-Forwarded-For` a mano (`backend/src/modules/security/security.controller.ts:94-98`) en vez de `req.ip`, que respeta `trust proxy` ya configurado en `backend/src/main.ts:47`.
- Fingerprint declarado por el cliente y sin cota: `DeviceFingerprintService.verify` calcula el hash de features enviadas por el cliente (`device-fingerprint.service.ts:42-51`), escribe en un Set Redis `fp:*` sin caducidad (línea 66, sin `EXPIRE`) y, sin Redis, carga **todas** las filas de `AuditLog` con esa huella (líneas 72-78).
- E2E sin efecto real: `E2eEncryptionService.storePublicKey` valida el PEM solo por formato/regex que acepta cualquier base64 (`e2e-encryption.service.ts:65-77`) y devuelve `e2eEnabled: true` (línea 43), aunque `ChatService` no la usa.
- Sin implementar (spec 26): borrado RGPD `DELETE /account`, límite de dispositivos y auditoría de login/refresh en el flujo real de `auth`.

**Diseño propuesto.**

1. Eliminar la rotación duplicada. Borrar `TokenRotationService.rotateToken` y el endpoint `POST /security/rotate-token` (`security.controller.ts:33-46`). La rotación canónica es `AuthService.refresh`. Mantener `audit()`/`revokeAll()` como helpers pero moverlos a un `AuditService` compartido (`backend/src/modules/security/audit.service.ts`) y reutilizarlo desde `auth` (ver punto 6). Si se necesita un «rotar» por UX, debe llamar a `AuthService` y devolver access+refresh, no inventar formato.
2. IP correcta. Reemplazar `clientIp` por el mismo criterio de `auth.controller.ts:12`: `req.ip || req.socket?.remoteAddress || 'unknown'` (respeta `TRUST_PROXY`). Aplicar a `rotateToken` (si queda), `verify` y `audit`.
3. Fingerprint acotado y honesto.
   - Poner TTL al Set: tras `SADD fp:<fp>`, `EXPIRE fp:<fp> 30d` (constante `FP_TTL_MS`), para que no se acumule indefinidamente.
   - Si no hay Redis, acotar el fallback: `auditLog.findMany({ where: { fingerprint, createdAt: { gte: since30d } }, select: { userId: true }, take: 500 })` en vez de cargar todas las filas.
   - Declarar el fingerprint como **señal de detección, no control de ejecución**: no revoca ni bloquea por sí solo (evita false positives y que un bot lo esconda enviando valores distintos). El `score`/`flagged` queda solo para revisión.
4. E2E honesto y validación criptográfica real.
   - `validatePublicKey`: en vez del regex, parsear la clave con Node: reconstruir el SPKI (PEM → DER) y `crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })`, comprobando `asymmetricKeyType === 'ec'` y curva P-256 (`prime256v1`). Rechazar (400) si no es una public key P-256 válida.
   - Devolver un estado veraz: `keyStored: true`, `e2eEnabled: false` (hasta que `ChatService` implemente el ruteo). Sustituir `e2eEnabled` por `publicKeyStored` / `chatE2eReady` en la respuesta y en `getActiveKey`.

5. Límite de dispositivos. Nueva variable `AUTH_MAX_ACTIVE_SESSIONS` (int, p. ej. 5) en `env.config.ts`. En `AuthService.generateTokens`, tras crear el `RefreshToken`, contar las sesiones activas del usuario y, si exceden el límite, revocar la más antigua: `refreshToken.findMany({ where: { userId, revokedAt: null }, orderBy: { createdAt: 'asc' }, take: overflow })` → `refreshToken.updateMany({ where: { id: { in: ids } }, data: { revokedAt: now } })`.
6. Auditoría real de login/refresh. `AuditService.record(userId, event, { ip, userAgent, fingerprint?, metadata? })` (wrapper del `auditLog.create` ya usado en `token-rotation.service.ts:89-107`). Llamar desde `AuthService.login` (éxito y fallo), `refresh` (rotación y reuse) y `logout`/`logoutAll`/`changePassword`. Mantener el endpoint `GET /security/audit` (`security.controller.ts:82-92`).
7. Borrado RGPD (escopo mínimo). `DELETE /security/account` (guard `JwtAuthGuard` + confirmación explícita). `AccountDeletionService.anonymize(userId)`: revoca sesiones (`revokeAllSessions`), y elimina/anonimiza las filas dependientes usando las cascadas existentes de Prisma (`onDelete: Cascade` ya declaradas en el esquema); si alguna relación no cascada, hacer borrados explícitos dentro de `prisma.$transaction`. Anonimizar `User` (email con sufijo hash, `passwordHash` nulo) y registrar un `AuditLog` `account_deleted`. (El borrado completo de assets/mascotas se delega en las cascadas de FK del esquema.)

**Archivos afectados.**
- `backend/src/modules/security/token-rotation.service.ts` (recorte/eliminación)
- `backend/src/modules/security/audit.service.ts` (nuevo)
- `backend/src/modules/security/account-deletion.service.ts` (nuevo)
- `backend/src/modules/security/device-fingerprint.service.ts`
- `backend/src/modules/security/e2e-encryption.service.ts`
- `backend/src/modules/security/security.controller.ts`
- `backend/src/modules/security/security.module.ts`
- `backend/src/modules/auth/auth.service.ts` (límite de sesiones + auditoría)
- `backend/src/config/env.config.ts` (`AUTH_MAX_ACTIVE_SESSIONS`)
- `backend/prisma/schema.prisma` (solo si las cascadas de `User` no cubren el borrado RGPD)

**Amenazas y casos límite.**
- Carrera en rotación: al eliminar el servicio duplicado, solo existe la rotación atómica de `auth` (una sola petición canjea el token).
- Falsificación de IP: con `req.ip` y `TRUST_PROXY` correcto, una cabecera `X-Forwarded-For` foránea no falsea el registro de auditoría, salvo que el proxy la añada.
- Exhaustión de memoria en el fallback de fingerprint: acotada por `take` y ventana temporal.
- RGPD: el borrado debe ser transaccional y no dejar huérfanos en una cascada parcial; si falla, se reintenta y se loguea.
- E2E: sin validación criptográfica, un atacante guardaba «public key» basura; ahora solo P-256 válidas.

**Tests.**
- Unit: `E2eEncryptionService.validatePublicKey` acepta SPKI P-256 real y rechaza base64 arbitrario / clave RSA / curva distinta.
- Unit: `DeviceFingerprintService.verify` aplica `EXPIRE` (Redis mock) y el fallback acota a 500/ventana.
- Unit: `AuthService.generateTokens` revoca la sesión más antigua al superar `AUTH_MAX_ACTIVE_SESSIONS`; `AuditService.record` llama a `auditLog.create`.
- E2e: `POST /security/rotate-token` → 404 (eliminado); `POST /security/verify` con `TRUST_PROXY` registra la IP real; `DELETE /security/account` deja `User` anonimizado y sesiones revocadas; `POST /security/e2e/public-key` devuelve `keyStored: true, e2eEnabled: false`.

**Rollout / migración.**
- Sin cambio destructivo de esquema si las cascadas de `User` ya existen; en su caso, una migración para completar FK `onDelete: Cascade`. Config: definir `AUTH_MAX_ACTIVE_SESSIONS`. Deploy en un solo paso (backend).
- El endpoint `rotate-token` se retira en el mismo release; verificar que ningún cliente lo consume (el escritorio usa `/v1/auth/refresh`).

#### S-09 — Escritorio: CSP desactivada y tokens al alcance del webview (Media)

**Causa raíz.**
- `"csp": null` en `desktop/src-tauri/tauri.conf.json:26` (la spec 26 da por hecho que está activa).
- Access token, refresh token y fast-path en `localStorage` (`desktop/src/lib/api.ts:15-22`; `store` en 24-27; `setSession` en 35-41); `docs/PROYECTO.md` §8 dice que van al llavero del sistema.
- La capability `default` permite `http:default` hacia `https://*/**` y `shell:allow-open` (`desktop/src-tauri/capabilities/default.json:8, 10-17`).
- Cinco usos de `{@html}` con SVG (`PetView.svelte`, `ControlPanel.svelte`, `ReplayViewer.svelte`); hoy son locales, pero el módulo de mods prevé sprites SVG subidos por usuarios.

**Diseño propuesto.**

1. CSP estricta. En `tauri.conf.json`, sustituir `"csp": null` por una política explícita (Tauri v2 la inyecta como `<meta>`). Ejemplo concreto:
   `"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: asset: http://asset.localhost; font-src 'self' data:; connect-src 'self' {ORIGEN_API} http://localhost:5173 http://127.0.0.1:3000"`
   donde `{ORIGEN_API}` es el host fijo de producción (p. ej. `https://api.petai.example`). Al ser una cadena estática, se construye en tiempo de build (reemplazo de variable en `tauri.conf.json` vía `beforeBuildCommand` o por perfil de config): en dev permite `localhost:5173`/`127.0.0.1:3000` y `wss:` para HMR; en prod, solo el host de la API. `connect-src` limitado así cierra peticiones a hosts arbitrarios desde el webview.
2. Tokens fuera de `localStorage`. Mover access/refresh al llavero del sistema mediante un comando Tauri nativo (Rust):
   - Añadir en `desktop/src-tauri/src/main.rs` los comandos `save_token(kind: String, value: String)` y `load_token(kind: String) -> Option<String>` que usan el crate `keyring` (macOS Keychain / Windows Credential Manager / Linux Secret Service). Registrarlos en `invoke_handler` (`main.rs:76`). Añadir `keyring = "3"` a `desktop/src-tauri/Cargo.toml`.
   - En `desktop/src/lib/api.ts`, sustituir `localStorage` por un wrapper `desktop/src/lib/secure-store.ts` que llama a `invoke('save_token'|'load_token')` y mantiene los tokens **solo en memoria** (`currentToken`, etc.) para no volver a leerlos en cada petición. Al arrancar, `load_token` recupera la sesión; al cerrar/rotar, `save_token` la persiste cifrada por el SO.
   - Con S-01 (fast-path acotado/revocable) el fast-path ya no es un «pasaporte» de 7 días; si se mantiene, se guarda también por `secure-store`, no por `localStorage`.
   - Fallback: si `keyring` falla (sin daemon en Linux), usar el store de Tauri cifrado (p. ej. `plugin-stronghold`) y **nunca** `localStorage`.

3. Capability mínima. En `default.json`:
   - Quitar `shell:allow-open` global (o acotarlo con scope a una lista de URLs/protocolos).
   - Reemplazar `https://*/**` por el host de la API concreto (`https://api.petai.example/**`) y conservar `http://127.0.0.1:*/**` / `http://localhost:*/**` solo para dev/Hermes (pueden ir a un capability separado `dev.json`).
4. SVG / `{@html}`. Ante sprites de mods, sanitizar con lista blanca antes de renderizar: `DOMPurify.sanitize(svg, { ALLOWED_TAGS: ['svg','path','g','defs','linearGradient','stop','use','title','desc'], ... })` (perfil SVG) en `PetView.svelte`, `ControlPanel.svelte` y `ReplayViewer.svelte`. Mientras no llegue el modding, la CSP (`default-src 'self'`) ya bloquea la carga externa; añadir una regla de lint que prohíba `{@html}` sin sanitizar.

**Archivos afectados.**
- `desktop/src-tauri/tauri.conf.json`
- `desktop/src-tauri/capabilities/default.json` (y nuevo `capabilities/dev.json`)
- `desktop/src-tauri/src/main.rs`
- `desktop/src-tauri/Cargo.toml`
- `desktop/src/lib/secure-store.ts` (nuevo)
- `desktop/src/lib/api.ts`
- `PetView.svelte`, `ControlPanel.svelte`, `ReplayViewer.svelte` (sanitizado; rutas según el árbol de `desktop/src`)
- `docs/PROYECTO.md` §8 (alineado con lo implementado)

**Amenazas y casos límite.**
- XSS en el webview (hoy latente, grave con sprites de mods): CSP + sanitizado + tokens fuera del webview → una inyección ya no roba la sesión ni abre peticiones a hosts arbitrarios.
- Sin daemon de secrets en Linux: `keyring` falla → fallback cifrado, nunca `localStorage`; si falla todo, no se persiste (el usuario vuelve a loguear al arrancar), aceptable.
- CSP y Vite HMR en dev: la política de dev debe permitir `localhost:5173` y `wss:` para el HMR; de ahí el perfil dev/prod.
- `connect-src` estático vs `VITE_API_URL`: si el cliente cambia de API, hay que actualizar el origen en la CSP (rebuild). Documentar.
- Instancias de escritorio: los tokens viven por SO y son compartidos entre ventanas; coherente con una sola sesión por dispositivo.

**Tests.**
- Unit (vitest): `secure-store` serializa/deserializa los tokens; `api.renewAccessToken` mantiene la misma lógica con el backend cifrado en vez de `localStorage` (stub de `invoke`).
- Integración Tauri: abrir el webview con DevTools → `localStorage` vacío (sin `petai_*`); tokens presentes solo en el llavero (comprobado por `load_token`). Verificación de CSP: un `<img>`/`fetch` a `https://malicioso.example` falla (console error, no carga).
- Unit de sanitizado: `DOMPurify.sanitize` sobre un SVG con `<script>`/`onload`/`href='javascript:'` devuelve solo nodos permitidos.
- Capability: `tauri build` con lint confirma que `https://*/**` ya no está permitido.

**Rollout / migración.**
- Sin migración de BD. Config: perfil de CSP dev/prod y el host de API. Los cambios de capability/Rust requieren un rebuild de la app de escritorio.
- Orden: (1) CSP + capability (no rompe nada, solo restringe), (2) `secure-store` + `keyring` con la sesión en memoria y fallback cifrado, (3) sanitizado de SVG cuando llegue el modding.
- Usuarios existentes: al primer arranque post-update, copiar `localStorage → secure-store` una sola vez y limpiar `localStorage` (migración de un solo uso, logueada).



### 3.2 Abusos de red (S-02, S-08)
#### S-02 — SSRF en webhooks (Alta)

**Causa raíz.** `backend/src/modules/webhooks/webhooks.service.ts`:
- `register()` valida con `this.validateUrl(dto.url)` (línea 43) y persiste `url: dto.url` en `prisma.webhook.create` (líneas 58-60).
- `validateUrl()` (líneas 207-227) e `isPrivateIp()` (líneas 229-240) solo inspeccionan el **texto** del `hostname`: bloquean `localhost`, `0.0.0.0`, `metadata.google.internal`, sufijo `.internal` y una lista corta de IPs.
- `deliver()` lanza la petición saliente con el `fetch` global: `await fetch(webhook.url, …)` (línea 142), sin fijar la IP de conexión; y `test()` devuelve `statusCode: result.statusCode` (línea 97) al cliente.

Defectos concretos verificados:
- **No resuelve DNS.** Un dominio propio que apunta a `127.0.0.1`, `10.x`, `169.254.169.254` (metadata de cloud) u `fc00::` pasa la validación, porque `isIP(host)===0` salta el chequeo.
- **IPv6 sin filtrar.** Para `https://[::1]/`, `parsed.hostname` es `[::1]` y `isIP('[::1]')===0`, así que la rama `isIP(host) && this.isPrivateIp(host)` se omite entera. Aunque no, `isPrivateIp` solo cubre `::1` y `fe80…`; faltan `fc00::/7` (ULA), `::ffff:127.0.0.1` (IPv4 mapeada), NAT64 `64:ff9b::/96` y 6to4 `2002::/16`.
- **Faltan IPv4.** `0.0.0.0/8`, `100.64.0.0/10` (CGNAT), `198.18.0.0/15`, TEST-NET (`192.0.0.0/24`, `192.0.2.0/24`, `198.51.100.0/24`) y multicast/reservado `224.0.0.0/4`.
- **Redirecciones seguidas.** El `fetch` global usa `redirect: 'follow'` por defecto: un host público que responde `302 → http://169.254.169.254/latest/…` o `→ http://127.0.0.1:6379/` sale de la red.
- **Óraco por estado.** `test()` devuelve el `statusCode` real, lo que deja distinguir «alcanzable / no» por endpoint interno (y por timing).

**Diseño propuesto.** Reutilizar el bloque SSRF del núcleo de IA (no inventar uno nuevo):
1. **Eliminar** `validateUrl()` e `isPrivateIp()` de `webhooks.service.ts`. Importar de `backend/src/modules/ai/ssrf.ts` → `resolveSafeBaseUrl(raw, policy)` (línea 119) y de `backend/src/modules/ai/pinned-fetch.ts` → `pinnedFetch(addresses)` (línea 34). `resolveSafeBaseUrl` ya resuelve con `lookup(host, {all:true})`, filtra **cada** dirección con `isPrivateAddress()` (línea 88; decide sobre bytes, cubre mapeadas/NAT64/6to4/ULA/CGNAT/TEST-NET) y devuelve `{ url, addresses }`.
2. **`register(userId, dto)`** (línea 42): sustituir `this.validateUrl(dto.url)` por `const safe = await resolveSafeBaseUrl(dto.url);`. Si lanza, es `BadRequestException` (mensaje ya claro). Persistir `url: safe.url` (normalizado) en `prisma.webhook.create({ data: { userId, url: safe.url, secret, events: dto.events } })`.
3. **`deliver(webhook, event)`** (línea 122): al inicio **revalidar en cada entrega** (las IPs pueden cambiar por DNS y un webhook registrado hoy puede apuntar a una red interna mañana): `const safe = await resolveSafeBaseUrl(webhook.url);`. Si lanza → no hacer red, registrar `prisma.webhookDelivery.create({ data: { webhookId, event, status: 'failed', statusCode: null, attempts: 0, error: 'SSRF: URL bloqueada por política de seguridad' } })` y `prisma.webhook.update({ where:{ id }, data:{ failureCount:{ increment: 1 } } })`, y retornar `{ status: 'failed', statusCode: null }` (sin reintentos).
4. **Bucle de reintentos** (líneas 138-167): `const fetchFn = safe.addresses.length > 0 ? pinnedFetch(safe.addresses) : fetch;` (mismo patrón que `ai-config.service.ts:131`) y `const res = await fetchFn(safe.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Petai-Event', 'X-Petai-Timestamp', 'X-Petai-Signature' }, body, signal: AbortSignal.timeout(10_000) });`. `pinnedFetch` ya garantiza HTTPS, `agent:false`, **no seguir redirecciones** (un `3xx` se devuelve tal cual → `res.ok===false` → la entrega falla) y fija la conexión a la IP validada (anti rebinding). No hace falta añadir `redirect:'manual'` aparte: está implícito en `pinnedFetch`.
5. **`test(userId, id)`** (línea 88): devolver `{ delivered: result.status === 'delivered' }`, **sin** `statusCode`. El `statusCode` real sigue grabado en `WebhookDelivery.statusCode` para el dueño (depuración server-side), pero nunca viaja en la respuesta HTTP.

**Decisiones y rationale.** Webhooks SIEMPRE estrictos: `resolveSafeBaseUrl` se llama sin `policy.allowInsecure`, y **no** se honra `AI_ALLOW_INSECURE_URLS` (esa variable solo aplica a la `baseUrl` de IA). Un webhook es por definición un sumidero de terceros, así que la protección SSRF no puede ser opcional ni depender del entorno.

**Archivos afectados.**
- `backend/src/modules/webhooks/webhooks.service.ts` (eliminar `validateUrl`/`isPrivateIp`; reescribir `register`/`deliver`/`test`).
- `backend/src/modules/ai/ssrf.ts` (reutilizado: `resolveSafeBaseUrl`, `isPrivateAddress`; sin cambios).
- `backend/src/modules/ai/pinned-fetch.ts` (reutilizado: `pinnedFetch`; sin cambios).
- `backend/src/modules/webhooks/webhooks.controller.ts` (sin cambios; endpoints idénticos: `POST /webhooks`, `POST /webhooks/:id/test`, `GET /webhooks`, `DELETE /webhooks/:id`).
- `backend/prisma/schema.prisma` (sin cambios: `Webhook.url` ya existe, línea 995; `WebhookDelivery.status/statusCode/error`, líneas 1008-1020).

**Amenazas y casos límite.**
- **DNS rebinding:** `resolveSafeBaseUrl` resuelve una vez y `pinnedFetch` conecta a esa IP fijada (`pinnedLookup` responde siempre con la dirección validada); no hay segunda resolución que un atacante pueda redirigir.
- **Redirecciones:** `pinnedFetch` no sigue `3xx`; un host público que haga `302` a `http://169.254.169.254/` o a un loopback no sale de la red (la entrega se marca `failed`).
- **IPv4 mapeada en IPv6:** `isPrivateAddress` resuelve `::ffff:127.0.0.1 ≡ ::ffff:7f00:1` por bytes, por lo que todas las formas textuales reciben la misma respuesta (bloque).
- **IP directas / alias de dominio:** `https://169.254.169.254/`, `https://[::1]/`, `https://0.0.0.0/`, `https://100.64.0.1/` y un dominio que resuelva a `10.0.0.1` se rechazan tanto en `register` como en `deliver`.
- **Óraco:** `test()` ya no expone `statusCode`; una URL bloqueada produce un `4xx` uniforme en registro y un `failed` uniforme en entrega, sin revelar alcanzabilidad por IP.
- **Retry amplificación:** el camino bloqueado por SSRF no reintenta (0 intentos de red), evitando saturar.
- **Exposición en staging:** no aplica a webhooks: la política es estricta en cualquier `NODE_ENV`.

**Tests.**
- Unit (`backend/src/modules/webhooks/webhooks.service.spec.ts`):
  - `register` rechaza `https://metadata.google.internal/`, `https://169.254.169.254/`, `http://[::1]/`, `https://[::ffff:127.0.0.1]/`, `https://0.0.0.0/`, `https://100.64.0.1/`, `https://198.18.0.1/`, y un dominio propio que resuelve (DNS mock) a `127.0.0.1` → `BadRequestException`.
  - `deliver` usa `pinnedFetch(addresses)` con las IP validadas y **no** el `fetch` global: con `resolveSafeBaseUrl` resolviendo a `10.0.0.1` → `webhookDelivery.status='failed'`, `error` contiene `SSRF`, `attempts===0`, y ninguna conexión de red.
  - `test` ante un `500` interno devuelve `{ delivered: false }` sin clave `statusCode`.
  - Rebinding: `pinnedLookup(['93.184.216.34'])` sigue devolviendo esa IP aunque el host pida otra (anti rebinding, reutiliza `ssrf.spec.ts`).
- E2E (`backend/test/webhooks.e2e-spec.ts`): `POST /webhooks` con URL interna → 400; con URL pública (stub) → 201 y `GET /webhooks` no expone IPs ni `secret`; `POST /webhooks/:id/test` → 200 con solo `{ delivered }`; `302 → http://127.0.0.1` no produce salida de red.

**Rollout / migración.** Sin migración de BD (el esquema no cambia) y sin variable de entorno nueva. Despliegue ordinario del backend. Se recomienda añadir el caso «redirección 302 a host interno» a la suite SSRF y documentar en `docs/DEPLOY.md` §8 que los webhooks revalidan DNS en cada entrega.

#### S-08 — DevKit sin autenticación (Media)

**Causa raíz.**
- `backend/src/app.module.ts:57` — `const DEV_TOOLS_ENABLED = process.env.NODE_ENV !== 'production';` y `:115` — `...(DEV_TOOLS_ENABLED ? [DevModule] : [])`. El flag se lee de `process.env` **al importar** el módulo, antes de que `ConfigModule.forRoot()` valide `.env`.
- `backend/src/modules/dev/dev.controller.ts:13-14` — `@Controller('dev')` / `class DevController` **sin `@UseGuards`**; rutas `POST /dev/hot-reload` (línea 22), `GET /dev/game-data` (29), `POST /dev/seed` (35) y `POST /dev/action` (42).
- `backend/src/modules/dev/dev.module.ts:17-21` — `DevModule` registra `DevController` y sus servicios sin ningún guard.
- `NODE_ENV` por defecto `development` (`backend/src/config/env.config.ts:15`), por lo que cualquier staging, CI o sandbox con red lo expone entero (cambiar balance en caliente, crear usuarios, actuar sobre la mascota de cualquiera).

**Diseño propuesto.** Control en dos capas: activación explícita por config (defensa en profundidad) + guard (control primario).
1. **Config** (`backend/src/config/env.config.ts`):
   - `envSchema`: `DEVKIT_ENABLED: z.enum(['true','false']).default('false')` y `DEVKIT_TOKEN: z.string().optional()`.
   - `productionProblems()`: si `env.DEVKIT_ENABLED === 'true'` → `problems.push('DEVKIT_ENABLED=true no puede usarse en producción')`, de modo que el servidor **se niega a arrancar** en `production` con DevKit encendido (líneas 81-110).
2. **Gating por config (corrige la carrera de tiempos).** Convertir `DevModule` en módulo dinámico `DevModule.forRoot()` que lee `configService.get('DEVKIT_ENABLED') === 'true'` **en tiempo de ejecución** (tras `ConfigModule.forRoot()`, primer import de `AppModule`, línea 61) y devuelve `controllers: []` cuando está apagado. En `app.module.ts`, sustituir `...(DEV_TOOLS_ENABLED ? [DevModule] : [])` por `DevModule.forRoot()` y **eliminar** el `const DEV_TOOLS_ENABLED` de la línea 57. Así el flag se decide con la config validada, no con `process.env` al importar (cierra lo señalado en la auditoría, línea 155).
3. **Guard (control primario).** Nuevo `DevToolsGuard implements CanActivate` en `backend/src/modules/dev/dev-tools.guard.ts`, aplicado con `@UseGuards(DevToolsGuard)` sobre `DevController` y registrado en los `providers` de `DevModule`:
   - `const req = context.switchToHttp().getRequest();`
   - IP real con el mismo criterio de `backend/src/modules/auth/auth.controller.ts:12`: `const ip = req.ip || req.socket?.remoteAddress || '';` (respeta `TRUST_PROXY` fijado en `backend/src/main.ts:47`).
   - Loopback: `if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return true;`
   - Token: `const expected = config.get<string>('DEVKIT_TOKEN'); const given = req.headers['x-petai-devkit-token'];` → `if (expected && given && timingSafeEqual(given, expected)) return true;` usando `crypto.timingSafeEqual` (comparación en tiempo constante; rechaza longitudes distintas).
   - En otro caso `throw new ForbiddenException()`.
   - Extracción opcional recomendada: subir `clientIp` a un helper compartido `backend/src/common/client-ip.ts` para que `auth` y el guard usen el mismo valor sensible a trust-proxy.
4. **Decisión y rationale.** DevKit queda **apagado por defecto** (`DEVKIT_ENABLED=false`) y, aun activo, exige **loopback o token**. Las 4 rutas mutan estado global (balance en caliente, seed de usuarios, acciones sobre cualquier mascota) y no pertenecen al contrato público de juego; por tanto, ni siquiera en desarrollo deben ser alcanzables desde fuera de la máquina sin un secreto explícito. No se reutiliza `JwtAuthGuard` de propósito: DevKit es una herramienta de desarrollo local, no una operación de usuario, y mezclar su control con el JWT de sesión añadiría fricción y una superficie de abuso (un atacante con cualquier sesión válida tocaría el balance).

**Archivos afectados.**
- `backend/src/app.module.ts` (gating por `DevModule.forRoot()`, sin flag de import).
- `backend/src/modules/dev/dev.module.ts` (`forRoot()`, registrar `DevToolsGuard`).
- `backend/src/modules/dev/dev.controller.ts` (`@UseGuards(DevToolsGuard)`).
- `backend/src/modules/dev/dev-tools.guard.ts` (nuevo).
- `backend/src/config/env.config.ts` (`DEVKIT_ENABLED`, `DEVKIT_TOKEN`, `productionProblems`).
- (opcional) `backend/src/common/client-ip.ts` (nuevo, helper compartido).
- Plantillas `.env` / `docker-compose*.yml` (documentar `DEVKIT_ENABLED` / `DEVKIT_TOKEN`).

**Amenazas y casos límite.**
- **Exposición en staging/CI:** cubierto por `DEVKIT_ENABLED` (off por defecto) + guard; aun con `NODE_ENV` mal fijado, el módulo se decide por config validada y el guard bloquea cualquier origen no-loopback sin token.
- **Spoofing de IP tras proxy:** el chequeo de loopback usa `req.ip` (respeta `TRUST_PROXY`). Detrás de un LB público con `TRUST_PROXY` bien configurado, `req.ip` es la IP real del cliente (no-loopback) y el guard deniega; `X-Forwarded-For` no lo puede falsificar salvo `TRUST_PROXY` mal puesto. Para acceso remoto fuera de loopback se usa `DEVKIT_TOKEN`, no el chequeo de IP.
- **Brute-force del token:** `DEVKIT_TOKEN` es un secreto de alta entropía (no adivinable), comparación en tiempo constante, y las rutas pasan además por el `RateLimitGuard` global (`APP_GUARD`, `auth.module.ts:26`).
- **Carrera de import-timing:** resuelta porque `DevModule.forRoot()` lee la config validada en runtime, no `process.env` en la fase de import.
- **Producción:** `productionProblems` impide arrancar con `DEVKIT_ENABLED=true`, por lo que no hay camino de código que registre el controller en prod; el guard sigue presente como segunda capa.

**Tests.**
- Unit (`backend/src/modules/dev/dev-tools.guard.spec.ts`):
  - Loopback (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) → `true`.
  - No-loopback sin token → `ForbiddenException` (403).
  - No-loopback con token correcto → `true`; token incorrecto → 403; token de longitud distinta → 403 (sin disparar `timingSafeEqual`).
  - `DEVKIT_TOKEN` ausente y no-loopback → 403.
- Unit (`backend/src/config/env.config.spec.ts`): `productionProblems` contiene el aviso cuando `DEVKIT_ENABLED==='true'` y `NODE_ENV==='production'`; no lo incluye en `development`.
- E2E (`backend/test/dev.e2e-spec.ts`): con `DEVKIT_ENABLED=true` + `DEVKIT_TOKEN`, `GET /dev/game-data` y `POST /dev/seed` → 200 desde loopback y con header correcto, 403 en otro caso; con `DEVKIT_ENABLED=false` → `GET /dev/game-data` 404; arranque con `NODE_ENV=production` + `DEVKIT_ENABLED=true` → `validateEnv` lanza.

**Rollout / migración.** Solo config; sin migración de BD. Añadir `DEVKIT_ENABLED` / `DEVKIT_TOKEN` a `.env` / compose (default off). Nota de compatibilidad: el flujo de desarrollo pasa de depender de `NODE_ENV` a requerir explícitamente `DEVKIT_ENABLED=true` (y `DEVKIT_TOKEN` para uso remoto); actualizar las instrucciones de DevKit (Feature 004) y `docs/DEPLOY.md`.


### 3.3 Integridad econÃ³mica (S-03, S-04, S-05, S-12, S-14)

El patrón de referencia ya probado en producción es el de `chests.service.ts:301-323` (`purchaseChest`): la comprobación de saldo y el descuento viven en **una única sentencia** `user.updateMany({ where: { id, <currency>: { gte: importe } }, data: { <currency>: { decrement: importe } } })`, y el llamante continúa **solo si `count === 1`** (o `=== 0` → revierte). El test de carrera de referencia es `backend/test/chests-race.e2e-spec.ts`: dos peticiones simultáneas → exactamente una `200` y la otra `409`, y el estado en BD refleja **una sola** mutación. Esta sección factoriza ese patrón en dos componentes transversales y lo aplica a todos los puntos económicos restantes.

#### C-01 — `WalletService` (cobro/abono atómico compartido)

**Decisión.** Un único `WalletService` (`@Injectable`, `@Global()` vía `WalletModule`) que encapsula el débito y el abono de `coins`/`gems`. Toda operación económica (S-03 regalos, S-04 energía-raid, S-05 cobros, S-12 recompensas, S-14 payouts) debe pasar por él **dentro de una transacción que el llamante abre**. El débito es race-safe por diseño (condición `>=` en el `WHERE`); el abono es idempotente cuando se combina con un guard de estado (`updateMany` + `count === 1`, ver S-14).

```typescript
// backend/src/modules/wallet/wallet.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Débito atómico y race-safe de una sola moneda. La comprobación de saldo y el
   * decremento son UNA sentencia UPDATE ... WHERE saldo >= importe. Si no hay saldo,
   * `count` = 0 y el llamante debe REVERTIR la transacción (no retener el cargo).
   * `tx` es un Prisma.TransactionClient (el llamante abre/propaga la transacción).
   */
  async debit(
    tx: Prisma.TransactionClient,
    userId: string,
    currency: 'coins' | 'gems',
    amount: number,
  ): Promise<{ ok: boolean }> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Importe de débito inválido');
    }
    const res =
      currency === 'coins'
        ? await tx.user.updateMany({
            where: { id: userId, coins: { gte: amount } },
            data: { coins: { decrement: amount } },
          })
        : await tx.user.updateMany({
            where: { id: userId, gems: { gte: amount } },
            data: { gems: { decrement: amount } },
          });
    return { ok: res.count === 1 };
  }

  /** Abono atómico (increment). Se expone con la misma firma para orquestar débito+abono en 1 tx. */
  async credit(
    tx: Prisma.TransactionClient,
    userId: string,
    currency: 'coins' | 'gems',
    amount: number,
  ): Promise<void> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Importe de abono inválido');
    }
    await (currency === 'coins'
      ? tx.user.update({ where: { id: userId }, data: { coins: { increment: amount } } })
      : tx.user.update({ where: { id: userId }, data: { gems: { increment: amount } } }));
  }
}
```

`debit` deviene la primitiva de `purchaseChest` de `chests.service.ts` (que se refactoriza para usarlo, no se reescribe). El `WalletModule` es `@Global()` para evitar imports repetidos en los 8+ módulos afectados.
#### C-02 — Bloqueo distribuido de crons (`CronLockService`)

**Decisión.** Ningún `@Cron` hoy usa bloqueo (S-14). Con 2+ réplicas, cada `@Cron` se ejecuta N veces → dobles liquidaciones, dobles rotaciones. Se introduce `CronLockService` sobre el `RedisService` existente (`backend/src/redis/redis.service.ts`) usando **`SET key <token> NX PX ttlMs`** (adquisición atómica) y liberación **CAS vía Lua** (solo se borra si el token sigue siendo el propio).

```typescript
// backend/src/redis/cron-lock.service.ts
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from './redis.service';

@Injectable()
export class CronLockService {
  constructor(private readonly redis: RedisService) {}

  // Esquema de clave: petai:<env>:cron:<nombre> (RedisService.key() añade el prefijo de entorno).
  // p. ej. petai:production:cron:raid:check
  private key(name: string): string {
    return this.redis.key(`cron:${name}`);
  }

  /** Adquiere con SET key NX PX ttl. Devuelve true solo si esta réplica es la única en la ventana. */
  async acquire(name: string, token: string, ttlMs: number): Promise<boolean> {
    const r = await this.redis.run((c) => c.set(this.key(name), token, 'PX', ttlMs, 'NX'), 'cron.lock.acquire');
    return r === 'OK'; // 'OK' → adquirido; null (NX ocupado o fallo de Redis) → no.
  }

  /** Libera SOLO si el token sigue siendo el de esta réplica (CAS). Evita borrar el lock de otra réplica. */
  async release(name: string, token: string): Promise<void> {
    await this.redis.run(
      (c) =>
        c.eval(
          `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
          1,
          this.key(name),
          token,
        ),
      'cron.lock.release',
    );
  }

  /**
   * Helper para @Cron: devuelve el token si se adquirió el lock (el llamante ejecuta y luego
   * `release`), o `null` si otra réplica ya lo tiene (el llamante no hace nada).
   */
  async guard(name: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    return (await this.acquire(name, token, ttlMs)) ? token : null;
  }
}
```

**Esquema de claves y TTL** (TTL < intervalo para no solaparse, pero > tiempo máximo de ejecución): `cron:raid:check` (PX 55000, `EVERY_MINUTE`), `cron:tournament:resolve` (PX 240000, `EVERY_5_MINUTES`), `cron:chests:cleanup` (PX 5400000, `EVERY_DAY_AT_3AM`), `cron:missions:reset` (PX 240000), `cron:gifts:expire` (nuevo, PX 240000).

**Nota de degradación.** `RedisService.run` devuelve `null` si Redis cae; por tanto `acquire` devuelve `false` y el cron se **salta (fail-closed)** en esa réplica. Es aceptable porque (a) la réplica con Redis lo ejecutará, y (b) la acción real está además protegida por el guard de estado atómico de S-14, de modo que aunque dos réplicas lo ejecutaran no habría doble liquidación. Para un cron que **no** pueda caerse, usaría fail-open + idempotencia, no este lock.
#### S-03 — Duplicación de objetos al aceptar/rechazar un regalo en paralelo (Alta)

**Causa raíz.** (líneas verificadas en `main` `3eeec6a`)
- `GiftingService.accept` (`gifting.service.ts:74-88`) hace `findFirst` (75), comprueba `status === 'pending'` (77) y, en una transacción **separada**, entrega el item (`grantInventory`, línea 80) y hace `tx.gift.update({ where: { id } })` (81-84). La actualización **no condiciona por `status`**.
- `GiftingService.reject` (`gifting.service.ts:91-109`) es idéntico: check en 94, entrega al remitente en 97, `tx.gift.update` sin condición en 98-104.
- Dos `accept` simultáneos leen `pending` a ambos → el receptor recibe el objeto **dos veces**. Un `accept` + un `reject` simultáneos → lo reciben **el receptor y el remitente** (duplicación para dos cuentas coordinadas).
- `qty` no se valida como entero: la línea 31 `Math.min(99, Math.max(1, input.qty ?? 1))` convierte `"abc"` en `NaN` y `1.5` produce un error de Prisma (500) en lugar de 400.
- `expiresAt` se fija (línea 53) pero nada devuelve el item al remitente ni impide aceptar uno caducado; no hay ningún cron en el módulo.
- Los límites diarios (`checkRateLimits`, llamada en línea 38; conteos en 138 y 142-144) se cuentan **fuera** de la transacción de creación (42-56).

**Diseño propuesto.**
1. **Reclamar antes de entregar**, dentro de la misma transacción, con `updateMany` condicionado por estado y receptor:
```typescript
async accept(userId: string, giftId: string) {
  return this.prisma.$transaction(async (tx) => {
    const claimed = await tx.gift.updateMany({
      where: { id: giftId, receiverId: userId, status: 'pending', expiresAt: { gt: new Date() } },
      data: { status: 'accepted', resolvedAt: new Date() },
    });
    if (claimed.count === 0) {
      const g = await tx.gift.findFirst({ where: { id: giftId, receiverId: userId } });
      if (!g) throw new NotFoundException('Gift no encontrado');
      if (g.expiresAt <= new Date()) throw new BadRequestException('Gift caducado');
      throw new BadRequestException('Este gift ya fue resuelto'); // count===0: ya no es pending
    }
    await this.grantInventory(tx, userId, /* itemId */ /* qty */); // entrega UNICAMENTE tras reclamar
    return tx.gift.findUnique({ where: { id: giftId } });
  });
}
```
   `reject` usa el mismo patrón (`status: 'rejected'`, entrega a `senderId`). La clave: **solo se entrega si `count === 1`**; como la transacción es serializable por el `UPDATE` sobre la misma fila, dos peticiones concurrentes producen exactamente un `count === 1`.
2. **Validar `qty`** con un esquema zod (o `Number.isInteger`) → 400 en `NaN`/fracciones; acotar 1..99. Se aplica en `send` (línea 31).
3. **Límites diarios dentro de la tx**: mover el `count` de `checkRateLimits` al interior de `$transaction` de `send` y, tras superar el límite, revertir. Alternativa estricta: una fila de contenedor `DailyCounter` con `updateMany` guardado.
4. **Cron de expiración** `cron:gifts:expire` (C-02, `EVERY_5_MINUTES`) que hace `gift.updateMany({ where: { status: 'pending', expiresAt: { lte: now } }, data: { status: 'expired' } })` y devuelve el item al remitente por `WalletService`/`grantInventory` dentro de una tx por lote. `accept` de uno ya expirado → 400 (punto 1).

**Archivos afectados.**
- `backend/src/modules/gifting/gifting.service.ts`
- `backend/src/modules/gifting/gifting.controller.ts` (validación zod de `qty`)
- `backend/src/modules/gifting/gifting.module.ts` (import `WalletModule` si aplica; cron de expiración)
- `backend/src/modules/gifting/gift-expiry.processor.ts` (nuevo, `@Cron` + `CronLockService`)
- `backend/src/modules/wallet/wallet.module.ts` / `wallet.service.ts` (C-01, nuevo)

**Amenazas y casos límite.**
- **Doble `accept`**: ahora una sola entrega (guard `updateMany` por `status` + `receiverId`).
- **`accept`+`reject` simultáneos**: uno reclama `pending→accepted`, el otro ve `count===0` → 400.
- **Regalo caducado**: `expiresAt` en el `WHERE` impide reclamarlo; el cron devuelve al remitente.
- **Recompensa sin entrega / entrega sin reclamo**: la entrega solo ocurre tras `count===1` dentro de la tx.
- **Límite diario por carrera**: conteo dentro de la transacción.

**Tests.**
- Unit: `gifting.service.spec.ts` — `accept`/`reject` con `prisma` mock; `count===0` → 400 y sin `grantInventory`; `qty` fracción/`NaN` → 400.
- E2E de carrera (modelo `chests-race.e2e-spec.ts`): `gifts-race.e2e-spec.ts` — 2× `POST /v1/gifts/:id/accept` simultáneos → `[200, 400]`, y el inventario del receptor refleja **una sola** copia; un par `accept`+`reject` → `[200,400]` y exactamente un propietario lo posee.

**Rollout / migración.**
- Sin migración de esquema nueva (los campos `status`, `resolvedAt`, `expiresAt` ya existen). Opcional: índice parcial `CREATE INDEX ON gift (receiverId, status) WHERE status = 'pending'` para acelerar el reclamo y el cron.
- Sin migración de datos; el guard es retrocompatible (los regalos ya resueltos no se tocan).

#### S-04 — Raid: ataques casi gratuitos y sin límite diario propio (Alta)

**Causa raíz.** (líneas verificadas en `main` `3eeec6a`)
- `RaidService.attack` (`raid.service.ts:62-115`) lee `pet.energy` (66), verifica `pet.energy < energyCost` (68) y, **después** de simular el combate, escribe `pet.update({ data: { energy: Math.max(0, pet.energy - this.cfg.energyCost) } })` (línea 88). Es una lectura→escritura no atómica: veinte peticiones paralelas leen la misma energía y hacen veinte ataques **pagando uno**. (El decremento de `hpRemaining` del jefe SÍ es atómico con `updateMany`, línea 79-82.)
- El límite diario usa `battlesService.battlesInLastDay(userId)` (línea 69) contra `maxAttacksPer24h` (70). Los ataques al raid **no crean filas `Battle`** (lo que cuenta `battlesInLastDay`), así que el contador es siempre 0 y el único freno era la energía, que ya se salta.
- El reparto es 5000 gemas proporcionales al daño (`settle`, 182-195), por lo que el coste efectivo del ataque es 0 → moneda premium de facto gratuita.

**Diseño propuesto.**
1. **Descontar energía de forma atómica ANTES de simular**, con `updateMany` guardado por saldo:
```typescript
const charged = await this.prisma.pet.updateMany({
  where: { id: petId, userId, energy: { gte: this.cfg.energyCost } },
  data: { energy: { decrement: this.cfg.energyCost } },
});
if (charged.count === 0) throw new BadRequestException('La mascota está demasiado cansada');
```
   Se elimina la lectura `pet.energy` previa y la escritura de la línea 88. Si falla un paso posterior (simulación), el `try/catch` del ataque revierte: `pet.updateMany({ where: { id: petId }, data: { energy: { increment: this.cfg.energyCost } } })` (reembolso dentro de la misma `prisma.$transaction`, idealmente).
2. **Límite diario propio del raid**: contarlo sobre `RaidParticipant` (que ya existe, `raidId_userId` único) dentro de la transacción:
```typescript
const attacksToday = await tx.raidParticipant.count({
  where: { raidId: raid.id, userId, lastAttackAt: { gte: dayStart } },
});
if (attacksToday >= this.cfg.maxAttacksPer24h) throw new BadRequestException('Límite de ataques diario alcanzado');
```
   (o una `totalAttacksToday` guardada en la propia fila). Se deja de usar `battlesInLastDay`.
3. **Todo en una sola `prisma.$transaction`** (clame de energía + conteo + `updateMany` de `hpRemaining` + upsert de `RaidParticipant`), de modo que un ataque nunca deja estado a mitad.

**Archivos afectados.**
- `backend/src/modules/raid/raid.service.ts`
- `backend/src/modules/raid/raid.controller.ts`
- `backend/src/modules/raid/raid.module.ts`
- `backend/prisma/schema.prisma` (solo si se añade `totalAttacksToday` a `RaidParticipant`)

**Amenazas y casos límite.**
- **20 ataques simultáneos**: el guard de energía `updateMany` solo permite N que encajen en el saldo; el resto recibe 400.
- **Límite diario**: contador sobre `RaidParticipant` dentro de tx → no se salta por no crear `Battle`.
- **Carga sin entrega**: la energía se descuenta en el mismo paso atómico que el daño; si el `settle`/simulación falla, reembolso en la tx.
- **Jefe con HP<daño**: ya resuelto por el `updateMany` de `hpRemaining` (línea 79-82) que se mantiene; se conserva el comportamiento de reclamar solo si hay HP suficiente.

**Tests.**
- Unit: `raid.service.spec.ts` — `attack` con energía insuficiente → 400 y `energy` intacto; guard `count===0` → 400.
- E2E de carrera (modelo `chests-race`): `raid-race.e2e-spec.ts` — N× `POST /v1/raid/attack` simultáneos con energía para exactamente K ataques → exactamente K `201`/`200` y N-K `400`, y `pet.energy` final = inicial − K·coste (nunca negativo); `RaidParticipant.totalAttacks` = K.

**Rollout / migración.**
- Sin migración obligatoria si el límite usa `lastAttackAt`/`totalAttacks` existentes; si se añade `totalAttacksToday Int @default(0)`, migración con backfill 0.
- `Pet.energy` es `Float`; el CHECK `energy >= 0` se añade en S-14/Rollout global (misma migración que las monedas).

#### S-05 — Cobros no atómicos: saldo negativo y cobro sin entrega (Alta)

**Causa raíz.** (líneas verificadas en `main` `3eeec6a`) Cinco puntos comprueban el saldo y descuentan **sin condición** (patrón `user.update` de decremento, no `updateMany` con `gte`):
- `seasons.service.ts` — `purchasePass` (112-145): check `user.gems < passPrice` (122-125), `user.update({ gems: { decrement } })` (127-130) **fuera de transacción**, y `seasonPass.create` (132-134) como paso separado. Si falla el `create`, las gemas ya se han descontado. `SeasonPass` tiene FK a `Season` y `ensureSeasonRecord()` (203-219) **no se llama** desde `purchasePass` → el `create` puede fallar siempre tras cobrar.
- `habitat.service.ts` — `placeFurniture` (64-115): check de saldo (79-85), `user.update` decremento (87-92) **antes** de comprobar que el hábitat/casilla existen y están libres (94-95 y bucle 102+). Cobra y, si la colocación falla, el usuario ha pagado y no recibe nada.
- `adventure.service.ts` — `startDaily` (25-79): premium check (39-43), `user.update` decremento (44-47) **antes** de generar el tema con el LLM (`orchestrator.generateTheme`, 52). Si el proveedor falla, no hay reembolso.
- `genes.service.ts` — `analyzeGene` (56-107): dentro de `prisma.$transaction` (80-94) hace `user.update({ gems: { decrement } })` (90-93) **sin condición** `gte`; el check previo es la lectura en línea 68.
- `tournament.service.ts` — `enter` (42-61): `user.findFirst({ gems: { gte: ENTRY_FEE } })` (53) y luego `prisma.$transaction([ user.update({ gems: { decrement } }), tournamentEntry.create ])` (55-58): el decremento no va condicionado.

Con peticiones simultáneas (comprar mueble + pase a la vez) el saldo puede quedar **negativo**.

**Diseño propuesto.** En los cinco casos, sustituir el chequeo+decremento por `WalletService.debit` **dentro de una transacción única** que incluye la entrega/creación. Plantilla (habitat):
```typescript
await this.prisma.$transaction(async (tx) => {
  const { ok } = await this.wallet.debit(tx, userId, furniture.currency, furniture.price);
  if (!ok) throw new BadRequestException('Saldo insuficiente');
  // …comprobaciones de existencia/hábitat/libre…
  await tx.habitatItem.create({ data: { /* x, y, roomId, petId */ } }); // entrega SOLO si el cargo ok
});
```
Detalles por módulo:
- **seasons**: dentro de la tx, `ensureSeasonRecord()` (o `season.upsert`) **antes** de `wallet.debit`; si no hay `Season`, 500→se revierte y no se cobra. `seasonPass.create` tras el debit, misma tx.
- **habitat**: `wallet.debit` → comprobaciones de hábitat/casilla → `habitItem.create` en una tx. Orden invertido: pagar solo si la entrega va a ser válida.
- **adventure**: `wallet.debit` → si el LLM (`generateTheme`) lanza, `catch` revierte la tx (reembolso automático). El debit y el `adventure.create` van juntos.
- **genes**: `wallet.debit(tx, …)` en la tx existente (reemplaza `user.update` 90-93) + `pet.update` de personalidad; si `count===0`, 400 y sin mutar el pet.
- **tournament**: `wallet.debit(tx, …)` + `tournamentEntry.create` en la tx; la FK única `tournamentId_userId` impide doble inscripción (ver S-14).

**Archivos afectados.**
- `backend/src/modules/seasons/seasons.service.ts`
- `backend/src/modules/habitat/habitat.service.ts`
- `backend/src/modules/adventure/adventure.service.ts`
- `backend/src/modules/genes/genes.service.ts`
- `backend/src/modules/tournament/tournament.service.ts`
- `backend/src/modules/wallet/wallet.{module,service}.ts` (C-01)
- `backend/src/modules/chests/chests.service.ts` (refactor a `wallet.debit`, conserva el guard)

**Amenazas y casos límite.**
- **Saldo negativo por carrera**: el `updateMany` con `gte` de `debit` hace imposible que dos cobros concurrentes rebasen el saldo; uno de los dos recibe `count===0` → 400.
- **Cobro sin entrega** (seasons FK / habitat casilla llena / adventure LLM): todo en una tx; cualquier fallo revierte el debit.
- **`ensureSeasonRecord` nunca llamado**: ahora se invoca dentro de `purchasePass`; el seed deja de ser un prerrequisito oculto.
- **Double-pay**: el guard por saldo + la unicidad de la fila entregada (SeasonPass/HabitatItem/TournamentEntry) impide doblar.

**Tests.** (uno de carrera por cada operación económica, modelo `chests-race.e2e-spec.ts`)
- Unit: `seasons/habitat/adventure/genes/tournament *.service.spec.ts` — `debit` `count===0` → 400 y sin `create`/`update` del dominio; seasons: sin `Season` → no cobra.
- E2E: `seasons-race.e2e-spec.ts` (2× `purchasePass` → una 201/una 400, `gems` = inicial − precio, 1 `SeasonPass`); `habitat-race.e2e-spec.ts` (mueble con saldo exacto → una 201/una 400, nunca `coins<0`); `adventure-race.e2e-spec.ts` (premium + LLM fallado → reembolso); `genes-race.e2e-spec.ts`; `tournament-race.e2e-spec.ts` (doble `enter` → una 201/una 409, 1 `TournamentEntry`, `gems` descontada 1 vez).

**Rollout / migración.**
- Migración única (compartida con S-14): restricciones `CHECK` en `User` — `ALTER TABLE "User" ADD CONSTRAINT user_currency_nonneg CHECK (coins >= 0 AND gems >= 0);` y en `Pet` — `CHECK (energy >= 0)`. Como Prisma no emite `CHECK` por scalares, se define en una migración SQL (`prisma/migrations/…/migrations.sql`).
- Backfill: si hay saldos negativos actuales (derivados de esta bug), corregir con `UPDATE "User" SET coins = GREATEST(coins, 0), gems = GREATEST(gems, 0)` **antes** de añadir el `CHECK`, y anotar un `AuditLog`.

#### S-12 — Recompensas afirmadas por el cliente (Media)

**Causa raíz.** (líneas verificadas en `main` `3eeec6a`) La recompensa depende de un campo que declara el cliente sin recomputarlo en el servidor:
- **Cocina** — `CookingService.submit` (`cooking.service.ts:69-98`) acepta `correctOrder: boolean` del cliente; si es `true`, `correctCount = ingredients.length` (84) → `pct = 1.0` → buff completo (`createBuff`, 89-94) y 40 monedas (95-96), **sin recomputar contra la semilla** ni con duración mínima. `start` además descuenta energía no atómico (≈ línea 57, `pet.update … energy:`).
- **Reconciliación** — `ReengagementService.forgive` (`reengagement.service.ts:162-205`) + `validateRitual` (208-226): `clicks`/`chat`/`actions` los declara el cliente; `grantGift` (229-236) abona monedas con `user.update({ coins: { increment } })` sin guard.
- **Group feeding** — `GroupFeedingService.completeMinigame` (`group-feeding.service.ts:96-123`) no valida ningún juego y actualiza el JSON de participantes por **lectura→reescritura** (101, 110): se pierden actualizaciones simultáneas. `finalizeRoom` (125-176) comprueba `rewardsDistributed` **fuera** de la transacción (línea 128); la tx (138-168) reparte y marca `rewardsDistributed: true` al final → dos finalizaciones a la vez reparten **dos veces**.
- **Care package** — `CarePackageService.sendCarePackage` (`care-package.service.ts:23-119`): crea 50 monedas al receptor (102-105); el límite diario (1/receptor/día) se cuenta **fuera** de la tx (59-65).

**Diseño propuesto.**
1. **Recomputar en el servidor (cocina)**: en `submit`, validar contra el `seed`/`recipeId`/`ingredients` guardados en `CookingSession` (y exigir `elapsed >= COOKING_DURATION` antes de premiar, como hacen los minijuegos del núcleo). El cliente solo entrega el resultado; el servidor recalcula `pct`/buff/monedas. Reclamar la sesión con `cookingSession.updateMany({ where: { id, userId, finishedAt: null }, data: { finishedAt: now } })` y premiar solo si `count===1` (patrón ya parcial en 73-77).
2. **Idempotencia por guard de estado (reconciliación)**: en `forgive`, reclamar `lastWelcomeBackAt` con `pet.updateMany({ where: { id, lastWelcomeBackAt: { lt: antiSpamCutoff } }, data: { lastWelcomeBackAt: now, … } })`; si `count===0` → 409. El abono de monedas pasa por `wallet.credit` en la misma tx que el guard.
3. **`finalizeRoom` atómico (group feeding)**:
```typescript
await this.prisma.$transaction(async (tx) => {
  const claimed = await tx.groupSession.updateMany({
    where: { id: room.id, status: 'active', rewardsDistributed: false },
    data: { status: 'complete', rewardsDistributed: true, generatedItemId: itemId, completedAt: new Date() },
  });
  if (claimed.count === 0) return null; // ya finalizada: no repartir
  for (const p of completed) { /* upsert item + wallet.credit + bonding */ }
  return itemId;
});
```
   La comprobación de `rewardsDistributed` pasa **dentro** del `WHERE` del `updateMany` (ya no la lectura externa de la línea 128). Para el JSON de participantes, evitar el read-modify-write concurrente: reclamar el minijuego con `updateMany` sobre un campo por participante (o una tabla `GroupParticipant`) en lugar de reescribir el `participants` Json.
4. **Care package dentro de la tx**: mover el `count` del límite (59-65) al interior de la transacción de creación (76-107) y revertir si se supera; el abono de 50 monedas usa `wallet.credit`.

**Archivos afectados.**
- `backend/src/modules/cooking/cooking.service.ts`
- `backend/src/modules/reengagement/reengagement.service.ts`
- `backend/src/modules/gifting/group-feeding.service.ts`
- `backend/src/modules/gifting/care-package.service.ts`
- `backend/src/modules/wallet/wallet.{module,service}.ts` (C-01)
- `backend/prisma/schema.prisma` (opcional: tabla `GroupParticipant` si se elimina el `participants` Json para evitar el read-modify-write)

**Amenazas y casos límite.**
- **`correctOrder: true` fraudulento**: se recalcula contra la semilla y la duración mínima; un cliente malicioso no puede forzar el buff.
- **Doble finalización (group feeding)**: el guard `updateMany` `rewardsDistributed:false→true` solo permite un reparto.
- **Reconciliación repetida / care duplicado**: guard por `lastWelcomeBackAt` / `count` dentro de tx impide doblar monedas.
- **Pérdida de actualizaciones de participantes**: se elimina el read-modify-write del JSON.

**Tests.**
- Unit: `cooking.service.spec.ts` — `submit` con `correctOrder` falso → recomputa `pct` real; `reengagement.service.spec.ts` — `count===0` → 409 sin monedas; `group-feeding.service.spec.ts` — `finalizeRoom` ya distribuida → sin reparto.
- E2E de carrera (modelo `chests-race`): `group-feeding-race.e2e-spec.ts` — dos `finalizeRoom` simultáneos → **una** distribución (monedas/items exactos, `rewardsDistributed: true`); `cooking-race.e2e-spec.ts` — doble `submit` de la misma sesión → una premia, la otra 400; `care-race.e2e-spec.ts` — dos `sendCarePackage` al mismo receptor → una 201/una 400, receptor recibe 50 monedas una sola vez.

**Rollout / migración.**
- Sin migración obligatoria si el guard de `group-feeding` usa `rewardsDistributed`/`status` existentes; si se migra a `GroupParticipant`, migración con backfill desde el JSON.
- Reutiliza el CHECK de saldos no negativos (S-05/S-14) para cubrir los abonos.

#### S-14 — Pagos no idempotentes y crons sin bloqueo entre réplicas (Media)

**Causa raíz.** (líneas verificadas en `main` `3eeec6a`)
- `RaidService.settle` (`raid.service.ts:182-195`): `findUnique` (183), check `status === 'settled'` (184), reparto con `user.update increment` (192) y `raid.update` a `settled` (193) en **pasos separados**, sin transacción común ni reclamo previo. Lo invocan el ataque que mata al jefe (105) y el cron (214): pueden coincidir → reparto doble.
- `TournamentService.payOut` (`tournament.service.ts:145-161`): check `status === 'finished'` (146-147), `tournament.update` a `finished` (150) y `user.update increment 1000` (156) en pasos separados.
- **Creación duplicada**: `getActiveRaid` (`raid.service.ts:148-156`) llama a `rotate()` (150/153, `raid.create`) si no hay raid activo; `getCurrent` (`tournament.service.ts:24-40`) llama a `createTournament()` (29; `tournament.create` en 91-102) si no hay torneo. Dos peticiones simultáneas → dos filas.
- **Crons sin bloqueo**: `@Cron(EVERY_MINUTE) handleCronCheck` (raid, 210) y `@Cron(EVERY_5_MINUTES) handleCron` (tournament, 175); también `cleanupExpiredChests` (`chests.processor.ts:76`) y el scheduler de misiones (`mission-scheduler.service.ts:32/68/120`). Con 2 réplicas todos corren 2×.

**Diseño propuesto.**
1. **Reclamar el cambio de estado con `updateMany` condicionado y pagar solo si `count === 1`**, todo en una transacción. `settle`:
```typescript
private async settle(raidId: string) {
  await this.prisma.$transaction(async (tx) => {
    const claimed = await tx.raid.updateMany({
      where: { id: raidId, status: 'active' },
      data: { status: 'settled', settledAt: new Date(), endedAt: new Date(), hpRemaining: 0 },
    });
    if (claimed.count === 0) return; // ya liquidado/expirado → no pagar
    const parts = await tx.raidParticipant.findMany({ where: { raidId, damageDealt: { gt: 0 } } });
    if (parts.length === 0) return;
    const total = parts.reduce((s, p) => s + p.damageDealt, 0);
    for (const p of parts) {
      const g = Math.min(Math.max(Math.floor(this.cfg.totalGems * (p.damageDealt / total)), 1),
        Math.floor(this.cfg.totalGems * 0.5));
      await this.wallet.credit(tx, p.userId, 'gems', g); // C-01
    }
  });
}
```
   El ataque (105) y el cron (214) compiten por la misma transición `active→settled`; solo una obtiene `count===1`. `payOut` (tournament): `tournament.updateMany({ where: { id, status: { in: ['bracket','active'] } }, data: { status: 'finished', endedAt: now } })` → repartir premios solo si `count===1`.
2. **Crear idempotentemente** con clave única determinista (no depende del lock):
   - `Raid.weekKey String @unique` = `w:${weekIndex}`; `rotate()` → `raid.upsert({ where: { weekKey }, update: {}, create: { …, weekKey } })`.
   - `Tournament.periodKey String @unique` = `t:${generación}`; `createTournament()` → `tournament.upsert({ where: { periodKey }, … })`.
   Dos peticiones simultáneas devuelven la misma fila.
3. **Bloqueo de crons (C-02)**: envolver cada `@Cron` con el guard:
```typescript
@Cron(CronExpression.EVERY_MINUTE)
async handleCronCheck() {
  const token = await this.cronLock.guard('raid:check', 55_000);
  if (!token) return; // otra réplica lo está ejecutando
  try { /* …settle / rotar… */ } finally { await this.cronLock.release('raid:check', token); }
}
```
   Aplicar a `raid:check`, `tournament:resolve` (240000), `chests:cleanup` (5400000), `missions:reset`/`missions:cleanup` (240000).

**Archivos afectados.**
- `backend/src/modules/raid/raid.service.ts` (`settle`, `getActiveRaid`/`rotate`, `handleCronCheck`)
- `backend/src/modules/tournament/tournament.service.ts` (`payOut`, `createTournament`, `handleCron`)
- `backend/src/modules/chests/chests.processor.ts` (`cleanupExpiredChests`)
- `backend/src/missions/mission-scheduler.service.ts`
- `backend/src/redis/cron-lock.service.ts` (C-02, nuevo) y su export en `redis.module.ts`
- `backend/prisma/schema.prisma` (`Raid.weekKey`, `Tournament.periodKey` únicos)
- `backend/src/modules/wallet/wallet.{module,service}.ts` (C-01)

**Amenazas y casos límite.**
- **`settle` por ataque + cron simultáneos**: la transición `active→settled` atómica garantiza un solo reparto.
- **`payOut` doble**: el guard `status in (bracket,active)→finished` lo impide.
- **Doble creación de raid/torneo**: el `upsert` por clave única devuelve la misma fila.
- **2 réplicas corriendo el cron**: `CronLockService` deja una sola; y aunque fallara, los guards de estado siguen siendo idempotentes (doble protección).
- **Redis caído**: el cron se salta (fail-closed) en esa réplica; la otra lo ejecuta; el guard de estado evita dobles efectos.

**Tests.**
- Unit: `raid.service.spec.ts` — `settle` ya en `settled` → sin `credit`; `tournament.service.spec.ts` — `payOut` ya `finished` → sin pago; `cron-lock.service.spec.ts` — 2º `acquire` sobre key ocupada → `false`; `release` con token ajeno → no borra (CAS Lua).
- E2E de carrera: `raid-settle-race.e2e-spec.ts` — atacar el último HP y disparar `handleCronCheck()` a la vez → las gemas repartidas **una** vez (suma respetando el cap); `tournament-race.e2e-spec.ts` — doble `getCurrent` sin torneo → 1 fila `Tournament`; doble `payOut` → premios 1×.

**Rollout / migración.**
- Migración: añadir `Raid.weekKey String @unique` y `Tournament.periodKey String @unique` con backfill (`weekKey = 'w:' || floor(extract(epoch from startedAt)/604800)`; un único `periodKey` por torneo existente). Si hubiera >1 raid/torneo activo por período, desdoblar antes de añadir el `@unique`.
- Reutiliza la migración de CHECK de saldos no negativos (S-05) — mismo PR.
- Re-despliegue con 2 réplicas para verificar que cada cron corre en una sola (log/métrica `cron.lock.acquire`).

### 3.4 Abuso de recursos (S-06, S-07)
#### S-06 — Voz (STT/TTS): key del servidor sin cuota por usuario, sin límite por minuto ni moderación

**Causa raíz.**
- `SttService` lee la clave del proveedor en el constructor, una sola vez y sin usuario: `backend/src/modules/voice/stt.service.ts:26` (`WHISPER_API_KEY`/`OPENAI_API_KEY`) y `backend/src/modules/voice/tts.service.ts:39` (`ELEVENLABS_API_KEY`). Cada llamada consume la clave del servidor.
- `VoiceController.transcribe` (`voice.controller.ts:43-55`) y `speak` (`voice.controller.ts:57-89`) no aplican cuota mensual, ni límite por minuto propio, ni moderación del texto; solo comprueban el tamaño del audio base64 (`voice.controller.ts:50`) y la longitud del texto (`voice.controller.ts:68`). El único freno es el límite global `RATE_LIMIT_PER_MINUTE` (300/min por usuario/IP).
- `VoiceModule` (`voice.module.ts:14-18`) no importa `AiModule` (por tanto `UsageService` y `AiConfigService`) ni el módulo de Redis, así que ninguno de los controles del chat de texto llega a la voz.

**Diseño propuesto.** Reutilizar exactamente los controles ya existentes en `ai/chat` y aplicarlos a la voz:
1. **BYOK para STT.** Reutilizar `AiConfigService.resolveProvider(userId)` (`ai-config.service.ts:108-124`) para obtener la clave OpenAI del usuario y, si existe, llamar a Whisper con ella (la clave se descifra solo en memoria, igual que en el chat). Si el usuario no tiene config, se usa la clave del servidor pero **se cuenta contra su cuota** (modo 'managed'). `TtsService`/`SttService` pasan a recibir `apiKey`/`baseUrl` por parámetro en `synthesize`/`transcribe` en lugar de leerlas en el constructor.
2. **Cuota mensual por usuario.** Reutilizar `UsageService` (`ai/usage.service.ts`): `assertWithinQuota(userId, mode)` (línea 53) y `record(userId, tokens)` (línea 37), igual que hace `ChatService.prepare` (`chat.service.ts:140`). El coste de una llamada de voz se aproxima en tokens: segundos de audio × `VOICE_TOKENS_PER_SECOND` (STT) + `Math.ceil(texto.length/4)` (TTS), mismo criterio que `estimateTokens` (`chat.service.ts:416-419`). El tope se controla con el nuevo env `VOICE_MONTHLY_QUOTA_SECONDS` (0 = ilimitado).
3. **Límite por minuto.** Reutilizar el patrón de ventana deslizante de `ChatService.checkRateLimit` (`chat.service.ts:62-80`) sobre Redis ZSET: clave `voicerate:{userId}`; `zremrangebyscore` + `zcard >= VOICE_MAX_PER_MINUTE` + `zadd`/`pexpire`, con respaldo en memoria por instancia si `RedisService.run` devuelve `null`. Por defecto 20/min (igual que el chat).
4. **Moderación.** Reutilizar `moderateInput`/`moderateOutput` y `containsSensitiveData` (`ai/moderation.ts`): en `transcribe`, moderar el texto reconocido antes de devolverlo/encadenarlo al chat (que no se envíe a terceros ni se guarde si contiene datos sensibles); en `speak`, moderar el `text` de entrada. Un texto bloqueado no llama al proveedor ni gasta cuota.
5. **Cierre del módulo.** `VoiceModule` importa `AiModule` (para `UsageService` + `AiConfigService`) y el módulo de Redis, y registra un `VoiceQuotaService` que centraliza los puntos 2, 3 y 4 (espejo de `ChatService`).
Env a añadir a `envSchema` (`config/env.config.ts`, junto a `AI_MONTHLY_TOKEN_QUOTA_*`):
- `VOICE_ENABLED: z.enum(['true','false']).default('true')` — si `false`, los endpoints responden 503 (apaga el gasto).
- `VOICE_MAX_PER_MINUTE: positiveInt(20)`.
- `VOICE_MONTHLY_QUOTA_SECONDS: z.coerce.number().int().min(0).default(1200)` — 0 = ilimitado.
- `VOICE_TOKENS_PER_SECOND: z.coerce.number().int().min(1).default(15)` — factor de coste del audio.

Decisión y rationale: no se crea una tabla nueva; el coste de voz se registra en `AiUsage` vía `UsageService.record`, así `GET /ai/usage` ya lo refleja y se reutiliza el mecanismo de 429 probado. La voz sigue siendo coste del servidor (ElevenLabs no tiene BYOK por usuario), por lo que se cuenta como modo 'managed'; STT sí puede usar la clave BYOK del usuario cuando existe.

**Archivos afectados.**
- `backend/src/modules/voice/voice.controller.ts` — inyectar `VoiceQuotaService`; `transcribe`/`speak` reciben `userId` y aplican cuota + límite + moderación.
- `backend/src/modules/voice/stt.service.ts` y `tts.service.ts` — `apiKey`/`baseUrl` por parámetro, no en el constructor.
- `backend/src/modules/voice/voice-quota.service.ts` — nuevo: cuota mensual vía `UsageService`, límite por minuto vía Redis (patrón de `checkRateLimit`), moderación.
- `backend/src/modules/voice/voice.module.ts` — importar `AiModule` + módulo de Redis; registrar `VoiceQuotaService`.
- `backend/src/config/env.config.ts` — nuevas vars en `envSchema`.
- `backend/src/modules/ai/usage.service.ts` — extender `quotaFor`/`summary`/`assertWithinQuota` con el modo `'voice'`.

**Amenazas y casos límite.**
- *Cost abuse:* una cuenta grabando minutos de audio o generando TTS largo agota la clave de ElevenLabs/Whisper → se frena con cuota mensual + 20/min + `VOICE_ENABLED=false`.
- *Ráfagas paralelas:* peticiones simultáneas saltan el conteo → la ventana deslizante Redis es compartida entre instancias y se evalúa antes de llamar al proveedor (patrón de `checkRateLimit`).
- *Cross-user:* la clave del proveedor sigue siendo global, pero la contabilidad y el límite son por `userId`; la clave BYOK del usuario solo la usa él (cifrada con AAD, `KeyCryptoService`).
- *Ownership:* `speak` recibe `speciesId` → validar que la especie existe y, si se usa dentro de un pet, comprobar propiedad (reutilizar `PetsService.getPetById`).
- *Datos sensibles* transcritos por STT → `containsSensitiveData` evita enviarlos/guardarlos.
- *Audio enorme:* mantener el tope de 10 MB y añadir tope de duración real (no solo base64) para no costear transcripciones abusivas.

**Tests.**
- Unit `voice-quota.service.spec.ts`: superar `VOICE_MONTHLY_QUOTA_SECONDS` → `assertWithinQuota` lanza 429; `record` suma segundos/tokens; exceder `VOICE_MAX_PER_MINUTE` en la ventana → 429; texto con datos sensibles (tarjeta Luhn) → no se invoca `SttService`/`TtsService` (mocks sin llamadas).
- E2E `voice.e2e-spec.ts`: `POST /v1/voice/speak` con cuota agotada → 429; 21 peticiones seguidas → la 21ª devuelve 429; `transcribe` cuyo texto contiene una tarjeta → respuesta moderada y `AiUsage` sin incremento.

**Rollout / migración.**
- Solo config: nuevas vars en `.env.example` y `docs/API.md`/`docs/DEPLOY.md`. Sin migración de BD (se reutiliza `AiUsage`). Despliegue sin riesgo: por defecto `VOICE_ENABLED=true` y 1200 s/mes; se puede bajar a 0 o apagar con `false` si se detecta abuso.

#### S-07 — Sync offline: estado global en memoria, sin límite y compartido entre usuarios

**Causa raíz.**
- Cuatro estructuras a nivel de módulo (globales del proceso), sin caducidad ni tope y compartidas por todos los usuarios: `backend/src/modules/sync/delta-sync.service.ts:33-36` (`userVersions`, `userState`, `appliedActions`, `userDeltas`).
- `appliedActions.add(action.id)` (`delta-sync.service.ts:113`) nunca se evicta → el `Set` crece indefinidamente.
- `userDeltas.get(userId)!.push(...)` (`delta-sync.service.ts:117-121`) no limita el array; cada acción guarda `args` (contenido libre) para siempre.
- `applyAction` (`delta-sync.service.ts:135-154`) no comprueba que `petId` pertenezca al `userId` → un usuario puede inyectar acciones sobre la mascota de otro.
- `pull` (`delta-sync.service.ts:77-87`) compara `d.timestamp > since` donde `since` es una versión numérica y `timestamp` es milisegundos → siempre devuelve todos los deltas.

**Diseño propuesto.** Mover el estado a Redis con claves por usuario y TTL, y añadir topes duros:
- **Esquema de claves** (usando `RedisService.key`, con prefijo de entorno):
  - `sync:version:{userId}` → entero (versión). `PSEXPIRE {SYNC_STATE_TTL_MS}`.
  - `sync:state:{userId}` → JSON de estado por pet. `PSEXPIRE {SYNC_STATE_TTL_MS}`.
  - `sync:actions:{userId}` → `SET` de ids ya aplicados (idempotencia). `PSEXPIRE {SYNC_STATE_TTL_MS}` y recorte a `SYNC_MAX_SEEN_ACTIONS` (1000) para mantener el tamaño acotado.
  - `sync:deltas:{userId}` → `LIST` de deltas. `PSEXPIRE {SYNC_STATE_TTL_MS}` y `LTRIM 0 {SYNC_MAX_DELTAS-1}` (2000).
- **Topes duros en `push`:** tope por acción de `args` (rechazar si `JSON.stringify(args).length > SYNC_MAX_ARGS_BYTES`, 4 KB) y tope de mascotas por estado (`SYNC_MAX_PETS`, 100). Si se superan, `400`/`413` y se rechaza esa acción sin tocar el estado.
- **Ownership:** reutilizar `PetsService.getPetById(userId, petId)` por acción (o por lote de `petId` únicos) antes de aplicarla; si no pertenece, se marca en `rejected` con motivo `ownership`.
- **Corregir `pull`:** guardar la versión y filtrar deltas por `version > since` (no por timestamp), devolviendo solo hasta la versión actual y acotado a `SYNC_MAX_DELTAS`.
- **Respaldo sin Redis:** si `RedisService.run` devuelve `null`, degradar a memoria **por usuario** con un LRU acotado (máx. `SYNC_MAX_PETS` pets y `SYNC_MAX_DELTAS` deltas por usuario) y eviction por TTL; nunca un mapa global sin límite.
Env a añadir a `envSchema` (`config/env.config.ts`):
- `SYNC_STATE_TTL_MS: positiveInt(86400000)` (24 h).
- `SYNC_MAX_DELTAS: positiveInt(2000)`.
- `SYNC_MAX_SEEN_ACTIONS: positiveInt(1000)`.
- `SYNC_MAX_ARGS_BYTES: positiveInt(4096)`.
- `SYNC_MAX_PETS: positiveInt(100)`.
- (Opcional) `SYNC_ENABLED: z.enum(['true','false']).default('true')` para apagar el módulo.

Decisión y rationale: persistir en Redis por usuario con TTL en vez de un mapa global. Elimina el estado compartido entre usuarios, acota la memoria (TTL + `LTRIM`/topes) y sigue el patrón ya usado por el chat de texto (`chatrate:{userId}`, ventana + TTL) y por otras funciones (misión, presencia).

**Archivos afectados.**
- `backend/src/modules/sync/delta-sync.service.ts` — reemplazar los 4 globales por operaciones Redis por usuario; topes; ownership; `pull` corregido.
- `backend/src/modules/sync/sync.controller.ts` — asegurar que `userId` siempre llega por `@CurrentUser` y propagar errores 4xx.
- `backend/src/modules/sync/sync.module.ts` — importar el módulo de Redis y `PetsModule`.
- `backend/src/config/env.config.ts` — nuevas vars en `envSchema`.
- `backend/src/modules/sync/crdt.service.ts` — opcional: usar `resolveConflicts` en la resolución del estado persistido.

**Amenazas y casos límite.**
- *Memory exhaustion:* 500 acciones/petición × 300 peticiones/min con `args` libres → se acota con `SYNC_MAX_ARGS_BYTES`, `SYNC_MAX_DELTAS`, `SYNC_MAX_PETS` y TTL; el `SET` de ids se recorta.
- *Cross-user / ownership:* inyección sobre la mascota de otro → `PetsService.getPetById` rechaza y se marca `rejected: ownership`.
- *DoS por push repetido:* idempotencia vía `sync:actions:{userId}` (SET) con recorte; una acción duplicada no vuelve a aplicarse ni a inflar deltas.
- *Versión inconsistente:* `pull` compara versiones, no timestamps; el cliente recibe solo deltas nuevos.
- *Redis caído:* degradación por usuario acotada en memoria (LRU), sin mapa global sin límite; si tampoco cabe, `503` con `Retry-After`.

**Tests.**
- Unit `delta-sync.service.spec.ts` (Redis mockado): `args` > `SYNC_MAX_ARGS_BYTES` → acción rechazada y sin mutar el estado; más de `SYNC_MAX_DELTAS` deltas → el `LIST` queda acotado; `pull(sinceVersion)` solo devuelve deltas con `version > since`; `petId` ajeno al `userId` → `rejected` con `ownership`.
- E2E `sync.e2e-spec.ts`: dos usuarios pushen y `pull` del usuario A no devuelva deltas de B; enviar 600 acciones (supera `MAX_ACTIONS_PER_PUSH`) → 400; repetir el mismo `actionId` → aplicado una sola vez; tras el TTL, las claves `sync:*:{userId}` caducan (verificar con `TTL`/`PTTL`).

**Rollout / migración.**
- Sin migración de BD (el estado de sincronía era efímero en memoria). Solo nuevas vars en `.env.example` y docs. Al desplegar, el estado anterior (solo en memoria) se pierde de forma natural en el restart; los clientes vuelven a `push`/`pull` contra Redis. No hay nada que conservar porque el estado era volátil por diseño.



### 3.5 ValidaciÃ³n de entrada y sandbox (S-10, S-11, S-17)
#### S-10 — Los módulos nuevos no validan el cuerpo de las peticiones

**Causa raíz.**
`main.ts` arranca la app con `const app = await NestFactory.create(AppModule, { logger })` (línea 41) y, de ahí a `app.listen` (línea 77), **no registra ningún `app.useGlobalPipes(...)`**. No hay `ValidationPipe` global ni ningún pipe de zod. La validación de entrada es dispar y manual:

- `auth` ya lo resuelve bien: `modules/auth/dto/auth.schemas.ts` define esquemas zod y un helper `parseOrBadRequest` (línea 56) que lanza `BadRequestException` con el primer motivo. `config/env.config.ts` y `modules/game-data/game-data.schemas.ts` también importan zod. Es decir, **zod ya es dependencia y patrón existente** que conviene reutilizar, no introducir otra librería.
- Los 23 módulos de la Fase 7 **no** lo hacen. Ej. `modules/modding/modding.controller.ts`: `publish(@Body() dto: PublishModDto)` (línea 29), `rate(... @Body() body: { stars: number; rating?: string })` (línea 73), `report(... @Body() body: { reason: string; details?: string })` (línea 86), `download(... @Body() body: { petId?: string })` (línea 96) y `update(... @Body() dto: Partial<PublishModDto>)` (línea 106). La anotación de tipo TypeScript **no filtra nada en runtime**: `stars: number` acepta `"5"` (string) o `null`. La comprobación queda en el service con `throw new BadRequestException(...)` ad-hoc (`modules/modding/modding.service.ts:57-93`).
- `modules/voice/voice.controller.ts` valida a mano: `if (!body.audio || typeof body.audio !== 'string')` (línea 46) y `if (!body.text || body.text.length > 5000)` (línea 68). `modules/adventure/adventure.controller.ts` pasa `body.petId` / `body.optionIndex` al service sin validar tipo ni rango (líneas 16-30).

Consecuencia: cualquier campo con tipo equivocado, faltante o malformado llega al service, donde cada módulo reimplementa (o se olvida de) su propia comprobación, y un payload con campos sobrantes (`__proto__`, `constructor`) entra tal cual.

**Diseño propuesto.**
Decisión: **un `ZodValidationPipe` global + un esquema zod por endpoint, activado por un decorator**. Se reutiliza zod (ya usado en `auth`) y el idiom del `app-exception.filter.ts`. El pipe es *opt-in*: si un parámetro no lleva esquema, el cuerpo pasa sin tocar (así no rompe los 23 módulos de un golpe; se migran por riesgo).

> **Nota de implementación.** Los pipes de NestJS reciben `ArgumentMetadata` (`{type, metatype, data}`), **no** `ExecutionContext`, por lo que un pipe global no puede identificar el handler/método para leer un esquema unido por decorator. Se implementa como un **pipe por endpoint**: `common/zod.pipe.ts` (`export class ZodPipe<T> { constructor(schema) }`) usado como `@Body(new ZodPipe(schema)) dto`. Es *opt-in* al igual que en el diseño (el endpoint que no lo lleva pasa intacto), devuelve `data` tipado y el 400 es `{ message: 'Datos inválidos', issues[] }`. El resto de secciones (esquemas por endpoint, orden de migración, tests) se cumple igual; el `@ZodBody` de los ejemplos se lee como `new ZodPipe(...)` y `main.ts` **no** registra pipe global.

1. `common/zod-validation.pipe.ts` + `common/zod.decorator.ts`:

```ts
// common/zod.decorator.ts
import type { ZodTypeAny } from 'zod';

const SCHEMA_MAP_KEY = 'zod:schema:map';
const index = (t: object, k: string | symbol) =>
  (Reflect.getMetadata(SCHEMA_MAP_KEY, t, k) as Record<number, ZodTypeAny> | undefined) ?? {};

/** Une un esquema zod al parámetro @Body() del handler. */
export const ZodBody = (schema: ZodTypeAny) =>
  (target: object, key: string | symbol, i: number) => {
    const map = { ...index(target, key), [i]: schema };
    Reflect.defineMetadata(SCHEMA_MAP_KEY, map, target, key);
  };

export function schemaFor(cls: new (...a: any[]) => any, method: string, paramIndex: number): ZodTypeAny | undefined {
  return index(cls.prototype, method)[paramIndex];
}
```

```ts
// common/zod-validation.pipe.ts
import { BadRequestException, ExecutionContext, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError } from 'zod';
import { schemaFor } from './zod.decorator';

/**
 * Pipe global opt-in: valida el cuerpo SOLO si el parámetro @Body() tiene @ZodBody(schema).
 * Valida y transforma (stripea campos sobrantes, coercea tipos) y devuelve `data` tipado.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform<unknown, unknown> {
  transform(value: unknown, ctx: ExecutionContext): unknown {
    const schema = schemaFor(ctx.getClass(), ctx.getHandler().name, ctx.index);
    if (!schema) return value; // sin esquema → paso transparente
    const result = schema.safeParse(value ?? {});
    if (!result.success) throw toBadRequest(result.error);
    return result.data;
  }
}

/** Convierte un ZodError → 400 con motivo + ruta de campo (no vierte el payload). */
function toBadRequest(err: ZodError): BadRequestException {
  const issues = err.issues.slice(0, 10).map((i) => ({
    field: i.path.join('.') || '(raíz)',
    message: i.message,
  }));
  return new BadRequestException({ message: 'Datos inválidos', issues });
}
```

2. Registro global en `main.ts`, tras `app.setGlobalPrefix(prefix)` (línea 50):

```ts
import { ZodValidationPipe } from './common/zod-validation.pipe';
// ...
app.useGlobalPipes(new ZodValidationPipe());
```

3. `throw new Error` → `400`: se sustituyen los `throw new BadRequestException(...)` manuales del service por esquemas zod en el controller (la validación de formato vive en el pipe); las reglas de negocio (p. ej. "solo el creator edita") **siguen** en el service. `app-exception.filter.ts` ya serializa `HttpException`, así que un `400` de `ZodValidationPipe` sale con el cuerpo `{ message, issues }` y sin stacktrace. Para `adventure`/`voice`, se elimina el bloque `if (!body.audio …)` del controller y se delega al esquema (mismo comportamiento, código centralizado).
4. **Orden de migración por riesgo** (un esquema por endpoint; primero lo que alimenta S-11 y lo con dinero/estado):

| Prioridad | Endpoint | Esquema |
|---|---|---|
| 1 (alto) | `modding.publish` | `publishModSchema` |
| 1 (alto) | `modding.report` / `modding.rate` | `modReportSchema` / `modRateSchema` |
| 1 (alto) | `voice.transcribe` / `voice.speak` | `transcribeSchema` (base64 ≤ 10MB, `lang` enum) / `speakSchema` (text ≤ 5000, `mood` enum) |
| 2 (medio) | `adventure.start` / `adventure.choose` | `adventureStartSchema` (`petId` uuid, `premium` boolean) / `chooseSchema` (`optionIndex` int 0..n) |
| 2 (medio) | `modding.download` / `modding.update` / `modding.workshop` | `downloadSchema`, `updateModSchema` (`.partial()`), `workshopQuerySchema` |
| 3 | resto de 23 módulos | un `*.schemas.ts` por módulo |

Ejemplo de esquema reutilizando los helpers de `auth.schemas.ts`:

```ts
// modules/modding/modding.schemas.ts
import { z } from 'zod';
const MOD_TYPES = ['species', 'furniture', 'minigame'] as const;
const MOD_RARITIES = ['common', 'rare', 'super_rare', 'legendary', 'mythic'] as const;

export const publishModSchema = z.object({
  type: z.enum(MOD_TYPES),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).default(''),
  element: z.string().max(32).optional(),
  rarity: z.enum(MOD_RARITIES).optional(),
  data: z.record(z.string(), z.unknown()).refine((d) => Object.keys(d).length > 0, 'data vacío'),
  sprite: z.string().max(512 * 1024).optional(),
  spriteUrl: z.string().max(512).optional(),     // validación de URL → S-11
  minigameCode: z.string().max(512 * 1024).optional(),
  minigameUrl: z.string().max(512).optional(),   // validación de URL → S-11
}).strict(); // rechaza campos sobrantes (__proto__, constructor, …)
```

Y en el controller: `publish(@CurrentUser() u, @Body() @ZodBody(publishModSchema) dto) { return this.modding.publish(u.id, dto); }`. La anotación de tipo pasa a ser derivada (`z.infer<typeof publishModSchema>`), eliminando el `PublishModDto` de mano.

**Archivos afectados.**
- `backend/src/main.ts` (registro del pipe global)
- `backend/src/common/zod-validation.pipe.ts` (nuevo)
- `backend/src/common/zod.decorator.ts` (nuevo)
- `backend/src/common/app-exception.filter.ts` (verificar que `issues` del 400 se serializa sin stack)
- `backend/src/modules/modding/modding.controller.ts` + `modding.schemas.ts` (nuevo) + `modding.service.ts` (retirar validaciones de formato manuales)
- `backend/src/modules/voice/voice.controller.ts` + `voice.schemas.ts` (nuevo)
- `backend/src/modules/adventure/adventure.controller.ts` + `adventure.schemas.ts` (nuevo)
- `backend/src/modules/*/` (resto de 23 módulos, esquema por endpoint)
- `backend/src/modules/auth/dto/auth.schemas.ts` (extraer los helpers `text()` y `parseOrBadRequest` a `common/` para reutilizar)
**Amenazas y casos límite.**
- *Campo con tipo equivocado*: `{ "stars": "5" }` → antes pasaba al service; ahora `z.number()` lo rechaza → 400. `{ "petId": 123 }` → 400.
- *Campos sobrantes / prototype pollution*: `{ type, name, data, __proto__: {...} }` → `.strict()` lo rechaza → 400.
- *Bodies enormes / indefinidos*: `voice.transcribe` con base64 de 100MB → `z.string().max(10*1024*1024)` lo corta antes de tocar la red (antes el `if` también lo hacía, pero ahora centralizado). `body: undefined` → `value ?? {}` → 400 limpio, no 500.
- *`optionIndex` fuera de rango* en `adventure.choose`: `z.number().int().min(0).max(4)` → 400; el service ya no confía en el cliente.
- *Migración parcial*: al no ser pipe *obligatorio*, un endpoint sin `@ZodBody` conserva el comportamiento de hoy, evitando un big-bang que rompa la API.

**Tests.**
- *Unit* (`common/zod-validation.pipe.spec.ts`): esquema presente + body inválido → lanza `BadRequestException` con `issues[]` acotado a 10; esquema presente + body válido → devuelve `data` transformado (stripea campos sobrantes, aplica `default`); **sin** esquema → devuelve `value` intacto; `value === undefined` → 400.
- *E2E* (`modding.e2e-spec.ts`): `POST /v1/modding/publish` con `{"type":"xeno"}` → **400** (antes 400 por el service, ahora por el pipe con `issues`); `{"name":""}` → 400; `{"type":"species","name":…,"data":{}}` → 400 (`data vacío`); body completo válido → 201. `POST /v1/voice/speak` con `text` de 5001 chars → 400. `POST /v1/adventure/choose` con `optionIndex: "abc"` → 400.
- *Contrato*: test de snapshot del cuerpo de error (siempre `{ message: 'Datos inválidos', issues: [...] }`, nunca el payload del cliente ni el stack).

**Rollout / migración.**
Sin cambios de DB ni de config. Despliegue progresivo: (1) añadir `common/zod-validation.pipe.ts` + `zod.decorator.ts` y registrar el pipe (inofensivo, no hay `@ZodBody` aún); (2) migrar por prioridad (modding → voice → adventure → resto), endpoint a endpoint, con su esquema y su test; (3) retirar las validaciones manuales duplicadas del service. Cada PR es independiente y rollback-safe.

---


#### S-11 — Sandbox de mods por lista negra de regex; URLs de mods sin validar

**Causa raíz.**
- `modules/modding/sandbox.service.ts:30-41` define `DANGEROUS_SVG_PATTERNS` (lista negra de regex: `/<script\b/i`, `/\bon[a-z]+\s*=/i`, `/href\s*=\s*["']\s*(https?:|\/\//i`, …) y `validateSprite` (líneas 58-74) solo **busca** esas cadenas. `modules/modding/sandbox.service.ts:43-52` define `DANGEROUS_JS_PATTERNS` (`/\beval\s*\(/`, `/\bfetch\s*\(/`, …) y `validateMinigame` (líneas 80-95) hace lo mismo. Una **lista negra de regex es evadible**: `<scr<script>ipt>` (anidado), `on&#102;focus=…` / `&#x4F;nfocus` (entidades XML que `test()` no descifra), `jAvAsCrIpT:` (los `/i` cubren esto, pero no la codificación `&#106;avascript:`), `jav&#x061;script:`, `<scr\x09ipt>`, o un `data:image/svg+xml` embebido. Para JS: `Function`/`eval` indirectos (`(0,eval)`, `window['eval']`, `globalThis.eval`), `import()` dinámico, `setTimeout('…')` como eval, o `fetch` oculto tras concatenación de nombre.
- **URLs sin validar**: `modules/modding/modding.service.ts:86-87` guarda `spriteUrl: dto.spriteUrl ?? …` y `minigameUrl: dto.minigameUrl ?? null` **sin ninguna comprobación**; el `update` (líneas 234-235) los acepta tal cual. Un `spriteUrl` con `javascript:…`, `data:text/html`, `//attacker.com` (protocol-relative), `http://169.254.169.254/` o `file://` queda almacenado y lo entrega `toPublic` (líneas 336-337) a quien descarga el mod.

**Diseño propuesto.**
Decisión: **sanitizer por lista blanca (allowlist) de elementos/atributos SVG + análisis estático por AST del JS + allowlist de URLs.** Se abandona la lista negra de regex. El minigame sigue ejecutándose **solo en el cliente** en un Web Worker; el backend nunca lo ejecuta — aquí solo se valida, se sanitiza y se decide si se permite publicarlo.

1. **SVG — allowlist, no blacklist.** Sustituir `DANGEROUS_SVG_PATTERNS` por un parseo+recorrido que **solo conserva** los nodos y atributos permitidos (todo lo demás se elimina o invalida):

```ts
// modules/modding/svg-sanitizer.ts  (lib: svg-sanitizer o @exodus/sanitize-svg)
const ALLOWED_ELS = new Set([
  'svg','g','path','circle','ellipse','line','polyline','polygon','rect','text','tspan',
  'defs','linearGradient','radialGradient','stop','use','clipPath','mask','pattern',
  'title','desc','symbol','feGaussianBlur','filter','feColorMatrix',
]);
const ALLOWED_ATTRS = new Set([
  'id','viewBox','width','height','x','y','cx','cy','r','rx','ry','d','points','href',
  'fill','stroke','stroke-width','stroke-linecap','opacity','transform','transform-origin',
  'x1','y1','x2','y2','stop-color','stop-opacity','offset','clip-path','mask','fill-opacity',
  'font-size','font-family','text-anchor','style',
]);

/** Devuelve SVG con SOLO nodos/atributos permitidos; lanza BadRequestException si queda inseguro. */
export function sanitizeSvg(input: string): string {
  if (!input || Buffer.byteLength(input, 'utf8') > 500 * 1024) throw new BadRequestException('SVG inválido');
  const tree = parseSvg(input);                    // parser real: descifra entidades → <script> ya no esconde
  if (tree.rootLocalName !== 'svg') throw new BadRequestException('SVG: raiz <svg> obligatoria');
  walk(tree, (n) => { if (!ALLOWED_ELS.has(n.localName)) n.remove(); });          // 1) eliminar nodo no permitido
  walk(tree, (n) => for (const a of [...n.attributes])                            // 2) atributos no permitidos
    if (!ALLOWED_ATTRS.has(a.name) || a.name.includes(':')) n.removeAttribute(a.name));
  walk(tree, (n) => { const h = n.getAttribute?.('href');                         // 3) allowlist de href
    if (h && !isAllowedHref(h)) n.removeAttribute('href'); });
  return serializeSvg(tree);                   // reserializa sin <script>, on*, foreignObject por construcción
}
```

Al ser **lista blanca**, no existe patrón a esquivar: un `<script>` ni un `onfocus` no están en `ALLOWED_ELS`/`ALLOWED_ATTRS` y se eliminan en vez de detectarse. El parseo real además descifra entidades (`&#102;`), cerrando el bypass por codificación. Se deja `MAX_SPRITE_BYTES = 500KB`.
2. **JS — aislamiento real, no regex.** Dos capas:

- *(a) Backend: análisis estático por AST.* En vez de `DANGEROUS_JS_PATTERNS`, parsear el bundle con un parser (acorn) y **rechazar** nodos concretos, que una regex no distingue:

```ts
// modules/modding/minigame-analyzer.ts
import * as acorn from 'acorn';
const FORBIDDEN = new Set(['eval','Function','import','require','fetch','XMLHttpRequest',
  'WebSocket','Worker','importScripts','localStorage','sessionStorage','navigator','location']);
export function analyzeMinigame(code: string): void {
  if (Buffer.byteLength(code, 'utf8') > 500 * 1024) throw new BadRequestException('Minigame demasiado grande');
  let ast; try { ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' }); }
  catch { throw new BadRequestException('Minigame: JS no parseable'); }
  walkAst(ast, (node) => {
    if (node.type === 'Identifier' && FORBIDDEN.has(node.name))
      throw new BadRequestException(`Minigame: API prohibida "${node.name}"`);
    if (node.type === 'MemberExpression' && isStaticStringAccess(node))
      if (FORBIDDEN.has(resolvedName(node))) throw new BadRequestException('Minigame: API prohibida'); // window['eval']
    if (node.type === 'CallExpression' && isDynamicEval(node))
      throw new BadRequestException('Minigame: eval dinámico');   // (0,eval)(...)
  });
}
```

- *(b) Cliente: aislamiento del Web Worker.* `workerConfig()` (sandbox.service.ts:101-108) ya declara timeout 60s / 10MB / API limitada. Se refuerza con **CSP estricta** del iframe/worker y **sin acceso a `DOM`, `network` ni `parent-context`**: el worker recibe la API PetAI únicamente por `postMessage` (`petai.getPet`, `petai.submitScore`, `petai.log`); `importScripts` restringido a un allowlist de bundles propios (`'self'`), `crossOriginIsolated: true`, y el HTML del worker con `sandbox="allow-scripts"` (sin `allow-same-origin`). El análisis del backend es una segunda línea de defensa, no la única: aunque alguien eluda el AST, el worker no tiene `document`/`fetch` para explotar.

3. **URL allowlist.** Función compartida `isAllowedModUrl(url)` aplicada a `spriteUrl`, `minigameUrl` y a `href` del SVG (en el sanitizer):

```ts
// modules/modding/mod-urls.ts
const ALLOWED_HOSTS = new Set(['cdn.petai.io', 'assets.petai.io']); // solo CDN propio
export function isAllowedModUrl(url: string): boolean {
  if (url.startsWith('inline://')) return true;                 // esquemas internos propios
  if (!url.startsWith('https://')) return false;               // nada de http:, data:, file:, //host
  let u; try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  if (isIpHost(u.hostname)) return false;                       // nada de IP / 169.254.169.254
  return ALLOWED_HOSTS.has(u.hostname) || ALLOWED_HOSTS.has(`www.${u.hostname}`);
}
```

Se aplica en `publish`/`update` del service: `if (dto.spriteUrl && !isAllowedModUrl(dto.spriteUrl)) throw new BadRequestException('spriteUrl no permitida')` (y lo mismo para `minigameUrl`). Combinado con `publishModSchema` de S-10 (que ya limita tipo/longitud), la URL pasa dos filtros: esquema zod + allowlist.
**Archivos afectados.**
- `backend/src/modules/modding/sandbox.service.ts` (reemplazar `validateSprite` por `sanitizeSvg`; `validateMinigame` por `analyzeMinigame`; mantener `workerConfig`)
- `backend/src/modules/modding/svg-sanitizer.ts` (nuevo)
- `backend/src/modules/modding/minigame-analyzer.ts` (nuevo)
- `backend/src/modules/modding/mod-urls.ts` (nuevo, `isAllowedModUrl`)
- `backend/src/modules/modding/modding.service.ts` (llamar al sanitizer en `publish`/`update`; validar `spriteUrl`/`minigameUrl`)
- `backend/src/modules/modding/modding.schemas.ts` (de S-10, campos `spriteUrl`/`minigameUrl`)
- `desktop/src` (cliente): HTML/worker del minigame con CSP `sandbox="allow-scripts"`, `importScripts` allowlist, `crossOriginIsolated`
- `backend/package.json` (dep: `svg-sanitizer` o `@exodus/sanitize-svg`, `acorn`, `xmldom`)

**Amenazas y casos límite.**
- *Bypass de entidades SVG*: `<scr&#105;pt>` / `on&#102;focus` / `&#x4F;nload` → el parseo real descifra y el allowlist de elementos/atributos elimina el nodo → limpio.
- *URL maliciosa*: `spriteUrl="data:text/html,<script>…"` → `isAllowedModUrl` (solo `https://` hosts permitidos o `inline://`) → 400. `spriteUrl="//attacker.com/x.svg"` → no empieza por `https://` → 400. `minigameUrl="http://169.254.169.254/…"` → protocolo + IP → 400.
- *SVG embebido / nested*: `<svg><foreignObject>…</foreignObject></svg>` → `foreignObject` no está en `ALLOWED_ELS` → eliminado.
- *JS evasivo*: `(0,eval)('…')`, `globalThis['fetch']`, `import('/x')` → el AST detecta el `Identifier`/`MemberExpression` con nombre en `FORBIDDEN` → 400; aunque pasara, el worker sin `network`/`DOM` no puede ejecutarlo.
- *Bundle > 500KB* → 400 antes de parsear (DoS por CPU de parseo). *SVG malformado* → parse error → 400, no excepción no controlada (500).
- *`data` JSON indefinido* (de S-10): `z.record` acota; los números `stats` siguen limitados por `STAT_MAX=999` en `validateData` (regla de negocio, se conserva en el service).

**Tests.**
- *Unit — SVG sanitizer* (`svg-sanitizer.spec.ts`): `sanitizeSvg('<svg><script>alert(1)</script><circle/></svg>')` → devuelve solo `<svg><circle/></svg>`; `sanitizeSvg('<svg onload="x()"><rect/></svg>')` → sin `onload`; caso entidad `'<svg><scr&#105;pt>x</scr&#105;pt></svg>'` → limpio; `<svg href="javascript:…">` → `href` eliminado; SVG de 600KB → `BadRequestException`; entrada no-SVG (`'<div></div>'`) → 400.
- *Unit — minigame* (`minigame-analyzer.spec.ts`): `'eval("x")'` → 400; `'window["fetch"](url)"'` → 400; `'import("x")'` → 400; código legítimo (`'petai.submitScore(9)'`) → OK; JS no parseable → 400; >500KB → 400.
- *Unit — URLs* (`mod-urls.spec.ts`): `isAllowedModUrl('https://cdn.petai.io/a.svg')` → true; `'inline://u/n'` → true; `'data:text/html,<'` → false; `'//a.com/x'` → false; `'http://169.254.169.254/'` → false; `'https://attacker.com/'` → false.
- *E2E* (`modding.e2e-spec.ts`): `POST /v1/modding/publish` con `sprite: '<svg><script>…'` → 400; con `spriteUrl: 'javascript:alert(1)'` → 400; con `minigameCode: 'fetch("/api")'` → 400; payload limpio → 201 y el `spriteUrl` devuelto es el sanitizeado/permitido.

**Rollout / migración.**
Sin cambios de esquema de BD, pero **sí de config de despliegue**: (1) fijar `CORS_ORIGINS`/config para que el cliente sirva los sprites/minijuegos solo desde `cdn.petai.io`/`assets.petai.io` (los hosts de `ALLOWED_HOSTS`); (2) añadir las deps nuevas a `backend/package.json` y pasar `pnpm audit` en CI; (3) el cliente (Tauri/Svelte) necesita el worker con `sandbox="allow-scripts"` + CSP antes de activar los minigames custom — **S-11 debe estar cerrado antes de activar el modding** (coincide con el orden de la auditoría). Los mods ya publicados con `spriteUrl`/`minigameUrl` fuera de allowlist se marcan `status='hidden'` en una tarea de backfill (ver S-17 para el patrón de migración por fases).

---
#### S-17 — Un solo usuario puede ocultar cualquier mod con 3 reports

**Causa raíz.**
- `modules/modding/modding.service.ts:43`: `const MAX_REPORTS_BEFORE_HIDE = 3;`. En `report()` (líneas 168-189) el service hace `this.prisma.modReport.create({ data: { modId, userId, reason, details } })` **sin comprobar si ese `userId` ya ha reportado ese `modId`**, incrementa `reportCount` y, al llegar a `reportCount >= 3`, marca `status: 'hidden'`. Resultado: la **misma cuenta** crea 3 filas de `ModReport` sobre el mismo mod y lo oculta.
- `prisma/schema.prisma:951-962`: el modelo `ModReport` solo tiene `@@index([modId])`; **no hay `@@unique([modId, userId])`** (a diferencia de `ModRating`, que sí lleva `@@unique([modId, userId])` en línea 947, y `ModDownload` en línea 972). El motor de base de datos no impide el duplicado.
- El controller `report(@CurrentUser() user, @Param('id') id, @Body() body: { reason: string; details?: string })` (`modding.controller.ts:83-89`) no valida ni `reason` ni `details` (sin esquema zod), por lo que `reason` llega `undefined` y el service lo fuerza a `'inapropiado'` (línea 173) sin acotar longitud.

**Diseño propuesto.**
Decisión: **impedir el duplicado a nivel de base de datos (`@@unique([modId, userId])`) + tratar el re-report como idempotente (no error 500), y exigir N *reportantes distintos* para ocultar.** El unique constraint es la garantía dura (funciona incluso con réplicas/peticiones simultáneas); el `reportCount` del mod pasa a reflejar *usuarios distintos*.

1. `prisma/schema.prisma` — añadir la restricción a `ModReport`:

```prisma
model ModReport {
  id        String   @id @default(uuid())
  modId     String
  mod       Mod      @relation(fields: [modId], references: [id], onDelete: Cascade)
  userId    String
  reason    String
  details   String?
  reviewed  Boolean  @default(false)
  createdAt DateTime @default(now())

  @@unique([modId, userId])   // ← un report por (mod, usuario); duplica de ModRating
  @@index([modId])
}
```
2. `modding.service.ts:report()` — idempotencia y conteo por usuario distinto:

```ts
async report(userId: string, modId: string, reason: string, details?: string) {
  const mod = await this.prisma.mod.findUnique({ where: { id: modId } });
  if (!mod || mod.status === 'deleted') throw new NotFoundException('Mod no encontrado');

  // Un report por (mod, usuario): si ya existe, es idempotente (no incrementa, no lanza 500).
  try {
    await this.prisma.modReport.create({
      data: { modId, userId, reason: reason ?? 'inapropiado', details: details ?? null },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { reportId: null, reportCount: mod.reportCount, hidden: mod.status === 'hidden', duplicate: true };
    }
    throw e;
  }

  // reportCount = nº de reportantes distintos (garantizado por el unique)
  const updated = await this.prisma.mod.update({
    where: { id: modId },
    data: { reportCount: { increment: 1 } },
  });

  let hidden = false;
  if (updated.reportCount >= MAX_REPORTS_BEFORE_HIDE && updated.status === 'published') {
    await this.prisma.mod.update({ where: { id: modId }, data: { status: 'hidden' } });
    hidden = true;
    this.logger.warn(`Mod ${modId} auto-hidden por ${updated.reportCount} reportantes distintos`);
  }
  return { reportId: updated.id, reportCount: updated.reportCount, hidden };
}
```

3. (Complemento S-10) `modReportSchema` para el controller: `z.object({ reason: z.string().min(1).max(200).default('inapropiado'), details: z.string().max(2000).optional() }).strict()`, aplicado con `@ZodBody`. Así `reason`/`details` quedan acotados antes de tocar la BD.
**Archivos afectados.**
- `backend/prisma/schema.prisma` (`@@unique([modId, userId])` en `ModReport`)
- `backend/prisma/migrations/…_modding_unique_report.sql` (nueva migración, ver Rollout)
- `backend/src/modules/modding/modding.service.ts` (`report()`: try/catch `P2002` + comentario sobre conteo por usuario)
- `backend/src/modules/modding/modding.controller.ts` (`@ZodBody(modReportSchema)`)
- `backend/src/modules/modding/modding.schemas.ts` (nuevo, `modReportSchema`)
- `backend/src/modules/modding/modding.service.spec.ts` / `modding.e2e-spec.ts` (tests)

**Amenazas y casos límite.**
- *Un usuario reporta 3 veces el mismo mod*: 1.º report → crea e incrementa a 1; 2.º y 3.º → `P2002` (unique) → respuesta idempotente `duplicate: true`, `reportCount` sigue en 1 → **el mod no se oculta**.
- *3 usuarios distintos* reportan el mismo mod → `reportCount` llega a 3 → `status='hidden'` (comportamiento deseado: la mayoría de usuarios distintos).
- *Peticiones simultáneas del mismo usuario* (race): el unique constraint de Postgres rechaza la segunda inserción (`P2002`) aunque lleguen a la vez → idempotencia garantizada a nivel de BD, no solo app.
- *Re-report tras re-apertura del mod*: si el mod vuelve a `published`, el unique sigue por `(modId,userId)` — un usuario que ya reportó no vuelve a contar. Si se quiere permitir re-report tras revisión, el patrón es *delete+create* del `ModReport` en el flujo de revisión, no relajar el unique.
- *`reason`/`details` con payload inyectable o enorme*: `modReportSchema` limita a 200/2000 chars y `.strict()`; al ser `String`/`String?` en Prisma (no interpolado en SQL), no hay inyección (ya no la había, pero la entrada queda acotada).
- *Cuenta de `reportCount` tras migración*: los `reportCount` históricos de mods con reports duplicados quedan inflados; se recalculan en la migración (ver Rollout).

**Tests.**
- *Unit* (`modding.service.spec.ts`): mock de Prisma — `report(u1, m)` 3 veces → `create` llamada 1 vez real + 2 `P2002` → `reportCount` = 1, `hidden: false`; 3 usuarios distintos → `reportCount` = 3, `hidden: true` y `status` → `hidden`; `P2002` devuelto como `{ duplicate: true }`, no excepción.
- *E2E* (`modding.e2e-spec.ts`): crear mod; `POST /v1/modding/:id/report` 3 veces con el **mismo** JWT → tras las 3, `GET /v1/modding/:id` → `status === 'published'` (no `hidden`), `reportCount === 1`; con **3 JWT distintos** → `status === 'hidden'`, `reportCount === 3`; 2.º report del mismo usuario → `200` con `duplicate: true` (no 500, no 409-opcional).
- *Único/contrato*: test de migración que inserta un duplicado `(modId,userId)` → `Prisma` lanza `P2002` (verifica que el constraint está).

**Rollout / migración.**
**Sí cambia la BD** — hay que desplegar con cuidado por los datos existentes:

1. **Backfill (previo al constraint):** eliminar los `ModReport` duplicados por `(modId,userId)` conservando el más antiguo:

```sql
DELETE FROM "ModReport" a USING "ModReport" b
WHERE a."modId" = b."modId" AND a."userId" = b."userId" AND a."createdAt" > b."createdAt";
```

2. **Re-calcular `reportCount`** por mod (nº de usuarios distintos), que antes contaba duplicados:

```sql
UPDATE "Mod" m
SET "reportCount" = (SELECT COUNT(DISTINCT r."userId") FROM "ModReport" r WHERE r."modId" = m.id);
```

3. **Crear el unique constraint** (idempotente, tolerante — si fallara por un residuo, ya se limpió en el paso 1):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "ModReport_modId_userId_unique" ON "ModReport"("modId", "userId");
```

Se empaqueta en una **migración de Prisma** (generada tras añadir `@@unique([modId, userId])` al schema). En Postgres, un `CREATE UNIQUE INDEX` es *online* (`CONCURRENTLY` en producción para no bloquear escrituras durante el backfill). Plan de despliegue: (1) ejecutar el backfill + re-count, (2) aplicar el unique, (3) desplegar el servicio con `report()` idempotente. Si algo falla entre pasos, no se pierde consistencia porque el nuevo código ya trata el `P2002` y el viejo no duplicaba datos tras el backfill. Rollback: `DROP INDEX "ModReport_modId_userId_unique"` y revertir el servicio (el `reportCount` recalculado es compatible con ambos).









### 3.6 ExposiciÃ³n de informaciÃ³n, infra y docs (S-15, S-16, S-18, S-19, S-20, S-21)
#### S-15 — Presencia de cualquier usuario visible para cualquier otro

**Causa raíz.**
El endpoint `GET /v1/presence/:userId` (verificado en `backend/src/modules/presence/presence.controller.ts:38-46`) está tras `JwtAuthGuard` (línea 28), pero el handler `getPresence(@Param('userId') userId)` usa el `userId` de la URL, no el del token: cualquier usuario autenticado puede listar los dispositivos (`deviceId`, `platform`, `lastHeartbeat`) y el estado online/offline de cualquier otro usuario llamando a `presenceService.getPresence(victimId)` (`presence.service.ts:55-70`) y `hasActiveDevices(victimId)` (líneas 75-78). No hay comprobación de propiedad. El co-op `visit` (líneas 50-67) sí usa `@CurrentUser()`, pero `getPresence` no.

**Diseño propuesto.**
Aplicar comprobación de propiedad, alineando con el resto del controller:
1. En `getPresence` añadir `@CurrentUser() user: any` y, si `user.id !== userId`, lanzar `new ForbiddenException('No puedes consultar la presencia de otro usuario')` (importar `ForbiddenException` de `@nestjs/common`). Solo si coinciden se devuelve `{ userId, devices, hasActiveDevices }`.
2. Alternativa más fuerte (recomendada si la presencia de terceros no tiene caso de uso propio): eliminar el `userId` del path y servir siempre la presencia propia — `GET /v1/presence` → `getPresence(user.id)`. El co-op sigue usando el `ownerId` del body.
3. No se exponen `deviceId` ajenos: al no poder consultar ajenos, el vector de correlación (qué dispositivo de quién está activo) desaparece.

**Archivos afectados.**
- `backend/src/modules/presence/presence.controller.ts`
- `backend/src/modules/presence/presence.service.ts` (solo si se reestructura a presencia propia)
- (nuevo) `backend/src/modules/presence/presence.controller.spec.ts`

**Amenazas y casos límite.**
- Enumeración masiva de `userId`: ahora devuelve 403 (sin información de que el usuario existe).
- El propio usuario sigue viendo sus dispositivos (autenticado).
- `hasActiveDevices` de un tercero deja de estar disponible vía API; si algún cliente interno lo necesita, debe llamar con el token del propio dueño.
- Riesgo residual: un atacante con un JWT válido sigue viendo la presencia de su propia cuenta (correcto).

**Tests.**
- Unit (`presence.controller.spec.ts`): `getPresence(userA)` con token de `userB` → 403; `getPresence(userA)` con token de `userA` → 200 con su lista.
- E2E: con dos cuentas, `GET /v1/presence/{otra}` → 403; `GET /v1/presence` (propio) → 200.

**Rollout / migración.**
- Sin cambios de BD ni de config. Ruptura de API menor si se cambia la firma a `GET /v1/presence` (sin `:userId`); actualizar `docs/API.md` si se usa esa variante. Si se conserva el path, no hay ruptura.

#### S-16 — API keys: carrera en el límite, claves Redis sin TTL y `list` devuelve el hash

**Causa raíz.**
- Carrera GET→INCR sin caducidad en `enforceRateLimit` (`backend/src/modules/webhooks/api-key.service.ts:108-120`): hace `r.get(windowKey)` (línea 111) y después `r.incr(windowKey)` (línea 119) como operaciones separadas (dos peticiones concurrentes leen el mismo valor y ambas pasan), y la clave `apikey:rl:{keyId}:{minuto}` (línea 109) nunca lleva `EXPIRE`, así que se acumula una clave por key por minuto para siempre.
- `touchLastUsed` (líneas 126-131) crea `apikey:lastused:{keyId}:{minuto}` con `setnx` (línea 128) y también sin `EXPIRE`.
- `list` (líneas 67-78) devuelve `keyHash: k.keyHash` (línea 72) al cliente, innecesario y que facilita brute-force/correlación de las claves.

**Diseño propuesto.**
1. Reutilizar `AuthThrottleService.hitFixed` (`backend/src/modules/auth/auth-throttle.service.ts:132-156`), que ya hace `INCR` + `PEXPIRE … NX` atómico en un único `MULTI` (línea 137). Sustituir el cuerpo de `enforceRateLimit(keyId)` por:
   - `const retryAfter = await this.throttle.hitFixed(`apikey:${keyId}`, RATE_LIMIT_PER_MIN, 60_000);`
   - si `retryAfter > 0` lanzar `new HttpException('Rate limit excedido (100 req/min)', 429)` con cabecera `Retry-After`.
   - Inyectar `AuthThrottleService` (exportarlo desde `AuthModule`) y eliminar el `GET`/`INCR` manual.
   - Sin Redis, `hitFixed` degrada a su mapa en memoria (líneas 144-155), de modo que el límite ya no desaparece al caerse Redis.
2. `touchLastUsed`: cambiar `setnx` por `set(lockKey, '1', 'EX', 60)` (o reutilizar `hitFixed` con tope 1) para que la clave caduque. Mantener el write a BD solo cuando el contador lo permite.
3. `list`: quitar el campo `keyHash` de la respuesta (línea 72). Conservar `id, name, scopes, lastUsedAt, revokedAt, createdAt`.

**Archivos afectados.**
- `backend/src/modules/webhooks/api-key.service.ts`
- `backend/src/modules/auth/auth.module.ts` (exportar `AuthThrottleService`)
- `backend/src/modules/webhooks/webhooks.module.ts` (importar `AuthModule`/`AuthThrottleService`)
- (nuevo) `backend/src/modules/webhooks/api-key.service.spec.ts`

**Amenazas y casos límite.**
- Peticiones concurrentes: `hitFixed` es atómico, no hay sobrepaso del tope.
- Redis caído: antes no había límite; ahora hay límite en memoria por instancia (coherente con `RateLimitGuard`).
- Crecimiento de memoria/Redis acotado por `MAX_KEYS` (`auth-throttle.service.ts:7`) y TTL de 60 s.
- Quitar `keyHash` de `list` no afecta a `verify`/`create` (los hash siguen en BD).

**Tests.**
- Unit: `enforceRateLimit` lanza 429 al superar 100 en la ventana (mock de `hitFixed` que devuelve 1); `list` no contiene `keyHash`; `touchLastUsed` aplica `EX 60`.
- E2E: 101 peticiones con la misma API key en un minuto → la 101ª devuelve 429; `GET /v1/apikeys` no expone el hash.

**Rollout / migración.**
- Sin migración de BD ni cambio de config. Retrocompatible en API salvo el campo `keyHash` que desaparece de `list` (verificar que ningún cliente lo consume; si lo hiciera, mantenerlo una release más con deprecation).
#### S-18 — API pública expone el nombre del dueño sin opt-in

**Causa raíz.**
- `/public/leaderboard` (`backend/src/modules/webhooks/public-api.controller.ts:17-49`) incluye `user: { select: { displayName: true } }` (línea 32) y devuelve `owner: p.user?.displayName ?? null` (línea 46) para **todos** los pets, sin comprobar la preferencia de visibilidad del dueño.
- En cambio `/public/pets/:petId` (líneas 71-100) sí aplica opt-in leyendo `user?.notificationPrefs.publicPets === true` (línea 86), y la auditoría señala que esa preferencia vive dentro de `notificationPrefs`, que no es su sitio.

**Diseño propuesto.**
1. Centralizar la preferencia en un campo propio. Añadir `publicProfile Boolean @default(false)` a `User` (migración Prisma no destructiva) y un endpoint de ajuste `PATCH /me/visibility` (o extender `PATCH /me`) para leer/escribirlo. Crear un helper `isPublicProfile(user)` que lee `user.publicProfile` y, durante la transición, cae a `(user?.notificationPrefs as any)?.publicPets === true` para no romper quien ya optó.
2. En `leaderboard`, filtrar con la opt-in: solo incluir en `entries` los pets cuyo dueño sea público. **Decisión:** excluir los no públicos del ranking público (coherente con `/pets/:id`, que da 404). Para evitar N consultas, hacer un único `pet.findMany` con `where: { user: { publicProfile: true } }` (o, en fase de transición, recuperar los `userId` y filtrar en memoria con la lista de públicos). El `limit` (top N) se aplica sobre el conjunto público.
3. En `/pets/:petId` sustituir la línea 86 por el helper `isPublicProfile(user)` (misma semántica, sitio correcto).

**Archivos afectados.**
- `backend/prisma/schema.prisma` (campo `User.publicProfile`)
- nueva migración `backend/prisma/migrations/<ts>_add_user_public_profile/migration.sql`
- `backend/src/modules/webhooks/public-api.controller.ts`
- `backend/src/modules/auth/...` (endpoint `PATCH /me/visibility` o extender `PATCH /me`) y su DTO
- (nuevo) `backend/src/modules/webhooks/public-api.controller.spec.ts`

**Amenazas y casos límite.**
- Fuga por ranking: un dueño con `publicProfile=false` no aparece en el leaderboard (nombre y `petId` ocultos).
- En la opción de excluir no se producen filas con `owner: null`.
- Tras la migración, todos empiezan en `false` (privado por defecto). Quien ya usaba `notificationPrefs.publicPets=true` mantiene visibilidad hasta que ajuste el nuevo campo (helper de transición).

**Tests.**
- Unit: `leaderboard` con mezcla de públicos/privados → solo retorna los públicos; `isPublicProfile` lee `publicProfile` y cae a `notificationPrefs.publicPets`.
- E2E: dueño privado → su pet no aparece en `/public/leaderboard` y `/public/pets/{id}` → 404; tras `PATCH /me/visibility { publicProfile: true }` → aparece.

**Rollout / migración.**
- Migración de Prisma: `ALTER TABLE "User" ADD COLUMN "publicProfile" BOOLEAN NOT NULL DEFAULT false` → `prisma migrate dev --name add_user_public_profile` y `migrate deploy` en producción.
- Rollout: desplegar migración → desplegar backend con el helper de transición → deprecar `notificationPrefs.publicPets` (puede quitarse en una release posterior).

#### S-19 — Cuerpos de error del proveedor de IA filtrados o propagados al cliente

**Causa raíz.**
- STT: `transcribe` (`backend/src/modules/voice/stt.service.ts:58-62`) hace `const errorBody = await response.text()` (línea 59), lo loguea (`logger.error(... ${errorBody})`, línea 60) y lo lanza al cliente: `throw new Error('STT failed: ' + status + ' - ' + errorBody)` (línea 61).
- ai-router: `GenericProvider.streamChat` (`backend/src/modules/ai-router/providers/generic.provider.ts:58-62`) hace `const errorBody = await response.text()` (línea 59) y lo propaga: `yield { type: 'error', message: 'Provider error ' + status + ': ' + errorBody, code }` (línea 60). El núcleo (`ai/chat`) evita esto a propósito.

**Diseño propuesto.**
Introducir un único helper de sanitización y aplicarlo a ambos:
1. Nuevo `backend/src/modules/voice/sanitize-provider-error.ts` (o util compartido) con `sanitizeProviderError(status: number): string` que devuelve un mensaje genérico por estado: `401/403 → 'No autorizado en el proveedor de IA'`, `429 → 'Límite del proveedor alcanzado, reintenta más tarde'`, `5xx → 'El proveedor de IA no está disponible'`, otro `4xx → 'Error del proveedor de IA (' + status + ')'`, resto → `'Error del proveedor de IA'`. Nunca interpela el cuerpo.
2. `stt.service.ts`: loguear solo `status` y el `model`/`baseUrl` (línea 60) y lanzar `new Error(sanitizeProviderError(response.status))` (línea 61). El cuerpo del log interno, si se necesita para depurar, solo en `NODE_ENV !== 'production'`; nunca en el `throw`.
3. `generic.provider.ts` (y, por coherencia, `openai.provider.ts` si tiene el mismo patrón): `yield { type: 'error', message: sanitizeProviderError(response.status), code: String(response.status) }` (línea 60). El cuerpo solo a `logger.debug` en dev, nunca en el evento `error`.

**Archivos afectados.**
- `backend/src/modules/voice/stt.service.ts`
- `backend/src/modules/voice/sanitize-provider-error.ts` (nuevo, o util compartido)
- `backend/src/modules/ai-router/providers/generic.provider.ts`
- `backend/src/modules/ai-router/providers/openai.provider.ts` (si aplica)
- (nuevo) `backend/src/modules/voice/sanitize-provider-error.spec.ts`

**Amenazas y casos límite.**
- Un proveedor que devuelva el propio `apiKey`, URLs internas o datos de otra cuenta en el body: ya no viajan al cliente ni a logs de producción.
- El cliente sigue sabiendo el código HTTP (`code`), útil para reintentos, sin detalle sensible.
- Timeouts y errores de red (`AbortError`, `CONNECTION`) ya usan mensajes genéricos (líneas 73-74, 127, 129); mantenerlos.

**Tests.**
- Unit: `sanitizeProviderError(401)` → 'No autorizado…'; `(429)` → mensaje de límite; `(503)` → no disponible; un cuerpo `'{ "error": "sk-…" }'` nunca aparece en la salida.
- Unit (STT/Provider): stub `fetch` con `ok:false` y body sensible → el `Error`/`yield` no contiene el body; el logger de producción no recibe el body.
- E2E (voice): falla de Whisper simulada → respuesta 5xx con mensaje genérico, sin filtrado del cuerpo.

**Rollout / migración.**
- Sin migración ni config. Ruptura de formato del mensaje de error (se vuelve genérico); si algún cliente hace match de la cadena antigua, avisar.

#### S-20 — Infraestructura: imágenes `:latest`, imagen prod con dev-deps, Redis sin contraseña y `/__metrics` del edge sin auth

**Causa raíz.**
- `docker-compose.prod.yml`: `prometheus` usa `prom/prometheus:latest` (línea 72), `grafana/grafana:latest` (línea 88) y `prom/alertmanager:latest` (línea 104) — sin versión fija ni digest.
- `backend/Dockerfile` (líneas 18-24): el stage `runtime` copia `/app` completo del stage `build` y conserva «las dependencias completas» (node_modules con dev-deps) por necesidad del CLI de Prisma y `ts-node`; el riesgo se marca como aceptado en `DEPLOY.md` §8 (línea 149).
- Redis sin contraseña: `docker-compose.prod.yml:22-24` (`redis:7-alpine`, `command redis-server --appendonly yes`, sin `requirepass`) y `REDIS_URL: redis://redis:6379` (línea 45) sin credenciales. Aceptable dentro de la red interna, pero agrava S-02 si hay salto a red no aislada.
- Edge `/__metrics` sin autenticación: `edge/worker.ts:70-72` sirve `renderMetrics()` a quien haga `GET /__metrics`, sin chequeo de cabecera/credencial.

**Diseño propuesto.**
1. **Fijar versiones/digests.** Reemplazar `:latest` por versiones concretas (p. ej. `prom/prometheus:v2.53.x`, `grafana/grafana:11.x`, `prom/alertmanager:v0.28.x`) y, para máxima reproducibilidad, por digest (`image: grafana/grafana@sha256:…`). `postgres:17-alpine` y `redis:7-alpine` ya están versionados.
2. **Redis con contraseña.**
   - `redis.command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD:?define REDIS_PASSWORD}"]`
   - `REDIS_URL: redis://:****@redis:6379` (backend, línea 45).
   - `env.config.ts` ya valida `REDIS_URL` (z.string, línea 18); añadir a `productionProblems` (línea 81) una comprobación de que en producción `REDIS_URL` lleva credenciales (recomendado, no bloqueante) y documentar `REDIS_PASSWORD` como obligatorio en producción (`DEPLOY.md`, `.env.example`).
3. **`/__metrics` del edge con auth.** En `edge/worker.ts`, exigir una cabecera compartida (p. ej. `x-metrics-token` igual a un secreto `METRICS_TOKEN` de `Env`) o un token query; si no coincide, devolver `403`. Añadir `METRICS_TOKEN?: string` a `Env`. Prometheus se configura con `bearer_token`/cabecera en el scrape. Si `METRICS_TOKEN` no se define, `/__metrics` sigue abierto **solo fuera de producción**.
4. **Imagen prod sin dev-deps (decisión: mantener full por ahora, mitigar).** Para no romper `prisma migrate deploy`/seed en el mismo contenedor, conservar las dependencias completas esta release y documentar en `DEPLOY.md` la alternativa: un contenedor `runner` (solo `dist` + prod deps) y un `migrate` job separado con la imagen de build. **Decisión explícita:** esta release fija versiones y endurece Redis/metrics; el split runner/migrator se hace en una tarea de infra independiente.

**Archivos afectados.**
- `docker-compose.prod.yml`
- `backend/Dockerfile` (si se aplica el split)
- `edge/worker.ts`
- `edge/wrangler.toml` / config de binds de Cloudflare (nuevo secret `METRICS_TOKEN`)
- `backend/src/config/env.config.ts` (validación de `REDIS_URL`/`REDIS_PASSWORD`)
- `infra/observability/prometheus/prometheus.yml` (credencial en el scrape del backend y del edge)
- `.env.example`, `docs/DEPLOY.md`

**Amenazas y casos límite.**
- `:latest`: un upstream que publique una versión incompatible rompe el deploy sin aviso; con digest/fija no.
- Redis con `requirepass`: todo cliente debe usar `REDIS_URL` con credencial; tests y dev pueden seguir sin contraseña (`REDIS_PASSWORD` opcional fuera de producción).
- `METRICS_TOKEN` ausente en prod → `/__metrics` devuelve 403 (acceso a métricas cortado); planear antes del deploy.
- Prometheus/Grafana/Alertmanager ya están en `127.0.0.1` (líneas 75, 91, 107); fijar versiones no cambia la exposición.

**Tests.**
- Unit (edge): `GET /__metrics` sin `x-metrics-token` en prod → 403; con token correcto → 200 con `petai_cdn_refresh_ms`; en dev (sin `METRICS_TOKEN`) → 200.
- Compose (CI): `docker compose -f docker-compose.prod.yml config` falla si `REDIS_PASSWORD`/versiones están mal; lint de imágenes (`hadolint`/`docker scout`) que no permita `:latest`.
- E2E (metrics): scrape con credencial → 200; sin → 403.

**Rollout / migración.**
- Config: añadir `REDIS_PASSWORD` a los secretos y actualizar `REDIS_URL` (backend y otros clientes). No destructiva; requiere reinicio del stack.
- Edge: crear el secret `METRICS_TOKEN` en Cloudflare antes de publicar el worker.
- Imágenes: pull de las versiones fijadas en el pipeline antes del deploy.

#### S-21 — Documentación de seguridad desfasada (Informativa)

**Causa raíz.**
La documentación describe comportamientos que no coinciden con el código verificado:
- `docs/DEPLOY.md` §8 (línea 153) dice «renovación de sesión en la app de escritorio (**hoy no usa el refresh token**)», pero el escritorio sí usa el refresh (`desktop/src/lib/api.ts` consume `POST /auth/refresh`).
- `docs/specs/spec-26-security-e2e.md`: la pregunta abierta 5 (línea 164) afirma «¿CSP en Tauri? → Sí (**ya viene por defecto**, reforzar)», mientras el código tiene `"csp": null` (`desktop/src-tauri/tauri.conf.json:26`); y el objetivo «E2E encryption chat IA» (líneas 17, 32-33, 47-52) describe un cifrado E2E que en el código solo guarda una clave pública (`E2eKeyPair`/`e2e-encryption.service.ts`), sin cifrado en el chat.
- `README.md`: línea 62 «**33 features**» y línea 195 «**33 funcionalidades expandidas (Fase 7)**: **implementadas y con tests**» cuando 23 módulos no tienen ningún test; y línea 105 (fila 026) «Token rotación, device fingerprinting, **E2E encryption en chat**».

**Diseño propuesto (ediciones concretas).**
1. `docs/DEPLOY.md` §8, línea 153: sustituir «renovación de sesión en la app de escritorio (hoy no usa el refresh token)» por «renovación de sesión en la app de escritorio **usa el refresh token (rotatorio) a través de `POST /v1/auth/refresh`**». Actualizar además la lista de riesgos del §8 para reflejar los puntos de esta sección (presencia, API keys, opt-in del leaderboard, errores de proveedor sanitizados, Redis con contraseña y métricas del edge autenticadas).
2. `docs/PROYECTO.md` §8 (Mascota de escritorio): corregir la afirmación de que los tokens «van al llavero del sistema» → indicar que hoy viven en `localStorage` (punto de mejora S-09).
3. `docs/specs/spec-26-security-e2e.md`:
   - Pregunta abierta 5 (línea 164): cambiar a «¿CSP en Tauri? → **No** (`"csp": null` en `tauri.conf.json:26`); pendiente activar (S-09)».
   - Sección «E2E Encryption» / AC4-AC5 (líneas 32-33, 47-52): matizar que la implementación actual **solo persiste la public key P-256** (`POST /e2e/public-key`) y **no cifra el chat**; el cifrado E2E de mensajes es objetivo pendiente.
4. `README.md`:
   - Línea 105 (fila 026): «Token rotación, device fingerprinting, **E2E encryption en chat**» → «Token rotación, device fingerprinting (E2E encryption **pendiente**)».
   - Línea 195: «33 funcionalidades expandidas (Fase 7): implementadas y con tests» → «33 funcionalidades expandidas (Fase 7): **implementadas; la cobertura de tests está en curso (23 módulos aún sin tests)**».
   - Línea 62: mantener el recuento pero añadir «(cobertura de tests parcial)».
5. `docs/DEPLOY.md` §8 (línea 149): al fijar versiones/Redis/metrics (S-20), actualizar el riesgo de «la imagen incluye dev-deps» con la nueva postura (split runner/migrator pendiente) y añadir el requisito de `REDIS_PASSWORD`.

**Archivos afectados.**
- `docs/DEPLOY.md`
- `docs/PROYECTO.md`
- `docs/specs/spec-26-security-e2e.md`
- `README.md`
- `docs/AUDITORIA_SEGURIDAD.md` (opcional: marcar S-15…S-21 como resueltos al cerrarlos)

**Amenazas y casos límite.**
- Doc y código divergen → un operador que lea el §8 cree que el escritorio no renueva (falso) o que la CSP/E2E están activas (falso). Tras estas ediciones, la doc describe el estado real y los puntos pendientes.
- Si las features de Fase 7 ganan tests, reactualizar la línea 195 del README.

**Tests.**
- Sin tests de código (cambio documental). Añadir al CI una comprobación de consistencia opcional (p. ej. que `csp` no sea `null` cuando la doc la declare activa) como tarea posterior.

**Rollout / migración.**
- Sin migración ni config. Se aplica en el mismo PR que cierra S-15…S-20 para que doc y código coincidan a la vez.




## 4. Plan de despliegue por oleadas

Checklist accionable. Cada item apunta a la sección §3 donde vive el diseño. Se valida cada oleada con `pnpm backend:test` + los tests e2e de carrera nuevos y `tsc --noEmit` en verde.

### Oleada 1 — bloqueo antes de desplegar (S-01, S-02, S-08)
- [ ] **S-01** (§3.1): acotar el fast-path (`JWT_FASTPATH_TTL` de minutos) + revocación vía `tokenVersion` (KV/Redis) **o** eliminarlo y no desplegar `edge/`; en ambos casos, no emitir `refreshFastPath` hasta que la revocación funcione.
- [ ] **S-02** (§3.2): `register`/`deliver` pasan por `resolveSafeBaseUrl` + `pinnedFetch`; eliminar el oráculo `test().statusCode`; añadir `WEBHOOK_ALLOW_INSECURE` (off por defecto, bloqueado en prod).
- [ ] **S-08** (§3.2): `DEVKIT_ENABLED` (off por defecto, rechazado en `productionProblems` en prod) + `DevGuard` (loopback o `DEVKIT_TOKEN`).
- Verificación: e2e SSRF (IP privada → 4xx/failed), DevKit 404/403 según flags, arranque en prod con fast-path sin claves → falla.

### Oleada 2 — antes de abrir registro público (S-03, S-04, S-05, S-06, S-07, S-14)
- [ ] **S-05** (§3.3): `WalletService` + `CHECK (coins>=0 AND gems>=0)`; usarlo en seasons/habitat/adventure/genes/tournament con entrega en la misma transacción.
- [ ] **S-03** (§3.3): claim atómico de regalos (`updateMany … count===1`), `qty` entero, expiración + cron, límite diario dentro de la transacción.
- [ ] **S-04** (§3.3): descuento de energía con `updateMany(energy gte)` **antes** de simular; límite diario sobre `RaidParticipant`.
- [ ] **S-14** (§3.3): claim atómico de `settle`/`payOut` (pago solo si `count===1`) + `CronLockService` (`SET NX PX`) en todos los `@Cron`.
- [ ] **S-06** (§3.4): cuota mensual + límite/min + moderación de voz (reutilizar `UsageService`/`moderation`); env de voz en `envSchema`.
- [ ] **S-07** (§3.4): estado de sync por usuario en Redis con TTL y topes; ownership de `petId`.
- Verificación: un test de carrera por operación económica (§5).

### Oleada 3 — siguiente iteración (S-09, S-10, S-12, S-13, S-15)
- [ ] **S-10** (§3.5): `ZodValidationPipe` + esquema por endpoint; `throw new Error` → 400.
- [ ] **S-12** (§3.3): recompensas validadas en servidor (duración mínima + score plausible vs semilla); race de `group-feeding` corregida; `finalizeRoom` dentro de transacción.
- [ ] **S-13** (§3.1): eliminar `token-rotation.service`; `clientIp` por `req.ip`; TTL al fingerprint; retirar el flag falso `e2eEnabled`; `DELETE /account` (RGPD).
- [ ] **S-15** (§3.6): presencia solo para el propio usuario o amistad aceptada (404 uniforme).
- [ ] **S-09** (§3.1): CSP estricta, tokens en llavero (Tauri secure store), capability acotada, SVG sanitizado.

### Oleada 4 — cuando se active el modding (S-11, S-17)
- [ ] **S-11** (§3.5): sanitizer SVG por lista blanca + aislamiento real de JS (iframe sandbox/Worker sin red) + allowlist de `spriteUrl`/`minigameUrl` + persistir el asset validado.
- [ ] **S-17** (§3.5): `@@unique([modId, userId])` en `ModReport`; auto-hide por usuarios **distintos**.

### Oleada 5 — mantenimiento (S-16, S-18, S-19, S-20, S-21)
- [ ] **S-16** (§3.6): `INCR`+`EXPIRE` atómico (o `AuthThrottleService.hitFixed`); TTL a las claves; no devolver `keyHash`.
- [ ] **S-18** (§3.6): `displayName` del dueño por opt-in (`User.publicPetList`), fuera de `notificationPrefs`.
- [ ] **S-19** (§3.6): errores de proveedor sanitizados (no propagar ni registrar el cuerpo).
- [ ] **S-20** (§3.6): imágenes fijadas por versión/digest; etapa prod sin dev-deps; `REDIS_PASSWORD`; `/__metrics` del edge autenticado.
- [ ] **S-21** (§3.6): actualizar `DEPLOY.md §8`, `spec-26` y `README` para que coincidan con el código.

## 5. Matriz de tests de concurrencia

Regla general (modelo `chests-race.e2e-spec.ts`): dos peticiones simultáneas a la misma operación → **exactamente una** `200`/`201` y las demás `409`/`400`/`429`; el estado en BD refleja **una sola** mutación (nada duplicado, saldo no negativo, pago una sola vez).

| Operación económica | Test de carrera | Invariante a afirmar |
|---|---|---|
| Aceptar/rechazar regalo (S-03) | `test/gifts-race.e2e-spec.ts` | 1 entrega; inventario con 1 copia; 1 propietario |
| Ataque raid (S-04) | `test/raid-race.e2e-spec.ts` | energía se descuenta por cada ataque válido |
| Cobro seasons/habitat/adventure/genes/tournament (S-05) | `test/<mód>-race.e2e-spec.ts` | saldo nunca < 0; 1 entrega por cobro |
| Settle raid / payOut torneo (S-14) | `test/raid-settle-race.e2e-spec.ts`, `test/tournament-payout-race.e2e-spec.ts` | pago exacto una sola vez |
| Crear raid/torneo (S-14) | `test/raid-create-race.e2e-spec.ts` | 1 fila activa/corriente |
| Cocina / group-feeding (S-12) | `test/cooking-race.e2e-spec.ts`, `test/group-feeding-race.e2e-spec.ts` | recompensa una sola vez |

## 6. Riesgos residuales y decisiones abiertas

- **S-01**: el SDD diseña la opción «acotar + revocar» para conservar la latencia del edge; la alternativa «eliminar el fast-path» (más simple) está documentada en §3.1. El fast-path ya emitido caduca en minutos tras el fix; mientras no se despliegue, conviene no emitirlo.
- **E2E (S-13 / S-21)**: se recomienda **retirar** el flag falso `e2eEnabled: true` en vez de implementar ECDH completo ahora; `spec-26` lo marca como pendiente.
- **Voz TTS (S-06)**: ElevenLabs no expone BYOK; el coste sigue siendo del servidor y se acota con cuota. STT sí puede usar la key BYOK del usuario cuando existe.
- **Redis caído**: los fixes de S-06/S-07/S-14/S-16 degradan a memoria **acotada por usuario**; documentar que la idempotencia/cuota es por instancia en ese caso.
- **Despliegue del edge**: hasta cerrar S-01, `edge/` no debe desplegarse; `JWT_ACCESS_SECRET` no debería vivir en Cloudflare.
- **Re-verificación**: tras cada oleada, re-leer `DEPLOY.md §8` (S-21) y fijar «última revisión: <commit>» para que no vuelva a desfasarse.

## 7. Checklist de cierre

- [ ] `tsc --noEmit` sin errores.
- [ ] `pnpm backend:test` en verde, incluidos los tests de carrera nuevos (§5).
- [ ] `pnpm validate:data`.
- [ ] Ningún endpoint de las oleadas 2-3 sin validación (S-10) ni sin test.
- [ ] `DEPLOY.md §8`, `spec-26` y `README` alineados con el código (S-21).
- [ ] `docker-compose.prod.yml` / `Dockerfile` sin `:latest` ni dev-deps en prod, y con `REDIS_PASSWORD` (S-20).
