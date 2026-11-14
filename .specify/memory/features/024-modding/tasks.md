# Tasks: Modding API + Workshop

## Backend

- [x] T1: Crear `Mod`, `ModRating`, `ModReport`, `ModDownload` en Prisma schema
- [x] T2: Crear `modding.module.ts` (NestJS module)
- [x] T3: Crear `sandbox.service.ts` con:
  - [x] `validateSprite(svg)` — sanitize SVG (scripts, on*, foreignObject, URLs externas, 500KB)
  - [x] `validateMinigame(code)` — validar bundle JS (500KB, sin eval/import)
  - [x] `workerConfig()` — config de sandbox (timeout 60s, memory 10MB, API limitada)
- [x] T4: Crear `modding.service.ts` con lógica completa:
  - [x] `publish(userId, dto)` — rate limit + validación + crear
  - [x] `getById(id)` — detalle (snapshot)
  - [x] `workshop(filters)` — list/search/filter + paginación
  - [x] `rate(userId, modId, stars)` — upsert + recalc promedio
  - [x] `report(userId, modId, reason)` — 3 reports → hidden
  - [x] `download(userId, modId, petId?)` — +snapshot
  - [x] `update` / `remove` (creator)
  - [x] `validateData(type, data)` — schema por tipo
- [x] T5: Crear `modding.controller.ts` con endpoints:
  - [x] POST /v1/modding/publish
  - [x] GET /v1/modding/:id
  - [x] GET /v1/modding/workshop
  - [x] POST /v1/modding/:id/rate
  - [x] POST /v1/modding/:id/report
  - [x] POST /v1/modding/:id/download
- [x] T6: Registrar `ModdingModule` en `app.module.ts`
- [x] T7: Migración Prisma (auto-generada al correr)

## Tests

- [ ] T8: Unit: `SandboxService.validateSprite` con SVG XSS (script, on*, foreignObject, url externa)
- [ ] T9: Unit: `validateData` (stats max, element/rarity inválidos)
- [ ] T10: Integration: publish → workshop → rate → verify promedio
- [ ] T11: Integration: 3 reports → hidden
- [ ] T12: Integration: rate limit 5/día
- [ ] T13: Security: rating race condition (upsert idempotente)

## Dependencias

- `AuthModule` (JwtAuthGuard, CurrentUser)
- `PrismaModule`, `RedisModule` (rate limit)
- `GameDataModule` (validación element/rarity)
- Storage S3/R2 + CDN (spriteUrl/minigameUrl)
