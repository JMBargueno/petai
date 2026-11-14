# Spec: DevKit + Hot Reloading de Game Data

## ID
Feature #4 — Oleada 1 "Velocidad de dev"

## Resumen
CLI `petai-devkit` que permite hot-reload de game data (species.json, balance.json, skills.json) sin reiniciar el backend, seed generator, test harness API para simular acciones, y balance simulator para validar cambios.

## Contexto
Cambiar `balance.json` o `species.json` actualmente requiere reiniciar el backend (~2min). El DevKit reduce esto a ~2s. También permite simular 10000 combates in-memory para validar balance antes de deploy.

Conecta con: GameDataService, motor de combate, Prisma seed, Jest.

## Objetivos
- Reducir ciclo "editar JSON → probar" de 2min a 2s.
- Seed rápida (`--users=100 --pets=500`).
- Simular combates masivamente sin UI ni DB.
- Detectar errores de balance antes de deploy.

## User Stories
- Como dev, quiero editar `balance.json` y ver el cambio sin reiniciar.
- Como dev, quiero generar 100 usuarios con 500 pets con un comando.
- Como designer, quiero simular 10000 combates con seed fija y obtener win rates.
- Como dev, quiero invocar "feed pet" o "pelear" por CLI sin UI.
- Como dev, quiero validar que mi cambio no rompe el seed.

## Criterios de aceptación
- [ ] AC1: `petai-devkit watch` monitoriza JSON y hace hot-reload sin reiniciar.
- [ ] AC2: `petai-devkit seed --users=100 --pets=500 --level=range(1,100)` en < 30s.
- [ ] AC3: `petai-devkit simulate --combats=10000 --seed=42` produce JSON report (win rates, rounds, damage).
- [ ] AC4: `petai-devkit action feed --petId=xxx` llama endpoint de test.
- [ ] AC5: `petai-devkit validate` verifica referencias cruzadas entre JSON.
- [ ] AC6: Hot reload atómico: JSON inválido → se rechaza, se mantiene anterior.
- [ ] AC7: Simulate y validate funcionan offline (sin backend).

## Diseño técnico
### Backend
- **Endpoints dev (protegidos por `NODE_ENV !== 'production'`):**
  - `POST /dev/hot-reload` — `{ file, source: "disk"|"inline", content? }`
  - `GET /dev/game-data` — datos actuales en memoria
  - `POST /dev/seed` — seed programático
- **GameDataService hot-swappable:** `reload(newData)` con validación zod + atomic swap.
- **Watcher:** `chokidar` monitoriza `shared/game-data/*.json` en dev.

### CLI (`tools/devkit/`)
```
tools/devkit/src/
  index.ts          (commander entry)
  commands/watch.ts
  commands/seed.ts
  commands/simulate.ts
  commands/action.ts
  commands/validate.ts
  lib/game-data.ts
  lib/battle-sim.ts (motor puro, sin IO)
  lib/seed-gen.ts
```
- Paquetes: `commander`, `chokidar`, `zod`, `@prisma/client`
- Bin: `petai-devkit`

## Interfaz de API
- `POST /dev/hot-reload` → 200 `{ ok, file, version, changedFields }` / 400 `{ errors }`
- `GET /dev/game-data` → 200 `{ balance, species, skills }`
- `POST /dev/seed` → 200 `{ usersCreated, petsCreated, durationMs }`

## Modelo de datos
- Sin cambios en Prisma. El seed crea registros existentes.
- `simulate` NO toca DB — in-memory.

## Eventos y sincronización
- chokidar → in-memory reload (IPC si mismo proceso, HTTP si separado)
- Sin WebSocket events nuevos.

## Dependencias
- **GameDataService:** refactor a hot-swappable
- **Motor de combate:** extraer como módulo puro reutilizable
- **chokidar + commander:** nuevos devDeps

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Refactor GameDataService + zod validation | 1 día |
| 2 | Endpoints `/dev/*` | 0.5 día |
| 3 | CLI scaffold + watch command | 1.5 días |
| 4 | seed command (generadores + Prisma) | 1.5 días |
| 5 | simulate command (battle engine + report) | 2 días |
| 6 | action + validate commands | 1.5 días |
| 7 | Tests + README | 1 día |

**Total: ~9 días**

## Tests
- Unit: reload (valid/invalid), seed distribution, battle-sim determinismo
- Integration: hot-reload → cambio reflejado
- E2E: simulate con seed → output idéntico 2 veces
- Edge: JSON malformado, weight=0, seed con 0 users

## Riesgos y notas
- **Solo dev:** `/dev/*` eliminados en production.
- **Battle engine:** Debe ser puro (sin I/O) para simulate.
- **Determinismo:** `--seed=42` → mismo output siempre.
- **Perf:** 10000 combates < 5s in-memory.

## Preguntas abiertas
1. ¿Paquete separado o carpeta en monorepo? (Propuesta: `tools/devkit`.)
2. ¿Documentar para todo el equipo? (Propuesta: README + demo.)
3. ¿Hot-reload para todos los JSON? (Propuesta: SÍ.)
4. ¿`--dry-run` en seed? (Propuesta: SÍ.)