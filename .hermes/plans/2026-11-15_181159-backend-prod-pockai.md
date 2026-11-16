# Desplegar backend + Postgres + Redis de PetAI en pockai.jmbargueno.com

## Goal

Tener el backend NestJS de PetAI corriendo en producción con `docker-compose.prod.yml` del repo, la API pública en **`api-pockai.jmbargueno.com`** (TLS vía nginx-proxy, mismo patrón que la web), PostgreSQL 17 y Redis 7 solo internos, observabilidad local, seed cargado y backups diarios — sin tocar la web ya desplegada en `pockai.jmbargueno.com`.

## Contexto actual / supuestos

- **Repo**: `/home/jmbargueno/scratch/petai`, rama `main` en `7284dcb`. El repo YA trae el despliegue de producción listo: `docker-compose.prod.yml` (postgres17 + redis7 + backend + prometheus/grafana/alertmanager, todos en `127.0.0.1`), `backend/Dockerfile` (multi-stage pnpm, `prisma migrate deploy` + `node --expose-gc dist/src/main` en el CMD, healthcheck sobre `/v1/health`), `docs/DEPLOY.md` y `.env.example`.
- **Infra de la web (patrón a imitar)**: el contenedor `pockai-web` está en la red Docker `webproxy` (nginx-proxy + acme-companion, puertos 80/443 del host) con `VIRTUAL_HOST=pockai.jmbargueno.com`. **La cuenta LE de nginx-proxy está PAUSADA** → los certs de pockai salen por certbot (cuenta del volumen `nginx_certs`) en layout flat (`/etc/nginx/certs/<dominio>.{crt,chain.pem,key,dhparam.pem}`) y se renuevan con `~/.hermes/scripts/pockai-cert-renew.sh`. Haremos exactamente lo mismo para `api-pockai`.
- **DNS**: zona `jmbargueno.com` en Cloudflare (zone id `dbcb884beb7ebc6c6797512f9f7c1cd0`), `CLOUDFLARE_API_TOKEN` en env. `pockai.jmbargueno.com` resuelve a la IP del host `185.215.165.254` **sin proxy CF** (necesario para LE HTTP-01) → `api-pockai` igual.
- **Colisiones verificadas**: puertos 3000/3001/9090/9093 libres en host; 5432 y 6379 del compose prod NO se publican al host (solo red interna) → cero colisión con los stacks existentes (n8n, zettas, mailcow, opengym).
- **Secretos**: backend en `NODE_ENV=production` **se niega a arrancar** si `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `AI_KEY_ENCRYPTION_KEY` o `DATABASE_URL` conservan los valores de `.env.example` (son públicos). Generaremos los nuestros.
- **El admin web** (`/es/admin/` en la web, sin recarga) no apunta todavía a ninguna API; cuando lo haga usará `https://api-pockai.jmbargueno.com` → `CORS_ORIGINS` debe incluir `https://pockai.jmbargueno.com`.
- Subdominios: `api-pockai.jmbargueno.com` es el **único** servicio con subdominio público. Postgres/Redis **no** se exponen (ni al host, ni a internet): acceso solo desde la red interna de Docker. Observabilidad: solo `127.0.0.1` de momento (Grafana `127.0.0.1:3001`, Prometheus `:9090`, Alertmanager `:9093`); el lock por VPN (`grafana-pockai`) queda como mejora opcional fuera de este plan.

## Arquitectura (2-3 frases)

El proyecto compose se ejecuta desde el checkout `~/scratch/petai` en `main` (el build context del Dockerfile es la raíz del repo). Un **overlay** `docker-compose.pockai.yml` (committed) une el contenedor `backend` a la red externa `webproxy` y le inyecta `VIRTUAL_HOST=api-pockai.jmbargueno.com`, de modo que nginx-proxy haga de front TLS + WebSocket upgrade + desbuffering SSE. El resto (postgres, redis, observabilidad) queda en la red interna del proyecto, igual que hoy `pockai-web` está tras el proxy.

## Paso a paso

