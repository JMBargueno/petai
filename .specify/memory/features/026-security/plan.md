# Plan: Security — Zero-Trust + E2E

## Arquitectura

```
backend/src/modules/security/
├── security.module.ts
├── security.controller.ts
├── e2e-encryption.service.ts        (public key P-256, enroute)
├── device-fingerprint.service.ts    (fingerprint + score + flag)
└── token-rotation.service.ts        (rotation + reuse detection + audit)
```

Conecta con `AuthModule`, `PrismaModule`, `RedisModule` (fingerprint sets, rate limit).

## Modelo de Datos (Prisma)

```prisma
model AuditLog {
  id          String   @id @default(uuid())
  userId      String
  event       String
  ip          String?
  userAgent   String?
  fingerprint String?
  metadata    Json?
  createdAt   DateTime @default(now())
  @@index([userId, createdAt])
  @@index([fingerprint])
}

model E2eKeyPair {
  id         String    @id @default(uuid())
  userId     String
  publicKey  String   // PEM P-256
  createdAt  DateTime  @default(now())
  revokedAt  DateTime?
  @@index([userId, revokedAt])
}
```

> El modelo `RefreshToken` ya existe. Se reutiliza `revokedAt` para marcar rotation y
> se usa un campo derivado (metadata) para rotation. No se añade `rotatedAt` para no
> alterar migraciones existentes; la "rotación" se modela como: al usar un refresh, se
> crea uno nuevo y el anterior se revoca (`revokedAt = now`).

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | /v1/security/rotate-token | JWT | Rotar refresh + reuse detection |
| GET | /v1/security/device-status | JWT | Estado (score, flag) del fingerprint |
| POST | /v1/security/verify | JWT | Computar/actualizar fingerprint + score |
| POST | /v1/security/e2e/public-key | JWT | Guardar public key P-256 |
| GET | /v1/security/audit | JWT | Últimos 100 eventos de auditoría |

## Flujos

### Rotate Token
1. Recibir refresh token opaco.
2. Buscar `RefreshToken` por hash.
3. Si no existe → 401.
4. Si `revokedAt` ya está set (reutilizado) → **revocar todos** los refresh del user → 401 + audit.
5. Si válido → revocar este, crear nuevo refresh, devolverlo.
6. Audit `refresh`/`rotation`.

### Verify (fingerprint)
1. Recibir features (UA, screen, tz, fonts).
2. `fingerprint = sha256(features)`.
3. Redis: `petai:fp:{fp}` → Set de userIds. Añadir al set.
4. Score: base 0, +20 por cuenta extra (>1). >80 → flag.
5. Audit `fingerprint` (si cambió IP).

### Device Status
1. Fingerprint del user (último verificado) → score/flag desde Redis/DB.

### E2E public key
1. Validar que el PEM es una P-256 (cabecera / formato).
2. Crear `E2eKeyPair` (una activa por user; revocar la anterior).
3. El backend solo enruta: nunca descifra.

## Decisiones de Diseño

- **Reuse detection**: un refresh rotado reutilizado revoca toda la sesión del user (compromiso total).
- **Score gradual**: fingerprinting no hace ban automático (false positives por ISP).
- **Audit inmutable**: solo se inserta; sin endpoints de borrado (GDPR: retention 1 año por partición).
- **E2E BYOK**: el managed mode no aplica E2E (el backend ve el prompt); solo BYOK.
