# Spec: Public API + Webhooks para Terceros

## ID
25 — Oleada 2 "Meta + IA" (NUEVAS_FUNCIONALIDADES §25)

## Resumen
API pública con API keys para acceso programático (leaderboards, pets opt-in, eventos), sistema de webhooks para notificar eventos de juego a terceros (pet.evolved, combat.finished, level.up), y SDK TypeScript para bots/dashboards.

## Contexto
El backend actual expone endpoints protegidos por JWT (auth de usuario). No hay API para desarrolladores externos que quieran crear integraciones: bots que avisen cuando un pet evoluciona, dashboards de progreso, o apps que muestren leaderboards. Webhooks permiten que estas integraciones reaccionen en tiempo real sin polling.

Conecta con: `AuthModule` (nuevo scope: API keys), `PetsModule`, `BattlesModule`, `RedisService`, `RealtimeGateway`.

## Objetivos
- API pública con auth por API key (separada del JWT de usuario).
- Webhooks: el usuario registra URLs para recibir eventos de su pet.
- SDK TypeScript (`petai-sdk`) para consumir la API + webhooks fácilmente.
- Rate limiting agresivo por API key (evitar abuse).

## User Stories
- Como developer, quiero una API con API key, para crear un bot que avise cuando mi pet evoluciona.
- Como developer, quiero registrar un webhook, para recibir eventos sin polling.
- Como jugador, quiero compartir el leaderboard de mi servidor, para que mis amigos lo vean.
- Como developer, quiero un SDK TypeScript, para no escribir fetch calls manualmente.
- Como admin, quiero ver qué API keys existen y su usage, para audit.

## Criterios de aceptación
- [ ] AC1: API keys con scopes: `read:pets`, `read:leaderboard`, `read:events`, `webhooks`.
- [ ] AC2: `GET /public/pets/:petId` — solo si el pet es público (opt-in en settings).
- [ ] AC3: `GET /public/leaderboard?element=fire&top=100` — top 100 por elemento.
- [ ] AC4: `GET /public/events` — eventos globales (raid, temporada, tournaments).
- [ ] AC5: Webhooks: `POST /webhooks/register` con URL + events list. Max 10 URLs/user.
- [ ] AC6: Eventos: `pet.evolved`, `combat.finished`, `level.up`, `ai.reminder.created`, `season.ended`.
- [ ] AC7: Webhook payload: JSON con `event`, `petId`, `data`, `timestamp`, `signature` (HMAC-SHA256).
- [ ] AC8: Retry: 3 attempts (1s, 5s, 30s) si el endpoint no responde 200.
- [ ] AC9: Rate limit: 100 req/min por API key, 10 req/min para webhook triggers.
- [ ] AC10: SDK: `petai-sdk` (npm) con `PetAI.init({apiKey})`, `petAI.on('evolved', cb)`.

## Diseño técnico

### Arquitectura
```
┌───────────────────────────────────────────────────────────┐
│  PublicApiModule (nuevo, backend)                          │
│  ├── PublicApiController (GET /public/*)                   │
│  ├── ApiKeyService (crear, validar, scope, rate limit)    │
│  └── ApiKeyGuard (middleware: verifica Authorization)     │
└───────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────┐
│  WebhookModule (nuevo, backend)                           │
│  ├── WebhookController (register, list, test)             │
│  ├── WebhookService (dispatch, retry, signature)          │
│  └── WebhookDispatcher (BullMQ: envía + retry)            │
└───────────────────────────────────────────────────────────┘
         │
         ├── Prisma: ApiKey, Webhook, WebhookDelivery
         ├── Redis: rate limits, API key cache
         └── BullMQ: webhook delivery queue
```

### Backend
**`public-api/`** (nuevo módulo):
- `public-api.module.ts`, `public-api.controller.ts`
- `api-key.service.ts` — CRUD keys, scope verification
- `api-key.guard.ts` — middleware `Authorization: Bearer petai_key_xxx`

**`webhooks/`** (nuevo módulo):
- `webhooks.module.ts`, `webhooks.controller.ts`, `webhooks.service.ts`
- `webhook-dispatcher.service.ts` — BullMQ processor (envía + retry)
- `webhooks.processor.ts` — BullMQ worker

Integración con eventos existentes:
- `PetsService` → al evolucionar/level up → emitir `webhook:event`.
- `BattlesModule` → al terminar → emitir `webhook:event`.
- `AiModule` → al crear reminder → emitir `webhook:event`.

