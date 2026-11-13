# API Contract: DevKit + Hot Reloading de Game Data

**Feature**: `004-devkit` | **Date**: 2026-11-14

Este contrato define dos superficies: (A) los **endpoints dev** del backend (solo `NODE_ENV !== 'production'`) y (B) los **comandos del CLI** `petai-devkit`. El contrato REST se documenta también con `@nestjs/swagger` y se exporta a `shared/openapi/openapi.json` (constitución III).

---

## A. Endpoints dev (backend NestJS)

**Base path**: `/dev`
**Guarda**: Todas las rutas de esta sección NO se registran cuando `NODE_ENV === 'production'` (DevModule condicional). En producción devuelve `404`.
**Autenticación**: No aplica en v1 (herramientas de desarrollo local). Los parámetros identificadores (`petId`, `userId`) se validan siempre en el servidor (constitución I).

### A1. `POST /dev/hot-reload`

Aplica un nuevo contenido de game data de forma atómica tras validar con zod.

**Request body**:
```json
{
  "file": "balance",
  "source": "inline",
  "content": "{ ... }"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `file` | string enum | Sí | Clave del archivo a recargar (`balance\|species\|patterns\|foods\|skills\|missions`). |
| `source` | `"inline" \| "disk"` | Sí | Origen del contenido (`inline` usa `content`; `disk` lee `shared/game-data/<file>.json`). |
| `content` | string \| object | condicional | Obligatorio si `source="inline"`. |

**Responses**:
- `200 OK`:
  ```json
  { "ok": true, "file": "balance", "version": "1.4.2", "changedFields": ["combats.elo.k"] }
  ```
- `400 Bad Request` (JSON malformado o falla schema zod) — snapshot anterior conservado:
  ```json
  { "ok": false, "file": "balance", "errors": [ { "path": "rarity.mythic.probability", "message": "number expected" } ] }
  ```
- `404 Not Found`: `file` desconocido.

**Semántica**: Atomic swap. Si la validación falla, el snapshot en memoria no cambia.

### A2. `GET /dev/game-data`

Devuelve el catálogo actual en memoria (snapshot vigente).

**Responses**:
- `200 OK`:
  ```json
  {
    "balance":  { "version": "1.4.2", "rarity": {}, "combats": {} },
    "species":  [ { "id": "...", "element": "...", "rarity": "...", "favoriteFood": "..." } ],
    "patterns": [],
    "foods":    [],
    "skills":   [],
    "missions": null,
    "loadedAt": "2026-11-14T12:00:00.000Z",
    "source": "disk"
  }
  ```

### A3. `POST /dev/seed`

Seed programático de usuarios y mascotas vía `@prisma/client`.

**Request body**:
```json
{ "users": 100, "pets": 500, "level": { "min": 1, "max": 100 }, "dryRun": false }
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `users` | int ≥ 0 | Sí | Nº de usuarios a crear. |
| `pets` | int ≥ 0 | Sí | Nº de mascotas a crear. |
| `level` | `{ min, max }` | No | Rango de nivel (default `1..10`). |
| `dryRun` | bool | No | Si `true`, no persiste; devuelve el plan. |

**Responses**:
- `200 OK`:
  ```json
  { "usersCreated": 100, "petsCreated": 500, "durationMs": 18400, "dryRun": false }
  ```
- `400 Bad Request`: `users`/`pets` inválidos o rango de nivel inválido.

**Semántica**: Aleatoriedad con `crypto` de Node. Con `dryRun=true` no se escribe en DB.

### A4. `POST /dev/action`

Test harness: invoca una acción del juego sin UI.