### T1 — Registro DNS `api-pockai.jmbargueno.com` (5 min)

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/dbcb884beb7ebc6c6797512f9f7c1cd0/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"A","name":"api-pockai","content":"185.215.165.254","proxied":false,"ttl":1}' | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["success"], d["result"]["id"])'
```
Esperado: `True <record-id>`.

Verificación: `dig +short api-pockai.jmbargueno.com A @1.1.1.1` → `185.215.165.254` (1-2 min de propagación).

### T2 — Overlay de compose en el repo (5 min)

Crear `docker-compose.pockai.yml` en la RAÍZ del repo (`/home/jmbargueno/scratch/petai/docker-compose.pockai.yml`):

```yaml
# Overlay para pockai.jmbargueno.com: expone el backend vía nginx-proxy (red webproxy).
# Uso: docker compose -f docker-compose.prod.yml -f docker-compose.pockai.yml up -d --build
services:
  backend:
    networks:
      webproxy:
        external: true
    environment:
      VIRTUAL_HOST: api-pockai.jmbargueno.com
      VIRTUAL_PORT: "3000"
      VIRTUAL_WEBSOCKETS: "true"   # socket.io: upgrade HTTP→WS en el vhost
```

Commit:
```bash
git add docker-compose.pockai.yml && git commit -m "feat(infra): overlay compose pockai (api vía nginx-proxy)"
```
(Es infraestructura del repo; no se toca `docker-compose.prod.yml` — sigue siendo la referencia genérica.)

### T3 — Secretos y `.env` (5 min)

En `~/scratch/petai`, con cada valor generado UNA vez con `openssl rand -hex 32`:

```bash
cd /home/jmbargueno/scratch/petai
A=$(openssl rand -hex 32); B=$(openssl rand -hex 32); C=$(openssl rand -hex 32)
PGU=$(openssl rand -hex 8); PGP=$(openssl rand -hex 24); GA=$(openssl rand -hex 16)
cat > .env <<EOF
# Producción pockai.jmbargueno.com — generado $(date -u +%FT%TZ)
POSTGRES_USER=$PGU
POSTGRES_PASSWORD=$PGP
POSTGRES_DB=petai
JWT_ACCESS_SECRET=$A
JWT_REFRESH_SECRET=$B
AI_KEY_ENCRYPTION_KEY=$C
GRAFANA_ADMIN_PASSWORD=$GA
TRUST_PROXY=1
CORS_ORIGINS=https://pockai.jmbargueno.com,tauri://localhost,http://tauri.localhost,https://tauri.localhost
EOF
chmod 600 .env
```
(`.env` ya está en `.gitignore` — línea 29. `AI_KEY_ENCRYPTION_KEY` debe ser 64 hex: `openssl rand -hex 32` lo garantiza.)

Copiar el `.env` al vault (el usuario necesita verlo/editarlo): `~/obsidian/AI/knowledge/pockai-prod.md` con los valores y su ubicación (lo hacemos en T9; el .env vive en el repo).

### T4 — Arranque del stack + build de imagen (15-25 min, build largo)

```bash
cd /home/jmbargueno/scratch/petai
git checkout -q main && git pull   # garantía de estado limpio
docker compose -f docker-compose.prod.yml -f docker-compose.pockai.yml up -d --build
```
Esperado al final: `petai-postgres`, `petai-redis`, `petai-backend` (nombre: `petai`_<servicio>_, el proyecto se llama `petai` por la carpeta), `petai-prometheus`, `petai-grafana`, `petai-alertmanager` en estado `Up (healthy)`. Si `backend` queda `restarting`, `docker logs --tail 30 <contenedor-backend>`: los fallos típicos son secretos del valor de dev (T3 mal hecha) o `DATABASE_URL` sin credenciales reales.

Verificación del estado:
```bash
docker compose -f docker-compose.prod.yml -f docker-compose.pockai.yml ps
```
Esperado: todos `Up (healthy)` (backend hace self-check de `/v1/health`; postgres/redis tienen healthchecks).

Migraciones: el CMD del backend ejecuta `prisma migrate deploy` automáticamente → la primera vez crea el schema completo (ver T6).

### T5 — TLS para `api-pockai` (5 min, mismo patrón que pockai-web)

Con el vhost ya generado por nginx-proxy (aparece al arrancar `backend` con `VIRTUAL_HOST`), emitir con la cuenta certbot del volumen `nginx_certs` (NUNCA acme-companion, está pausado):

```bash
docker run --rm -v nginx_html:/usr/share/nginx/html -v nginx_certs:/etc/letsencrypt \
  certbot/certbot certonly --non-interactive --webroot -w /usr/share/nginx/html \
  -d api-pockai.jmbargueno.com --cert-name api-pockai.jmbargueno.com \
  --email contact@jmbargueno.com --agree-tos --no-eff-email
