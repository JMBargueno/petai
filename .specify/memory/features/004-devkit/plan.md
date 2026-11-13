# Implementation Plan: DevKit + Hot Reloading de Game Data

**Branch**: `004-devkit` | **Date**: 2026-11-14 | **Spec**: `docs/specs/spec-04-devkit.md`

**Input**: Feature specification from `docs/specs/spec-04-devkit.md` y `spec.md` (esta carpeta).

**Note**: Este plan describe el diseño técnico para el DevKit (CLI + watcher de backend + endpoints dev). El motor de combate y `GameDataService` ya existen en `backend/src`; el DevKit los encapsula y refactoriza, no los reescribe.

## Summary

Entrega un DevKit que reduce el ciclo "editar JSON → probar" de ~2 min a ~2 s y permite validar balance antes de deploy. Técnico: (1) refactorizar `GameDataService` a un servicio hot-swappable con validación zod y atomic swap; (2) crear un módulo `dev` en el backend con endpoints `POST /dev/hot-reload`, `GET /dev/game-data`, `POST /dev/seed` y `POST /dev/action`, guardados por `NODE_ENV !== 'production'`; (3) un watcher `chokidar` que observa `shared/game-data/*.json` y dispara el reload; (4) un CLI `petai-devkit` (commander) en `tools/devkit/` con subcomandos `watch`, `seed`, `simulate`, `action` y `validate`; (5) extraer el motor de combate como módulo puro para `simulate` offline y reutilizar la lógica de `scripts/validate-game-data.js` en `validate`.

## Technical Context

**Language/Version**: TypeScript 5.7, Node 24 LTS (backend y CLI comparten runtime).

**Primary Dependencies**: NestJS 11 (`@nestjs/common|core`), `zod` (ya en backend), `commander` + `chokidar` (nuevos devDeps del DevKit), `@prisma/client` (seed), `crypto` de Node (aleatoriedad del seed, constitución I).

**Storage**: Sin cambios en Prisma (seed crea registros de modelos existentes). Los game data viven en `shared/game-data/*.json` y se cargan a memoria (snapshot).

**Testing**: Jest unit (Jest config de `backend`, `*.spec.ts` junto al código) para reload/seed/simulate; E2E con Supertest en `backend/test/*.e2e-spec.ts` contra Postgres de `docker-compose`. `simulate`/`validate` se prueban offline.

**Target Platform**: Node.js (servidor + CLI local de desarrollo). Linux/macOS dev.

**Project Type**: CLI tool + backend feature (watcher + dev endpoints). Monorepo pnpm.

**Performance Goals**: hot-reload < 2 s; seed 100/500 < 30 s; 10000 combates < 5 s in-memory.

**Constraints**: Determinismo del motor de combate inalterado (constitución II); hot-swap atómico; `/dev/*` ausente en producción; `simulate`/`validate` sin I/O.

**Scale/Scope**: 6 archivos JSON; 4 endpoints dev; 5 subcomandos CLI; ~25 archivos nuevos/modificados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Backend autoritativo**: PASS. El seed usa `crypto` de Node (no `Math.random`); los endpoints `/dev/action` validan `petId`/`userId` en el servidor y no aceptan datos de cliente no validados. Los dev endpoints no alteran el cálculo de estado del juego (el motor sigue siendo la fuente).
- **II. Combate determinista**: PASS. `simulate` consume `engine.ts`/`rng.ts` sin modificar el orden del PRNG ni las constantes; el refactor a "módulo puro" solo aisla I/O, no cambia la lógica. Se prueba la invarianta "misma seed ⇒ mismo log byte a byte".
- **III. Contrato único**: PASS (aplicable parcialmente). Los endpoints REST se documentan con `@nestjs/swagger` y se reflejan en `shared/openapi/openapi.json` vía `pnpm export:openapi`. El DevKit es un binario local, no un cliente; no genera tipos a mano.
- **Seguridad (guarda prod)**: PASS. `NODE_ENV === 'production'` ⇒ las rutas `/dev/*` no se registran (404); se verifica con test e2e (SC-007).
- **Balance via JSON**: PASS. `simulate` y `validate` leen `balance.json`, no literales hardcoded.

