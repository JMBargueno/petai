# Plan: Public API + Webhooks

## Arquitectura

```
backend/src/modules/webhooks/
├── webhooks.module.ts
├── webhooks.controller.ts        (POST/GET/DELETE /v1/webhooks)
├── webhooks.service.ts           (register, dispatch, HMAC, retry)
├── public-api.controller.ts      (GET /v1/public/*)
├── api-key.service.ts            (CRUD keys, scope verify, rate limit)
└── api-key.guard.ts              (middleware: verifica Bearer petai_key_*)
```

Conecta con `PrismaModule`, `RedisModule` (rate limits) y `PetsModule` (leaderboard).

## Modelo de Datos (Prisma)

```prisma
model ApiKey {
  id         String    @id @default(uuid())
  userId     String
  name       String
  keyHash    String    @unique
  scopes     Json
  lastUsedAt DateTime?
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())
  @@index([userId])
}

model Webhook {
  id             String   @id @default(uuid())
  userId         String
  url            String
  secret         String
  events         Json
  active         Boolean  @default(true)
  lastDeliveryAt DateTime?
  failureCount   Int      @default(0)
  createdAt      DateTime @default(now())
  deliveries     WebhookDelivery[]
  @@index([userId, active])
}

model WebhookDelivery {
  id         String   @id @default(uuid())
  webhookId  String
  webhook    Webhook  @relation(fields: [webhookId], references: [id], onDelete: Cascade)
  event      String
  status     String   @default("pending")
  statusCode Int?
  attempts   Int      @default(0)
  error      String?
  createdAt  DateTime @default(now())
  @@index([webhookId, createdAt])
}
```

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | /v1/apikeys | JWT | Crear API key (scopes) |
| GET | /v1/apikeys | JWT | Listar mis keys |
| DELETE | /v1/apikeys/:id | JWT | Revocar key |
| GET | /v1/public/leaderboard | ApiKey | Top 100 por elemento |
| GET | /v1/public/events | ApiKey | Eventos globales |
| POST | /v1/webhooks | JWT | Registrar webhook |
| GET | /v1/webhooks | JWT | Listar webhooks |
| DELETE | /v1/webhooks/:id | JWT | Borrar webhook |
| POST | /v1/webhooks/:id/test | JWT | Probar webhook |

## Flujos

### Crear API Key
1. Validar scope list (`read:pets|read:leaderboard|read:events|webhooks`).
2. Generar `petai_key_<random>`; guardar `keyHash = sha256(key)`.
3. Devolver el plaintext UNA vez.

### Public endpoint (ApiKeyId Guard)
1. `Authorization: Bearer petai_key_<key>`.
2. `sha256(key)` → buscar `ApiKey`; validar `revokedAt == null`.
3. Verificar scope requerido por el endpoint.
4. Rate limit 100 req/min por keyHash (Redis).
5. Actualizar `lastUsedAt` (throttle).

### Registrar Webhook
1. Validar HTTPS y anti-SSRF (no IPs privadas / localhost / metadatos).
2. Limit 10 webhooks por user.
3. Generar `secret` aleatorio si no se provee.

### Dispatch
1. Buscar webhooks activos del user que suscriban al evento.
2. Payload `{ event, petId, userId, data, timestamp }`.
3. Firmar: `X-Petai-Signature = HMAC-SHA256(secret, timestamp + "." + body)`.
4. POST con headers `X-Petai-Event`, `X-Petai-Timestamp`, `X-Petai-Signature`.
5. Retry 3 (1s, 5s, 30s). 5 fallos → `active=false`, `failureCount++`.

## Decisiones de Diseño

- **Hash-only**: nunca se guarda el key plaintext; solo el SHA-256.
- **Anti-SSRF**: reject hosts `localhost`, IPs privadas (10/172/192/169), metadata endpoints.
- **Retry con backoff**: se implementa en el service (sin BullMQ para mantener la dependencia
  mínima); en producción se puede sustituir por una cola.
- **Rate limit**: Redis sliding window por `keyHash`; respaldo en DB si Redis cae.
