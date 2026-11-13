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
