# Tasks: Security — Zero-Trust + E2E

## Backend

- [x] T1: Crear `AuditLog`, `E2eKeyPair` en Prisma schema
- [x] T2: Crear `security.module.ts`
- [x] T3: Crear `token-rotation.service.ts` (rotation, reuse detection, audit)
- [x] T4: Crear `device-fingerprint.service.ts` (fingerprint, score, flag)
- [x] T5: Crear `e2e-encryption.service.ts` (public key P-256, enroute)
- [x] T6: Crear `security.controller.ts`:
  - [x] POST /v1/security/rotate-token
  - [x] GET /v1/security/device-status
  - [x] POST /v1/security/verify
  - [x] POST /v1/security/e2e/public-key
  - [x] GET /v1/security/audit
- [x] T7: Registrar `SecurityModule` en `app.module.ts`

## Tests

- [ ] T8: Unit: token rotation (reuse → revoca todos)
- [ ] T9: Unit: fingerprint scoring (3 cuentas → flag)
- [ ] T10: Unit: E2E public key (PEM P-256 válido/inválido)
- [ ] T11: Integration: login → refresh → rotation → reuse → revoke
- [ ] T12: Security: audit append-only, no borrado

## Dependencias

- `AuthModule` (JWT, RefreshToken)
- `PrismaModule`, `RedisModule`