### SDK (nuevo paquete: `petai-sdk`)
```typescript
// Uso básico
import { PetAI } from 'petai-sdk';
const client = new PetAI({ apiKey: 'petai_key_xxx' });

// Fetch data
const pets = await client.pets.list({ element: 'fire' });
const lb = await client.leaderboard.top({ limit: 50 });

// Webhooks (server-side)
const webhook = new PetAIWebhook({ url: 'https://mybot.com/hook', secret: 'xxx' });
await webhook.verify(req); // verify HMAC signature
await webhook.handle('pet.evolved', data);
```

### Infraestructura
- Sin CDN (la API es stateless, detrás del mismo backend).
- BullMQ para webhook delivery (retry, backoff).
- Redis para rate limiting por API key.
## Interfaz de API

**`POST /api-keys`** (JWT) — crear API key con scopes.
**`DELETE /api-keys/:id`** — revocar. **`GET /api-keys`** — listar.

**`GET /public/pets/:petId`** (scope: `read:pets`) — solo si pet es público (opt-in).
**`GET /public/leaderboard?element=&top=`** (scope: `read:leaderboard`) — top 100.
**`GET /public/events`** (scope: `read:events`) — eventos globales.

**`POST /webhooks/register`** (JWT) — { url, events[], secret } → max 10/user.
**`GET /webhooks`** — listar. **`DELETE /webhooks/:id`**. **`POST /webhooks/:id/test`**.

## Modelo de datos

**`ApiKey`**: id, userId, name, keyHash (SHA-256 @unique), scopes Json, lastUsedAt?, revokedAt?, createdAt.

**`Webhook`**: id, userId, url, secret, events Json, active, lastDeliveryAt?, failureCount, createdAt.

**`WebhookDelivery`**: id, webhookId, event, status (delivered|failed|pending), statusCode?, attempts, error?, createdAt.

## Protocolos y comunicación
- Auth: `Authorization: Bearer petai_key_xxx`.
- Webhook POST: headers `X-Petai-Event`, `X-Petai-Timestamp`, `X-Petai-Signature` (HMAC-SHA256).
- Retry: BullMQ backoff 1s→5s→30s, 3 attempts. 5 failures → webhook desactivado.
- Payload: `{ event, petId, userId, data, timestamp }`.

## Security
- API keys: solo hash en DB. Scopes por endpoint. Rate limit 100/min.
- Webhook: solo HTTPS, SSRF protection (no IPs privadas), HMAC verification.
- Revocation inmediata. Webhook rate: 10 triggers/min.
## Dependencias
- `AuthModule` (ApiKeyGuard), `PetsModule`, `BattlesModule`.
- `RedisService` (rate limits), `PrismaService`, BullMQ.
- `RealtimeGateway` (event triggers).

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | ApiKey model + CRUD + guard | 2 días |
| 2 | Public endpoints (pets, lb, events) | 2 días |
| 3 | Webhook model + endpoints | 1.5 días |
| 4 | Dispatcher (BullMQ + retry + HMAC) | 2 días |
| 5 | Event triggers en servicios | 1.5 días |
| 6 | Rate limiting + SSRF protection | 1 día |
| 7 | SDK `petai-sdk` (npm) | 2 días |
| 8 | Docs + tests | 2 días |

**Total: ~14.5 días**

## Performance y escalabilidad
- Public endpoints: stateless, O(1). 1M req/min.
- Webhooks: async BullMQ. No bloquea request trigger.
- Rate limit: Redis sliding window O(1).
- BullMQ: max 1000 concurrent jobs.

## Tests
- Unit: ApiKeyGuard, WebhookDispatcher (HMAC, retry), rate limit.
- Integration: API key → public endpoint. Evolve → webhook.
- E2E: Full flow: key → endpoint → webhook delivery.
- Load: 1000 req/min → rate limit.
- Security: SSRF, invalid scope, revoked key.

## Riesgos y notas
- SSRF: webhook a IP interna → bloquear.
- Storm: 1 evento → 1000 webhooks → saturación.
- Key leakage: revocation inmediata + rotation.
- Solo opt-in data. Default: privado.

## Preguntas abiertas
1. Webhooks por pet o por user? → User.
2. Max API keys/user? → 5.
3. Webhooks globales (raid, season)? → Sí.
4. SDK Python? → No v1.
5. Rate limit por scope? → No v1.