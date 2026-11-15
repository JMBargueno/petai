# Despliegue en producción

Guía para publicar el backend de PetAI y distribuir los clientes. El backend es el único componente que
corre en un servidor; los clientes (escritorio, Android, iOS) se instalan en los dispositivos.

## 1. Requisitos

| Componente | Versión | Notas |
|---|---|---|
| PostgreSQL | 17 | Datos de juego y cuentas. Con copias de seguridad (ver §6). |
| Redis | 7 | Límites de intentos, vinculación de dispositivos y clasificación. Es opcional para arrancar (el servidor degrada a memoria/PostgreSQL), pero **obligatorio si hay más de una réplica**. |
| Proxy con TLS | Caddy, Nginx, Traefik… | El backend habla HTTP; el cifrado lo pone el proxy. |
| Docker | 24+ | Opcional pero recomendado (ver §3). |

## 2. Secretos y variables de entorno

El servidor **se niega a arrancar en producción** (`NODE_ENV=production`) si algún secreto conserva el valor
público de desarrollo o si hay protecciones desactivadas. Genera cada secreto con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | sí | Cadena de conexión de PostgreSQL con credenciales propias. |
| `REDIS_URL` | recomendada | Por ejemplo `redis://redis:6379`. |
| `JWT_ACCESS_SECRET` | sí | ≥ 32 caracteres, distinto del de refresco. |
| `JWT_REFRESH_SECRET` | sí | ≥ 32 caracteres. |
| `AI_KEY_ENCRYPTION_KEY` | sí | 64 caracteres hex (AES-256-GCM). **Si se pierde, las keys de IA guardadas no se pueden descifrar**; guárdala en un gestor de secretos. Rotarla invalida las keys existentes (los usuarios tendrían que volver a introducirlas). |
| `TRUST_PROXY` | sí tras proxy | Nº de saltos de confianza (normalmente `1`). Sin él, el límite de intentos vería la IP del proxy. |
| `CORS_ORIGINS` | no | Orígenes de navegador permitidos. Los clientes nativos y el webview de Tauri no necesitan más. |
| `SWAGGER_ENABLED` | no | Por defecto `false` en producción. |
| `RATE_LIMIT_PER_MINUTE` | no | Peticiones por minuto por usuario autenticado o por IP (300 por defecto). Súbelo si muchos usuarios comparten IP sin iniciar sesión. |
| `AI_ALLOW_INSECURE_URLS`, `AUTH_RATE_LIMIT_DISABLED`, `RATE_LIMIT_DISABLED` | **nunca** | El arranque falla si están activas en producción. |

Los límites de intentos (`AUTH_*`), el límite global (`RATE_LIMIT_PER_MINUTE`) y las cuotas de IA (`AI_MONTHLY_TOKEN_QUOTA_*`) tienen valores por defecto
razonables; ver `.env.example` y `docs/API.md`.

## 3. Despliegue con Docker Compose (un servidor)

```bash
cp .env.example .env
# Edita .env: POSTGRES_USER, POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, AI_KEY_ENCRYPTION_KEY
docker compose -f docker-compose.prod.yml up -d --build
```

Qué hace el contenedor del backend al arrancar: aplica las migraciones pendientes (`prisma migrate deploy`)
y lanza `node dist/src/main`. El puerto 3000 solo se publica en `127.0.0.1`: coloca delante el proxy TLS.

Ejemplo mínimo con Caddy (certificado automático):

```
api.tudominio.com {
    reverse_proxy 127.0.0.1:3000
}
```

Para WebSocket (`/socket.io`) el proxy debe permitir el *upgrade* (Caddy y Nginx con
`proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`). Las respuestas SSE del chat
requieren **desactivar el buffering** del proxy (en Nginx: `proxy_buffering off;`), o el texto no llegará en
streaming.

### Catálogo del juego (primera vez)

