# Feature Specification: DevKit + Hot Reloading de Game Data

**Feature Branch**: `004-devkit`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "CLI `petai-devkit` que permite hot-reload de game data (species.json, balance.json, skills.json, etc.) sin reiniciar el backend, seed generator rápido, test harness API para simular acciones, y balance simulator para validar cambios de balance antes de deploy. Reduce el ciclo 'editar JSON → probar' de ~2min a ~2s y permite simular 10000 combates in-memory con seed fija."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hot-reload de game data sin reiniciar el backend (Priority: P1)

Como desarrollador, quiero editar `shared/game-data/*.json` (species, balance, skills, patterns, foods, missions) y ver el cambio aplicado en memoria en el backend corriendo en segundos, sin reiniciar el proceso, y que si el JSON es inválido se rechace el cambio y se mantenga el anterior válido.

**Why this priority**: Es el corazón de la feature y el mayor gancho de productividad: hoy cualquier cambio de `balance.json` o `species.json` obliga a reiniciar el backend (~2min). El hot-reload atómico (watcher + endpoints `/dev/*` + swap válido) es el slice que de por sí entrega valor demostrable (editar un JSON y ver el cambio en ~2s). Es el MVP.

**Independent Test**: Se prueba arrancando el backend (dev) y el watcher, editando `shared/game-data/balance.json` (p. ej. cambiar `balance.combats.elo.k`) y verificando en < 2s que `GET /dev/game-data` refleja el nuevo valor sin reinicio. Luego se escribe un JSON malformado y se verifica que `GET /dev/game-data` sigue devolviendo el último snapshot válido y que el watcher emite un error de validación.

**Acceptance Scenarios**:

1. **Given** el backend dev está corriendo con el watcher activo sobre `shared/game-data/*.json`, **When** un dev modifica `balance.json` (valor `combats.elo.k` de 16 a 18), **Then** en < 2s el endpoint `GET /dev/game-data` devuelve `combats.elo.k = 18` sin que el backend se haya reiniciado.
2. **Given** el backend dev tiene en memoria un snapshot válido de `species.json`, **When** se escribe en disco un `species.json` con un campo ausente/incorrecto que falla el schema zod, **Then** el watcher rechaza el cambio, `GET /dev/game-data` sigue devolviendo el snapshot anterior válido y se emite un error de validación con el path del campo inválido.
3. **Given** el backend dev está corriendo, **When** se llama a `POST /dev/hot-reload` con `{ file: "balance.json", source: "inline", content: "<json válido>" }`, **Then** se devuelve `200 { ok: true, file: "balance.json", version, changedFields }` y el nuevo snapshot queda en memoria de forma atómica.
4. **Given** el backend dev está corriendo, **When** se llama a `POST /dev/hot-reload` con `content` de un JSON inválido, **Then** se devuelve `400 { errors: [...] }` y el snapshot en memoria no cambia.
5. **Given** `NODE_ENV === 'production'`, **When** se llama a cualquier endpoint `/dev/*`, **Then** la ruta no existe (no se registra) y se devuelve 404.

---

### User Story 2 - Balance simulator con seed determinista (Priority: P2)

Como designer/balance, quiero simular un número configurable de combates (p. ej. 10000) con una seed fija y obtener un reporte JSON con win rates por rareza/elemento, rondas promedio y daño promedio, para validar un cambio de balance antes de deploy, sin UI ni base de datos.

**Why this priority**: Es la segunda capacidad más valiosa y completamente independiente del backend: permite validar el impacto de un cambio de `balance.json` masivamente en memoria. Se apoya en el motor de combate (que la constitución exige ser 100% determinista) extraído como módulo puro reutilizable, por lo que se puede demostrar aisladamente (mismo `--seed` ⇒ mismo reporte byte a byte).

**Independent Test**: Se ejecuta `petai-devkit simulate --combats=10000 --seed=42` dos veces sin backend ni DB y se verifica que ambos reportes JSON son idénticos byte a byte, que contiene win rates por rareza y elemento, rondas promedio y daño promedio, y que termina en < 5s.

**Acceptance Scenarios**:

1. **Given** los `shared/game-data/*.json` actuales son válidos, **When** se ejecuta `petai-devkit simulate --combats=10000 --seed=42`, **Then** se produce un reporte JSON con `winRates` (por rareza y por elemento), `avgRounds`, `avgDamage` y `total`, terminando en < 5s sin backend ni DB.
2. **Given** el mismo `--seed=42` y los mismos datos, **When** se ejecuta `simulate` dos veces, **Then** el output JSON es idéntico byte a byte (determinismo garantizado por el motor mulberry32).
3. **Given** un `--combats=0` o un seed ausente en los argumentos, **When** se ejecuta `simulate`, **Then** el comando valida los argumentos y falla con un mensaje claro (o asume el seed por defecto documentado) en lugar de producir un reporte corrupto.

---

### User Story 3 - Seed programático, test harness y validación de integridad (Priority: P3)

Como dev, quiero generar usuarios y mascotas de prueba con un solo comando (`seed --users=100 --pets=500 --level=range(1,100)`), invocar acciones del juego por CLI sin UI (p. ej. `action feed --petId=xxx`) a través de un endpoint de test protegido, y validar las referencias cruzadas entre los JSON de game data antes de commit.