**Verdict**: Sin violaciones. No se requiere Complejidad Tracking.

## Project Structure

### Documentation (this feature)

```text
.specify/memory/features/004-devkit/
├── spec.md              # Especificación (esta feature)
├── plan.md              # This file
├── tasks.md             # Task list
└── contracts/
    └── api-contract.md  # CLI commands + dev endpoints
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── modules/
│   │   ├── game-data/
│   │   │   ├── game-data.service.ts      # REFAC: hot-swappable + zod + atomic swap (reload/newData)
│   │   │   ├── game-data.controller.ts   # (existing) catálogo público
│   │   │   ├── game-data.module.ts       # registra DevModule en dev
│   │   │   └── game-data.schemas.ts      # NUEVO: schemas zod por archivo (balance/species/skills/...)
│   │   ├── dev/                          # NUEVO: módulo de dev tools
│   │   │   ├── dev.module.ts             # condición NODE_ENV !== 'production'
│   │   │   ├── dev.controller.ts         # POST /dev/hot-reload, GET /dev/game-data, POST /dev/seed, POST /dev/action
│   │   │   ├── dev-hot-reload.service.ts # valida (zod) + atomic swap sobre GameDataService
│   │   │   ├── dev-seed.service.ts       # seed programático vía Prisma
│   │   │   ├── dev-action.service.ts     # test harness: feed/battle etc.
│   │   │   └── game-data-watcher.service.ts # chokidar sobre shared/game-data/*.json → hot-reload
│   │   └── battles/combat/
│   │       ├── engine.ts                 # (existing) motor determinista
│   │       ├── rng.ts                    # (existing) mulberry32
│   │       └── battle-sim.ts             # NUEVO: wrapper puro exportable para simulate (sin IO)
│   └── main.ts                           # watcher arranca solo en dev
├── test/
│   └── dev.e2e-spec.ts                   # E2E: hot-reload refleja cambio; /dev/* 404 en prod
└── prisma/seed.ts                        # (existing) reutilizado por dev-seed.service

tools/devkit/                             # NUEVO: carpeta del CLI (no paquete separado)
├── package.json                          # bin "petai-devkit", devDeps commander/chokidar/zod/@prisma/client
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts                          # commander entry (register commands)
    ├── commands/
    │   ├── watch.ts                      # chokidar → POST /dev/hot-reload (o swap directo si in-process)
    │   ├── seed.ts                       # POST /dev/seed (users/pets/level/dry-run)
    │   ├── simulate.ts                   # battle-sim offline → reporte JSON
    │   ├── action.ts                     # POST /dev/action (feed, battle...)
    │   └── validate.ts                   # referencias cruzadas entre JSON (offline)
    ├── lib/
    │   ├── game-data.ts                  # carga + schemas zod compartidos
    │   ├── battle-sim.ts                 # importa motor puro; genera N combates con seed
    │   ├── seed-gen.ts                   # generadores (crypto de Node) de users/pets
    │   └── http-client.ts                # cliente REST para /dev/*
    └── test/
        ├── simulate.spec.ts              # determinismo: mismo seed ⇒ mismo output
        ├── validate.spec.ts              # fixtures con refs rotas
        └── seed-gen.spec.ts              # distribución por level/rarity
```

**Structure Decision**: Monorepo pnpm. El backend conserva su layout `src/modules/*`; el DevKit vive en `tools/devkit/` (decisión del spec, pregunta #1). El motor de combate ya está en `backend/src/modules/battles/combat/`; `tools/devkit` lo consume vía un wrapper exportable (`battle-sim.ts` en el backend) para no duplicar la lógica determinista. Los schemas zod se centralizan en `backend/src/modules/game-data/game-data.schemas.ts` y se comparten con el watcher y el CLI.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Ninguna. Todos los gates de la constitución pasan (ver Constitution Check).