El catálogo (especies, patrones, comidas) lo carga el seed. En producción **no crea el usuario demo**:

```bash
docker compose -f docker-compose.prod.yml exec backend pnpm exec ts-node prisma/seed.ts
```

Hay que repetirlo cuando cambien los JSON de `shared/game-data/` (es idempotente).

## 4. Varias réplicas

- Ejecuta las migraciones **una sola vez** antes de subir réplicas (`prisma migrate deploy` desde un job), y
  cambia el `CMD` de la imagen para que no las ejecute en cada réplica.
- Redis es necesario: los límites de intentos, la vinculación de dispositivos y los límites del chat se
  comparten por Redis. Sin él cada réplica contaría por separado.
- Todavía **en memoria y por instancia** (no compartido): el turno pendiente del modo Hermes local
  (`prepareLocal`, caduca a los 5 min), la exclusión de «una respuesta de chat en curso por usuario» y la
  limitación de extracción de memoria. Con balanceo sin afinidad de sesión, esas tres cosas pueden
  comportarse de forma levemente distinta; mueve el turno de Hermes local a Redis si lo usas con réplicas.
- El WebSocket (`/realtime`) mantiene el estado de conexión en cada instancia: usa afinidad de sesión
  (*sticky sessions*) o el adaptador de Redis de socket.io si necesitas emitir entre réplicas.

## 5. Sondas de salud

| Ruta | Uso |
|---|---|
| `GET /v1/health` | *Liveness*: el proceso responde. |
| `GET /v1/health/ready` | *Readiness*: PostgreSQL responde (`503` si no). Devuelve `redis: up/degraded`. |

El contenedor ya incluye un `HEALTHCHECK` sobre `/v1/health`. Al recibir `SIGTERM` el servidor cierra
conexiones de forma ordenada.

## 6. Copias de seguridad y recuperación

- **PostgreSQL**: `pg_dump` diario (o snapshots del volumen) y prueba de restauración periódica. Es la única
  fuente de verdad de cuentas, mascotas e inventario.
- **Redis**: contiene datos derivados (clasificación, contadores) y se reconstruye solo: la clasificación
  global se recompone desde PostgreSQL si Redis está vacío. Con `appendonly yes` sobrevive a reinicios.
- **Secretos**: copia de `AI_KEY_ENCRYPTION_KEY` y de los secretos JWT en un gestor de secretos.

## 7. Rendimiento de referencia

Medido en local (portátil, Node 22, PostgreSQL y Redis en Docker) con `backend/scripts/loadtest.sh`
(autocannon, 50 conexiones, 10 s, sin errores):

| Endpoint | Peticiones/s | Latencia p99 |
|---|---|---|
| `GET /health` | ~5 400 | 35 ms |
| `GET /health/ready` (BD + Redis) | ~2 650 | 26 ms |
| `GET /shop` (catálogo en caché) | ~2 450 | 25 ms |
| `GET /pets` (BD, autenticado) | ~760 | 76 ms |
| `GET /leaderboard` (Redis) | ~660 | 93 ms |

Son cifras de un único proceso de Node en una máquina de desarrollo: sirven para detectar regresiones, no como
dimensionamiento. El login usa Argon2id (≈ decenas de ms de CPU por intento, a propósito), y está limitado por
IP y cuenta; para una prueba de carga del login hay que subir los límites `AUTH_*` en un entorno de pruebas.
Nunca lances la prueba contra producción sin permiso: es tráfico sintético intenso.

## 8. Auditoría de seguridad (resumen)

Medidas ya aplicadas, con su prueba automática:

- Contraseñas con Argon2id; mismo coste de cálculo y misma respuesta para cuenta inexistente o contraseña errónea.
- Tokens: acceso corto (15 min) y refresco rotatorio atómico con detección de reutilización (revoca todas las sesiones).
- El usuario puede cerrar todas sus sesiones (`/auth/logout-all`) y cambiar la contraseña (`/auth/password`, que también las cierra). Las conexiones WebSocket se cortan al caducar el token con el que se abrieron (máximo 5 por usuario).
- Límite de intentos en login (por cuenta+IP, por IP y por cuenta), registro, refresh, vinculación de dispositivos y chat, más un límite global de peticiones por usuario/IP (Redis).
- Vinculación de dispositivos: la confirmación es atómica y un código ya confirmado no se puede reasignar a otra cuenta.
- Keys de IA de los usuarios cifradas con AES-256-GCM y ligadas al usuario (AAD): una key copiada a la fila de otro usuario no se descifra.
- Protección SSRF en las URL de proveedor: solo HTTPS, sin rangos privados o reservados (incluidas las IPv4 incrustadas en IPv6: mapeadas, NAT64, 6to4) y con la conexión fijada a la IP validada, de modo que un cambio de DNS posterior (rebinding) no la desvía.
- Las acciones que dan recompensa tienen coste, espera o condición (el baño solo cuenta si la mascota lo necesita); el ELO se actualiza por incrementos atómicos.
- JWT con el algoritmo fijado (HS256); los errores de red del proveedor de IA no se devuelven al cliente.
- Validación estricta de entradas (zod) y filtro global de excepciones sin filtrar trazas.
- CORS por lista de orígenes; Swagger desactivado en producción; cabeceras de seguridad con `helmet`.
- Arranque bloqueado en producción con secretos o ajustes inseguros.
- El usuario demo (contraseña pública) no se crea en producción.
- `pnpm audit --prod`: sin vulnerabilidades conocidas en la fecha de esta revisión (la CI lo ejecuta en cada cambio con `--audit-level=high`).
- CI con permisos de solo lectura y acciones de terceros fijadas por SHA.

Riesgos conocidos y aceptados:

- El registro responde 409 si el correo ya existe (permite saber si una cuenta está registrada; el límite de registros por IP lo acota).
- El límite de fallos por cuenta desde cualquier IP permite que un atacante con muchas direcciones bloquee temporalmente el inicio de sesión de un tercero (no sus sesiones ya abiertas).
- Tras `logout-all` o un cambio de contraseña, los access tokens ya emitidos siguen valiendo hasta caducar (15 min).
- En el modo Hermes local la respuesta la afirma el cliente: sube la inteligencia sin pasar por un proveedor (limitado a 20 mensajes por minuto y sin efecto en el combate).
- La imagen de producción incluye las dependencias de desarrollo (necesita el CLI de Prisma y ts-node para migraciones y seed).

Pendiente o fuera de alcance de esta revisión (no se ha hecho una auditoría externa ni un pentest):
verificación de compras (Play Billing / StoreKit), rotación de secretos sin cortes, WAF/DDoS a nivel de infraestructura,
verificación de correo y recuperación de contraseña. (La app de escritorio **sí** renueva por refresh token, pero lo guarda en `localStorage`; moverlo al llavero del sistema y activar la CSP queda pendiente, ver S-09.)

## 9. Distribución de los clientes

### Escritorio (Tauri 2)

```bash
cd desktop
cp .env.example .env.production      # y pon VITE_API_URL=https://api.tudominio.com (sin /v1)
pnpm install
pnpm exec tauri build --bundles nsis   # Windows: instalador .exe (NSIS)
```

- Windows: el instalador queda en `desktop/src-tauri/target/release/bundle/nsis/PetAI_<versión>_x64-setup.exe`
  (instalación por usuario, sin permisos de administrador). Para MSI, `--bundles msi` (requiere WiX, que Tauri
  descarga). **MSIX no está soportado por Tauri 2**; si se necesita Microsoft Store, hay que empaquetar el `.exe`
  con las herramientas de MSIX aparte.
- macOS: `pnpm exec tauri build --bundles dmg` **en un Mac** (no se puede cruzar desde Windows). Para
  distribuir fuera de tu equipo hay que firmar con un Developer ID y notarizar.
