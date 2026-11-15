#!/usr/bin/env bash
# Prueba de carga de lectura con autocannon (no se instala en el proyecto: se baja con npx).
# Uso: BASE=http://localhost:3000/v1 EMAIL=demo@petai.local PASSWORD='Password123!' ./scripts/loadtest.sh
# Requiere el backend en marcha. NUNCA apuntar a producción sin permiso: es tráfico sintético intenso.
set -euo pipefail
BASE="${BASE:-http://localhost:3000/v1}"
EMAIL="${EMAIL:-demo@petai.local}"
PASSWORD="${PASSWORD:-Password123!}"
CONNECTIONS="${CONNECTIONS:-50}"
DURATION="${DURATION:-10}"

TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')

run() {
  echo "=== $1 ==="
  npx -y autocannon -c "$CONNECTIONS" -d "$DURATION" -H "authorization=Bearer $TOKEN" "$BASE$2" 2>&1 \
    | grep -E "Latency|Req/Sec|requests in|non 2xx|errors" || true
}

run "health (sin BD)" /health
run "ready (BD + Redis)" /health/ready
run "GET /pets (BD, autenticado)" /pets
run "GET /shop (catálogo en caché)" /shop
run "GET /leaderboard (Redis)" "/leaderboard?scope=global&limit=20"

# ── Carga de ESCRITURA (R-07) ─────────────────────────────────────────────────
# El write path más apto para carga con un solo token es POST /v1/sync/push: no tiene límite por
# minuto y su estado vive en Redis + memoria. Se usa el petId real del usuario: el 1er push aplica
# la acción (escritura real) y los siguientes se deduplican por `seen`, ejerciendo igualmente toda
# la ruta (carga desde Redis + check de seen + query de ownership por lote).
# Nota: los write paths con límite por usuario/día (battles/matchmake, chat, gifting/send) requieren
# VARIOS usuarios para una carga de escritura realista; este script es una herramienta de 1 usuario.
PET_ID=$(curl -s "$BASE/pets" -H "authorization=Bearer $TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0))[0]?.id ?? "loadtest-pet"')
PUSH_BODY="{\"actions\":[{\"id\":\"loadtest-1\",\"petId\":\"$PET_ID\",\"type\":\"feed\",\"args\":{},\"timestamp\":1700000000000},{\"id\":\"loadtest-2\",\"petId\":\"$PET_ID\",\"type\":\"play\",\"args\":{},\"timestamp\":1700000000001}]}"
echo "=== POST /sync/push (escritura, Redis+memoria) petId=$PET_ID ==="
npx -y autocannon -c "$CONNECTIONS" -d "$DURATION" -m POST \
  -H "authorization=Bearer $TOKEN" -H 'content-type=application/json' -b "$PUSH_BODY" \
  "$BASE/sync/push" 2>&1 | grep -E "Latency|Req/Sec|requests in|non 2xx|errors" || true