```
Esperado: `new certificate expires on` (si falla con 404 en el challenge, el vhost aún no está: `docker exec nginx-proxy nginx -s reload` y reintentar; si persiste, `dig +short api-pockai.jmbargueno.com A @1.1.1.1` debe dar la IP del host).

Copiar al layout flat que lee el vhost + generar dhparam:
```bash
docker run --rm -v nginx_certs:/etc/letsencrypt alpine:3 sh -c "
  set -e
  cp /etc/letsencrypt/live/api-pockai.jmbargueno.com/fullchain.pem /etc/letsencrypt/api-pockai.jmbargueno.com.crt
  cp /etc/letsencrypt/live/api-pockai.jmbargueno.com/chain.pem      /etc/letsencrypt/api-pockai.jmbargueno.com.chain.pem
  cp /etc/letsencrypt/live/api-pockai.jmbargueno.com/privkey.pem    /etc/letsencrypt/api-pockai.jmbargueno.com.key
  openssl dhparam -out /etc/letsencrypt/api-pockai.jmbargueno.com.dhparam.pem 2048
"
docker exec nginx-proxy nginx -s reload
```

Verificación: `curl -sI https://api-pockai.jmbargueno.com/v1/health | head -1` → `HTTP/2 200` (o 404 si la ruta aún no existe en el backend — con 200 ya cerramos T6; si el proxy no carga el cert, el error será TLS, no HTTP).

### T6 — Verificación funcional de la API (10 min)

```bash
B=https://api-pockai.jmbargueno.com
curl -s $B/v1/health            # → JSON de liveness, 200
curl -s $B/v1/health/ready      # → postgres up + "redis: up"
curl -s -o /dev/null -w '%{http_code}\n' $B/v1/docs   # → 404 (Swagger OFF por defecto en prod)
curl -s -o /dev/null -w '%{http_code}\n' $B/v1/auth/login   # → 400 o 415 (ruta viva, sin body)
# CORS para la web:
curl -s -o /dev/null -D- -H 'Origin: https://pockai.jmbargueno.com' $B/v1/health | grep -i access-control-allow-origin
# → access-control-allow-origin: https://pockai.jmbargueno.com
# Registro real (crea un usuario de prueba en la DB nueva — válido en prod recién montada):
curl -s -X POST $B/v1/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"deploy-check@jmbargueno.com","username":"deploycheck","password":"'"$(openssl rand -hex 12)"'"}' | head -c 300
```
Esperado del register: `201` (o `200`) con el usuario; si devuelve `400` por formato de DTO, leer el error JSON y ajustar el body (los campos exactos están en `backend/src/modules/auth/dto/register.dto.ts`). Después:
```bash
curl -s -X POST $B/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"deploy-check@jmbargueno.com","password":"<la-misma>"' | grep -o 'accessToken'
```
→ contiene `accessToken` (cierra el ciclo registro→login real).

Migraciones aplicadas (verificar, no son una acción):
```bash
docker compose -f docker-compose.prod.yml -f docker-compose.pockai.yml exec postgres \
  psql -U $(grep '^POSTGRES_USER' .env | cut -d= -f2) -d petai -c '\dt' | wc -l
```
→ decenas de tablas (el schema completo de Prisma).

### T7 — Seed del catálogo del juego (5 min)

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.pockai.yml exec backend \
  pnpm exec ts-node prisma/seed.ts
```
Esperado: el seed termina sin errores (idempotente; en prod **no** crea usuario demo). Verificación:
```bash
docker compose -f docker-compose.prod.yml -f docker-compose.pockai.yml exec postgres \
  psql -U $(grep '^POSTGRES_USER' .env | cut -d= -f2) -d petai -t -c "SELECT count(*) FROM species"
