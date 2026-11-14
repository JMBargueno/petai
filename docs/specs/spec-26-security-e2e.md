# Spec: Security — Zero-Trust + E2E Encryption

## ID
26 — Oleada 3 "Comunidad + Ecosistema" (NUEVAS_FUNCIONALIDADES §26)

## Resumen
Hardening de seguridad: token rotation (access 15min + refresh 7d), device fingerprinting anti-farming, E2E encryption para chat IA, y rate limiting multi-dimensional (IP + device + user).

## Contexto
El auth actual usa JWT + refresh con rotation parcial. No hay fingerprinting, no E2E en chat IA, rate limit solo por user. Para producción (GDPR/CCPA) se necesita: tokens con rotación forzada, detección de bots, E2E encryption, rate limiting por IP.

Conecta con: `AuthModule`, `AiModule`, `KeyCryptoService`, `RedisService`, `DeviceLink`.

## Objetivos
- Token rotation: access 15min, refresh 7d, rotation en cada uso.
- Device fingerprinting: detectar cuentas bot/farming.
- E2E encryption chat IA: backend solo enruta, no descifra.
- Rate limiting: IP + device + user (3 capas).
- Cumplimiento GDPR/CCPA.

## User Stories
- Como usuario, quiero E2E en mi chat IA, para que ni PetAI lo lea.
- Como admin, quiero detectar cuentas bot, para proteger la economía.
- Como usuario, quiero que al perder mi device, tokens se invaliden.
- Como usuario, quiero que no se pueda farmear con 100 cuentas desde 1 IP.
- Como empresa, quiero cumplir GDPR (borrado, cifrado).

## Criterios de aceptación
- [ ] AC1: Access 15min, Refresh 7d, rotation en cada uso.
- [ ] AC2: Refresh reuse detection: si un refresh ya rotado se reutiliza → revocar TODOS.
- [ ] AC3: Fingerprint: hash(UA + screen + tz + fonts). 3+ cuentas mismo FP → flag.
- [ ] AC4: E2E: client genera keypair P-256. Public key en DB. Chat cifra con ECDH.
- [ ] AC5: Backend E2E: solo enruta cifrado. No lee prompts.
- [ ] AC6: Rate limit: IP 100/min, device 50/min, user 20/min.
- [ ] AC7: `DELETE /account` (GDPR): borra en <7d.
- [ ] AC8: At rest: AES-256 para API keys, device tokens.
- [ ] AC9: Audit log: login, rotation, IP change.
- [ ] AC10: TLS 1.3 forzado (HSTS).

## Diseño técnico

### Token Rotation
- Access: JWT HS256, TTL 15min, `sub`, `iat`, `exp`, `jti`.
- Refresh: opaque UUID, TTL 7d, rotation each use.
- Reuse detection: refresh ya rotado se reutiliza → revocar TODOS + disconnect sockets.

### E2E Encryption
1. First run: client genera P-256 keypair. `POST /e2e/public-key`.
2. Chat BYOK: client cifra con ECDH→AES-256-GCM. Envía ciphertext.
3. Backend E2E mode: NO puede llamar al LLM (no ve prompt). Client llama DIRECTAMENTE al LLM.
4. Backend managed mode: backend tiene API key, ve prompts (sin E2E).
5. Tool calls: client descifra, ejecuta local, envía resultado cifrado.

### Device Fingerprinting
- Features: UA, screen res, timezone, fonts count, WebGL renderer.
- SHA-256 → `deviceFingerprint`.
- Redis: `petai:fp:{fp}` → Set userIds. >3 → flag.
- Score: 0-100. +20 por cuenta extra.
### Backend — SecurityModule
Nuevo `backend/src/modules/security/`:
- `security.module.ts`, `security.service.ts`
- `device-fingerprint.service.ts` — detect + score + flag
- `rate-limit.service.ts` — 3-layer (IP, device, user) en Redis
- `audit-log.service.ts` — append-only (tabla `AuditLog`)
- `gdpr.service.ts` — right to erasure
- `e2e.service.ts` — public key management

Cambios en `AuthModule`:
- Refresh rotation: cada `POST /auth/refresh` genera nuevo refresh, invalida el anterior.
- Reuse detection: si `rotatedAt IS NOT NULL` → revocar todo.

Cambios en `AiModule`:
- E2E mode: `ChatService` recibe ciphertext, lo pasa al LLM (si BYOK) o devuelve error (si managed sin E2E).
- Metadata: solo se persisten `tokenCount`, `timestamp`, `petId` (no el texto).

### Redis
- `petai:rl:ip:{ip}` — sliding window 60s, max 100.
- `petai:rl:fp:{fingerprint}` — sliding window 60s, max 50.
- `petai:rl:user:{userId}` — sliding window 60s, max 20.
- `petai:fp:{fingerprint}` — Set de userIds (TTL 30d).
- `petai:fp:score:{userId}` — Score 0-100.