**Why this priority**: Añade valor de soporte (datamocking, automatización de pruebas, guard de integridad) pero depende de capacidades ya cubiertas por US1/US2 (endpoints dev, motor puro, scripts de validación). Es el último slice y puede entregarse de forma independiente una vez existen los endpoints dev y el motor extraído.

**Independent Test**: Se ejecuta `petai-devkit seed --users=10 --pets=20 --level=range(1,5)` contra el backend dev y se verifica la respuesta `{ usersCreated, petsCreated, durationMs }` con los registros en DB; luego `petai-devkit validate` sobre los JSON actuales y se verifica que reporta referencias cruzadas válidas (o lista las rotas); y `petai-devkit action feed --petId=<id>` invoca el endpoint de test y devuelve el resultado.

**Acceptance Scenarios**:

1. **Given** el backend dev está corriendo, **When** se ejecuta `petai-devkit seed --users=100 --pets=500 --level=range(1,100)`, **Then** se crea ese número de usuarios y mascotas en < 30s y devuelve `200 { usersCreated, petsCreated, durationMs }`.
2. **Given** un seed con `--dry-run` (propuesta confirmada), **When** se ejecuta `seed --dry-run`, **Then** NO se escribe en la base de datos y se devuelve el plan de creación (cuentas por rarity/level).
3. **Given** una `petId` válida y el backend dev corriendo, **When** se ejecuta `petai-devkit action feed --petId=xxx`, **Then** se invoca el endpoint de test `POST /dev/action` y se devuelve el resultado de la acción (p. ej. cambio de vitalidad) sin UI.
4. **Given** los `shared/game-data/*.json` contienen una referencia rota (p. ej. `species.favoriteFood` que no existe en `foods.json`), **When** se ejecuta `petai-devkit validate`, **Then** se falla con exit code distinto de 0 listando cada referencia rota; con todos los datos válidos termina con exit 0.

---

### Edge Cases

- ¿Qué pasa cuando el JSON malformado cambia múltiples archivos a la vez? Cada archivo se valida de forma independiente y atómica; un fallo en uno no descarta los otros ya aplicados, pero el snapshot de ese archivo se mantiene en su último estado válido.
- ¿Qué pasa si `weight`/`probability` de una rarity es 0 o la suma de probabilidades no cierra? La validación zod y `validate` lo rechazan (refleja la regla de `scripts/validate-game-data.js`: `totalProb` debe sumar 1).
- ¿Qué pasa si un `--seed` de `simulate` produce 0 combates válidos o `seed --users=0`? El comando debe fallar limpiamente o reportar el edge sin corruptar el output.
- ¿Qué pasa si el watcher detecta un cambio en un archivo que el backend no carga (p. ej. un JSON nuevo)? El watcher solo hot-reload los archivos gestionados por `GameDataService` (los 6 conocidos); los desconocidos se ignoran con log.
- ¿Qué pasa si dos peticiones `/dev/hot-reload` para el mismo archivo llegan simultáneamente? El swap es atómico (una sola referencia); gana una, la otra opera sobre el snapshot resultante sin dejar estado intermedio.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST proveer un CLI `petai-devkit` (bin) con los subcomandos `watch`, `seed`, `simulate`, `action` y `validate`, construido con `commander`.
- **FR-002**: System MUST proveer un watcher que monitorice `shared/game-data/*.json` (los 6: balance, species, patterns, foods, skills, missions) con `chokidar` en dev y dispare el hot-reload correspondiente.
- **FR-003**: System MUST exponer en el backend un endpoint `POST /dev/hot-reload` que acepte `{ file, source: "disk" | "inline", content? }`, valide el contenido con zod y aplique un swap atómico del snapshot.
- **FR-004**: System MUST exponer `GET /dev/game-data` que devuelva los datos actuales en memoria (`{ balance, species, skills, ... }`).
- **FR-005**: System MUST exponer `POST /dev/seed` para seed programático que devuelva `{ usersCreated, petsCreated, durationMs }`.
- **FR-006**: System MUST exponer un endpoint de test `POST /dev/action` para invocar acciones del juego (p. ej. `feed`, `battle`) por CLI.
- **FR-007**: System MUST refactorizar `GameDataService` a un servicio hot-swappable con `reload(newData)` que valide con zod y haga atomic swap; todos los getters deben leer el snapshot vigente.
- **FR-008**: System MUST extraer el motor de combate (`modules/battles/combat/engine.ts` + `rng.ts`) como un módulo puro reutilizable sin I/O ni reloj, para que `simulate` funcione offline.
- **FR-009**: System MUST proveer `simulate` que genere N combates in-memory con un PRNG sembrado (mulberry32) y emita un reporte JSON determinista (`winRates`, `avgRounds`, `avgDamage`, `total`).
- **FR-010**: System MUST proveer `validate` que verifique referencias cruzadas entre los JSON (rarity, elemento, favoriteFood, kind de skill, ligas ordenadas, etc.) reutilizando/ampliando la lógica de `scripts/validate-game-data.js`.
- **FR-011**: System MUST proveer `seed` con argumentos `--users`, `--pets`, `--level=range(min,max)` y `--dry-run`, usando `@prisma/client`.
- **FR-012**: System MUST proteger todos los endpoints `/dev/*` para que solo estén disponibles cuando `NODE_ENV !== 'production'`; en producción la ruta no se registra (404).
- **FR-013**: System MUST garantizar el hot-reload atómico: si el nuevo contenido falla validación, se rechaza y se conserva el último snapshot válido.
- **FR-014**: System MUST mantener `simulate` y `validate` 100% offline (sin backend ni DB).