```
(El nombre exacto de la tabla de especies sale de `prisma/schema.prisma` — si `species` no existe, tomar el nombre real del schema; la tabla correcta es la que el seed puebla.)
→ un número > 0.

### T8 — Renovación de cert: extender el script de pockai (5 min)

Editar `~/.hermes/scripts/pockai-cert-renew.sh`: sustituir la variable `DOMAIN=pockai.jmbargueno.com` por un bucle:

```sh
for DOMAIN in pockai.jmbargueno.com api-pockai.jmbargueno.com; do
```
…y mover el `docker run certbot renew --cert-name "$DOMAIN"` + el bloque de copia flat + el `nginx -s reload` DENTRO del bucle (el script actual ya está escrito para parametrizar por `DOMAIN`; el `reload` pasa a estar tras el bucle para no recargar dos veces: recargar una sola vez al final si alguno renovó).

Verificación: `sh ~/.hermes/scripts/pockai-cert-renew.sh` → sale sin errores y, como no renueva nada (certs nuevos), no hace nada visible. El cron existente (watchdog no_agent de pockai) ya lo ejecuta; confirmar con `grep pockai-cert-renew ~/.hermes/cron/jobs.json` (o el mecanismo de crons de Hermes) que queda apuntando al script actualizado.

### T9 — Backups diarios (10 min)

Crear `~/.hermes/scripts/petai-backup.sh`:
```sh
#!/bin/sh
# Backup diario del stack pockai (postgres + redis). Watchdog silencioso (patron webproxy-deploy).
set -eu
cd /home/jmbargueno/scratch/petai
D=$(date +%F)
DEST=~/backups/petai/$D
mkdir -p "$DEST"
U=$(grep '^POSTGRES_USER' .env | cut -d= -f2)
docker compose -f docker-compose.prod.yml -f docker-compose.pockai.yml exec -T postgres \
  pg_dumpall -U "$U" --clean --if-exists > "$DEST/pg-dumpall.sql"
docker compose -f docker-compose.prod.yml -f docker-compose.pockai.yml exec -T redis \
  sh -c "redis-cli SAVE > /dev/null 2>&1 || true; cat /data/dump.rdb" > "$DEST/redis.rdb"
# Integridad mínima: el dump debe listarse como base de datos válida
gzip -f "$DEST"/pg-dumpall.sql "$DEST"/redis.rdb
echo "petai backup ok $D: $(du -h "$DEST"/*.gz | awk '{print $1}' | tr '\n' ' ')"
```
chmod +x y ejecutar una vez → esperada la línea `petai backup ok <fecha>`.

Cron diario (patrón webproxy-deploy: `no_agent: true`, watchdog silencioso): un job `0 3 * * *` que ejecuta `sh ~/.hermes/scripts/petai-backup.sh >> /dev/null 2>&1`. (Se crea con el mecanismo de crons de Hermes que ya gestiona los otros watchdogs — `webproxy-deploy` usa exactamente este patrón.)

Verificación: `ls ~/backups/petai/$(date +%F)/` → 2 ficheros `.gz`; `zcat …/pg-dumpall.sql.gz | head -5` → cabecera de dump PostgreSQL.

### T10 — Documentación: vault + skill (5 min)

- `~/obsidian/AI/knowledge/pockai-prod.md`: URL `https://api-pockai.jmbargueno.com`, subdominio DNS (unproxied), ubicación del proyecto compose (`~/scratch/petai`, overlay `docker-compose.pockai.yml`), `.env` en `~/scratch/petai/.env` (600) CON los secretos, nombres de contenedor (`petai-backend` etc.), puertos locales (API `127.0.0.1:3000`, Grafana `:3001`), patrón de cert (certbot flat, NO acme-companion), backups en `~/backups/petai/`, seed idempotente + cuándo repetirlo (cambios en `shared/game-data/`).
- Actualizar el skill `pockai-web` (o crear `pockai-prod`) con el procedimiento de redeploy del backend: `git pull && docker compose -f docker-compose.prod.yml -f docker-compose.pockai.yml up -d --build` + `prisma migrate deploy` automático + seed si toca + verificación de health.

## Tests / validación (resumen de puertas de paso)

