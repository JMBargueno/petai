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
| `AI_ALLOW_INSECURE_URLS`, `AUTH_RATE_LIMIT_DISABLED` | **nunca** | El arranque falla si están activas en producción. |

Los límites de intentos (`AUTH_*`) y las cuotas de IA (`AI_MONTHLY_TOKEN_QUOTA_*`) tienen valores por defecto
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
- Límite de intentos en login, registro, refresh, vinculación de dispositivos y chat (Redis).
- Keys de IA de los usuarios cifradas con AES-256-GCM; protección SSRF en las URL de proveedor.
- Validación estricta de entradas (zod) y filtro global de excepciones sin filtrar trazas.
- CORS por lista de orígenes; Swagger desactivado en producción; cabeceras de seguridad con `helmet`.
- Arranque bloqueado en producción con secretos o ajustes inseguros.
- El usuario demo (contraseña pública) no se crea en producción.
- `pnpm audit --prod`: sin vulnerabilidades conocidas en la fecha de esta revisión (repetir en cada release; la CI no lo ejecuta todavía).

Pendiente o fuera de alcance de esta revisión (no se ha hecho una auditoría externa ni un pentest):
verificación de compras (Play Billing / StoreKit), rotación de secretos sin cortes, y WAF/DDoS a nivel de infraestructura.

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
- Actualizaciones automáticas: no están configuradas (haría falta el plugin updater de Tauri, una clave de
  firma y un servidor de *manifests*).

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