**Request body**:
```json
{ "action": "feed", "petId": "0e8a...uuid", "args": { "foodId": "apple" } }
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `action` | string enum | Sí | `feed` \| `battle` \| (otras según soporte). |
| `petId` | uuid | condicional | Identificador de la mascota (validado en servidor). |
| `args` | object | No | Argumentos específicos de la acción. |

**Responses**:
- `200 OK`:
  ```json
  { "ok": true, "action": "feed", "petId": "0e8a...", "result": { "vitaleBefore": 80, "vitaleAfter": 95 } }
  ```
- `400 Bad Request`: `action` no soportada o args inválidos.
- `404 Not Found`: `petId` inexistente o `userId` de la sesión no tiene esa mascota.

**Semántica**: `petId`/`userId` provienen de la sesión/servidor; nunca se confía en un `userId` enviado por el cliente (constitución I).

---

## B. CLI `petai-devkit`

Binario local (commander). Punto de entrada: `tools/devkit/src/index.ts`.

| Comando | Args | Offline | Endpoint asociado | Descripción |
|---------|------|---------|-------------------|-------------|
| `watch` | `[--path=<dir>]` | No (si via HTTP) | `POST /dev/hot-reload` | Monitoriza `shared/game-data/*.json` (chokidar) y dispara hot-reload. |
| `simulate` | `--combats=<n> --seed=<n> [--out=<file>]` | **Sí** | — | Simula N combates in-memory con seed fija; emite reporte JSON. |
| `seed` | `--users=<n> --pets=<n> [--level=range(min,max)] [--dry-run]` | No | `POST /dev/seed` | Seed rápido de usuarios/mascotas. |
| `action` | `<feed\|battle> --petId=<uuid> [--foodId=...]` | No | `POST /dev/action` | Invoca una acción del juego sin UI. |
| `validate` | `[--path=<dir>]` | **Sí** | — | Verifica referencias cruzadas entre los JSON de game data. |

### B1. `petai-devkit simulate --combats=10000 --seed=42`

**Output (stdout o `--out`)** — JSON determinista (mismo `--seed` ⇒ mismo output byte a byte):
```json
{
  "seed": 42,
  "total": 10000,
  "winRates": {
    "byRarity":  { "normal": 0.51, "rare": 0.48, "superRare": 0.45, "legendary": 0.44 },
    "byElement": { "fire": 0.5, "water": 0.49, "plant": 0.51, "electric": 0.48, "shadow": 0.5, "light": 0.52 }
  },
  "avgRounds": 6.3,
  "avgDamage": 214.7
}
```
**Validación de args**: `--combats` entero > 0; `--seed` numérico (default documentado si ausente). Fallback claro en casos límite (`--combats=0`).

### B2. `petai-devkit seed --users=100 --pets=500 --level=range(1,100)`

Parsea `--level=range(min,max)`; POST a `POST /dev/seed`. Muestra `{ usersCreated, petsCreated, durationMs }`. Con `--dry-run` no persiste.

### B3. `petai-devkit action feed --petId=xxx --foodId=apple`

POST a `POST /dev/action`. Muestra el resultado de la acción.

### B4. `petai-devkit validate`

Lee los JSON de `shared/game-data/` y valida referencias cruzadas (rarity, elemento, `favoriteFood`, `kind` de skill, ligas ordenadas, suma de probabilidades). **Exit code**: `0` si todo válido, `≠0` si hay referencias rotas (lista cada error). Reutiliza los schemas zod de `game-data.schemas.ts` / reglas de `scripts/validate-game-data.js`.

### B5. `petai-devkit watch`

Arranca chokidar sobre `shared/game-data/*.json`. En cada `change/add` POSTea a `POST /dev/hot-reload` (o aplica swap directo si corre in-process) y loguea el resultado (ok/errores de validación). Solo los 6 archivos gestionados; ignora el resto con log.

---

## C. Compatibilidad y versionado

- Los endpoints `/dev/*` son inestables y de uso interno; no forman parte del contrato público de la API de juego (no consumidos por escritorio/móviles).
- El campo `version` en `GET /dev/game-data` y en la respuesta de `hot-reload` refleja la `version` del JSON de origen (p. ej. `balance.json.version`).
- `simulate`/`validate` consumen `balance.json`/`species.json` directamente; cualquier cambio de `version` del motor de combate (constitución II) debe re-validarse con `simulate` (invarianta de determinismo).