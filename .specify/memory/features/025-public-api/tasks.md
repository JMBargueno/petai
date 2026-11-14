# Tasks: Public API + Webhooks

## Backend

- [x] T1: Crear `ApiKey`, `Webhook`, `WebhookDelivery` en Prisma schema
- [x] T2: Crear `webhooks.module.ts`
- [x] T3: Crear `api-key.service.ts` (crear/listar/revocar/verificar/rate-limit)
- [x] T4: Crear `api-key.guard.ts` (Bearer petai_key_*, scope, rate limit)
- [x] T5: Crear `public-api.controller.ts` (leaderboard, events)
- [x] T6: Crear `webhooks.service.ts` (register, anti-SSRF, dispatch, HMAC, retry)
- [x] T7: Crear `webhooks.controller.ts` (POST/GET/DELETE /v1/webhooks, apikeys)
- [x] T8: Registrar `WebhooksModule` en `app.module.ts`

## Tests

- [ ] T9: Unit: ApiKeyGuard (scope inválido, key revocada, rate limit)
- [ ] T10: Unit: HMAC signature (determinista con secret+timestamp)
- [ ] T11: Unit: anti-SSRF (localhost, IP privada, metadata)
- [ ] T12: Integration: crear key → leaderboard → verificar
- [ ] T13: Integration: dispatch → retry → 5 fallos → desactivado

## Dependencias

- `PrismaModule`, `RedisModule`
- `PetsModule` (leaderboard)
- `AuthModule` (JWT para gestión de keys/webhooks)