### Key Entities *(include if feature involves data)*

- **GameDataSnapshot**: Instantánea de los datos de juego en memoria (balance, species, patterns, foods, skills, missions). Atributos: `version`, `loadedAt`, `source` ("disk"|"inline"). Relaciones: es el único estado que leen `GameDataService` y los endpoints `/dev/*`; se reemplaza de forma atómica por otro `GameDataSnapshot`.
- **SimReport**: Resultado del balance simulator. Atributos: `seed`, `total`, `winRates` (por rareza y elemento), `avgRounds`, `avgDamage`. Relaciones: derivado puramente de un `GameDataSnapshot` + la semilla, sin persistencia.
- **DevReloadRequest**: Petición de hot-reload. Atributos: `file`, `source`, `content?`. Relaciones: entrada de `POST /dev/hot-reload`; produce un `GameDataSnapshot` nuevo o un error 400.
- **SeedPlan / SeedResult**: Plan y resultado de seed programático. Atributos: `usersCreated`, `petsCreated`, `durationMs`, `dryRun`, distribución por rarity/level. Relaciones: consume `@prisma/client`; con `dryRun` no persiste.
- **DevActionRequest**: Petición de test harness. Atributos: `action` (p. ej. `feed`), `petId`, args opcionales. Relaciones: entrada de `POST /dev/action`; el `userId`/`petId` se valida en el servidor (constitución I).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El ciclo "editar `shared/game-data/*.json` → ver el cambio aplicado en memoria" se reduce de ~2 min (reinicio) a < 2 s, medido desde el `write` en disco hasta la respuesta de `GET /dev/game-data` reflejando el cambio.
- **SC-002**: `petai-devkit seed --users=100 --pets=500 --level=range(1,100)` completa en < 30 s contra la base de datos de desarrollo.
- **SC-003**: `petai-devkit simulate --combats=10000 --seed=42` termina en < 5 s in-memory y produce el reporte JSON completo.
- **SC-004**: El 100% de los snapshots inválidos (JSON malformado o que falla zod) son rechazados de forma atómica, conservando el snapshot previo válido; 0 escapes a estado corrupto en el set de fixtures.
- **SC-005**: El determinismo de `simulate` es exacto: ejecutar dos veces con el mismo `--seed` y los mismos datos produce output JSON idéntico byte a byte.
- **SC-006**: `simulate` y `validate` funcionan 100% offline (sin backend corriendo ni DB) y `validate` detecta el 100% de las referencias cruzadas rotas del set de fixtures de prueba con 0 falsos negativos.
- **SC-007**: Ningún endpoint `/dev/*` es alcanzable cuando `NODE_ENV === 'production'` (404), verificado por test e2e.

## Assumptions

- Se reutiliza el stack existente del monorepo pnpm: `backend/` NestJS 11 + TypeScript 5.7 + Node 24, `shared/game-data/*.json`, Prisma ORM, Jest. No se introduce un lenguaje nuevo.
- `commander`, `chokidar` y `zod` se usan para el DevKit (`zod` ya está en deps de `backend`; `commander` y `chokidar` son nuevos devDeps).
- El DevKit vive como carpeta del monorepo en `tools/devkit/` (no como paquete separado), con el bin `petai-devkit` (pregunta abierta #1 resuelta por la propuesta).
- El hot-reload aplica a los 6 JSON de `shared/game-data/` (pregunta abierta #3: SÍ).
- El seed crea registros de los modelos Prisma ya existentes (User, Pet, etc.); NO se añaden ni modifican modelos Prisma.
- El motor de combate (`engine.ts`) ya es 100% determinista según la constitución (II); el DevKit solo lo encapsula como módulo puro importable, sin alterar su orden de PRNG ni sus constantes de `balance.json → combats`.
- Los endpoints `/dev/*` no requieren autenticación adicional más allá de la guarda de `NODE_ENV` (herramientas de desarrollo local); en producción no existen.
- `--dry-run` en seed se incluye (pregunta abierta #4: SÍ).
- El watcher opera en el proceso del backend (mismo proceso ⇒ swap directo en memoria); la variante por HTTP entre procesos está contemplada en el contrato pero no se implementa en v1.
- La documentación se entrega como `README` en `tools/devkit/` + una demo (pregunta abierta #2).
- Se respeta la constitución: aleatoriedad del seed con `crypto` de Node (no `Math.random`), y cualquier acción vía `/dev/action` valida `petId`/`userId` en el servidor (principio I).

<!--CONT-->