### Frontend
- `CryptoEngine` (Tauri Rust / Android Kotlin): P-256 keypair, AES-256-GCM encrypt/decrypt.
- `DeviceFingerprint`: gather features → SHA-256.
- Key storage: Tauri → OS keychain/keystore. Android → `EncryptedSharedPreferences`.

### Infraestructura
- TLS 1.3: HSTS header, no TLS 1.2 fallback en el proxy (Caddy/Nginx).
- Audit log: tabla inmutable (sin UPDATE/DELETE), retention 1 año.
## Interfaz de API

**`POST /auth/refresh`** (modificado): rotation forzada. Reuse → 401 + revoke all.
**`POST /e2e/public-key`** (JWT): guardar public key P-256.
**`DELETE /account`** (JWT): GDPR erasure. Response: 202 (asynchronous, <7d).
**`GET /security/audit`** (JWT): últimos 100 eventos de auditoría del user.

## Modelo de datos

**`RefreshToken`** (modificado): + `rotatedAt DateTime?` (cuando fue rotado).
**`AuditLog`** (nuevo): id, userId, event (login|refresh|ip_change|key_created|key_revoked|account_deleted), ip, userAgent, fingerprint, metadata Json?, createdAt. Inmutable.
**`E2eKeyPair`** (nuevo): id, userId, publicKey (PEM), createdAt, revokedAt?.

## Protocolos y comunicación
- Token rotation: cada refresh invalida el anterior. Client siempre usa el último.
- E2E: Cifrado per-message (no per-session). ECDH ephemeral por request.
- Rate limit: 3 capas (IP → device → user). El más restrictivo aplica.
- Audit: append-only. Sin API de borrado. Retention 1 año.

## Security
- TLS 1.3, HSTS max-age=31536000.
- API keys: AES-256-GCM (KeyCryptoService existente).
- E2E: P-256 ECDH + AES-256-GCM. Keys en OS keystore.
- Rate limit: Redis sliding window.
- DDoS: 100 req/min/IP. Behind: Cloudflare/Nginx.
- Audit: inmutable, retention 1 año.

## Dependencias
- `AuthModule` (existing, se modifica), `AiModule` (E2E mode).
- `KeyCryptoService`, `RedisService`, `PrismaService`.
- OS keychain/keystore (Tauri/Android).
- Proxy TLS (Caddy/Nginx/Traefik).

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Token rotation + reuse detection | 2 días |
| 2 | Rate limiting 3-layer (Redis) | 2 días |
| 3 | Device fingerprinting + scoring | 2 días |
| 4 | E2E crypto (client: Rust/Kotlin) | 3 días |
| 5 | E2E backend (public key, enroute) | 2 días |
| 6 | GDPR: erasure + audit log | 2 días |
| 7 | HSTS + TLS 1.3 config + docs | 1 día |
| 8 | Tests (security audit, load) | 2 días |

**Total: ~16 días (~3-4 semanas)**

## Performance y escalabilidad
- Rate limit: Redis O(1). 1M users × 20 req = 20M req/min capacity.
- E2E: P-256 ECDH ~1ms, AES-GCM ~0.1ms/message. Negligible.
- Audit log: 1M entries/día ≈ 1GB/mes. Partitioning por mes.
- Fingerprint: Redis Set, 1M users × 1 FP = 1M keys ≈ 100MB.

## Tests
- Security audit: OWASP Top 10 checklist.
- Unit: token rotation, reuse detection, rate limit, fingerprint scoring.
- Integration: E2E encrypt → backend enroute → client decrypt.
- E2E: Full login → refresh → rotation → reuse → revoke.
- Load: 10k concurrent → rate limit kicks in.
- Penetration: SQLi, XSS, SSRF, token manipulation, replay attack.

## Riesgos y notas
- E2E con managed mode: El backend NO puede hacer E2E si tiene la API key (ve el prompt). Solo aplica a BYOK.
- Fingerprinting false positive: 2 users en misma red (mismo ISP) pueden tener FP similar. Mitigar: score gradual, no ban automático.
- GDPR erasure: Borrar `ChatMessage` puede romper el contexto de memoria del pet. Mitigar: "forget" en vez de hard delete (anonymize).
- TLS 1.3: Algunos clientes antiguos no soportan. Fallback a TLS 1.2 solo para health checks.
- Audit log growth: 1M/día → partitioning mensual.

## Preguntas abiertas
1. E2E solo BYOK o también managed? → BYOK v1. Managed v2 (con client-side proxy).
2. Fingerprinting: ban automático o review? → Review (score >80 → flag, admin decide).
3. Audit retention: 1 año o más? → 1 año (GDPR).
4. ¿2FA? → No v1. v2: TOTP.
5. ¿CSP en Tauri? → Sí (ya viene por defecto, reforzar).