- **Firma de código en Windows**: sin certificado, SmartScreen avisará de «editor desconocido». Con certificado,
  configúralo en `bundle.windows.certificateThumbprint` o firma el `.exe` con `signtool`.
- La URL del backend se fija **en tiempo de compilación** (`VITE_API_URL`): un instalador por entorno.

### Actualizaciones automáticas del escritorio

La app comprueba si hay versión nueva a los 30 s de arrancar y cada 6 h (también desde la bandeja
› «Buscar actualizaciones» y en Ajustes › Acerca de). Si hay una, la mascota avisa y el usuario la instala con
«Instalar y reiniciar». Como el repo es **privado**, el backend hace de proxy:
`GET /v1/desktop/updates/:target/:arch/:version` lee el último release **publicado** de GitHub (los borradores
no cuentan) y `GET /v1/desktop/updates/download/:assetId` redirige a la descarga firmada de GitHub.

Puesta en marcha (una sola vez):

1. Genera el par de claves del updater **y guarda la privada en un sitio seguro**: si se pierde, las
   instalaciones existentes no podrán volver a actualizarse.
   ```bash
   cd desktop && pnpm tauri signer generate -w ~/.tauri/pockai.key
   ```
2. Pega la clave **pública** (`~/.tauri/pockai.key.pub`) en `desktop/src-tauri/tauri.conf.json` ›
   `plugins.updater.pubkey` y haz commit.
3. En GitHub › Settings › Secrets › Actions crea `TAURI_SIGNING_PRIVATE_KEY` (contenido de `pockai.key`) y
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
4. En el backend de producción define `GITHUB_RELEASES_TOKEN`: un *fine-grained PAT* con permiso de solo
   lectura **Contents** sobre el repo. Si hace falta, también `GITHUB_RELEASES_REPO`. Sin token el endpoint
   responde 204 y no se ofrecen actualizaciones.

Publicar una versión:

1. Sube la versión en `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml` y
   `desktop/package.json`.
2. Crea y sube la etiqueta: `git tag v0.2.0 && git push origin v0.2.0`. El workflow `release.yml` genera
   un **borrador** con los instaladores, los `.sig` y `latest.json`.
3. Revisa el borrador y **publícalo**. A partir de ese momento, en un máximo de 5 min (caché del backend),
   los clientes ven la versión nueva.

Descarga desde la web: el botón «Descargar» de Windows apunta a `{apiUrl}/v1/desktop/download/windows`
(también existe `/macos`), que redirige al instalador del último release publicado. No hay que tocar la web en
cada versión, pero sí poner en `web/src/app/site.json` › `apiUrl` la URL del backend de producción
(`https://api-pockai.jmbargueno.com`) antes de desplegar la web.

Notas:
- El endpoint por defecto de `tauri.conf.json` es la API de producción (tiene que ser `https`: el plugin
  rechaza `http` en builds release y la app no arrancaría). En CI se sustituye por `PETAI_API_URL`.
- Los builds locales (`tauri build`) no generan artefactos del updater ni necesitan la clave. Eso solo pasa en CI
  (el workflow activa `createUpdaterArtifacts` y fija el endpoint en el runner).
- Las instalaciones anteriores a esta función (v0.1.0) no tienen updater: hay que reinstalarlas a mano una vez.

### Android

```bash
cd mobile/android
./gradlew :app:bundleRelease      # .aab para Play Store (necesita keystore de firma)
```

El `buildType release` apunta a `https://api.petai.example/v1` (marcador de posición): cámbialo en
`app/build.gradle.kts` (`API_BASE_URL`) antes de publicar, y configura la firma de la release (keystore fuera del
repositorio). Play Billing y notificaciones push (FCM) siguen pendientes.

### iOS

Pendiente (se desarrollará en macOS).