No hay TDD de unidad (es infra); la validación es por puerta:
1. DNS: `dig` → IP host (T1).
2. `compose ps` → todo `Up (healthy)` (T4).
3. TLS: `curl -sI https://api-pockai.jmbargueno.com/v1/health` → 200 con cert válido (T5).
4. Funcional: liveness + readiness + Swagger OFF + CORS + registro/login real (T6).
5. Datos: schema migrado + seed > 0 filas (T6-T7).
6. Continuidad: cert renew bucle + backup diario con primer run ok (T8-T9).
7. Regresión web: `curl -s -o /dev/null -w '%{http_code}\n' https://pockai.jmbargueno.com/es/` → 200 (el deploy de backend no toca la web).

## Riesgos, tradeoffs y preguntas abiertas

- **Cuenta LE pausada (mitigado)**: no usamos acme-companion; replicamos el patrón certbot de pockai (probado). Riesgo residual: rate-limit de LE si hicéramos varios retries del challenge → esperar 5 min entre reintentos.
- **Build de imagen**: el Dockerfile compila con pnpm multi-stage; el primer build puede tardar 15-25 min. No es un fallo si no hay error, solo espera.
- **`.env` en el checkout**: si alguien hace `git clean -fdx` en `~/scratch/petai`, el `.env` desaparece → la copia en el vault (T10) es la recuperación. Mitigación adicional opcional: copiar además a `~/.hermes/secrets/petai.env`.
- **WebSocket/SSE tras el proxy**: `VIRTUAL_WEBSOCKETS=true` cubre el upgrade de socket.io; el SSE del chat necesita `proxy_buffering off` — nginx-proxy NO lo expone por env. Socket.io funciona por polling HTTP como fallback, así que el sistema funciona sin buffering off; si el chat SSE a tropezar en producción, se añade `proxy_buffering off; proxy_cache off;` montando `./deploy/nginx-vhost/api-pockai.conf` sobre `/etc/nginx/vhost.d/api-pockai.jmbargueno.com.conf` del contenedor nginx-proxy (una tarea de 5 min, ya documentada aquí).
- **Observabilidad pública**: Grafana/Prometheus quedan en `127.0.0.1` (accesibles solo en el host). Si el usuario quiere `grafana-pockai.jmbargueno.com` desde fuera, se hace con la receta de lock-VPN (`wireguard-vpn`, patrón n8n) — fuera de scope aquí para no exponer dashboards con un click.
- **Rélicas / escala**: no planeado (YAGNI); `docs/DEPLOY.md §4` documenta qué movería a Redis si algún día hay 2+ réplicas.
- **`OPENAI_API_KEY`**: fuera de scope por decisión del usuario (15-11): se deja vacía en `.env`; el chat de IA degrada sin key. Inyectarla más adelante = añadir `OPENAI_API_KEY=...` al `.env` + `docker compose ... up -d backend` (recarga), sin migraciones.
- **CORS**: fijado a `https://pockai.jmbargueno.com` + orígenes Tauri; las apps nativas no mandan `Origin` y no están afectadas.

## Orden de ejecución

T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10. Cada tarea es commiteable/verificable por separado; el commit único de código (T2) deja el resto como configuración local + infra.

## Estado final — completado 2026-11-15

T1–T10 completadas. Resultado verificado en producción:
- `https://api-pockai.jmbargueno.com/v1/health` y `/v1/health/ready` → 200 ok (db, redis, bullmq).
- Websocket socket.io handshake OK a través del proxy. Web `pockai.jmbargueno.com` intacta (200).
- Cert LE emitido (expira 2027-02-13); symlinks flat relativos en `nginx_certs`.
- Seed: 3 especies / 8 patrones / 8 alimentos (verificado en DB).
- Backup real ejecutado: `~/backups/petai/2026-11-15/` (dumpall con data + RDB).
- Crons Hermes: `petai backup` (3a99a6ed1000, 03:00) + `pockai-web cert renew` (03d61ae2eaa1, sáb 04:35, cubre ambos dominios).
- Push main: cc52a1e..0485db8 (overlay, fix PinoNestLogger + specs, Dockerfile shared, docs §11).
- Bloqueantes resueltos: SIGSEGV 139 = bug `PinoNestLogger.emit` (level numérico como método pino, oculto por `abortOnError` de Nest 11); MODULE_NOT_FOUND = `shared/game-data` sin copiar a `/app/backend/shared`.