## 10. Lista de comprobación previa al lanzamiento

- [ ] Secretos generados y guardados fuera del repositorio.
- [ ] TLS activo y `TRUST_PROXY` correcto (probar que la IP en los logs es la del cliente).
- [ ] `GET /v1/health/ready` en verde y sondas configuradas en el balanceador.
- [ ] Copia de seguridad de PostgreSQL probada con una restauración real.
- [ ] Catálogo cargado con el seed (y sin usuario demo).
- [ ] Instaladores compilados con la `VITE_API_URL` de producción y firmados.
- [ ] URL de la API de la release de Android actualizada.

## 11. Producción en jmbargueno.com

Despliegue real (15-11-2026) del stack sobre el servidor Contabo (`185.215.165.254`),
repositorio en `/home/jmbargueno/scratch/petai`:

- **Dominio público**: `api-pockai.jmbargueno.com` → record A sin proxy en Cloudflare
  (el TLS lo termina nginx-proxy, no Cloudflare). Postgres y Redis quedan solo en la red
  interna `petai_default`; Prometheus/Grafana/Alertmanager escuchan en `127.0.0.1`.
- **Overlay**: `docker-compose.pockai.yml` (commit) añade la red `webproxy` al backend
  (`networks: [default, webproxy]` — no solo `webproxy`, que cortaría el acceso a
  postgres/redis), `VIRTUAL_HOST`, `VIRTUAL_PORT=3000`, `VIRTUAL_WEBSOCKETS` (socket.io)
  y `LETSENCRYPT_HOST` (vhost :80 con webroot para certbot).
  Comando de despliegue: `docker compose -f docker-compose.prod.yml -f docker-compose.pockai.yml up -d --build`
- **TLS**: certbot (cuenta LE del volumen compartido `nginx_certs`) + symlinks flat
  relativos (`api-pockai.jmbargueno.com.crt -> ./live/.../fullchain.pem`, `.key`,
  `.chain.pem`, `.dhparam.pem -> ./dhparam.pem`). `nginx -t && nginx -s reload` en
  `nginx-proxy`. La cuenta LE de acme-companion del proxy sigue pausada.
  Renovación: `~/.hermes/scripts/pockai-cert-renew.sh` (cron `40 3 * * *`; watchdog
  silencioso, repunta los symlinks flat y recarga nginx solo si renovó).
- **Secretos**: `.env` (chmod 600, gitignored) con `POSTGRES_USER/PASSWORD`,
  `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`.
  `OPENAI_API_KEY` intencionadamente vacía: el chat de IA degrada sin ella; para
  activarla se añade al `.env` y `docker compose ... up -d backend` (sin migraciones).
- **Backups**: `~/.hermes/scripts/petai-backup.sh` (cron `0 3 * * *`) →
  `~/backups/petai/YYYY-MM-DD/{pg-dumpall.sql.gz, redis.rdb.gz}`. El dumpall va con
  `--clean --if-exists` y se restaura con `pg_restore`/`psql` sobre un PostgreSQL 17.
- **Catálogo**: seed idempotente (`upsert`), sin usuario demo en producción:
  `docker compose -f docker-compose.prod.yml exec backend pnpm exec ts-node prisma/seed.ts`
- **Fixes de despliegue aplicados** (commits del 15-11):
  - `PinoNestLogger.emit` usaba el level numérico de Nest como nombre de método de pino
    (`this.pino[30]`); con Nest 11 (`abortOnError` por defecto) el backend hacía
    `process.abort()` al bootstrap. Ahora mapea `levelToMethod()` → trace/debug/info/warn/error.
  - `shared/game-data/*.json` se `require()`a desde `dist/src/modules/<x>/` hacia
    `/app/backend/shared/`; el Dockerfile copia `shared` también a `/app/backend/shared`
    (antes solo iba a `/app/shared/`, lo que daba `MODULE_NOT_FOUND` al arrancar).
